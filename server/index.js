require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const path = require("node:path");
const { Pool } = require("pg");
const { z } = require("zod");

const app = express();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false });
const production = process.env.NODE_ENV === "production";
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
}
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: (process.env.APP_ORIGIN || "").split(",").filter(Boolean), credentials: true }));
app.use(express.json({ limit: "20kb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const cookieOptions = { httpOnly: true, secure: production || process.env.SESSION_COOKIE_SECURE === "true", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 };
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : req.headers["x-session-token"];
    const cookieToken = req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith("nexora_session="))?.slice("nexora_session=".length);
    const raw = token || cookieToken;
    if (!raw) return res.status(401).json({ error: "Authentication required." });
    const result = await pool.query(
      "SELECT u.id,u.full_name,u.username,u.email,u.phone,u.role,u.status,u.created_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",
      [hashToken(decodeURIComponent(raw))]
    );
    if (!result.rowCount || result.rows[0].status !== "active") return res.status(401).json({ error: "Session expired or account unavailable." });
    req.user = result.rows[0];
    next();
  } catch (e) { next(e); }
}
const requireAdmin = (req,res,next) => req.user?.role === "admin" ? next() : res.status(403).json({error:"Administrator access required."});

app.get("/api/health", asyncRoute(async (_req,res) => {
  await pool.query("SELECT 1");
  res.json({ status:"ok", database:"connected" });
}));

app.post("/api/auth/register", asyncRoute(async (req,res) => {
  const schema = z.object({
    fullName:z.string().trim().min(2).max(120),
    username:z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.]+$/),
    email:z.string().trim().email().max(254),
    phone:z.string().trim().max(24).optional().or(z.literal("")),
    password:z.string().min(10).max(72)
  });
  const parsed=schema.safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:"Invalid registration details.",details:parsed.error.flatten()});
  const {fullName,username,email,phone,password}=parsed.data;
  const passwordHash=await bcrypt.hash(password,12);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const user=await client.query(
      "INSERT INTO users(full_name,username,email,phone,password_hash) VALUES($1,$2,$3,$4,$5) RETURNING id,full_name,username,email,phone,role,created_at",
      [fullName,username,email.toLowerCase(),phone||null,passwordHash]
    );
    await client.query("INSERT INTO wallet_accounts(user_id) VALUES($1)",[user.rows[0].id]);
    await client.query("INSERT INTO commission_accounts(user_id) VALUES($1)",[user.rows[0].id]);
    const raw=newToken();
    await client.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",[user.rows[0].id,hashToken(raw)]);
    await client.query("COMMIT");
    res.cookie("nexora_session",raw,cookieOptions).status(201).json({user:user.rows[0]});
  } catch(e) {
    await client.query("ROLLBACK");
    if(e.code==="23505") return res.status(409).json({error:"Username or email already exists."});
    throw e;
  } finally {client.release();}
}));

app.post("/api/auth/login", asyncRoute(async(req,res)=>{
  const parsed=z.object({login:z.string().trim().min(3).max(254),password:z.string().min(1).max(72)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:"Enter your username/email and password."});
  const {login,password}=parsed.data;
  const found=await pool.query("SELECT id,password_hash,status FROM users WHERE lower(email)=lower($1) OR lower(username)=lower($1) LIMIT 1",[login]);
  if(!found.rowCount || !(await bcrypt.compare(password,found.rows[0].password_hash))) return res.status(401).json({error:"Invalid login credentials."});
  if(found.rows[0].status!=="active") return res.status(403).json({error:"This account is blocked. Contact support."});
  const raw=newToken();
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')",[found.rows[0].id,hashToken(raw)]);
  res.cookie("nexora_session",raw,cookieOptions).json({ok:true});
}));

