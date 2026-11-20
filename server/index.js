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
app.get("/api/wallet/ledger",requireAuth,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT id,amount_minor,entry_type,reference_id,note,created_at FROM wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]);
  res.json({entries:r.rows});
}));
app.get("/api/admin/users",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT u.id,u.full_name,u.username,u.email,u.phone,u.status,u.created_at,w.balance_minor FROM users u JOIN wallet_accounts w ON w.user_id=u.id ORDER BY u.created_at DESC LIMIT 200");
  res.json({users:r.rows});
}));
app.get("/api/admin/money-requests",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const r=await pool.query("SELECT m.*,u.username,u.email FROM money_requests m JOIN users u ON u.id=m.user_id ORDER BY m.created_at DESC LIMIT 200");
  res.json({requests:r.rows});
}));

// Serve only the public website files from the same origin as the API.
const publicFiles = new Set(["styles.css","app.js","dashboard.html","dashboard.css","dashboard.js"]);
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
app.listen(port,()=>console.log("NEXORA API listening on port "+port));
