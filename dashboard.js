const api=(window.NEXORA_API_URL||"/api");
const money=(minor)=>"৳"+(Number(minor||0)/100).toFixed(2);
async function request(path,options={}){const r=await fetch(api+path,{credentials:"include",...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Unable to load data.");return data}
function row(title,sub,right){const el=document.createElement("div");el.className="data-row";const left=document.createElement("div");const strong=document.createElement("strong");strong.textContent=title;const small=document.createElement("small");small.textContent=sub||"";left.append(strong,small);const value=document.createElement("b");value.textContent=right||"";el.append(left,value);return el}

function setupMoneyForms(){
 const dep=document.getElementById("depositForm"),wd=document.getElementById("withdrawForm");
 const methodSelect=document.getElementById("depositMethodSelect");
 const withdrawMethodSelect=document.getElementById("withdrawMethodSelect");
 const withdrawMethodLogo=document.getElementById("withdrawMethodLogo");
 const gatewayStyles={bkash:"money-bkash-logo",nagad:"money-nagad-logo",rocket:"money-rocket-logo",upay:"money-upay-logo"};
 const gatewayNames={bkash:"bKash",nagad:"Nagad",rocket:"Rocket",upay:"upay"};
 const syncWithdrawGateway=()=>{const method=withdrawMethodSelect?.value||"bkash";if(withdrawMethodLogo){withdrawMethodLogo.textContent=gatewayNames[method]||"bKash";withdrawMethodLogo.className="money-method-logo "+(gatewayStyles[method]||gatewayStyles.bkash);}};
 withdrawMethodSelect?.addEventListener("change",syncWithdrawGateway);
 syncWithdrawGateway();
 const methodLogo=document.getElementById("depositMethodLogo");
 const syncDepositGateway=()=>{const method=methodSelect?.value||"bkash";if(methodLogo){methodLogo.textContent=gatewayNames[method]||"bKash";methodLogo.className="money-method-logo "+(gatewayStyles[method]||gatewayStyles.bkash);}};
 methodSelect?.addEventListener("change",syncDepositGateway);
 syncDepositGateway();
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
 document.getElementById("referralCount").textContent="Referred customers: "+(mine.referred_count||0);const codeEl=document.getElementById("profileReferralCode");if(codeEl)codeEl.textContent=code;const countEl=document.getElementById("profileReferralCount");if(countEl)countEl.textContent=String(mine.referred_count||0);
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


function setupProfile(user){
 const editBtn=document.getElementById("editProfileBtn"),form=document.getElementById("profileEditForm"),cancel=document.getElementById("cancelProfileEdit"),feedback=document.getElementById("profileEditFeedback");
 editBtn.addEventListener("click",()=>{form.hidden=!form.hidden;});
 cancel.addEventListener("click",()=>{form.hidden=true;feedback.textContent="";});
 form.addEventListener("submit",async e=>{e.preventDefault();const btn=form.querySelector('button[type="submit"]');btn.disabled=true;feedback.textContent="Saving…";try{const payload={fullName:document.getElementById("editFullName").value.trim(),phone:document.getElementById("editPhone").value.trim()};const result=await request("/me",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const u=result.user;document.getElementById("fullName").textContent=u.full_name;document.getElementById("phone").textContent=u.phone||"Not added";document.getElementById("editFullName").value=u.full_name;document.getElementById("editPhone").value=u.phone||"";feedback.textContent="Profile updated.";form.hidden=true;}catch(err){feedback.textContent=err.message;}finally{btn.disabled=false;}});
 document.getElementById("copyProfileReferral").addEventListener("click",async()=>{const code=document.getElementById("profileReferralCode").textContent;if(!code||code==="Loading…"||code==="Not assigned")return;try{await navigator.clipboard.writeText(code);document.getElementById("copyProfileReferral").textContent="✓";}catch{document.getElementById("copyProfileReferral").textContent="!";}});
 const activity=document.getElementById("profileActivity");activity.textContent="";Promise.all([request("/orders"),request("/wallet/ledger")]).then(([orders,ledger])=>{const items=[];(ledger.entries||[]).slice(0,2).forEach(x=>items.push({label:x.entry_type.replaceAll("_"," "),date:x.created_at,mark:Number(x.amount_minor)>=0?"+":"−"}));(orders.orders||[]).slice(0,2).forEach(x=>items.push({label:x.service_name+" · "+x.status,date:x.created_at,mark:x.status==="completed"?"✓":"↗"}));items.sort((a,b)=>new Date(b.date)-new Date(a.date));if(!items.length){activity.innerHTML='<p class="nex-muted">No recent account activity yet.</p>';return;}items.slice(0,3).forEach(x=>{const line=document.createElement("div");line.className="nex-activity-row";const mark=document.createElement("span");mark.className="nex-activity-mark";mark.textContent=x.mark;const text=document.createElement("span");text.textContent=x.label+" · "+new Date(x.date).toLocaleDateString();line.append(mark,text);activity.append(line);});}).catch(()=>{activity.innerHTML='<p class="nex-muted">Activity is temporarily unavailable.</p>';});
}

async function init(){const message=document.getElementById("dashMessage");try{const me=await request("/me");const u=me.user;document.getElementById("userName").textContent=u.full_name.split(" ")[0];document.getElementById("fullName").textContent=u.full_name;document.getElementById("username").textContent=u.username;document.getElementById("email").textContent=u.email;document.getElementById("phone").textContent=u.phone||"Not added";document.getElementById("joined").textContent=new Date(u.created_at).toLocaleDateString();document.getElementById("balance").textContent=money(u.balance_minor);
document.getElementById("profileUsername").textContent=(u.username||"NEXORA_MEMBER").toUpperCase();document.getElementById("profileUserId").textContent="User ID: NXM-"+String(u.id||"").replaceAll("-","").slice(0,6).toUpperCase();document.getElementById("profileRank").textContent=u.role==="admin"?"ADMIN":"MEMBER";document.getElementById("profileBalance").textContent=money(u.balance_minor);
document.getElementById("editFullName").value=u.full_name||"";document.getElementById("editPhone").value=u.phone||"";document.getElementById("spent").textContent=money(u.total_spent_minor);document.getElementById("completed").textContent=String(u.completed_orders??0);
const [orders,ledger]=await Promise.all([request("/orders"),request("/wallet/ledger")]);
const orderItems=Array.isArray(orders.orders)?orders.orders:[];
const activeCount=orderItems.filter(o=>!["completed","cancelled","canceled","failed","refunded"].includes(String(o.status||"").toLowerCase())).length;
const activeEl=document.getElementById("activeOrders");if(activeEl)activeEl.textContent=String(activeCount);
const recent=document.getElementById("recentOrdersList");if(recent){recent.textContent="";if(!orderItems.length){const empty=document.createElement("div");empty.className="recent-empty";const icon=document.createElement("span");icon.textContent="▤";const p=document.createElement("p");p.textContent="No recent orders found. Start by making a new order below!";empty.append(icon,p);recent.append(empty);}else orderItems.slice(0,4).forEach(o=>recent.append(row(o.service_name,o.status+" · "+new Date(o.created_at).toLocaleString(),money(o.charge_minor))));}
const spentMinor=Number(u.total_spent_minor||0),balanceMinor=Number(u.balance_minor||0);const spentProgress=document.getElementById("spentProgress");if(spentProgress)spentProgress.style.width=(spentMinor+balanceMinor>0?Math.min(100,spentMinor/(spentMinor+balanceMinor)*100):0)+"%";
const ol=document.getElementById("ordersList");ol.textContent="";if(!orders.orders.length)ol.textContent="No orders yet.";orders.orders.slice(0,8).forEach(o=>ol.append(row(o.service_name,o.status+" · "+new Date(o.created_at).toLocaleString(),money(o.charge_minor))));const ll=document.getElementById("ledgerList");ll.textContent="";if(!ledger.entries.length)ll.textContent="No wallet activity yet.";ledger.entries.slice(0,10).forEach(x=>ll.append(row(x.entry_type.replaceAll("_"," "),new Date(x.created_at).toLocaleString(),(Number(x.amount_minor)<0?"−":"+")+money(Math.abs(Number(x.amount_minor))))));await loadMoneyRequests();await loadReferrals();setupProfile(u);setupMoneyForms();setupSupport();document.getElementById("copyReferralLink").addEventListener("click",async()=>{const value=document.getElementById("myReferralLink").value;if(!value)return;try{await navigator.clipboard.writeText(value);document.getElementById("copyReferralLink").textContent="Copied!";}catch{document.getElementById("copyReferralLink").textContent="Copy failed";}});message.textContent="";message.hidden=true;applyDashboardView();}catch(e){console.error("NEXORA dashboard initialization failed:",e);message.hidden=false;message.textContent="We couldn’t load your dashboard data right now. Please refresh in a moment.";message.classList.add("api-error-safe");}}
function applyDashboardView(){
 const view=(location.hash||"#dashboard").slice(1);
 const heading=document.querySelector(".dash-heading");
 const stats=document.querySelector(".stats-grid");
 const topGroups=Array.from(document.querySelectorAll(".dash-wrap > .dash-columns"));
 const topPanels=Array.from(document.querySelectorAll(".dash-wrap > .dash-panel,.dash-wrap > .ledger-panel"));
 const recentOrders=document.getElementById("recentOrders");
 const quickActions=document.querySelector(".quick-actions");
 quickActions?.classList.toggle("dash-view-hidden",view!=="dashboard"&&view!=="deposit"&&view!=="withdraw");
 quickActions?.querySelectorAll("a").forEach(a=>a.classList.remove("quick-active"));
 const activeQuick=view==="deposit"?"quick-deposit":view==="withdraw"?"quick-withdraw":view==="orders"?"quick-primary":"";
 if(activeQuick)quickActions?.querySelector("."+activeQuick)?.classList.add("quick-active");
 heading?.classList.add("dash-view-hidden");
 stats?.classList.add("dash-view-hidden");
 topGroups.forEach(el=>el.classList.add("dash-view-hidden"));
 topPanels.forEach(el=>el.classList.add("dash-view-hidden"));
 recentOrders?.classList.add("dash-view-hidden");
 const showGroup=(index,id)=>{
  const group=topGroups[index];
  const panel=document.getElementById(id);
  if(!group||!panel)return;
  group.classList.remove("dash-view-hidden");
  group.querySelectorAll(":scope > section").forEach(el=>el.classList.toggle("dash-view-hidden",el!==panel));
 };
 const showStandalone=id=>{
  const panel=document.getElementById(id)?.closest(".dash-panel");
  panel?.classList.remove("dash-view-hidden");
 };
 if(view==="profile")showGroup(0,"profile");
 else if(view==="orders")showGroup(0,"orders");
 else if(view==="deposit")showGroup(1,"deposit");
 else if(view==="withdraw")showGroup(1,"withdraw");
 else if(view==="referral")showGroup(2,"referral");
 else if(view==="top-leaders")showGroup(2,"top-leaders");
 else if(view==="live-chat")showStandalone("live-chat");
 else if(view==="money-history")showStandalone("moneyRequestsList");
 else if(view==="wallet-activity")showStandalone("ledgerList");
 else { heading?.classList.remove("dash-view-hidden"); stats?.classList.remove("dash-view-hidden"); recentOrders?.classList.remove("dash-view-hidden"); }
 window.scrollTo({top:0,behavior:"smooth"});
}
window.addEventListener("hashchange",applyDashboardView);
applyDashboardView();
const menuToggle=document.getElementById("accountMenuToggle");const accountMenu=document.getElementById("accountMenu");
const isMobileMenu=()=>window.matchMedia("(max-width: 700px)").matches;
function setAccountMenuOpen(open){
 accountMenu.classList.toggle("open",open);
 document.body.classList.toggle("account-menu-open",open&&isMobileMenu());
 menuToggle.setAttribute("aria-expanded",String(open));
 menuToggle.setAttribute("aria-label",open?"Close account menu":"Open account menu");
}
menuToggle.addEventListener("click",()=>setAccountMenuOpen(!accountMenu.classList.contains("open")));
accountMenu.addEventListener("click",event=>{if(event.target.closest("a"))setAccountMenuOpen(false);});
document.addEventListener("click",event=>{if(!event.target.closest(".account-menu-wrap"))setAccountMenuOpen(false);});
document.addEventListener("keydown",event=>{if(event.key==="Escape")setAccountMenuOpen(false);});
window.addEventListener("resize",()=>{if(!isMobileMenu())document.body.classList.remove("account-menu-open");else if(accountMenu.classList.contains("open"))document.body.classList.add("account-menu-open");});
document.getElementById("logoutBtn").addEventListener("click",async()=>{setAccountMenuOpen(false);try{await request("/auth/logout",{method:"POST"});}finally{location.href="/#login";}});init();