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
// Render terminates HTTPS at its proxy; trust the proxy so secure cookies and client IP handling work correctly.
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({ origin: (process.env.APP_ORIGIN || "").split(",").filter(Boolean), credentials: true }));
app.use(express.json({ limit: "1.2mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const cookieOptions = { httpOnly: true, secure: production || process.env.SESSION_COOKIE_SECURE === "true", sameSite: "lax", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 };
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("base64url");
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const MAX_SUPPORT_IMAGE_BYTES = 200 * 1024;
function decodeSupportImages(items) {
  return items.map((value) => {
    if (typeof value !== "string" || value.length > 280000) throw new Error("Each image must be 200 KB or smaller after compression.");
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new Error("Only valid JPG, PNG or WEBP images are allowed.");
    const mime = match[1], encoded = match[2], data = Buffer.from(encoded, "base64");
    if (!data.length || data.length > MAX_SUPPORT_IMAGE_BYTES || data.toString("base64") !== encoded) throw new Error("Each image must be 200 KB or smaller.");
    const isJpeg = mime === "image/jpeg" && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
    const isPng = mime === "image/png" && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const isWebp = mime === "image/webp" && data.toString("ascii",0,4) === "RIFF" && data.toString("ascii",8,12) === "WEBP";
    if (!isJpeg && !isPng && !isWebp) throw new Error("Image content does not match its file type.");
    return { mime, data };
  });
}
async function saveSupportImages(client, messageId, images) {
  for (const image of images) {
    const id = crypto.randomUUID();
    await client.query(
      "INSERT INTO support_attachments(id,message_id,public_id,secure_url,format,bytes,mime_type,data) VALUES($1,$2,$3,$4,'image',$5,$6,$7)",
      [id,messageId,id,"/api/support/attachments/"+id,image.data.length,image.mime,image.data]
    );
  }
}

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
    referralCode:z.string().trim().max(32).optional().default(""),
    password:z.string().min(10).max(72)
  });
  const parsed=schema.safeParse(req.body);
  if(!parsed.success) { const fields=parsed.error.flatten().fieldErrors; const messages=[]; if(fields.fullName) messages.push("Full name: enter 2–120 characters."); if(fields.username) messages.push("Username: use 3–32 characters (letters, numbers, dot or underscore only)."); if(fields.email) messages.push("Enter a valid email address (maximum 254 characters)."); if(fields.phone) messages.push("Phone number must be 24 characters or fewer."); if(fields.referralCode) messages.push("Referral code must be 32 characters or fewer."); if(fields.password) messages.push("Password must be 10–72 characters."); return res.status(400).json({error:messages.join(" ")||"Please check your registration details."}); }
  const {fullName,username,email,phone,password,referralCode}=parsed.data;
  const referrer=referralCode?await pool.query("SELECT id FROM users WHERE upper(referral_code)=upper($1) AND status='active' LIMIT 1",[referralCode]):{rowCount:0,rows:[]};
  if(referralCode&&!referrer.rowCount)return res.status(400).json({error:"This referral code is invalid or inactive."});
  const referralCodeNew="NX"+crypto.randomBytes(5).toString("hex").toUpperCase();
  const passwordHash=await bcrypt.hash(password,12);
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const user=await client.query(
      "INSERT INTO users(full_name,username,email,phone,password_hash,referral_code,referred_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,full_name,username,email,phone,role,created_at",
      [fullName,username,email.toLowerCase(),phone||null,passwordHash,referralCodeNew,referrer.rows[0]?.id||null]
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
app.patch("/api/me",requireAuth,asyncRoute(async(req,res)=>{
 const parsed=z.object({fullName:z.string().trim().min(2).max(120),phone:z.string().trim().max(32).optional().default("")}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Enter a valid name and phone number."});
 const phone=parsed.data.phone||null;
 const updated=await pool.query("UPDATE users SET full_name=$1,phone=$2 WHERE id=$3 RETURNING id,full_name,username,email,phone,role,created_at",[parsed.data.fullName,phone,req.user.id]);
 res.json({user:updated.rows[0]});
}));
app.get("/api/services",asyncRoute(async(_req,res)=>{
  const result=await pool.query("SELECT id,category,name,description,price_per_1000_minor,min_quantity,max_quantity FROM services WHERE enabled=true ORDER BY category,name");
  res.json({services:result.rows});
}));
app.get("/api/public/recent-orders",asyncRoute(async(_req,res)=>{
 const result=await pool.query("SELECT s.name AS service_name,o.created_at FROM orders o JOIN services s ON s.id=o.service_id WHERE s.category='free_fire' AND o.status='completed' AND o.created_at>NOW()-INTERVAL '24 hours' ORDER BY o.created_at DESC LIMIT 8");
 res.set("Cache-Control","public, max-age=30").json({orders:result.rows.map(row=>({service_name:row.service_name,time_label:Math.max(1,Math.floor((Date.now()-new Date(row.created_at).getTime())/60000))+" min ago"}))});
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
    if(s.category==="free_fire"&&!/^[0-9]{5,12}$/.test(parsed.data.target)){await client.query("ROLLBACK");return res.status(400).json({error:"Enter a valid 5–12 digit Free Fire Player UID."});}
    if(s.category==="free_fire"?(q<s.min_quantity||q%s.min_quantity!==0||q>s.min_quantity*10):(q<s.min_quantity||q>s.max_quantity)){await client.query("ROLLBACK");return res.status(400).json({error:"Quantity is outside the service limits."});}
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
app.get("/api/referrals/me",requireAuth,asyncRoute(async(req,res)=>{
 const r=await pool.query("SELECT u.referral_code,(SELECT COUNT(*) FROM users child WHERE child.referred_by=u.id)::int AS referred_count FROM users u WHERE u.id=$1",[req.user.id]);
 res.json(r.rows[0]||{});
}));
app.get("/api/referrals/leaderboard",requireAuth,asyncRoute(async(_req,res)=>{
 const r=await pool.query("SELECT u.username,COUNT(child.id)::int AS referrals FROM users u LEFT JOIN users child ON child.referred_by=u.id WHERE u.role=$1 GROUP BY u.id,u.username HAVING COUNT(child.id)>0 ORDER BY referrals DESC,u.created_at ASC LIMIT 10",["user"]);
 res.json({leaders:r.rows});
}));
app.get("/api/admin/growth",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{
 const [settings,stats,referrals,leaders]=await Promise.all([
  pool.query("SELECT commission_percent,enabled,updated_at FROM referral_settings WHERE id=TRUE"),
  pool.query("SELECT COUNT(*)::int AS total_users,COUNT(*) FILTER(WHERE referred_by IS NOT NULL)::int AS referred_users,COUNT(DISTINCT referred_by)::int AS active_referrers FROM users WHERE role=$1",["user"]),
  pool.query("SELECT child.id,child.full_name,child.username,child.email,child.created_at,ref.full_name AS referrer_name,ref.username AS referrer_username,ref.referral_code FROM users child JOIN users ref ON ref.id=child.referred_by ORDER BY child.created_at DESC LIMIT 200"),
  pool.query("SELECT ref.id,ref.full_name,ref.username,ref.referral_code,COUNT(child.id)::int AS referral_count FROM users ref JOIN users child ON child.referred_by=ref.id WHERE ref.role=$1 GROUP BY ref.id ORDER BY referral_count DESC,ref.created_at ASC LIMIT 10",["user"])
 ]);
 res.json({settings:settings.rows[0]||{commission_percent:"5.00",enabled:false},stats:stats.rows[0],referrals:referrals.rows,leaders:leaders.rows});
}));
app.patch("/api/admin/growth/settings",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({commissionPercent:z.number().finite().min(0).max(50),enabled:z.boolean()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Commission rate must be between 0 and 50 percent."});
 const r=await pool.query("INSERT INTO referral_settings(id,commission_percent,enabled,updated_at) VALUES(TRUE,$1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET commission_percent=EXCLUDED.commission_percent,enabled=EXCLUDED.enabled,updated_at=NOW() RETURNING commission_percent,enabled,updated_at",[parsed.data.commissionPercent,parsed.data.enabled]);
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES($1,$2,$3,$4::jsonb)",[req.user.id,"referral_settings_updated","referral_settings",JSON.stringify(parsed.data)]);
 res.json({settings:r.rows[0]});
}));
app.get("/api/admin/money-requests",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT m.*,u.username,u.email FROM money_requests m JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 200");
  res.json({requests:r.rows});
}));



/* Support Center: private user tickets and separate administrator inbox. */
app.get("/api/support/tickets",requireAuth,asyncRoute(async(req,res)=>{
 const r=await pool.query("SELECT t.id,t.subject,t.status,t.created_at,t.updated_at,(SELECT COUNT(*)::int FROM ticket_messages m WHERE m.ticket_id=t.id) AS message_count,(SELECT message FROM ticket_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message FROM support_tickets t WHERE t.user_id=$1 ORDER BY t.updated_at DESC LIMIT 100",[req.user.id]);
 res.json({tickets:r.rows});
}));
app.post("/api/support/tickets",requireAuth,asyncRoute(async(req,res)=>{
 const parsed=z.object({subject:z.string().trim().min(4).max(180),message:z.string().trim().min(2).max(5000),uploads:z.array(z.string().max(280000)).max(4).default([])}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Enter a subject, a message and up to four compressed images."});
 let images;try{images=decodeSupportImages(parsed.data.uploads)}catch(e){return res.status(400).json({error:e.message})}
 const client=await pool.connect();
 try{await client.query("BEGIN");
 const t=await client.query("INSERT INTO support_tickets(user_id,subject,status) VALUES($1,$2,'open') RETURNING id,subject,status,created_at,updated_at",[req.user.id,parsed.data.subject]);
 const inserted=await client.query("INSERT INTO ticket_messages(ticket_id,sender_id,message) VALUES($1,$2,$3) RETURNING id",[t.rows[0].id,req.user.id,parsed.data.message]);
 const messageId=inserted.rows[0].id;
 if(images.length)await saveSupportImages(client,messageId,images);
 await client.query("COMMIT");res.status(201).json({ticket:t.rows[0]});
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
app.get("/api/support/tickets/:id/messages",requireAuth,asyncRoute(async(req,res)=>{
 const t=await pool.query("SELECT id,user_id FROM support_tickets WHERE id=$1",[req.params.id]);
 if(!t.rowCount)return res.status(404).json({error:"Ticket not found."});
 if(t.rows[0].user_id!==req.user.id&&req.user.role!=="admin")return res.status(403).json({error:"You cannot view this ticket."});
 const r=await pool.query("SELECT m.id,m.message,m.created_at,m.sender_id,u.username,u.full_name,u.role,COALESCE((SELECT json_agg(json_build_object('url',CASE WHEN a.data IS NOT NULL THEN '/api/support/attachments/'||a.id::text ELSE a.secure_url END,'format',a.format,'bytes',a.bytes)) FROM support_attachments a WHERE a.message_id=m.id),'[]'::json) AS attachments FROM ticket_messages m JOIN users u ON u.id=m.sender_id WHERE m.ticket_id=$1 ORDER BY m.created_at ASC",[req.params.id]);
 res.json({messages:r.rows});
}));
app.post("/api/support/tickets/:id/messages",requireAuth,asyncRoute(async(req,res)=>{
 const parsed=z.object({message:z.string().trim().max(5000).default(""),uploads:z.array(z.string().max(280000)).max(4).default([])}).refine(v=>v.message.length>0||v.uploads.length>0).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Send a message or attach up to four compressed images."});
 let images;try{images=decodeSupportImages(parsed.data.uploads)}catch(e){return res.status(400).json({error:e.message})}
 const client=await pool.connect();
 try{await client.query("BEGIN");
 const t=await client.query("SELECT id,user_id,status FROM support_tickets WHERE id=$1 FOR UPDATE",[req.params.id]);
 if(!t.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Ticket not found."});}
 if(t.rows[0].user_id!==req.user.id&&req.user.role!=="admin"){await client.query("ROLLBACK");return res.status(403).json({error:"You cannot reply to this ticket."});}
 if(t.rows[0].status==="closed"){await client.query("ROLLBACK");return res.status(409).json({error:"This ticket is closed."});}
 const inserted=await client.query("INSERT INTO ticket_messages(ticket_id,sender_id,message) VALUES($1,$2,$3) RETURNING id",[req.params.id,req.user.id,parsed.data.message]);
 const messageId=inserted.rows[0].id;
 if(images.length)await saveSupportImages(client,messageId,images);
 const nextStatus=req.user.role==="admin"?"answered":"open";
 await client.query("UPDATE support_tickets SET status=$1,updated_at=NOW() WHERE id=$2",[nextStatus,req.params.id]);
 await client.query("COMMIT");res.status(201).json({ok:true,status:nextStatus});
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}));
app.get("/api/support/attachments/:id",requireAuth,asyncRoute(async(req,res)=>{
 const found=await pool.query("SELECT a.data,a.mime_type,t.user_id FROM support_attachments a JOIN ticket_messages m ON m.id=a.message_id JOIN support_tickets t ON t.id=m.ticket_id WHERE a.id=$1",[req.params.id]);
 if(!found.rowCount||!found.rows[0].data)return res.status(404).json({error:"Image not found."});
 if(found.rows[0].user_id!==req.user.id&&req.user.role!=="admin")return res.status(403).json({error:"You cannot view this image."});
 res.set({"Content-Type":found.rows[0].mime_type,"Content-Length":String(found.rows[0].data.length),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Disposition":"inline"}).send(found.rows[0].data);
}));
app.get("/api/admin/support/tickets",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const allowed=["open","in_progress","answered","resolved","closed"],status=allowed.includes(req.query.status)?req.query.status:null;
 const q=String(req.query.search||"").trim().slice(0,100),term=q?"%"+q+"%":null;
 const r=await pool.query("SELECT t.id,t.subject,t.status,t.created_at,t.updated_at,u.id AS user_id,u.full_name,u.username,u.email,(SELECT COUNT(*)::int FROM ticket_messages m WHERE m.ticket_id=t.id) AS message_count,(SELECT message FROM ticket_messages m WHERE m.ticket_id=t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE ($1::text IS NULL OR t.status=$1) AND ($2::text IS NULL OR t.subject ILIKE $2 OR u.full_name ILIKE $2 OR u.username ILIKE $2 OR u.email ILIKE $2 OR t.id::text ILIKE $2) ORDER BY CASE WHEN t.status IN ('open','in_progress') THEN 0 ELSE 1 END,t.updated_at DESC LIMIT 250",[status,term]);
 res.json({tickets:r.rows});
}));
app.patch("/api/admin/support/tickets/:id/status",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({status:z.enum(["open","in_progress","answered","resolved","closed"])}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Invalid ticket status."});
 const r=await pool.query("UPDATE support_tickets SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,status",[parsed.data.status,req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:"Ticket not found."});
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'support_ticket_status_changed','support_ticket',$2,$3::jsonb)",[req.user.id,req.params.id,JSON.stringify({status:parsed.data.status})]);
 res.json({ok:true,status:r.rows[0].status});
}));

// Serve only the public website files from the same origin as the API.
const publicFiles = new Set(["styles.css","app.js","facebook.html","facebook.css","facebook.js","dashboard.html","dashboard.css","dashboard.js","admin.html","admin.css","admin.js","support-admin.html","support-admin.css","support-admin.js","free-fire.html","free-fire.css","free-fire.js"]);
app.get("/", (_req,res) => res.sendFile(path.join(__dirname,"..","index.html")));
app.get("/support-admin", (_req,res) => res.sendFile(path.join(__dirname,"..","support-admin.html")));
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
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(32)")
 .then(()=>pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL"))
 .then(()=>pool.query("UPDATE users SET referral_code=chr(78)||chr(88)||upper(substr(id::text,1,8)||substr(id::text,10,2)) WHERE referral_code IS NULL"))
 .then(()=>pool.query("CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_unique ON users(upper(referral_code))"))
 .then(()=>pool.query("CREATE INDEX IF NOT EXISTS users_referred_by_idx ON users(referred_by)"))
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS referral_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id=TRUE), commission_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK(commission_percent>=0 AND commission_percent<=50), enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
 .then(()=>pool.query("INSERT INTO referral_settings(id,commission_percent,enabled) VALUES(TRUE,5.00,FALSE) ON CONFLICT(id) DO NOTHING"))
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS support_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),subject VARCHAR(180) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS ticket_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,sender_id UUID NOT NULL REFERENCES users(id),message TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check"))
  .then(()=>pool.query("ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check CHECK(status IN ('open','in_progress','answered','resolved','closed'))"))
  .then(()=>pool.query("CREATE INDEX IF NOT EXISTS support_tickets_user_updated_idx ON support_tickets(user_id,updated_at DESC)"))
  .then(()=>pool.query("CREATE INDEX IF NOT EXISTS ticket_messages_ticket_date_idx ON ticket_messages(ticket_id,created_at)"))
  
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS support_attachments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),message_id UUID NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,public_id VARCHAR(255) NOT NULL UNIQUE,secure_url TEXT NOT NULL,format VARCHAR(20) NOT NULL,bytes BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("ALTER TABLE support_attachments ADD COLUMN IF NOT EXISTS data BYTEA"))
  .then(()=>pool.query("ALTER TABLE support_attachments ADD COLUMN IF NOT EXISTS mime_type VARCHAR(40)"))
  .then(()=>pool.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS cost_per_1000_minor BIGINT NOT NULL DEFAULT 0 CHECK(cost_per_1000_minor >= 0)"))
  // Seed requested Free Fire packages; order fulfilment remains globally disabled until a supplier is verified.
  .then(()=>pool.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) SELECT 'free_fire','25 Diamonds','Fixed-price Free Fire diamond package. Supplier fulfilment is not yet enabled.',80000,0,25,25,NULL,TRUE WHERE NOT EXISTS (SELECT 1 FROM services WHERE category='free_fire' AND lower(name)=lower('25 Diamonds'))"))
  .then(()=>pool.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) SELECT 'free_fire','50 Diamonds','Fixed-price Free Fire diamond package. Supplier fulfilment is not yet enabled.',80000,0,50,50,NULL,TRUE WHERE NOT EXISTS (SELECT 1 FROM services WHERE category='free_fire' AND lower(name)=lower('50 Diamonds'))"))
  .then(()=>pool.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) SELECT 'free_fire',v.name,'Fixed-price Free Fire diamond package. Supplier fulfilment is not yet enabled.',v.rate,0,v.qty,v.qty,NULL,TRUE FROM (VALUES ('100 Diamonds',80000,100),('210 Diamonds',76190,210),('530 Diamonds',75471,530),('1,060 Diamonds',75471,1060)) AS v(name,rate,qty) WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.category='free_fire' AND lower(s.name)=lower(v.name))"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS commission_accounts (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, balance_minor BIGINT NOT NULL DEFAULT 0 CHECK(balance_minor>=0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE UNIQUE INDEX IF NOT EXISTS money_requests_deposit_trx_unique ON money_requests(method,lower(trx_id)) WHERE request_type='deposit' AND trx_id IS NOT NULL"))
  .then(()=>app.listen(port,()=>console.log("NEXORA API listening on port "+port)))
  .catch(error=>{console.error("Database initialization failed",error);process.exit(1);});
