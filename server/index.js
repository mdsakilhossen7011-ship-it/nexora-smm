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
// Permit only the external image hosts used by NEXORA's homepage and Free Fire banner.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "img-src": ["'self'", "data:", "https://images.unsplash.com", "https://dl.dir.freefiremobile.com"]
    }
  }
}));
app.use(cors({ origin: (process.env.APP_ORIGIN || "").split(",").filter(Boolean), credentials: true }));
app.use(express.json({ limit: "1.2mb" }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }));
app.use(async (req,res,next)=>{
 try{
  const setting=await pool.query("SELECT enabled,message FROM site_settings WHERE id=TRUE");
  if(!setting.rows[0]?.enabled)return next();
  const raw=req.headers.authorization?.startsWith("Bearer ")?req.headers.authorization.slice(7):req.headers["x-session-token"]||req.headers.cookie?.split(";").map(v=>v.trim()).find(v=>v.startsWith("nexora_session="))?.slice("nexora_session=".length);
  let isAdmin=false;
  if(raw){const admin=await pool.query("SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.role='admin' AND u.status='active' LIMIT 1",[hashToken(decodeURIComponent(raw))]);isAdmin=admin.rowCount>0;}
  // An administrator may keep using only the admin interface and its protected APIs.
  // Do not exempt the public homepage/customer pages just because the same browser is logged in as admin.
  if(isAdmin&&(
   req.path==="/admin.html"||req.path==="/admin.css"||req.path==="/admin.js"||
   req.path==="/support-admin"||req.path==="/support-admin.css"||req.path==="/support-admin.js"||
   req.path==="/styles.css"||req.path==="/ui-icons.css"||req.path==="/ui-icons.js"||
   req.path.startsWith("/api/admin/")||req.path.startsWith("/api/support/")
  ))return next();
  res.set("Cache-Control","no-store");
  if(req.path.startsWith("/api/"))return res.status(503).json({error:"Site is temporarily under maintenance.",maintenance:true,message:setting.rows[0].message});
  const reason=String(setting.rows[0].message||"We are carrying out scheduled maintenance.").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
  return res.status(503).type("html").send('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Site Maintenance — NEXORA SMM</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#08091a;color:#f5f5ff;font:16px Arial,sans-serif;padding:24px;box-sizing:border-box"><main style="max-width:560px;text-align:center;background:#15162b;border:1px solid #5550a0;border-radius:20px;padding:32px"><h1>We’ll be back soon</h1><p style="color:#c9c7df;line-height:1.7">'+reason+'</p><p style="color:#9b98b8;font-size:13px">NEXORA SMM · Site maintenance</p></main></body></html>');
 }catch(error){next(error);}
});


// Cache official Garena artwork in the running service so repeat page visits are fast.
const officialArtworkCache = new Map();
const officialArtworkPending = new Map();
async function getOfficialArtwork(key, url) {
  const cached = officialArtworkCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (officialArtworkPending.has(key)) return officialArtworkPending.get(key);
  const pending = (async () => {
    const upstream = await fetch(url, {
      headers: { "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8", "User-Agent": "Mozilla/5.0 NEXORA-SMM/1.0" },
      signal: AbortSignal.timeout(12000),
      redirect: "error"
    });
    if (!upstream.ok) throw new Error("Garena artwork returned HTTP " + upstream.status);
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) throw new Error("Garena artwork source did not return an image");
    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new Error("Garena artwork has an invalid size");
    const item = { bytes, contentType, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    officialArtworkCache.set(key, item);
    return item;
  })();
  officialArtworkPending.set(key, pending);
  try { return await pending; }
  finally { officialArtworkPending.delete(key); }
}
function sendOfficialArtwork(res, artwork) {
  res.set({
    "Content-Type": artwork.contentType,
    "Content-Length": String(artwork.bytes.length),
    "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
    "X-Content-Type-Options": "nosniff"
  }).send(artwork.bytes);
}
app.get("/media/free-fire-character", async (_req, res, next) => {
  try {
    const artwork = await getOfficialArtwork("free-fire-character", "https://dl.dir.freefiremobile.com/common/web_event/official2.ff.garena.all/20238/4f4fc6c6d43fc3bb5ef4617f9f5340f7.png");
    sendOfficialArtwork(res, artwork);
  } catch (error) {
    console.error("Free Fire character artwork error:", error.message);
    res.status(502).type("text/plain").send("Free Fire character artwork is temporarily unavailable.");
  }
});
app.get("/media/free-fire-background", async (_req, res, next) => {
  try {
    const artwork = await getOfficialArtwork("free-fire-background", "https://cdn.wildflamestudio.com/common/web_event/official2.ff.garena.all/202210/c23d656a45bc5c75cd77d53065605fe0.jpg");
    sendOfficialArtwork(res, artwork);
  } catch (error) {
    console.error("Free Fire background artwork error:", error.message);
    res.status(502).type("text/plain").send("Free Fire background artwork is temporarily unavailable.");
  }
});

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

async function cleanupExpiredSupportMessages() {
  const result = await pool.query("DELETE FROM ticket_messages WHERE created_at <= NOW() - INTERVAL '1 hour'");
  return result.rowCount;
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
app.post("/api/admin/smmexo/services",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{
  const apiKey=process.env.SMMEXO_API_KEY;
  if(!apiKey) return res.status(503).json({error:"SMMEXO_API_KEY is not configured in the hosting environment."});
  const body=new URLSearchParams({key:apiKey,action:"services"});
  let upstream;
  try {
    upstream=await fetch("https://smmexo.com/api/v2",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(15000)});
  } catch(error) {
    return res.status(502).json({error:error.name==="TimeoutError"?"SMMEXO did not respond within 15 seconds.":"Could not connect to SMMEXO."});
  }
  const data=await upstream.json().catch(()=>null);
  if(!upstream.ok) return res.status(502).json({error:"SMMEXO returned HTTP "+upstream.status+"."});
  if(!Array.isArray(data)) return res.status(502).json({error:data?.error||data?.message||"SMMEXO returned an unexpected service-list response."});
  const services=data.map(item=>({
    serviceId:String(item.service??""),
    name:String(item.name??""),
    type:String(item.type??""),
    category:String(item.category??""),
    rate:Number(item.rate),
    min:Number(item.min),
    max:Number(item.max),
    refill:item.refill===true,
    cancel:item.cancel===true
  })).filter(item=>item.serviceId&&item.name&&Number.isFinite(item.rate)&&Number.isFinite(item.min)&&Number.isFinite(item.max));
  res.set("Cache-Control","no-store").json({supplier:"SMMEXO",currency:"USD",count:services.length,services});
}));