app.post("/api/auth/logout",requireAuth,asyncRoute(async(req,res)=>{
  const raw=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):req.headers.cookie?.split(";").map(v=>v.trim()).find(v=>v.startsWith("nexora_session="))?.slice("nexora_session=".length);
  if(raw) await pool.query("DELETE FROM sessions WHERE token_hash=$1",[hashToken(decodeURIComponent(raw))]);
  res.clearCookie("nexora_session",{...cookieOptions,maxAge:undefined}).json({ok:true});
}));
app.get("/api/me",requireAuth,asyncRoute(async(req,res)=>{
  const result=await pool.query("SELECT u.id,u.full_name,u.username,u.email,u.phone,u.role,u.created_at,w.balance_minor,w.total_spent_minor,(SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id AND o.status='completed') AS completed_orders FROM users u JOIN wallet_accounts w ON w.user_id=u.id WHERE u.id=$1",[req.user.id]);
  res.json({user:result.rows[0]});
}));
app.get("/api/services",asyncRoute(async(_req,res)=>{
  const result=await pool.query("SELECT id,category,name,description,price_per_1000_minor,min_quantity,max_quantity FROM services WHERE enabled=true ORDER BY category,name");
  res.json({services:result.rows});
}));
app.get("/api/orders",requireAuth,asyncRoute(async(req,res)=>{
  const result=await pool.query("SELECT o.id,o.target,o.quantity,o.charge_minor,o.status,o.created_at,s.name AS service_name FROM orders o JOIN services s ON s.id=o.service_id WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 100",[req.user.id]);
  res.json({orders:result.rows});
}));
app.post("/api/orders",requireAuth,asyncRoute(async(req,res)=>{
  if (process.env.ORDER_FULFILMENT_ENABLED !== "true") return res.status(503).json({error:"Ordering is temporarily disabled until a verified supplier fulfilment workflow is configured. No balance was deducted."});
  const parsed=z.object({serviceId:z.string().uuid(),target:z.string().trim().min(2).max(500),quantity:z.number().int().positive()}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({error:"Invalid order details."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const svc=await client.query("SELECT * FROM services WHERE id=$1 AND enabled=true FOR UPDATE",[parsed.data.serviceId]);
    if(!svc.rowCount) {await client.query("ROLLBACK");return res.status(404).json({error:"Service unavailable."});}
    const s=svc.rows[0],q=parsed.data.quantity;
    if(q<s.min_quantity||q>s.max_quantity){await client.query("ROLLBACK");return res.status(400).json({error:"Quantity is outside the service limits."});}
    const charge=BigInt(Math.ceil(Number(s.price_per_1000_minor)*q/1000));
    const wallet=await client.query("SELECT balance_minor FROM wallet_accounts WHERE user_id=$1 FOR UPDATE",[req.user.id]);
    if(BigInt(wallet.rows[0].balance_minor)<charge){await client.query("ROLLBACK");return res.status(400).json({error:"Insufficient wallet balance."});}
    const order=await client.query("INSERT INTO orders(user_id,service_id,target,quantity,charge_minor) VALUES($1,$2,$3,$4,$5) RETURNING id,status,charge_minor,created_at",[req.user.id,s.id,parsed.data.target,q,charge.toString()]);
    await client.query("UPDATE wallet_accounts SET balance_minor=balance_minor-$1,total_spent_minor=total_spent_minor+$1,updated_at=NOW() WHERE user_id=$2",[charge.toString(),req.user.id]);
    await client.query("INSERT INTO wallet_ledger(user_id,amount_minor,entry_type,reference_id,note) VALUES($1,$2,'order_charge',$3,$4)",[req.user.id,(-charge).toString(),order.rows[0].id,"Order charge"]);
    await client.query("COMMIT");
    res.status(201).json({order:order.rows[0],message:"Order accepted into the panel queue. Provider fulfilment is not enabled until a verified provider adapter is configured."});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));

app.get("/api/money-requests",requireAuth,asyncRoute(async(req,res)=>{
  await pool.query("INSERT INTO commission_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
  const [requests,commission]=await Promise.all([
    pool.query("SELECT id,request_type,method,amount_minor,trx_id,account_number,status,review_note,created_at,reviewed_at FROM money_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]),
    pool.query("SELECT balance_minor FROM commission_accounts WHERE user_id=$1",[req.user.id])
  ]);
  res.json({requests:requests.rows,commission_balance_minor:commission.rows[0].balance_minor});
}));
app.post("/api/money-requests/deposit",requireAuth,asyncRoute(async(req,res)=>{
  const parsed=z.object({method:z.enum(["bkash","nagad","rocket","upay"]),amount:z.number().int().min(100).max(50000),trxId:z.string().trim().min(6).max(120),accountNumber:z.string().trim().regex(/^(?:\+?88)?01[3-9]\d{8}$/)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a valid amount, sender number and TrxID. Minimum deposit is ৳100."});
  const d=parsed.data;
  const r=await pool.query("INSERT INTO money_requests(user_id,request_type,method,amount_minor,trx_id,account_number) VALUES($1,'deposit',$2,$3,$4,$5) RETURNING id,status,created_at",[req.user.id,d.method,d.amount*100,d.trxId,d.accountNumber]);
  res.status(201).json({request:r.rows[0],message:"Deposit request submitted. Balance will be added only after admin verifies the TrxID."});
}));
app.post("/api/money-requests/withdraw",requireAuth,asyncRoute(async(req,res)=>{
  const parsed=z.object({method:z.enum(["bkash","nagad","rocket","upay"]),amount:z.number().int().min(100).max(50000),accountNumber:z.string().trim().regex(/^(?:\+?88)?01[3-9]\d{8}$/)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a valid withdrawal amount and payout number. Minimum withdrawal is ৳100."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    await client.query("INSERT INTO commission_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
    const wallet=await client.query("SELECT balance_minor FROM commission_accounts WHERE user_id=$1 FOR UPDATE",[req.user.id]);
    const amount=BigInt(parsed.data.amount)*100n;
    if(BigInt(wallet.rows[0].balance_minor)<amount){await client.query("ROLLBACK");return res.status(400).json({error:"Insufficient available commission balance. Wallet deposit balance cannot be withdrawn."});}
    const r=await client.query("INSERT INTO money_requests(user_id,request_type,method,amount_minor,account_number) VALUES($1,'withdrawal',$2,$3,$4) RETURNING id,status,created_at",[req.user.id,parsed.data.method,amount.toString(),parsed.data.accountNumber]);
    await client.query("UPDATE commission_accounts SET balance_minor=balance_minor-$1,updated_at=NOW() WHERE user_id=$2",[amount.toString(),req.user.id]);
    await client.query("COMMIT");
    res.status(201).json({request:r.rows[0],message:"Withdrawal request submitted for admin review."});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
app.post("/api/admin/money-requests/:id/review",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const parsed=z.object({decision:z.enum(["approved","rejected"]),note:z.string().trim().max(500).optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Choose approve or reject."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT * FROM money_requests WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Money request not found."});}
    const m=found.rows[0];
    if(m.status!=="pending"){await client.query("ROLLBACK");return res.status(409).json({error:"This request has already been reviewed."});}
    if(parsed.data.decision==="approved"&&m.request_type==="deposit"){
      await client.query("UPDATE wallet_accounts SET balance_minor=balance_minor+$1,updated_at=NOW() WHERE user_id=$2",[m.amount_minor,m.user_id]);
      await client.query("INSERT INTO wallet_ledger(user_id,amount_minor,entry_type,reference_id,note,created_by) VALUES($1,$2,'deposit',$3,$4,$5)",[m.user_id,m.amount_minor,m.id,"Verified manual deposit",req.user.id]);
    }
    if(parsed.data.decision==="rejected"&&m.request_type==="withdrawal"){
      await client.query("INSERT INTO commission_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[m.user_id]);
      await client.query("UPDATE commission_accounts SET balance_minor=balance_minor+$1,updated_at=NOW() WHERE user_id=$2",[m.amount_minor,m.user_id]);
    }
    await client.query("UPDATE money_requests SET status=$1,reviewed_by=$2,review_note=$3,reviewed_at=NOW() WHERE id=$4",[parsed.data.decision,req.user.id,parsed.data.note||null,m.id]);
    await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,'money_request',$3,$4::jsonb)",[req.user.id,"money_request_"+parsed.data.decision,m.id,JSON.stringify({request_type:m.request_type,amount_minor:m.amount_minor})]);
    await client.query("COMMIT");
    res.json({ok:true,status:parsed.data.decision});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));

app.get("/api/wallet/ledger",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT id,amount_minor,entry_type,reference_id,note,created_at FROM wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]);
  res.json({entries:r.rows});
}));
app.get("/api/admin/users",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const search=String(req.query.search||"").trim().slice(0,100);
  const status=["active","blocked"].includes(req.query.status)?req.query.status:null;
  const term=search?("%"+search+"%"):null;
  const r=await pool.query(
    "SELECT u.id,u.full_name,u.username,u.email,u.phone,u.status,u.created_at,w.balance_minor,w.total_spent_minor,COUNT(o.id)::int AS total_orders,COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_orders FROM users u JOIN wallet_accounts w ON w.user_id=u.id LEFT JOIN orders o ON o.user_id=u.id WHERE u.role='user' AND ($1::text IS NULL OR (u.full_name ILIKE $1 OR u.username ILIKE $1 OR u.email ILIKE $1 OR COALESCE(u.phone,'') ILIKE $1)) AND ($2::text IS NULL OR u.status=$2) GROUP BY u.id,w.balance_minor,w.total_spent_minor ORDER BY u.created_at DESC LIMIT 200",
    [term,status]
  );
  res.json({users:r.rows});
}));
app.get("/api/admin/users/:id",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const user=await pool.query("SELECT u.id,u.full_name,u.username,u.email,u.phone,u.status,u.role,u.created_at,w.balance_minor,w.total_spent_minor,COUNT(o.id)::int AS total_orders,COUNT(o.id) FILTER (WHERE o.status='completed')::int AS completed_orders FROM users u JOIN wallet_accounts w ON w.user_id=u.id LEFT JOIN orders o ON o.user_id=u.id WHERE u.id=$1 AND u.role='user' GROUP BY u.id,w.balance_minor,w.total_spent_minor",[req.params.id]);
  if(!user.rowCount)return res.status(404).json({error:"User not found."});
  const ledger=await pool.query("SELECT amount_minor,entry_type,note,created_at FROM wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10",[req.params.id]);
  res.json({user:user.rows[0],recent_activity:ledger.rows});
}));
app.post("/api/admin/users/:id/balance",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const parsed=z.object({amount:z.number().finite().multipleOf(0.01).min(-500000).max(500000).refine(v=>Math.round(v*100)!==0),reason:z.string().trim().min(5).max(250)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a non-zero amount (maximum ৳500,000) and a reason of 5–250 characters."});
  const amountMinor=BigInt(Math.round(parsed.data.amount*100));
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const user=await client.query("SELECT id FROM users WHERE id=$1 AND role='user' FOR UPDATE",[req.params.id]);
    if(!user.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"User not found."});}
    const wallet=await client.query("SELECT balance_minor FROM wallet_accounts WHERE user_id=$1 FOR UPDATE",[req.params.id]);
    if(!wallet.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Wallet account is missing."});}
    const next=BigInt(wallet.rows[0].balance_minor)+amountMinor;
    if(next<0n){await client.query("ROLLBACK");return res.status(400).json({error:"This adjustment would make the user's balance negative."});}
    await client.query("UPDATE wallet_accounts SET balance_minor=$1,updated_at=NOW() WHERE user_id=$2",[next.toString(),req.params.id]);
    await client.query("INSERT INTO wallet_ledger(user_id,amount_minor,entry_type,note,created_by) VALUES($1,$2,'admin_adjustment',$3,$4)",[req.params.id,amountMinor.toString(),parsed.data.reason,req.user.id]);
    await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'user_balance_adjusted','user',$2,$3::jsonb)",[req.user.id,req.params.id,JSON.stringify({amount_minor:amountMinor.toString(),reason:parsed.data.reason})]);
    await client.query("COMMIT");
    res.json({ok:true,balance_minor:next.toString()});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
app.patch("/api/admin/users/:id/status",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const parsed=z.object({status:z.enum(["active","blocked"])}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Choose active or blocked."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const updated=await client.query("UPDATE users SET status=$1,updated_at=NOW() WHERE id=$2 AND role='user' RETURNING id,status",[parsed.data.status,req.params.id]);
    if(!updated.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"User not found."});}
    if(parsed.data.status==="blocked")await client.query("DELETE FROM sessions WHERE user_id=$1",[req.params.id]);
    await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,'user',$3,$4::jsonb)",[req.user.id,"user_"+parsed.data.status,req.params.id,JSON.stringify({status:parsed.data.status})]);
    await client.query("COMMIT");
    res.json({ok:true,status:updated.rows[0].status});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
app.get("/api/admin/orders",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const search=String(req.query.search||"").trim().slice(0,100);
  const allowed=["pending","processing","completed","canceled","refunded"];
  const status=allowed.includes(req.query.status)?req.query.status:null;
  const term=search?("%"+search+"%"):null;
  const r=await pool.query(
    "SELECT o.id,o.target,o.quantity,o.charge_minor,o.status,o.created_at,o.updated_at,o.provider_order_id,s.name AS service_name,s.category,u.username,u.email FROM orders o JOIN services s ON s.id=o.service_id JOIN users u ON u.id=o.user_id WHERE ($1::text IS NULL OR o.status=$1) AND ($2::text IS NULL OR o.target ILIKE $2 OR s.name ILIKE $2 OR u.username ILIKE $2 OR u.email ILIKE $2 OR o.id::text ILIKE $2) ORDER BY o.created_at DESC LIMIT 200",
    [status,term]
  );
  res.json({orders:r.rows});
}));
app.get("/api/admin/orders/:id",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const r=await pool.query(
    "SELECT o.id,o.user_id,o.target,o.quantity,o.charge_minor,o.status,o.created_at,o.updated_at,o.provider_order_id,s.name AS service_name,s.category,u.full_name,u.username,u.email,u.phone FROM orders o JOIN services s ON s.id=o.service_id JOIN users u ON u.id=o.user_id WHERE o.id=$1",
    [req.params.id]
  );
  if(!r.rowCount)return res.status(404).json({error:"Order not found."});
  res.json({order:r.rows[0]});
}));
app.post("/api/admin/orders/:id/cancel-refund",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const parsed=z.object({reason:z.string().trim().min(5).max(250)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a cancellation reason (5–250 characters)."});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const found=await client.query("SELECT id,user_id,charge_minor,status FROM orders WHERE id=$1 FOR UPDATE",[req.params.id]);
    if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Order not found."});}
    const o=found.rows[0];
    if(o.status!=="pending"){await client.query("ROLLBACK");return res.status(409).json({error:"Only pending orders can be canceled here. Check supplier status before changing any processing order."});}
    const amount=BigInt(o.charge_minor);
    if(amount>0n){
      await client.query("UPDATE wallet_accounts SET balance_minor=balance_minor+$1,total_spent_minor=GREATEST(0,total_spent_minor-$1),updated_at=NOW() WHERE user_id=$2",[amount.toString(),o.user_id]);
      await client.query("INSERT INTO wallet_ledger(user_id,amount_minor,entry_type,reference_id,note,created_by) VALUES($1,$2,'refund',$3,$4,$5)",[o.user_id,amount.toString(),o.id,"Order cancellation refund: "+parsed.data.reason,req.user.id]);
    }
    const nextStatus=amount>0n?"refunded":"canceled";
    await client.query("UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2",[nextStatus,o.id]);
    await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'order_canceled_refunded','order',$2,$3::jsonb)",[req.user.id,o.id,JSON.stringify({amount_minor:amount.toString(),reason:parsed.data.reason,status:nextStatus})]);
    await client.query("COMMIT");
    res.json({ok:true,status:nextStatus,refunded_minor:amount.toString()});
  }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));


