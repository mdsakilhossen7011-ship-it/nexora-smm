const api=(window.NEXORA_API_URL||"/api");
const money=(minor)=>"৳"+(Number(minor||0)/100).toFixed(2);
async function request(path,options={}){const r=await fetch(api+path,{credentials:"include",...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Unable to load data.");return data}
function row(title,sub,right){const el=document.createElement("div");el.className="data-row";const left=document.createElement("div");const strong=document.createElement("strong");strong.textContent=title;const small=document.createElement("small");small.textContent=sub||"";left.append(strong,small);const value=document.createElement("b");value.textContent=right||"";el.append(left,value);return el}

function setupMoneyForms(){
 const dep=document.getElementById("depositForm"),wd=document.getElementById("withdrawForm");
 const submit=async(form,path,feedback)=>{const btn=form.querySelector('button[type="submit"]');btn.disabled=true;feedback.textContent="Submitting…";try{const body=Object.fromEntries(new FormData(form).entries());body.amount=Number(body.amount);const result=await request(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});feedback.textContent=result.message;form.reset();await loadMoneyRequests();}catch(e){feedback.textContent=e.message;}finally{btn.disabled=false;}};
 dep.addEventListener("submit",e=>{e.preventDefault();submit(dep,"/money-requests/deposit",document.getElementById("depositFeedback"));});
 wd.addEventListener("submit",e=>{e.preventDefault();submit(wd,"/money-requests/withdraw",document.getElementById("withdrawFeedback"));});
}
async function loadMoneyRequests(){const data=await request("/money-requests");document.getElementById("commissionBalance").textContent=money(data.commission_balance_minor);const list=document.getElementById("moneyRequestsList");list.textContent="";if(!data.requests.length){list.textContent="No deposit or withdrawal requests yet.";return;}data.requests.forEach(x=>list.append(row(x.request_type+" · "+x.method.toUpperCase(),x.status+" · "+new Date(x.created_at).toLocaleString(),money(x.amount_minor))));}

async function loadReferrals(){
 const [mine,board]=await Promise.all([request("/referrals/me"),request("/referrals/leaderboard")]);
 const code=mine.referral_code||"Not assigned",link=mine.referral_code?location.origin+"/?ref="+encodeURIComponent(mine.referral_code)+"#register":"";
 document.getElementById("myReferralCode").value=code;
 document.getElementById("myReferralLink").value=link;
 document.getElementById("referralCount").textContent="Referred customers: "+(mine.referred_count||0);
 const list=document.getElementById("referralLeaders");list.textContent="";
 if(!(board.leaders||[]).length){list.textContent="No referral leaders yet.";return}
 board.leaders.forEach((x,i)=>{const item=row((i+1)+". @"+x.username,x.referrals+" referred customers","");list.append(item)});
}


async function compressSupportImages(input){
 const files=Array.from(input.files||[]);
 if(files.length>4)throw new Error("Choose up to 4 images.");
 const output=[];
 for(const file of files){
  if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Only JPG, PNG or WEBP images are allowed.");
  let bitmap;
  try{bitmap=await createImageBitmap(file)}catch{throw new Error("One of the selected files is not a valid image.")}
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");
  let width=bitmap.width,height=bitmap.height;
  const maxSide=1600,scale=Math.min(1,maxSide/Math.max(width,height));width=Math.round(width*scale);height=Math.round(height*scale);
  let blob=null;
  for(let attempt=0;attempt<12;attempt++){
   canvas.width=width;canvas.height=height;ctx.clearRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);
   const quality=Math.max(.38,.84-attempt*.055);
   blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",quality));
   if(!blob)blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
   if(blob&&blob.size<=200*1024)break;
   if(attempt%3===2){width=Math.max(480,Math.round(width*.82));height=Math.max(480,Math.round(height*.82))}
  }
  bitmap.close();
  if(!blob||blob.size>200*1024)throw new Error("An image could not be compressed below 200 KB. Choose a smaller image.");
  const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Unable to read compressed image."));reader.readAsDataURL(blob)});
  output.push(dataUrl);
 }
 return output;
}

let activeSupportTicket=null;
async function loadSupportTickets(){const list=document.getElementById("supportTicketList");if(!list)return;list.textContent="Loading…";try{const d=await request("/support/tickets");list.textContent="";if(!(d.tickets||[]).length){list.textContent="No support tickets yet.";return}d.tickets.forEach(t=>{const b=document.createElement("button");b.type="button";b.className="support-ticket-row";b.textContent=t.subject+" · "+String(t.status).replaceAll("_"," ").toUpperCase()+" · "+new Date(t.updated_at).toLocaleString();b.addEventListener("click",()=>openSupportTicket(t.id));list.append(b)})}catch(e){list.textContent=e.message}}
async function openSupportTicket(id){activeSupportTicket=id;const wrap=document.getElementById("supportThread"),messages=document.getElementById("supportMessages");wrap.hidden=false;messages.textContent="Loading conversation…";try{const d=await request("/support/tickets/"+encodeURIComponent(id)+"/messages");messages.textContent="";(d.messages||[]).forEach(m=>{const box=document.createElement("article");box.className="support-message";const body=document.createElement("p");body.textContent=m.message;const meta=document.createElement("small");meta.textContent=(m.role==="admin"?"NEXORA Support":"You")+" · "+new Date(m.created_at).toLocaleString();box.append(body);(m.attachments||[]).forEach(a=>{const img=document.createElement("img");img.src=a.url;img.alt="Support attachment";img.loading="lazy";img.style.maxWidth="min(100%,360px)";img.style.display="block";img.style.borderRadius="10px";img.style.marginTop="8px";box.append(img)});box.append(meta);messages.append(box)})}catch(e){messages.textContent=e.message}}
function setupSupport(){const form=document.getElementById("supportTicketForm"),reply=document.getElementById("supportReplyForm");form.addEventListener("submit",async e=>{e.preventDefault();const button=form.querySelector('button[type="submit"]'),feedback=document.getElementById("supportFeedback");button.disabled=true;feedback.textContent="Submitting…";try{const body=Object.fromEntries(new FormData(form).entries());body.uploads=await compressSupportImages(document.getElementById("newTicketImages"));await request("/support/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});form.reset();feedback.textContent="Ticket created. Support will reply here.";await loadSupportTickets()}catch(err){feedback.textContent=err.message}finally{button.disabled=false}});reply.addEventListener("submit",async e=>{e.preventDefault();if(!activeSupportTicket)return;const button=reply.querySelector('button[type="submit"]'),feedback=document.getElementById("supportReplyFeedback");button.disabled=true;try{const body=Object.fromEntries(new FormData(reply).entries());body.uploads=await compressSupportImages(document.getElementById("replyTicketImages"));await request("/support/tickets/"+encodeURIComponent(activeSupportTicket)+"/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});reply.reset();feedback.textContent="Reply sent.";await openSupportTicket(activeSupportTicket);await loadSupportTickets()}catch(err){feedback.textContent=err.message}finally{button.disabled=false}});document.getElementById("refreshSupport").addEventListener("click",loadSupportTickets);loadSupportTickets()}