app.post("/api/admin/smmexo/import",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
  const parsed=z.object({serviceIds:z.array(z.string().trim().min(1).max(120)).min(1).max(100)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Select between 1 and 100 supplier services to import."});
  const apiKey=process.env.SMMEXO_API_KEY;
  if(!apiKey)return res.status(503).json({error:"SMMEXO_API_KEY is not configured in the hosting environment."});
  const body=new URLSearchParams({key:apiKey,action:"services"});
  let upstream;
  try{
    upstream=await fetch("https://smmexo.com/api/v2",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body,signal:AbortSignal.timeout(15000)});
  }catch(error){
    return res.status(502).json({error:error.name==="TimeoutError"?"SMMEXO did not respond within 15 seconds.":"Could not connect to SMMEXO."});
  }
  const supplierData=await upstream.json().catch(()=>null);
  if(!upstream.ok)return res.status(502).json({error:"SMMEXO returned HTTP "+upstream.status+"."});
  if(!Array.isArray(supplierData))return res.status(502).json({error:supplierData?.error||supplierData?.message||"SMMEXO returned an unexpected service-list response."});
  const selectedIds=[...new Set(parsed.data.serviceIds)];
  const selected=supplierData.filter(item=>selectedIds.includes(String(item.service??"")));
  const foundIds=new Set(selected.map(item=>String(item.service??"")));
  const skipped=selectedIds.filter(id=>!foundIds.has(id)).map(id=>({serviceId:id,reason:"Not found in the current SMMEXO catalogue."}));
  const imported=[];
  const client=await pool.connect();
  const categoryFor=(item)=>{
    const source=(String(item.category??"")+" "+String(item.name??"")).toLowerCase();
    if(source.includes("instagram"))return "instagram";
    if(source.includes("facebook"))return "facebook";
    if(source.includes("tiktok")||source.includes("tik tok"))return "tiktok";
    if(source.includes("youtube"))return "youtube";
    if(source.includes("telegram"))return "telegram";
    if(source.includes("free fire"))return "free_fire";
    if(source.includes("pubg"))return "pubg_mobile";
    if(source.includes("mobile legends")||source.includes("mlbb"))return "mlbb";
    return null;
  };
  try{
    await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS cost_per_1000_minor BIGINT NOT NULL DEFAULT 0");
    await client.query("BEGIN");
    for(const item of selected){
      const serviceId=String(item.service??"");
      const existing=await client.query("SELECT id FROM services WHERE provider_service_id=$1 LIMIT 1",[serviceId]);
      if(existing.rowCount){skipped.push({serviceId,reason:"Already imported."});continue;}
      const category=categoryFor(item);
      const rate=Number(item.rate),min=Math.max(1,Math.floor(Number(item.min)||1)),max=Math.max(min,Math.floor(Number(item.max)||min));
      if(!category){skipped.push({serviceId,reason:"Unsupported category; no matching NEXORA category."});continue;}
      if(!serviceId||!String(item.name??"").trim()||!Number.isFinite(rate)||rate<0||!Number.isFinite(min)||!Number.isFinite(max)){
        skipped.push({serviceId,reason:"Supplier returned invalid service details."});continue;
      }
      const supplierCategory=String(item.category??"").slice(0,500);
      const supplierType=String(item.type??"").slice(0,100);
      const refill=item.refill===true?"Yes":"No",cancel=item.cancel===true?"Yes":"No";
      const description=("Imported from SMMEXO. Wholesale rate: $"+rate.toFixed(4)+" USD per 1,000. Supplier category: "+supplierCategory+". Type: "+supplierType+". Refill: "+refill+". Cancel: "+cancel+". Supplier wholesale rate is stored in USD. Set a BDT selling price before enabling.").slice(0,2000);
      const inserted=await client.query(
        "INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,supplier_rate_usd_per_1000,min_quantity,max_quantity,provider_service_id,enabled) VALUES($1,$2,$3,0,0,$4,$5,$6,$7,FALSE) RETURNING id",
        [category,String(item.name).trim().slice(0,160),description,rate,min,max,serviceId]
      );
      await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'smmexo_service_imported','service',$2,$3::jsonb)",[req.user.id,inserted.rows[0].id,JSON.stringify({supplier:"SMMEXO",supplier_service_id:serviceId,wholesale_rate_usd_per_1000:rate,category})]);
      imported.push({serviceId,name:String(item.name).trim().slice(0,160),id:inserted.rows[0].id});
    }
    await client.query("COMMIT");
  }catch(error){
    await client.query("ROLLBACK");
    throw error;
  }finally{client.release();}
  res.set("Cache-Control","no-store").json({imported,skipped,importedCount:imported.length,skippedCount:skipped.length});
}));