app.get("/api/admin/services",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const r=await pool.query("SELECT s.id,s.category,s.name,s.description,s.price_per_1000_minor,s.cost_per_1000_minor,s.min_quantity,s.max_quantity,s.provider_service_id,s.enabled,s.created_at,s.updated_at,(SELECT COUNT(*) FROM orders o WHERE o.service_id=s.id)::int AS order_count FROM services s ORDER BY s.category,s.name");
 res.json({services:r.rows});
}));
app.post("/api/admin/services",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({category:z.enum(["facebook","tiktok","instagram","youtube","telegram","free_fire","pubg_mobile","mlbb"]),name:z.string().trim().min(2).max(160),description:z.string().trim().max(2000).optional().default(""),price:z.number().finite().min(0).max(10000000),cost:z.number().finite().min(0).max(10000000),minQuantity:z.number().int().min(1).max(10000000),maxQuantity:z.number().int().min(1).max(10000000),providerServiceId:z.string().trim().max(120).optional().default("")}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Check service details and price/quantity limits."});
 const d=parsed.data;if(d.maxQuantity<d.minQuantity)return res.status(400).json({error:"Maximum quantity must be at least minimum quantity."});
 const price=Math.round(d.price*100),cost=Math.round(d.cost*100);
 const r=await pool.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,FALSE) RETURNING id",[d.category,d.name,d.description,price,cost,d.minQuantity,d.maxQuantity,d.providerServiceId||null]);
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'service_created','service',$2,$3::jsonb)",[req.user.id,r.rows[0].id,JSON.stringify({category:d.category,name:d.name,price_minor:price,cost_minor:cost})]);
 res.status(201).json({ok:true,id:r.rows[0].id,enabled:false});
}));
app.patch("/api/admin/services/:id",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({category:z.enum(["facebook","tiktok","instagram","youtube","telegram","free_fire","pubg_mobile","mlbb"]),name:z.string().trim().min(2).max(160),description:z.string().trim().max(2000),price:z.number().finite().min(0).max(10000000),cost:z.number().finite().min(0).max(10000000),minQuantity:z.number().int().min(1).max(10000000),maxQuantity:z.number().int().min(1).max(10000000),providerServiceId:z.string().trim().max(120)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Invalid service details."});
 const d=parsed.data;if(d.maxQuantity<d.minQuantity)return res.status(400).json({error:"Maximum quantity must be at least minimum quantity."});
 const r=await pool.query("UPDATE services SET category=$1,name=$2,description=$3,price_per_1000_minor=$4,cost_per_1000_minor=$5,min_quantity=$6,max_quantity=$7,provider_service_id=$8,updated_at=NOW() WHERE id=$9 RETURNING id",[d.category,d.name,d.description,Math.round(d.price*100),Math.round(d.cost*100),d.minQuantity,d.maxQuantity,d.providerServiceId||null,req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:"Service not found."});
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'service_updated','service',$2,$3::jsonb)",[req.user.id,req.params.id,JSON.stringify({category:d.category,name:d.name,price:d.price,cost:d.cost})]);
 res.json({ok:true});
}));
app.patch("/api/admin/services/:id/status",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({enabled:z.boolean()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Invalid service status."});
 const r=await pool.query("UPDATE services SET enabled=$1,updated_at=NOW() WHERE id=$2 RETURNING id,enabled",[parsed.data.enabled,req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:"Service not found."});
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,'service',$3,$4::jsonb)",[req.user.id,parsed.data.enabled?"service_enabled":"service_disabled",req.params.id,JSON.stringify({enabled:parsed.data.enabled})]);
 res.json({ok:true,enabled:r.rows[0].enabled});
}));
app.delete("/api/admin/services/:id",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const r=await pool.query("DELETE FROM services s WHERE s.id=$1 AND NOT EXISTS(SELECT 1 FROM orders o WHERE o.service_id=s.id) RETURNING s.id",[req.params.id]);
 if(!r.rowCount)return res.status(409).json({error:"Service not found or already used by an order. Disable it instead of deleting."});
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'service_deleted','service',$2,'{}'::jsonb)",[req.user.id,req.params.id]);
 res.json({ok:true});
}));
app.get("/api/admin/money-requests",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT m.*,u.username,u.email FROM money_requests m JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 200");
  res.json({requests:r.rows});
}));