async function init(){const message=document.getElementById("dashMessage");try{const me=await request("/me");const u=me.user;document.getElementById("userName").textContent=u.full_name.split(" ")[0];document.getElementById("fullName").textContent=u.full_name;document.getElementById("username").textContent=u.username;document.getElementById("email").textContent=u.email;document.getElementById("phone").textContent=u.phone||"Not added";document.getElementById("joined").textContent=new Date(u.created_at).toLocaleDateString();document.getElementById("balance").textContent=money(u.balance_minor);document.getElementById("spent").textContent=money(u.total_spent_minor);document.getElementById("completed").textContent=u.completed_orders;document.getElementById("accountStatus").textContent="Active";
const [orders,ledger]=await Promise.all([request("/orders"),request("/wallet/ledger")]);const ol=document.getElementById("ordersList");ol.textContent="";if(!orders.orders.length)ol.textContent="No orders yet.";orders.orders.slice(0,8).forEach(o=>ol.append(row(o.service_name,o.status+" · "+new Date(o.created_at).toLocaleString(),money(o.charge_minor))));const ll=document.getElementById("ledgerList");ll.textContent="";if(!ledger.entries.length)ll.textContent="No wallet activity yet.";ledger.entries.slice(0,10).forEach(x=>ll.append(row(x.entry_type.replaceAll("_"," "),new Date(x.created_at).toLocaleString(),(Number(x.amount_minor)<0?"−":"+")+money(Math.abs(Number(x.amount_minor))))));await loadMoneyRequests();await loadReferrals();setupMoneyForms();setupSupport();document.getElementById("copyReferralLink").addEventListener("click",async()=>{const value=document.getElementById("myReferralLink").value;if(!value)return;try{await navigator.clipboard.writeText(value);document.getElementById("copyReferralLink").textContent="Copied!";}catch{document.getElementById("copyReferralLink").textContent="Copy failed";}});message.textContent="Your account data is loaded from the connected API.";}catch(e){message.textContent=e.message+" If the API is not deployed yet, dashboard data will not be available."}}
const menuToggle=document.getElementById("accountMenuToggle");const accountMenu=document.getElementById("accountMenu");
menuToggle.addEventListener("click",()=>{const open=accountMenu.classList.toggle("open");menuToggle.setAttribute("aria-expanded",String(open));menuToggle.setAttribute("aria-label",open?"Close account menu":"Open account menu");});
accountMenu.addEventListener("click",event=>{if(event.target.closest("a")){accountMenu.classList.remove("open");menuToggle.setAttribute("aria-expanded","false");}});
document.addEventListener("click",event=>{if(!event.target.closest(".account-menu-wrap")){accountMenu.classList.remove("open");menuToggle.setAttribute("aria-expanded","false");}});
document.getElementById("logoutBtn").addEventListener("click",async()=>{try{await request("/auth/logout",{method:"POST"});}finally{location.href="/#login";}});init();