app.post("/api/admin/ff-reseller/import-catalogue",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const catalog=[["BD Server","25 Diamonds","25",19.5,25],["BD Server","50 Diamonds","50",33.8,50],["BD Server","Weekly Lite","LITE",35.1,1],["BD Server","Level Up 6","LV6",35.1,1],["BD Server","Level Up 10","LV10",62.4,1],["BD Server","Level Up 15","LV15",62.4,1],["BD Server","Level Up 20","LV20",62.4,1],["BD Server","Level Up 25","LV25",62.4,1],["BD Server","115 Diamonds","115",74.1,115],["BD Server","Level Up 30","LV30",88.4,1],["BD Server","240 Diamonds","240",146.9,240],["BD Server","Weekly","WEEKLY",149.5,1],["BD Server","610 Diamonds","610",371.8,610],["BD Server","Monthly","MONTHLY",734.5,1],["BD Server","1240 Diamonds","1240",741,1240],["BD Server","2530 Diamonds","2530",1487.2,2530],["Indonesia Server","50 Diamonds","INDO50",49.4,50],["Indonesia Server","70 Diamonds","INDO70",68.9,70],["Indonesia Server","140 Diamonds","INDO140",137.8,140],["Indonesia Server","Weekly","INDO_WEEKLY",208,1],["Indonesia Server","355 Diamonds","INDO355",343.2,355],["Indonesia Server","Monthly","INDO_MONTHLY",624,1],["Indonesia Server","720 Diamonds","INDO720",686.4,720],["Indonesia Server","7290 Diamonds","INDO7290",6864,7290],["UniPin Voucher BD","25 Diamond Code","U25",19.5,25],["UniPin Voucher BD","50 Diamond Code","U50",33.8,50],["UniPin Voucher BD","115 Diamond Code","U115",74.1,115],["UniPin Voucher BD","240 Diamond Code","U240",146.9,240],["UniPin Voucher BD","Weekly Code","U161",149.5,1],["UniPin Voucher BD","610 Diamond Code","U610",371.8,610],["UniPin Voucher BD","1240 Diamond Code","U1240",741,1240],["UniPin Voucher BD","2530 Diamond Code","U2530",1487.2,2530]];
 const client=await pool.connect();const imported=[],skipped=[];
 try{
  await client.query("BEGIN");
  for(const [group,label,tag,cost,qty] of catalog){
   const providerId="ffreseller:"+tag;
   const existing=await client.query("SELECT id FROM services WHERE provider_service_id=$1 LIMIT 1",[providerId]);
   if(existing.rowCount){skipped.push({tag,reason:"Already imported"});continue;}
   const perThousand=Math.ceil(Math.round(cost*100)*1000/qty);
   const name=group+" · "+label;
   const description="FF Reseller "+group+" package. Supplier tag: "+tag+". Supplier cost: ৳"+cost.toFixed(2)+". Set your customer selling price before enabling this service.";
   const inserted=await client.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) VALUES('free_fire',$1,$2,$3,$4,$5,$5,$6,FALSE) RETURNING id",[name,description,perThousand,perThousand,qty,providerId]);
   imported.push({id:inserted.rows[0].id,group,label,tag,supplierCostBdt:cost});
  }
  await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES($1,'ff_reseller_catalogue_imported','service',$2::jsonb)",[req.user.id,JSON.stringify({imported:imported.length,skipped:skipped.length,total:catalog.length})]);
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 res.json({total:catalog.length,importedCount:imported.length,skippedCount:skipped.length,imported,skipped,enabled:false,message:"Imported disabled. Set customer selling prices and enable each package in Services before customer ordering."});
}));

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
  const result=await pool.query("SELECT id,category,name,description,price_per_1000_minor,min_quantity,max_quantity,provider_service_id FROM services WHERE enabled=true ORDER BY category,name");
  res.json({services:result.rows});
}));
app.get("/api/public/recent-orders",asyncRoute(async(_req,res)=>{
 const result=await pool.query("SELECT s.name AS service_name,o.created_at FROM orders o JOIN services s ON s.id=o.service_id WHERE s.category='free_fire' AND o.status='completed' AND o.created_at>NOW()-INTERVAL '24 hours' ORDER BY o.created_at DESC LIMIT 8");
 res.set("Cache-Control","public, max-age=30").json({orders:result.rows.map(row=>({service_name:row.service_name,time_label:Math.max(1,Math.floor((Date.now()-new Date(row.created_at).getTime())/60000))+" min ago"}))});
}));
async function refundFFResellerOrder(orderId,userId,note){
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const updated=await client.query("UPDATE orders SET status='refunded',updated_at=NOW() WHERE id=$1 AND user_id=$2 AND status='processing' RETURNING charge_minor",[orderId,userId]);
  if(!updated.rowCount){await client.query("COMMIT");return false;}
  const amount=updated.rows[0].charge_minor;
  const wallet=await client.query("UPDATE wallet_accounts SET balance_minor=balance_minor+$1,total_spent_minor=GREATEST(0,total_spent_minor-$1),updated_at=NOW() WHERE user_id=$2",[amount,userId]);
  if(wallet.rowCount!==1)throw new Error("Wallet account missing; refund transaction rolled back.");
  await client.query("INSERT INTO wallet_ledger(user_id,amount_minor,entry_type,reference_id,note) VALUES($1,$2,'refund',$3,$4)",[userId,amount,orderId,note||"Automatic refund: FF Reseller rejected order"]);
  await client.query("COMMIT");
  return true;
 }catch(error){
  await client.query("ROLLBACK");
  console.error("FF Reseller refund failed:",error.message);
  throw error;
 }finally{client.release();}
}
async function syncFFResellerOrder(orderId,userId){
 // Network lookup is deliberately outside the DB transaction/row lock.
 const found=await pool.query("SELECT o.provider_order_id,o.status,s.provider_service_id FROM orders o JOIN services s ON s.id=o.service_id WHERE o.id=$1 AND o.user_id=$2",[orderId,userId]);
 if(!found.rowCount||found.rows[0].status!=="processing"||!String(found.rows[0].provider_service_id||"").startsWith("ffreseller:")||String(found.rows[0].provider_service_id).startsWith("ffreseller:U")||!found.rows[0].provider_order_id)return;
 let data;
 try{data=await ffResellerRequest("/api/resaleorder/status?order_id="+encodeURIComponent(found.rows[0].provider_order_id));}
 catch(error){console.error("FF Reseller status lookup failed:",{orderId,message:error.message,status:error.status||null});return;}
 const state=ffProviderStatus(data);
 if(state==="failed"){await refundFFResellerOrder(orderId,userId,"Automatic refund: FF Reseller order failed");return;}
 if(state==="completed"){
  await pool.query("INSERT INTO ff_reseller_webhook_events(order_id,provider_order_id,status,payload) SELECT $1,$2,'completed',$3::jsonb WHERE NOT EXISTS (SELECT 1 FROM ff_reseller_webhook_events WHERE order_id=$1 AND status='completed' AND created_at>NOW()-INTERVAL '1 day')",[orderId,found.rows[0].provider_order_id,JSON.stringify({source:"supplier_status_api"})]);
  console.info("FF Reseller supplier reports completed; awaiting customer confirmation:",{orderId});
  return;
 }
 const statusKeys=[];
 const scan=[data];const seen=new Set();
 while(scan.length&&seen.size<100){
  const value=scan.shift();if(!value||typeof value!=="object"||seen.has(value))continue;seen.add(value);
  if(Array.isArray(value)){scan.push(...value);continue;}
  for(const [key,child] of Object.entries(value)){if(/status/i.test(key)&&typeof child!=="object")statusKeys.push([key,String(child).slice(0,80)]);else if(child&&typeof child==="object")scan.push(child);}
 }
 console.warn("FF Reseller status remains processing:",{orderId,responseStatusFields:statusKeys});
}
function ffResellerWebhookToken(orderId){
 const key=process.env.FF_RESELLER_API_KEY;
 if(!key)throw new Error("FF_RESELLER_API_KEY is not configured.");
 return crypto.createHmac("sha256",key).update("ff-reseller-webhook:"+orderId).digest("hex");
}
function validFFResellerWebhookToken(orderId,provided){
 if(typeof provided!=="string"||!/^[a-f0-9]{64}$/i.test(provided))return false;
 const expected=Buffer.from(ffResellerWebhookToken(orderId),"hex");
 const actual=Buffer.from(provided,"hex");
 return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
const ffWebhookLimiter=rateLimit({windowMs:60*1000,limit:20,standardHeaders:true,legacyHeaders:false,message:{error:"Too many supplier webhook requests. Try again later."}});
app.post("/api/webhooks/ff-reseller",ffWebhookLimiter,asyncRoute(async(req,res)=>{
 const orderId=String(req.body?.orderid||"");
 if(!/^[0-9a-f-]{36}$/i.test(orderId))return res.status(400).json({error:"Invalid order reference."});
 if(!validFFResellerWebhookToken(orderId,String(req.query.token||"")))return res.status(401).json({error:"Invalid supplier webhook token."});
 const status=String(req.body?.status||"").trim().toLowerCase();
 const found=await pool.query("SELECT o.id,o.user_id,o.status,s.provider_service_id FROM orders o JOIN services s ON s.id=o.service_id WHERE o.provider_order_id=$1 LIMIT 1",[orderId]);
 if(!found.rowCount)return res.status(404).json({error:"Order not found."});
 const order=found.rows[0];
 if(!String(order.provider_service_id||"").startsWith("ffreseller:")||String(order.provider_service_id).startsWith("ffreseller:U"))return res.status(400).json({error:"Webhook does not match a supported FF UID order."});
 if(order.status!=="processing")return res.json({ok:true,alreadyFinal:true,status:order.status});
 if(!["success","complete","completed","failed","failure","error","cancelled","canceled"].includes(status))return res.status(400).json({error:"Unsupported supplier webhook status."});
 const callbackPayload={content:typeof req.body?.content==="string"?req.body.content.slice(0,2000):"",codes:Array.isArray(req.body?.codes)?req.body.codes.slice(0,20).map(value=>String(value).slice(0,200)):[]};
 await pool.query("INSERT INTO ff_reseller_webhook_events(order_id,provider_order_id,status,payload) VALUES($1,$2,$3,$4::jsonb)",[order.id,orderId,status,JSON.stringify(callbackPayload)]);
 if(["success","complete","completed"].includes(status)){
  console.info("FF Reseller reported delivery; awaiting customer confirmation:",{orderId});
  return res.json({ok:true,status:"awaiting_customer_confirmation"});
 }
 if(["failed","failure","error","cancelled","canceled"].includes(status)){
  const refunded=await refundFFResellerOrder(order.id,order.user_id,"Automatic refund: FF Reseller webhook reported "+status);
  console.info("FF Reseller webhook reported failed order:",{orderId,refunded});
  return res.json({ok:true,status:refunded?"refunded":"unchanged"});
 }
}));
app.get("/api/orders",requireAuth,asyncRoute(async(req,res)=>{
  const pending=await pool.query("SELECT o.id FROM orders o JOIN services s ON s.id=o.service_id WHERE o.user_id=$1 AND o.status='processing' AND s.provider_service_id LIKE 'ffreseller:%' AND s.provider_service_id NOT LIKE 'ffreseller:U%' AND o.provider_order_id IS NOT NULL ORDER BY o.created_at ASC LIMIT 10",[req.user.id]);
  for(const item of pending.rows)await syncFFResellerOrder(item.id,req.user.id);
  const result=await pool.query("SELECT o.id,o.target,o.quantity,o.charge_minor,o.status,o.created_at,s.name AS service_name,s.category FROM orders o JOIN services s ON s.id=o.service_id WHERE o.user_id=$1 ORDER BY o.created_at DESC LIMIT 100",[req.user.id]);
  res.json({orders:result.rows});
}));
async function ffResellerRequest(path,body){
 const key=process.env.FF_RESELLER_API_KEY;
 if(!key)throw Object.assign(new Error("FF_RESELLER_API_KEY is not configured in Render."),{status:503});
 let response;
 try{response=await fetch("https://buildspare.site"+path,{method:body?"POST":"GET",headers:{"Authorization":"Bearer "+key,"Accept":"application/json",...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});}
 catch(error){throw Object.assign(new Error("FF Reseller did not respond. Check order status before retrying."),{status:502,uncertain:true});}
 const raw=await response.text();let data;try{data=raw?JSON.parse(raw):{};}catch{data={message:raw.slice(0,500)};}
 if(!response.ok)throw Object.assign(new Error(data?.message||data?.error||("FF Reseller HTTP "+response.status)),{status:response.status>=500?502:400,provider:data,providerRejected:response.status>=400&&response.status<500,uncertain:response.status>=500});
 const message=String(typeof data==="string"?data:(data?.message||data?.error||""));
 if(/insufficient balance|stock is not available|package not found|unauthorized|invalid/i.test(message))throw Object.assign(new Error(message),{status:400,provider:data,providerRejected:true});
 return data;
}
function ffProviderStatus(data){
 const terminalComplete=new Set(["success","successful","completed","complete","delivered","done"]);
 const terminalFailed=new Set(["failed","failure","error","cancelled","canceled","rejected"]);
 const queue=[{value:data,depth:0}],seen=new Set(),statuses=[];
 while(queue.length){
  const {value,depth}=queue.shift();
  if(!value||typeof value!=="object"||depth>6||seen.has(value))continue;
  seen.add(value);
  if(Array.isArray(value)){for(const item of value)queue.push({value:item,depth:depth+1});continue;}
  for(const [key,child] of Object.entries(value)){
   const normalizedKey=key.toLowerCase().replace(/[^a-z]/g,"");
   if(["status","orderstatus","deliverystatus","fulfilmentstatus","fulfillmentstatus"].includes(normalizedKey)&&typeof child==="string"&&child.trim())statuses.push(child.trim().toLowerCase());
   if(child&&typeof child==="object")queue.push({value:child,depth:depth+1});
  }
 }
 if(statuses.some(value=>terminalFailed.has(value)))return"failed";
 if(statuses.some(value=>terminalComplete.has(value)))return"completed";
 return"processing";
}
app.post("/api/orders",requireAuth,asyncRoute(async(req,res)=>{
 const parsed=z.object({serviceId:z.string().uuid(),requestId:z.string().uuid().optional(),target:z.string().trim().max(500).optional().default(""),quantity:z.number().int().positive()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Invalid order details."});
 const orderId=parsed.data.requestId||crypto.randomUUID();
 const client=await pool.connect();let committed=false;let orderRow=null;let ffContext=null;
 try{
  await client.query("BEGIN");
  const prior=await client.query("SELECT id,status,charge_minor,created_at FROM orders WHERE id=$1 AND user_id=$2",[orderId,req.user.id]);
  if(prior.rowCount){await client.query("COMMIT");return res.status(200).json({order:prior.rows[0],message:"This order request was already received. It will not be submitted again.",duplicate:true});}
  const svc=await client.query("SELECT * FROM services WHERE id=$1 AND enabled=true FOR UPDATE",[parsed.data.serviceId]);
  if(!svc.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Service unavailable."});}
  const s=svc.rows[0],q=parsed.data.quantity,isFF=s.category==="free_fire",providerId=String(s.provider_service_id||"");
  if(!isFF&&parsed.data.target.trim().length<2){await client.query("ROLLBACK");return res.status(400).json({error:"Enter a valid target for this service."});}
  const isFFReseller=isFF&&providerId.startsWith("ffreseller:");
  if(isFFReseller&&process.env.FF_RESELLER_ORDERS_ENABLED!=="true"){await client.query("ROLLBACK");return res.status(503).json({error:"FF Reseller orders are not enabled yet. No balance was deducted."});}
  if(isFFReseller&&!process.env.FF_RESELLER_API_KEY){await client.query("ROLLBACK");return res.status(503).json({error:"FF Reseller API key is not configured. No balance was deducted."});}
  if(!isFFReseller&&process.env.ORDER_FULFILMENT_ENABLED!=="true"){await client.query("ROLLBACK");return res.status(503).json({error:"Ordering is temporarily disabled until a verified supplier fulfilment workflow is configured. No balance was deducted."});}
  const isVoucher=isFFReseller&&providerId.startsWith("ffreseller:U");
  if(isFFReseller&&BigInt(s.price_per_1000_minor)<=BigInt(s.cost_per_1000_minor||0)){await client.query("ROLLBACK");return res.status(400).json({error:"Admin must set a customer selling price above the supplier cost before this package can be ordered. No balance was deducted."});}
  if(isVoucher){await client.query("ROLLBACK");return res.status(503).json({error:"UniPin voucher ordering is temporarily unavailable until supplier order tracking and secure code delivery are verified. No balance was deducted."});}
  if(isVoucher&&process.env.FF_RESELLER_VOUCHERS_ENABLED!=="true"){await client.query("ROLLBACK");return res.status(503).json({error:"UniPin voucher orders are not enabled until supplier delivery and status handling are verified. No balance was deducted."});}
  if(isFFReseller&&!isVoucher&&!/^[0-9]{6,12}$/.test(parsed.data.target)){await client.query("ROLLBACK");return res.status(400).json({error:"Enter a valid 6–12 digit Free Fire Player UID."});}
  if(!isFFReseller&&isFF&&!/^[0-9]{5,12}$/.test(parsed.data.target)){await client.query("ROLLBACK");return res.status(400).json({error:"Enter a valid 5–12 digit Free Fire Player UID."});}
  if(isFF?(q<s.min_quantity||q%s.min_quantity!==0||q>s.min_quantity*10):(q<s.min_quantity||q>s.max_quantity)){await client.query("ROLLBACK");return res.status(400).json({error:"Quantity is outside the service limits."});}
  const packageCount=isFF?Math.floor(q/s.min_quantity):q;
  const charge=BigInt(Math.ceil(Number(s.price_per_1000_minor)*q/1000));
  const wallet=await client.query("SELECT balance_minor FROM wallet_accounts WHERE user_id=$1 FOR UPDATE",[req.user.id]);
  if(!wallet.rowCount||BigInt(wallet.rows[0].balance_minor)<charge){await client.query("ROLLBACK");return res.status(400).json({error:"Insufficient wallet balance."});}
  const inserted=await client.query("INSERT INTO orders(id,user_id,service_id,target,quantity,charge_minor,status,provider_order_id) VALUES($1,$2,$3,$4,$5,$6,'processing',$7) ON CONFLICT(id) DO NOTHING RETURNING id,status,charge_minor,created_at",[orderId,req.user.id,s.id,isVoucher?"UNIPIN VOUCHER":parsed.data.target,q,charge.toString(),isFFReseller?orderId:null]);
  if(!inserted.rowCount){await client.query("ROLLBACK");const existing=await pool.query("SELECT id,status,charge_minor,created_at FROM orders WHERE id=$1 AND user_id=$2",[orderId,req.user.id]);return res.status(200).json({order:existing.rows[0],message:"This order request was already received. It will not be submitted again.",duplicate:true});}
  await client.query("UPDATE wallet_accounts SET balance_minor=balance_minor-$1,total_spent_minor=total_spent_minor+$1,updated_at=NOW() WHERE user_id=$2",[charge.toString(),req.user.id]);
  await client.query("INSERT INTO wallet_ledger(user_id,amount_minor,entry_type,reference_id,note) VALUES($1,$2,'order_charge',$3,$4)",[req.user.id,(-charge).toString(),orderId,"Order charge"]);
  await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,$2,'order',$3,$4::jsonb)",[req.user.id,isFFReseller?"ff_reseller_order_queued":"order_submitted",orderId,JSON.stringify({provider:isFFReseller?"FF_RESELLER":null,tag:isFFReseller?providerId.slice("ffreseller:".length):null,isVoucher,requestId:orderId})]);
  await client.query("COMMIT");committed=true;orderRow=inserted.rows[0];
  if(isFFReseller)ffContext={tag:providerId.slice("ffreseller:".length),isVoucher,packageCount,target:parsed.data.target};
 }catch(error){if(!committed)await client.query("ROLLBACK");throw error;}finally{client.release();}
 if(ffContext){
  let providerData;
  try{
   providerData=ffContext.isVoucher
    ?await ffResellerRequest("/api/resaleorder/bulk",{items:[{tag_line:ffContext.tag,quantity:ffContext.packageCount}]})
    :await ffResellerRequest("/api/resaleorder",{account_info:{player_id:ffContext.target},selectedPackage:{id:1,tag_line:ffContext.tag},quantity:ffContext.packageCount,order_id:orderId,url:(process.env.APP_ORIGIN||"https://nexora-smm.onrender.com").split(",")[0].replace(/\/+$/,"")+"/api/webhooks/ff-reseller?token="+ffResellerWebhookToken(orderId)});
   const state=ffProviderStatus(providerData);
   const msg=String(typeof providerData==="string"?providerData:(providerData?.message||providerData?.error||""));
   if(providerData?.success===false||providerData?.data?.success===false||state==="failed"||/insufficient balance|stock is not available|package not found|unauthorized|validation error/i.test(msg)){
    await refundFFResellerOrder(orderId,req.user.id,"Automatic refund: "+(msg||"FF Reseller rejected order"));
    const refreshed=await pool.query("SELECT id,status,charge_minor,created_at FROM orders WHERE id=$1",[orderId]);
    return res.status(502).json({order:refreshed.rows[0],error:msg||"FF Reseller rejected this order. Your wallet was refunded.",refunded:true});
   }
   let voucherPayload="";
   if(ffContext.isVoucher){voucherPayload=Array.isArray(providerData?.codes)?providerData.codes.join("\\n"):String(providerData?.content||"");if(voucherPayload)await pool.query("UPDATE orders SET target=$2,status='completed',updated_at=NOW() WHERE id=$1 AND status='processing'",[orderId,"UNIPIN CODE: "+voucherPayload]);}
   else if(state==="completed")await pool.query("UPDATE orders SET status='completed',updated_at=NOW() WHERE id=$1 AND status='processing'",[orderId]);
   orderRow=(await pool.query("SELECT id,status,charge_minor,created_at FROM orders WHERE id=$1",[orderId])).rows[0];
   return res.status(201).json({order:orderRow,message:orderRow.status==="completed"?"Order completed successfully.":"Order accepted for processing. If supplier confirmation is delayed, do not place it again.",providerStatus:orderRow.status,providerResult:providerData?.codes||providerData?.content||undefined});
  }catch(error){
   if(error.providerRejected){await refundFFResellerOrder(orderId,req.user.id,"Automatic refund: "+error.message);const refunded=await pool.query("SELECT id,status,charge_minor,created_at FROM orders WHERE id=$1",[orderId]);return res.status(502).json({order:refunded.rows[0],error:error.message,refunded:true});}
   const refreshed=await pool.query("SELECT id,status,charge_minor,created_at FROM orders WHERE id=$1",[orderId]);
   return res.status(201).json({order:refreshed.rows[0],message:error.uncertain?"Supplier response timed out or was unavailable. Order is held for status checking; do not submit it again.":"Order is held for admin verification. Do not submit it again.",providerPending:true});
  }
 }
 return res.status(201).json({order:orderRow,message:"Order submitted."});
}));

app.get("/api/public/money-limits",asyncRoute(async(_req,res)=>{const r=await pool.query("SELECT minimum_deposit_bdt,minimum_withdrawal_bdt FROM money_request_settings WHERE id=TRUE");const x=r.rows[0]||{minimum_deposit_bdt:100,minimum_withdrawal_bdt:100};res.set("Cache-Control","no-store").json({minimum_deposit:Number(x.minimum_deposit_bdt),minimum_withdrawal:Number(x.minimum_withdrawal_bdt)});}));
app.get("/api/public/payment-settings",asyncRoute(async(_req,res)=>{const r=await pool.query("SELECT method,account_number,account_type FROM payment_settings WHERE active=TRUE AND method IN ('bkash','nagad')");const settings={};for(const x of r.rows)settings[x.method]={number:x.account_number,type:x.account_type};const c=await pool.query("SELECT bep20_address,binance_pay_id,usdt_bdt_rate FROM crypto_payment_settings WHERE id=TRUE");const x=c.rows[0]||{};if(Number(x.usdt_bdt_rate)>0&&x.bep20_address)settings.usdt_bep20={number:x.bep20_address};if(Number(x.usdt_bdt_rate)>0&&x.binance_pay_id)settings.binance_pay={number:x.binance_pay_id};res.set("Cache-Control","no-store").json({settings,usdt_bdt_rate:Number(x.usdt_bdt_rate||0)});}));
app.get("/api/admin/money-limits",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{const r=await pool.query("SELECT minimum_deposit_bdt,minimum_withdrawal_bdt FROM money_request_settings WHERE id=TRUE");const x=r.rows[0]||{minimum_deposit_bdt:100,minimum_withdrawal_bdt:100};res.set("Cache-Control","no-store").json({minimum_deposit:Number(x.minimum_deposit_bdt),minimum_withdrawal:Number(x.minimum_withdrawal_bdt)});}));
app.put("/api/admin/money-limits",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{const parsed=z.object({minimumDeposit:z.number().int().min(1).max(50000),minimumWithdrawal:z.number().int().min(1).max(50000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Minimum amounts must be whole BDT values between ৳1 and ৳50,000."});const v=parsed.data;await pool.query("INSERT INTO money_request_settings(id,minimum_deposit_bdt,minimum_withdrawal_bdt,updated_at,updated_by) VALUES(TRUE,$1,$2,NOW(),$3) ON CONFLICT(id) DO UPDATE SET minimum_deposit_bdt=EXCLUDED.minimum_deposit_bdt,minimum_withdrawal_bdt=EXCLUDED.minimum_withdrawal_bdt,updated_at=NOW(),updated_by=EXCLUDED.updated_by",[v.minimumDeposit,v.minimumWithdrawal,req.user.id]);await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES($1,'money_request_limits_updated','money_request_settings',$2::jsonb)",[req.user.id,JSON.stringify({minimum_deposit_bdt:v.minimumDeposit,minimum_withdrawal_bdt:v.minimumWithdrawal})]);res.set("Cache-Control","no-store").json({ok:true,minimum_deposit:v.minimumDeposit,minimum_withdrawal:v.minimumWithdrawal});}));
app.get("/api/admin/payment-settings",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{const r=await pool.query("SELECT method,account_number,account_type FROM payment_settings");const settings={};for(const x of r.rows)settings[x.method]={number:x.account_number,type:x.account_type};res.set("Cache-Control","no-store").json({settings});}));
app.put("/api/admin/payment-settings",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{const item=z.object({number:z.string().trim().max(20).default(""),type:z.enum(["personal","merchant"]).default("personal")});const parsed=z.object({settings:z.object({bkash:item,nagad:item})}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Enter valid payment numbers and account types."});const client=await pool.connect();try{await client.query("BEGIN");for(const [method,value] of Object.entries(parsed.data.settings)){const number=value.number;if(number&&!/^(?:\+?88)?01[3-9]\d{8}$/.test(number)){await client.query("ROLLBACK");return res.status(400).json({error:"Enter a valid Bangladesh mobile number for "+method+"."});}await client.query("INSERT INTO payment_settings(method,account_number,account_type,active,updated_at,updated_by) VALUES($1,$2,$3,$4,NOW(),$5) ON CONFLICT(method) DO UPDATE SET account_number=EXCLUDED.account_number,account_type=EXCLUDED.account_type,active=EXCLUDED.active,updated_at=NOW(),updated_by=EXCLUDED.updated_by",[method,number,value.type,Boolean(number),req.user.id]);}await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES($1,$2,$3,$4::jsonb)",[req.user.id,"payment_numbers_updated","payment_settings",JSON.stringify({configured:Object.entries(parsed.data.settings).filter(([,v])=>v.number).map(([k])=>k)})]);await client.query("COMMIT");res.json({ok:true});}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}));

app.get("/api/admin/crypto-payment-settings",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{const r=await pool.query("SELECT bep20_address,binance_pay_id,usdt_bdt_rate FROM crypto_payment_settings WHERE id=TRUE");res.json(r.rows[0]||{bep20_address:"",binance_pay_id:"",usdt_bdt_rate:0});}));
app.put("/api/admin/crypto-payment-settings",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{const parsed=z.object({bep20_address:z.string().trim().max(120).default(""),binance_pay_id:z.string().trim().max(80).default(""),usdt_bdt_rate:z.number().positive().max(10000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Enter a valid USDT rate and receiving details."});const v=parsed.data;await pool.query("INSERT INTO crypto_payment_settings(id,bep20_address,binance_pay_id,usdt_bdt_rate,updated_at,updated_by) VALUES(TRUE,$1,$2,$3,NOW(),$4) ON CONFLICT(id) DO UPDATE SET bep20_address=EXCLUDED.bep20_address,binance_pay_id=EXCLUDED.binance_pay_id,usdt_bdt_rate=EXCLUDED.usdt_bdt_rate,updated_at=NOW(),updated_by=EXCLUDED.updated_by",[v.bep20_address,v.binance_pay_id,v.usdt_bdt_rate,req.user.id]);res.json({ok:true});}));
app.get("/api/money-requests",requireAuth,asyncRoute(async(req,res)=>{
  await pool.query("INSERT INTO commission_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING",[req.user.id]);
  const [requests,commission]=await Promise.all([
    pool.query("SELECT id,request_type,method,amount_minor,trx_id,account_number,crypto_amount,conversion_rate,status,review_note,created_at,reviewed_at FROM money_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",[req.user.id]),
    pool.query("SELECT balance_minor FROM commission_accounts WHERE user_id=$1",[req.user.id])
  ]);
  res.json({requests:requests.rows,commission_balance_minor:commission.rows[0].balance_minor});
}));
app.post("/api/money-requests/deposit",requireAuth,asyncRoute(async(req,res)=>{
  const parsed=z.object({method:z.enum(["bkash","nagad","usdt_bep20","binance_pay"]),amount:z.number().positive().max(50000),trxId:z.string().trim().min(6).max(120),accountNumber:z.string().trim().min(3).max(120)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter valid deposit details. Minimum deposit is ৳100 equivalent."});
  const d=parsed.data;let bdt=d.amount,usdt=null,rate=null;
  if((d.method==="bkash"||d.method==="nagad")&&!Number.isInteger(d.amount))return res.status(400).json({error:"Mobile wallet deposits must be whole BDT amounts."});
  if(d.method==="usdt_bep20"||d.method==="binance_pay"){const c=await pool.query("SELECT bep20_address,binance_pay_id,usdt_bdt_rate FROM crypto_payment_settings WHERE id=TRUE");const cfg=c.rows[0];if(!cfg||!Number(cfg.usdt_bdt_rate)||!(d.method==="usdt_bep20"?cfg.bep20_address:cfg.binance_pay_id))return res.status(400).json({error:"This crypto deposit method is not configured yet."});if(!/^\d+(?:\.\d{1,6})?$/.test(String(d.amount)))return res.status(400).json({error:"Enter USDT up to 6 decimal places."});usdt=d.amount;rate=Number(cfg.usdt_bdt_rate);bdt=Math.round(usdt*rate*100)/100;}
  const limitsResult=await pool.query("SELECT minimum_deposit_bdt FROM money_request_settings WHERE id=TRUE");const minimumDeposit=Number(limitsResult.rows[0]?.minimum_deposit_bdt||100);if(!Number.isFinite(bdt)||bdt<minimumDeposit||bdt>50000)return res.status(400).json({error:"Converted deposit must be between ৳"+minimumDeposit+" and ৳50,000."});
  if((d.method==="bkash"||d.method==="nagad")&&!/^(?:\+?88)?01[3-9]\d{8}$/.test(d.accountNumber))return res.status(400).json({error:"Enter a valid sender mobile number."});
  const r=await pool.query("INSERT INTO money_requests(user_id,request_type,method,amount_minor,trx_id,account_number,crypto_amount,conversion_rate) VALUES($1,'deposit',$2,$3,$4,$5,$6,$7) RETURNING id,status,created_at",[req.user.id,d.method,Math.round(bdt*100),d.trxId,d.accountNumber,usdt,rate]);
  res.status(201).json({request:r.rows[0],message:"Deposit request submitted. Balance will be added only after admin verifies the payment."});
}));
app.post("/api/money-requests/withdraw",requireAuth,asyncRoute(async(req,res)=>{
  const parsed=z.object({method:z.enum(["bkash","nagad","rocket","upay"]),amount:z.number().int().positive().max(50000),accountNumber:z.string().trim().regex(/^(?:\+?88)?01[3-9]\d{8}$/)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({error:"Enter a valid withdrawal amount and payout number."});
  const limitsResult=await pool.query("SELECT minimum_withdrawal_bdt FROM money_request_settings WHERE id=TRUE");const minimumWithdrawal=Number(limitsResult.rows[0]?.minimum_withdrawal_bdt||100);if(parsed.data.amount<minimumWithdrawal)return res.status(400).json({error:"Minimum withdrawal is ৳"+minimumWithdrawal+"."});
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
app.get("/api/admin/orders/:id/ff-reconciliation",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const r=await pool.query("SELECT o.id,o.user_id,o.target,o.quantity,o.charge_minor,o.status,o.created_at,o.updated_at,o.provider_order_id,s.name AS service_name,s.provider_service_id,u.full_name,u.username FROM orders o JOIN services s ON s.id=o.service_id JOIN users u ON u.id=o.user_id WHERE o.id=$1",[req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:"Order not found."});
 const order=r.rows[0];
 if(!String(order.provider_service_id||"").startsWith("ffreseller:")||String(order.provider_service_id).startsWith("ffreseller:U")||!order.provider_order_id)return res.status(400).json({error:"This is not a supported FF Reseller UID order."});
 const events=await pool.query("SELECT status,payload,created_at FROM ff_reseller_webhook_events WHERE order_id=$1 ORDER BY created_at DESC LIMIT 20",[order.id]);
 const origin=(process.env.APP_ORIGIN||"https://nexora-smm.onrender.com").split(",")[0].replace(/\/+$/,"");
 const callbackUrl=origin+"/api/webhooks/ff-reseller?token="+ffResellerWebhookToken(order.provider_order_id);
 res.set("Cache-Control","no-store").json({order,events:events.rows,callbackUrl});
}));
app.post("/api/admin/orders/:id/confirm-delivered",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({reason:z.string().trim().min(10).max(250),customerConfirmed:z.literal(true)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Customer confirmation details are required (10–250 characters)."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query("SELECT o.id,o.user_id,o.status,o.provider_order_id,s.provider_service_id FROM orders o JOIN services s ON s.id=o.service_id WHERE o.id=$1 FOR UPDATE OF o",[req.params.id]);
  if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Order not found."});}
  const order=found.rows[0];
  if(!String(order.provider_service_id||"").startsWith("ffreseller:")||String(order.provider_service_id).startsWith("ffreseller:U")||!order.provider_order_id){await client.query("ROLLBACK");return res.status(400).json({error:"This is not a supported FF Reseller UID order."});}
  if(order.status!=="processing"){await client.query("ROLLBACK");return res.status(409).json({error:"Only a processing order can be reconciled."});}
  const updated=await client.query("UPDATE orders SET status='completed',updated_at=NOW() WHERE id=$1 AND status='processing' RETURNING id",[order.id]);
  if(!updated.rowCount){await client.query("ROLLBACK");return res.status(409).json({error:"Order status changed. Refresh and review it again."});}
  await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'ff_reseller_delivery_customer_confirmed','order',$2,$3::jsonb)",[req.user.id,order.id,JSON.stringify({provider_order_id:order.provider_order_id,customer_confirmation:parsed.data.reason})]);
  await client.query("COMMIT");
  res.json({ok:true,status:"completed"});
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
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
 const r=await pool.query("SELECT s.id,s.category,s.name,s.description,s.price_per_1000_minor,s.cost_per_1000_minor,s.supplier_rate_usd_per_1000,s.min_quantity,s.max_quantity,s.provider_service_id,s.enabled,s.created_at,s.updated_at,(SELECT COUNT(*) FROM orders o WHERE o.service_id=s.id)::int AS order_count FROM services s ORDER BY s.category,s.name");
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

app.patch("/api/admin/services/bulk-pricing",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({serviceIds:z.array(z.string().uuid()).min(1).max(500),price:z.number().finite().min(0).max(10000000),cost:z.number().finite().min(0).max(10000000)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Select 1–500 services and enter valid BDT prices."});
 const d=parsed.data,price=Math.round(d.price*100),cost=Math.round(d.cost*100),client=await pool.connect();
 try{
  await client.query("BEGIN");
  const updated=await client.query("UPDATE services SET price_per_1000_minor=$1,cost_per_1000_minor=$2,updated_at=NOW() WHERE id=ANY($3::uuid[]) RETURNING id,name",[price,cost,d.serviceIds]);
  if(updated.rowCount!==d.serviceIds.length){await client.query("ROLLBACK");return res.status(404).json({error:"Some selected services were not found. No prices were changed; refresh the list and try again."});}
  await client.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES($1,'services_bulk_pricing_updated','service',$2::jsonb)",[req.user.id,JSON.stringify({service_ids:d.serviceIds,count:updated.rowCount,price_per_1000_minor:price,cost_per_1000_minor:cost})]);
  await client.query("COMMIT");
  res.json({ok:true,updatedCount:updated.rowCount});
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
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




// Admin content and audit APIs.
app.get("/api/public/announcements",asyncRoute(async(_req,res)=>{
 const r=await pool.query("SELECT id,title,body,created_at FROM announcements WHERE active=TRUE ORDER BY created_at DESC LIMIT 5");
 res.set("Cache-Control","public, max-age=30").json({announcements:r.rows});
}));
app.get("/api/admin/announcements",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{
 const r=await pool.query("SELECT a.id,a.title,a.body,a.active,a.created_at,u.username AS created_by FROM announcements a JOIN users u ON u.id=a.created_by ORDER BY a.created_at DESC LIMIT 100");
 res.json({announcements:r.rows});
}));
app.post("/api/admin/announcements",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({title:z.string().trim().min(3).max(180),body:z.string().trim().min(2).max(3000),active:z.boolean().default(true)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Enter a valid announcement title and message."});
 const r=await pool.query("INSERT INTO announcements(title,body,active,created_by) VALUES($1,$2,$3,$4) RETURNING id,title,body,active,created_at",[parsed.data.title,parsed.data.body,parsed.data.active,req.user.id]);
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'announcement_created','announcement',$2,$3::jsonb)",[req.user.id,r.rows[0].id,JSON.stringify({title:parsed.data.title,active:parsed.data.active})]);
 res.status(201).json({announcement:r.rows[0]});
}));
app.patch("/api/admin/announcements/:id",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({active:z.boolean()}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Choose a valid announcement status."});
 const r=await pool.query("UPDATE announcements SET active=$1 WHERE id=$2 RETURNING id,active,title",[parsed.data.active,req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:"Announcement not found."});
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'announcement_status_changed','announcement',$2,$3::jsonb)",[req.user.id,req.params.id,JSON.stringify({active:parsed.data.active})]);
 res.json({announcement:r.rows[0]});
}));
app.delete("/api/admin/announcements/:id",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const r=await pool.query("DELETE FROM announcements WHERE id=$1 RETURNING id,title",[req.params.id]);
 if(!r.rowCount)return res.status(404).json({error:"Announcement not found."});
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES($1,'announcement_deleted','announcement',$2,$3::jsonb)",[req.user.id,req.params.id,JSON.stringify({title:r.rows[0].title})]);
 res.json({ok:true});
}));
app.get("/api/admin/activity",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const q=String(req.query.search||"").trim().slice(0,100),term=q?"%"+q+"%":null;
 const a=String(req.query.action||"").trim().slice(0,100),actionTerm=a?"%"+a+"%":null;
 const r=await pool.query("SELECT l.id,l.action,l.entity_type,l.entity_id,l.details,l.created_at,u.full_name,u.username,u.email FROM audit_logs l LEFT JOIN users u ON u.id=l.actor_id WHERE ($1::text IS NULL OR l.action ILIKE $1 OR l.entity_type ILIKE $1 OR COALESCE(u.username,'') ILIKE $1 OR COALESCE(u.email,'') ILIKE $1 OR COALESCE(l.entity_id::text,'') ILIKE $1) AND ($2::text IS NULL OR l.action ILIKE $2) ORDER BY l.created_at DESC LIMIT 200",[term,actionTerm]);
 res.json({logs:r.rows});
}));

app.get("/api/admin/currency",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{
 const r=await pool.query("SELECT usd_to_bdt_rate,updated_at FROM currency_settings WHERE id=TRUE");
 res.set("Cache-Control","no-store").json({usd_to_bdt_rate:Number(r.rows[0]?.usd_to_bdt_rate||0),updated_at:r.rows[0]?.updated_at||null});
}));
app.put("/api/admin/currency",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{
 const parsed=z.object({usdToBdtRate:z.number().finite().min(1).max(10000)}).safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Enter a valid USD to BDT rate between 1 and 10,000."});
 const r=await pool.query("INSERT INTO currency_settings(id,usd_to_bdt_rate,updated_at,updated_by) VALUES(TRUE,$1,NOW(),$2) ON CONFLICT(id) DO UPDATE SET usd_to_bdt_rate=EXCLUDED.usd_to_bdt_rate,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING usd_to_bdt_rate,updated_at",[parsed.data.usdToBdtRate,req.user.id]);
 await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES($1,'currency_rate_updated','currency_settings',$2::jsonb)",[req.user.id,JSON.stringify({usd_to_bdt_rate:parsed.data.usdToBdtRate})]);
 res.set("Cache-Control","no-store").json({settings:r.rows[0]});
}));
app.get("/api/admin/maintenance",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{const r=await pool.query("SELECT enabled,message FROM site_settings WHERE id=TRUE");res.set("Cache-Control","no-store").json(r.rows[0]||{enabled:false,message:""});}));
app.put("/api/admin/maintenance",requireAuth,requireAdmin,asyncRoute(async(req,res)=>{const parsed=z.object({enabled:z.boolean(),message:z.string().trim().max(1000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:"Enter a valid maintenance setting and message."});if(parsed.data.enabled&&parsed.data.message.length<5)return res.status(400).json({error:"When maintenance is ON, write a reason of at least 5 characters."});await pool.query("INSERT INTO site_settings(id,enabled,message,updated_at,updated_by) VALUES(TRUE,$1,$2,NOW(),$3) ON CONFLICT(id) DO UPDATE SET enabled=EXCLUDED.enabled,message=EXCLUDED.message,updated_at=NOW(),updated_by=EXCLUDED.updated_by",[parsed.data.enabled,parsed.data.message,req.user.id]);await pool.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES($1,'site_maintenance_updated','site_settings',$2::jsonb)",[req.user.id,JSON.stringify({enabled:parsed.data.enabled,message:parsed.data.message})]);res.set("Cache-Control","no-store").json({ok:true,enabled:parsed.data.enabled,message:parsed.data.message});}));
app.get("/api/admin/system",requireAuth,requireAdmin,asyncRoute(async(_req,res)=>{
 const counts=await pool.query("SELECT (SELECT COUNT(*)::int FROM users WHERE role='user') AS users,(SELECT COUNT(*)::int FROM orders) AS orders,(SELECT COUNT(*)::int FROM services) AS services,(SELECT COUNT(*)::int FROM money_requests WHERE status='pending') AS pending_money,(SELECT COUNT(*)::int FROM support_tickets WHERE status IN ('open','in_progress')) AS open_tickets");
 res.set("Cache-Control","no-store").json({database:true,environment:process.env.NODE_ENV||"development",orderFulfilmentEnabled:process.env.ORDER_FULFILMENT_ENABLED==="true",counts:counts.rows[0],paymentMode:"Manual review (bKash, Nagad, Rocket, upay)",secretsEditable:false});
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
 await cleanupExpiredSupportMessages();
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
const publicFiles = new Set(["card-facebook.svg","card-instagram.svg","card-freefire.svg","card-tiktok.svg","card-youtube.svg","card-telegram.svg","styles.css","app.js","service-nav.js","drawer.css","drawer.js","ui-icons.css","ui-icons.js","facebook.html","facebook.css","facebook.js","instagram.html","instagram.css","instagram.js","tiktok.html","tiktok.css","tiktok.js","youtube.html","youtube.css","youtube.js","telegram.html","telegram.css","telegram.js","dashboard.html","dashboard.css","dashboard.js","admin.html","admin.css","admin.js","support-admin.html","support-admin.css","support-admin.js","free-fire.html","free-fire.css","free-fire.js"]);
app.get("/", (_req,res) => res.sendFile(path.join(__dirname,"..","index.html")));
// Keep administrator pages inaccessible unless the request has an active admin session.
app.get("/admin.html",requireAuth,requireAdmin,(_req,res)=>res.sendFile(path.join(__dirname,"..","admin.html")));
app.get("/support-admin",requireAuth,requireAdmin,(_req,res)=>res.sendFile(path.join(__dirname,"..","support-admin.html")));
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
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS site_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id=TRUE), enabled BOOLEAN NOT NULL DEFAULT FALSE, message TEXT NOT NULL DEFAULT '', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id) ON DELETE SET NULL)"))
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS payment_settings (method VARCHAR(12) PRIMARY KEY CHECK(method IN ('bkash','nagad','rocket','upay')), account_number VARCHAR(20) NOT NULL DEFAULT '', account_type VARCHAR(12) NOT NULL DEFAULT 'personal' CHECK(account_type IN ('personal','merchant')), active BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_by UUID REFERENCES users(id) ON DELETE SET NULL)"))
  .then(()=>pool.query("ALTER TABLE payment_settings ALTER COLUMN account_number TYPE VARCHAR(120)"))
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS crypto_payment_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id=TRUE),bep20_address VARCHAR(120) NOT NULL DEFAULT '',binance_pay_id VARCHAR(80) NOT NULL DEFAULT '',usdt_bdt_rate NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK(usdt_bdt_rate>=0),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by UUID REFERENCES users(id) ON DELETE SET NULL)"))
 .then(()=>pool.query("INSERT INTO crypto_payment_settings(id) VALUES(TRUE) ON CONFLICT(id) DO NOTHING"))
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS money_request_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id=TRUE),minimum_deposit_bdt INTEGER NOT NULL DEFAULT 100 CHECK(minimum_deposit_bdt BETWEEN 1 AND 50000),minimum_withdrawal_bdt INTEGER NOT NULL DEFAULT 100 CHECK(minimum_withdrawal_bdt BETWEEN 1 AND 50000),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by UUID REFERENCES users(id) ON DELETE SET NULL)"))
 .then(()=>pool.query("INSERT INTO money_request_settings(id) VALUES(TRUE) ON CONFLICT(id) DO NOTHING"))
 .then(()=>pool.query("ALTER TABLE money_requests DROP CONSTRAINT IF EXISTS money_requests_method_check"))
 .then(()=>pool.query("ALTER TABLE money_requests ADD CONSTRAINT money_requests_method_check CHECK(method IN ('bkash','nagad','rocket','upay','usdt_bep20','binance_pay'))"))
 .then(()=>pool.query("ALTER TABLE money_requests ALTER COLUMN account_number TYPE VARCHAR(120)"))
 .then(()=>pool.query("ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS crypto_amount NUMERIC(20,8)"))
 .then(()=>pool.query("ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS conversion_rate NUMERIC(12,4)"))
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS referral_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id=TRUE), commission_percent NUMERIC(5,2) NOT NULL DEFAULT 5.00 CHECK(commission_percent>=0 AND commission_percent<=50), enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
 .then(()=>pool.query("INSERT INTO referral_settings(id,commission_percent,enabled) VALUES(TRUE,5.00,FALSE) ON CONFLICT(id) DO NOTHING"))
 .then(()=>pool.query("CREATE TABLE IF NOT EXISTS announcements (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),title VARCHAR(180) NOT NULL,body TEXT NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,created_by UUID NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS audit_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),actor_id UUID REFERENCES users(id),action VARCHAR(100) NOT NULL,entity_type VARCHAR(60) NOT NULL,entity_id UUID,details JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS ff_reseller_webhook_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,provider_order_id VARCHAR(120) NOT NULL,status VARCHAR(40) NOT NULL,payload JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE INDEX IF NOT EXISTS ff_reseller_webhook_events_order_date_idx ON ff_reseller_webhook_events(order_id,created_at DESC)"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS support_tickets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES users(id),subject VARCHAR(180) NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'open',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS ticket_messages (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,sender_id UUID NOT NULL REFERENCES users(id),message TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_status_check"))
  .then(()=>pool.query("ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_status_check CHECK(status IN ('open','in_progress','answered','resolved','closed'))"))
  .then(()=>pool.query("CREATE INDEX IF NOT EXISTS support_tickets_user_updated_idx ON support_tickets(user_id,updated_at DESC)"))
  .then(()=>pool.query("CREATE INDEX IF NOT EXISTS ticket_messages_ticket_date_idx ON ticket_messages(ticket_id,created_at)"))
  .then(()=>pool.query("CREATE INDEX IF NOT EXISTS ticket_messages_created_at_idx ON ticket_messages(created_at)"))
  
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS support_attachments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),message_id UUID NOT NULL REFERENCES ticket_messages(id) ON DELETE CASCADE,public_id VARCHAR(255) NOT NULL UNIQUE,secure_url TEXT NOT NULL,format VARCHAR(20) NOT NULL,bytes BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("ALTER TABLE support_attachments ADD COLUMN IF NOT EXISTS data BYTEA"))
  .then(()=>pool.query("ALTER TABLE support_attachments ADD COLUMN IF NOT EXISTS mime_type VARCHAR(40)"))
  .then(()=>pool.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS cost_per_1000_minor BIGINT NOT NULL DEFAULT 0 CHECK(cost_per_1000_minor >= 0)"))
  .then(()=>pool.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS supplier_rate_usd_per_1000 NUMERIC(18,8) NOT NULL DEFAULT 0 CHECK(supplier_rate_usd_per_1000 >= 0)"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS currency_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(id=TRUE),usd_to_bdt_rate NUMERIC(12,4) NOT NULL DEFAULT 0 CHECK(usd_to_bdt_rate>=0),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_by UUID REFERENCES users(id) ON DELETE SET NULL)"))
  .then(()=>pool.query("INSERT INTO currency_settings(id,usd_to_bdt_rate) VALUES(TRUE,0) ON CONFLICT(id) DO NOTHING"))
  // Seed requested Free Fire packages; order fulfilment remains globally disabled until a supplier is verified.
  .then(()=>pool.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) SELECT 'free_fire','25 Diamonds','Fixed-price Free Fire diamond package. Supplier fulfilment is not yet enabled.',80000,0,25,25,NULL,TRUE WHERE NOT EXISTS (SELECT 1 FROM services WHERE category='free_fire' AND lower(name)=lower('25 Diamonds'))"))
  .then(()=>pool.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) SELECT 'free_fire','50 Diamonds','Fixed-price Free Fire diamond package. Supplier fulfilment is not yet enabled.',80000,0,50,50,NULL,TRUE WHERE NOT EXISTS (SELECT 1 FROM services WHERE category='free_fire' AND lower(name)=lower('50 Diamonds'))"))
  .then(()=>pool.query("INSERT INTO services(category,name,description,price_per_1000_minor,cost_per_1000_minor,min_quantity,max_quantity,provider_service_id,enabled) SELECT 'free_fire',v.name,'Fixed-price Free Fire diamond package. Supplier fulfilment is not yet enabled.',v.rate,0,v.qty,v.qty,NULL,TRUE FROM (VALUES ('100 Diamonds',80000,100),('210 Diamonds',76190,210),('530 Diamonds',75471,530),('1,060 Diamonds',75471,1060)) AS v(name,rate,qty) WHERE NOT EXISTS (SELECT 1 FROM services s WHERE s.category='free_fire' AND lower(s.name)=lower(v.name))"))
  .then(()=>pool.query("CREATE TABLE IF NOT EXISTS commission_accounts (user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, balance_minor BIGINT NOT NULL DEFAULT 0 CHECK(balance_minor>=0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"))
  .then(()=>pool.query("CREATE UNIQUE INDEX IF NOT EXISTS money_requests_deposit_trx_unique ON money_requests(method,lower(trx_id)) WHERE request_type='deposit' AND trx_id IS NOT NULL"))
  .then(()=>app.listen(port,()=>{
    console.log("NEXORA API listening on port "+port);
    cleanupExpiredSupportMessages().catch(error=>console.error("Initial support message cleanup failed",error));
    const supportCleanupTimer=setInterval(()=>{
      cleanupExpiredSupportMessages().catch(error=>console.error("Scheduled support message cleanup failed",error));
    },30*1000);
    supportCleanupTimer.unref();
  }))
  .catch(error=>{console.error("Database initialization failed",error);process.exit(1);});