// Serve only the public website files from the same origin as the API.
const publicFiles = new Set(["styles.css","app.js","dashboard.html","dashboard.css","dashboard.js","admin.html","admin.css","admin.js"]);
app.get("/", (_req,res) => res.sendFile(path.join(__dirname,"..","index.html")));
app.get("/:asset", (req,res,next) => {
  if (!publicFiles.has(req.params.asset)) return next();
  res.sendFile(path.join(__dirname,"..",req.params.asset));
});

app.use((err,_req,res,_next)=>{
  console.error(err);
  if(err.code==="23505") return res.status(409).json({error:"A record with this value already exists."});
  res.status(500).json({error:"Internal server error."});
});
const port=Number(process.env.PORT||4000);
pool.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS cost_per_1000_minor BIGINT NOT NULL DEFAULT 0 CHECK(cost_per_1000_minor >= 0)").then(()=>pool.query("CREATE TABLE IF NOT EXISTS commission_accounts (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, balance_minor BIGINT NOT NULL DEFAULT 0 CHECK(balance_minor>=0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE UNIQUE INDEX IF NOT EXISTS money_requests_deposit_trx_unique ON money_requests(method,lower(trx_id)) WHERE request_type='deposit' AND trx_id IS NOT NULL"))
  .then(()=>app.listen(port,()=>console.log("NEXORA API listening on port "+port)))
  .catch(error=>{console.error("Database initialization failed",error);process.exit(1);});
