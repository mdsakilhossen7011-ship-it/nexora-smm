const api="/api";
async function request(path,options={}){const r=await fetch(api+path,{credentials:"include",...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed");return data}
const money=v=>"৳"+(Number(v||0)/100).toFixed(2);
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
const titles={overview:["Overview","Your panel at a glance."],users:["Users","Manage customer accounts and wallet access."],orders:["Orders","Review and manage customer orders."],services:["Services","Manage gaming and social media services."],finance:["Finance","Review deposits, withdrawals and payment requests."],growth:["Growth & Referrals","Referral performance and commission controls."],support:["Support","Customer tickets and live support."],website:["Website Content","Manage banners, notices and announcements."],settings:["Settings","Payment, security and panel configuration."],activity:["Activity Logs","Review administrative actions."]};
function showPage(page){if(page==="support"){location.href="/support-admin";return}if(!titles[page])return;document.querySelectorAll(".admin-page").forEach(x=>x.classList.toggle("active",x.id==="page-"+page));document.querySelectorAll(".admin-nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));document.getElementById("pageTitle").textContent=titles[page][0];document.getElementById("pageSubtitle").textContent=titles[page][1];document.getElementById("adminSidebar").classList.remove("open");document.getElementById("sidebarScrim").classList.remove("show");document.getElementById("sidebarToggle").setAttribute("aria-expanded","false");document.getElementById("searchResults").hidden=true;if(page==="users")loadUsers();if(page==="orders")loadOrders();if(page==="services")loadServices();if(page==="finance")loadFinance();if(page==="growth")loadGrowth();if(page==="website")loadAnnouncements();if(page==="settings")loadSystem();if(page==="activity")loadActivity()}
async function loadGrowth(){
 const status=document.getElementById("growthStatus"),leaders=document.getElementById("growthLeaders"),referrals=document.getElementById("growthReferrals");
 if(!status||!leaders||!referrals)return;
 status.textContent="Loading referral data…";leaders.textContent="";referrals.textContent="";
 try{
  const data=await request("/admin/growth"),st=data.stats||{},settings=data.settings||{};
  document.getElementById("growthTotalUsers").textContent=st.total_users??0;
  document.getElementById("growthReferredUsers").textContent=st.referred_users??0;
  document.getElementById("growthActiveReferrers").textContent=st.active_referrers??0;
  document.getElementById("referralCommission").value=Number(settings.commission_percent||0).toFixed(2);
  document.getElementById("referralEnabled").checked=!!settings.enabled;
  status.textContent="Referral data loaded";
  if(!(data.leaders||[]).length)leaders.append(el("div","empty-admin","No referrals recorded yet."));
  (data.leaders||[]).forEach((x,i)=>{const card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","",(i+1)+". "+x.full_name+" (@"+x.username+")"),el("span","request-status user-state",String(x.referral_count)+" referrals"));const meta=el("div","request-meta");meta.append(el("span","","Referral code: "+(x.referral_code||"—")));card.append(head,meta);leaders.append(card)});
  if(!(data.referrals||[]).length)referrals.append(el("div","empty-admin","No referred registrations found."));
  (data.referrals||[]).forEach(x=>{const card=el("article","request-card"),head=el("div","request-head"),identity=el("div","user-identity");identity.append(el("strong","",x.full_name+" (@"+x.username+")"),el("span","user-subline",x.email||""));head.append(identity,el("span","request-status user-state","REFERRED"));const meta=el("div","request-meta");[["Referred by",x.referrer_name+" (@"+x.referrer_username+")"],["Referral code",x.referral_code],["Joined",x.created_at?new Date(x.created_at).toLocaleString():"—"]].forEach(([k,v])=>meta.append(el("span","",k+": "+String(v||"—"))));card.append(head,meta);referrals.append(card)});
 }catch(e){status.textContent="Could not load referral data";leaders.append(el("div","empty-admin admin-error",e.message))}
}
async function saveReferralSettings(event){
 event.preventDefault();const button=document.getElementById("saveReferralSettings"),commissionPercent=Number(document.getElementById("referralCommission").value),enabled=document.getElementById("referralEnabled").checked;
 if(!Number.isFinite(commissionPercent)||commissionPercent<0||commissionPercent>50){alert("Commission rate must be between 0 and 50%.");return}
 if(enabled&&!confirm("Save this referral commission policy? No commission is credited until a real supplier confirms an eligible order as completed."))return;
 button.disabled=true;
 try{await request("/admin/growth/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({commissionPercent,enabled})});alert("Referral settings saved.");await loadGrowth()}catch(e){alert(e.message)}finally{button.disabled=false}
}
async function loadFinance(){const status=document.getElementById("adminStatus"),list=document.getElementById("requestsList");status.textContent="Loading…";list.textContent="";try{const data=await request("/admin/money-requests");const requests=data.requests||[],pending=requests.filter(x=>x.status==="pending");document.getElementById("pendingCount").textContent=pending.length;document.getElementById("totalCount").textContent=requests.length;document.getElementById("financeBadge").title=pending.length+" pending";document.getElementById("financeBadge").style.display=pending.length?"block":"none";status.textContent="Admin access verified";if(!requests.length){list.append(el("div","empty-admin","No money requests found."));return}requests.forEach(m=>{const card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","",String(m.request_type||"").toUpperCase()+" · "+String(m.method||"").toUpperCase()),el("span","request-status",String(m.status||"").toUpperCase()));card.append(head);const meta=el("div","request-meta");[[ "Amount",money(m.amount_minor)],["User",String(m.username||"—")+" ("+String(m.email||"—")+")"],["Account",m.account_number||"—"],["TrxID",m.trx_id||"—"],["Submitted",m.created_at?new Date(m.created_at).toLocaleString():"—"],["Review note",m.review_note||"—"]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));card.append(meta);if(m.status==="pending"){const actions=el("div","request-actions"),note=el("input");note.placeholder="Optional review note";note.maxLength=500;const yes=el("button","approve","Approve"),no=el("button","reject","Reject");const review=async decision=>{if(!confirm(decision==="approved"?"Verify the payment/TrxID before approving. Continue?":"Reject this request?"))return;yes.disabled=no.disabled=true;try{await request("/admin/money-requests/"+encodeURIComponent(m.id)+"/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,note:note.value})});await loadFinance()}catch(e){alert(e.message);yes.disabled=no.disabled=false}};yes.addEventListener("click",()=>review("approved"));no.addEventListener("click",()=>review("rejected"));actions.append(note,yes,no);card.append(actions)}list.append(card)})}catch(e){status.textContent="Could not load requests";list.append(el("div","empty-admin admin-error",e.message))}}
async function loadUsers(){
 const status=document.getElementById("usersStatus"),list=document.getElementById("usersList");
 if(!status||!list)return;
 status.textContent="Loading users…";list.textContent="";
 try{
  const params=new URLSearchParams(),search=document.getElementById("userSearch").value.trim(),filter=document.getElementById("userStatusFilter").value;
  if(search)params.set("search",search);if(filter)params.set("status",filter);
  const data=await request("/admin/users?"+params.toString()),users=data.users||[];
  status.textContent=users.length+" customer account"+(users.length===1?"":"s")+" loaded";
  if(!users.length){list.append(el("div","empty-admin","No matching customer accounts."));return}
  users.forEach(u=>{
   const card=el("article","request-card user-card"),head=el("div","request-head"),identity=el("div","user-identity");
   identity.append(el("strong","",u.full_name||"Unnamed user"),el("span","user-subline","@"+u.username+" · "+u.email));
   const state=el("span","request-status user-state "+(u.status==="active"?"is-active":"is-blocked"),String(u.status||"").toUpperCase());head.append(identity,state);card.append(head);
   const meta=el("div","request-meta");
   [["Phone",u.phone||"Not provided"],["Wallet balance",money(u.balance_minor)],["Total spent",money(u.total_spent_minor)],["Orders",String(u.total_orders||0)+" ("+String(u.completed_orders||0)+" completed)"],["Joined",u.created_at?new Date(u.created_at).toLocaleDateString():"—"]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));
   card.append(meta);
   const actions=el("div","user-actions"),details=el("button","user-action","View profile & activity"),balance=el("button","user-action","Adjust balance"),toggle=el("button",u.status==="active"?"user-action danger":"user-action success",u.status==="active"?"Block user":"Unblock user");
   const detailBox=el("div","user-detail");detailBox.hidden=true;
   details.addEventListener("click",async()=>{if(!detailBox.hidden){detailBox.hidden=true;details.textContent="View profile & activity";return}details.disabled=true;details.textContent="Loading…";try{const d=await request("/admin/users/"+encodeURIComponent(u.id));const p=d.user;detailBox.textContent="";const info=el("div","user-detail-grid");[["Full name",p.full_name],["Username",p.username],["Email",p.email],["Phone",p.phone||"Not provided"],["Account status",p.status],["Joined",new Date(p.created_at).toLocaleString()],["Wallet balance",money(p.balance_minor)],["Total spent",money(p.total_spent_minor)],["Total orders",String(p.total_orders)],["Completed orders",String(p.completed_orders)]].forEach(([k,v])=>info.append(el("span","",k+": "+String(v??"—"))));detailBox.append(info,el("h3","user-activity-title","Recent wallet activity"));if(!(d.recent_activity||[]).length)detailBox.append(el("p","users-footnote","No wallet activity recorded."));else d.recent_activity.forEach(a=>detailBox.append(el("p","user-activity-row",(a.entry_type||"activity")+" · "+money(a.amount_minor)+" · "+(a.note||"")+" · "+new Date(a.created_at).toLocaleString())));detailBox.hidden=false;details.textContent="Hide profile & activity"}catch(e){alert(e.message)}finally{details.disabled=false}});
   balance.addEventListener("click",async()=>{const raw=prompt("Enter balance adjustment in BDT. Use a negative number to subtract (example: 150 or -50).");if(raw===null)return;const amount=Number(raw);if(!Number.isFinite(amount)||amount===0||Math.abs(amount)>500000||Math.round(amount*100)!==amount*100){alert("Enter a valid non-zero amount with up to 2 decimal places (maximum ৳500,000).");return}const reason=prompt("Reason for this wallet adjustment (5–250 characters):");if(reason===null)return;if(reason.trim().length<5||reason.trim().length>250){alert("Reason must be 5–250 characters.");return}if(!confirm((amount>0?"Add ":"Subtract ")+money(Math.abs(Math.round(amount*100)))+" "+(amount>0?"to":"from")+" @"+u.username+"'s wallet?"))return;balance.disabled=true;try{await request("/admin/users/"+encodeURIComponent(u.id)+"/balance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount,reason:reason.trim()})});await loadUsers();alert("Wallet balance updated and recorded in the ledger.")}catch(e){alert(e.message)}finally{balance.disabled=false}});
   toggle.addEventListener("click",async()=>{const next=u.status==="active"?"blocked":"active";if(!confirm((next==="blocked"?"Block":"Unblock")+" @"+u.username+"? "+(next==="blocked"?"Their active sessions will be revoked.":"They will be able to sign in again.")))return;toggle.disabled=true;try{await request("/admin/users/"+encodeURIComponent(u.id)+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});await loadUsers()}catch(e){alert(e.message);toggle.disabled=false}});
   actions.append(details,balance,toggle);card.append(actions,detailBox);list.append(card);
  });
 }catch(e){status.textContent="Could not load users";list.append(el("div","empty-admin admin-error",e.message))}
}
async function loadOrders(){
 const status=document.getElementById("ordersStatus"),list=document.getElementById("ordersList");
 if(!status||!list)return;
 status.textContent="Loading orders…";list.textContent="";
 try{
  const params=new URLSearchParams(),search=document.getElementById("orderSearch").value.trim(),filter=document.getElementById("orderStatusFilter").value;
  if(search)params.set("search",search);if(filter)params.set("status",filter);
  const data=await request("/admin/orders?"+params.toString()),orders=data.orders||[];
  status.textContent=orders.length+" order"+(orders.length===1?"":"s")+" loaded";
  if(!orders.length){list.append(el("div","empty-admin","No matching orders found."));return}
  orders.forEach(o=>{
   const card=el("article","request-card order-card"),head=el("div","request-head");
   const identity=el("div","user-identity");
   identity.append(el("strong","",(o.service_name||"Service")+" · "+money(o.charge_minor)),el("span","user-subline","@"+(o.username||"—")+" · "+(o.email||"—")));
   const state=el("span","request-status user-state",String(o.status||"").toUpperCase());head.append(identity,state);card.append(head);
   const meta=el("div","request-meta");
   [["Order ID",o.id],["Category",o.category||"—"],["Target",o.target||"—"],["Quantity",String(o.quantity)],["Created",o.created_at?new Date(o.created_at).toLocaleString():"—"],["Provider ref",o.provider_order_id||"Not assigned"]].forEach(([k,v])=>meta.append(el("span","",k+": "+String(v??"—"))));
   card.append(meta);
   const actions=el("div","user-actions"),details=el("button","user-action","Full order details");
   details.addEventListener("click",async()=>{details.disabled=true;try{const d=await request("/admin/orders/"+encodeURIComponent(o.id));const p=d.order;const info=el("div","user-detail-grid");[["Order ID",p.id],["Customer",p.full_name+" (@"+p.username+")"],["Email",p.email],["Phone",p.phone||"Not provided"],["Service",p.service_name],["Target",p.target],["Quantity",p.quantity],["Amount",money(p.charge_minor)],["Status",p.status],["Supplier order ID",p.provider_order_id||"Not assigned"],["Created",new Date(p.created_at).toLocaleString()],["Last updated",new Date(p.updated_at).toLocaleString()]].forEach(([k,v])=>info.append(el("span","",k+": "+String(v??"—"))));const box=card.querySelector(".order-detail");box.textContent="";box.append(info);box.hidden=!box.hidden;details.textContent=box.hidden?"Full order details":"Hide order details"}catch(e){alert(e.message)}finally{details.disabled=false}});
   actions.append(details);
   if(o.status==="pending"){
    const cancel=el("button","user-action danger","Cancel & refund");
    cancel.addEventListener("click",async()=>{const reason=prompt("Cancellation reason (5–250 characters):");if(reason===null)return;if(reason.trim().length<5||reason.trim().length>250){alert("Reason must be 5–250 characters.");return}if(!confirm("Cancel this pending order and return "+money(o.charge_minor)+" to the customer's wallet?"))return;cancel.disabled=true;try{const result=await request("/admin/orders/"+encodeURIComponent(o.id)+"/cancel-refund",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:reason.trim()})});alert(result.status==="refunded"?"Order canceled and wallet refund recorded.":"Order canceled. No charge was present to refund.");await loadOrders()}catch(e){alert(e.message);cancel.disabled=false}});
    actions.append(cancel);
   }
   const detailBox=el("div","user-detail order-detail");detailBox.hidden=true;card.append(actions,detailBox);list.append(card);
  });
 }catch(e){status.textContent="Could not load orders";list.append(el("div","empty-admin admin-error",e.message))}
}

const serviceCategories={facebook:"Facebook",tiktok:"TikTok",instagram:"Instagram",youtube:"YouTube",telegram:"Telegram",free_fire:"Free Fire",pubg_mobile:"PUBG Mobile",mlbb:"Mobile Legends"};
function resetServiceForm(){document.getElementById("serviceForm").reset();document.getElementById("serviceId").value="";document.getElementById("serviceFormTitle").textContent="Add new service";document.getElementById("saveService").textContent="Save service";document.getElementById("serviceMin").value="1";document.getElementById("serviceMax").value="100000"}
function fillServiceForm(s){document.getElementById("serviceId").value=s.id;document.getElementById("serviceCategory").value=s.category;document.getElementById("serviceName").value=s.name;document.getElementById("serviceDescription").value=s.description||"";document.getElementById("servicePrice").value=(Number(s.price_per_1000_minor)/100).toFixed(2);document.getElementById("serviceCost").value=(Number(s.cost_per_1000_minor)/100).toFixed(2);document.getElementById("serviceMin").value=s.min_quantity;document.getElementById("serviceMax").value=s.max_quantity;document.getElementById("serviceProviderId").value=s.provider_service_id||"";document.getElementById("serviceFormTitle").textContent="Edit service";document.getElementById("saveService").textContent="Update service";document.getElementById("serviceForm").scrollIntoView({behavior:"smooth",block:"start"})}
async function loadServices(){
 const status=document.getElementById("servicesStatus"),list=document.getElementById("servicesList");if(!status||!list)return;
 status.textContent="Loading services…";list.textContent="";
 try{
  const data=await request("/admin/services"),q=document.getElementById("serviceSearch").value.trim().toLowerCase(),cat=document.getElementById("serviceCategoryFilter").value;
  const all=data.services||[],services=all.filter(s=>(!cat||s.category===cat)&&(!q||(s.name+" "+s.description+" "+s.category).toLowerCase().includes(q)));
  status.textContent=services.length+" of "+all.length+" services";
  if(!services.length){list.append(el("div","empty-admin","No matching services found."));return}
  services.forEach(s=>{
   const card=el("article","request-card service-card"),head=el("div","request-head"),identity=el("div","user-identity");
   identity.append(el("strong","",s.name),el("span","user-subline",(serviceCategories[s.category]||s.category)+" · "+(s.provider_service_id||"No supplier ID")));
   head.append(identity,el("span","request-status user-state "+(s.enabled?"is-active":"is-blocked"),s.enabled?"ENABLED":"DISABLED"));card.append(head);
   const price=Number(s.price_per_1000_minor)/100,cost=Number(s.cost_per_1000_minor)/100,meta=el("div","request-meta");
   [["Selling / 1000","৳"+price.toFixed(2)],["Purchase / 1000","৳"+cost.toFixed(2)],["Profit / 1000","৳"+(price-cost).toFixed(2)],["Margin",price>0?(((price-cost)/price)*100).toFixed(1)+"%":"—"],["Quantity",s.min_quantity+" – "+s.max_quantity],["Orders used",String(s.order_count||0)]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));card.append(meta);
   if(s.description)card.append(el("p","users-footnote",s.description));
   const actions=el("div","user-actions"),edit=el("button","user-action","Edit"),toggle=el("button",s.enabled?"user-action danger":"user-action success",s.enabled?"Disable":"Enable"),del=el("button","user-action danger","Delete");
   edit.addEventListener("click",()=>fillServiceForm(s));
   toggle.addEventListener("click",async()=>{if(s.enabled&&!confirm("Disable this service?"))return;if(!s.enabled&&!confirm("Enable this service? Confirm that its supplier mapping and fulfilment have been verified."))return;toggle.disabled=true;try{await request("/admin/services/"+encodeURIComponent(s.id)+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:!s.enabled})});await loadServices()}catch(e){alert(e.message);toggle.disabled=false}});
   del.addEventListener("click",async()=>{if(!confirm("Permanently delete this service? Services already used by orders cannot be deleted; disable them instead."))return;del.disabled=true;try{await request("/admin/services/"+encodeURIComponent(s.id),{method:"DELETE"});await loadServices()}catch(e){alert(e.message);del.disabled=false}});
   actions.append(edit,toggle,del);card.append(actions);list.append(card);
  });
 }catch(e){status.textContent="Could not load services";list.append(el("div","empty-admin admin-error",e.message))}
}
async function saveService(event){event.preventDefault();const id=document.getElementById("serviceId").value;const payload={category:document.getElementById("serviceCategory").value,name:document.getElementById("serviceName").value.trim(),description:document.getElementById("serviceDescription").value.trim(),price:Number(document.getElementById("servicePrice").value),cost:Number(document.getElementById("serviceCost").value),minQuantity:Number(document.getElementById("serviceMin").value),maxQuantity:Number(document.getElementById("serviceMax").value),providerServiceId:document.getElementById("serviceProviderId").value.trim()};if(!Number.isFinite(payload.price)||!Number.isFinite(payload.cost)||payload.maxQuantity<payload.minQuantity){alert("Check selling price, purchase cost and quantity limits.");return}const button=document.getElementById("saveService");button.disabled=true;try{await request("/admin/services"+(id?"/"+encodeURIComponent(id):""),{method:id?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});alert(id?"Service updated.":"Service created disabled by default.");resetServiceForm();await loadServices()}catch(e){alert(e.message)}finally{button.disabled=false}}

async function loadAnnouncements(){
 const status=document.getElementById("announcementStatus"),list=document.getElementById("announcementsList");if(!status||!list)return;
 status.textContent="Loading…";list.textContent="";
 try{const data=await request("/admin/announcements"),items=data.announcements||[];status.textContent=items.length+" announcement"+(items.length===1?"":"s");
 if(!items.length){list.append(el("div","empty-admin","No announcements created yet."));return}
 items.forEach(a=>{const card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","",a.title),el("span","request-status user-state "+(a.active?"is-active":"is-blocked"),a.active?"PUBLISHED":"HIDDEN"));card.append(head,el("p","announcement-copy",a.body));const meta=el("div","request-meta");meta.append(el("span","","Created by: @"+a.created_by),el("span","",a.created_at?new Date(a.created_at).toLocaleString():""));card.append(meta);const actions=el("div","user-actions"),toggle=el("button",a.active?"user-action danger":"user-action success",a.active?"Hide announcement":"Publish announcement"),del=el("button","user-action danger","Delete");toggle.addEventListener("click",async()=>{toggle.disabled=true;try{await request("/admin/announcements/"+encodeURIComponent(a.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!a.active})});await loadAnnouncements()}catch(e){alert(e.message);toggle.disabled=false}});del.addEventListener("click",async()=>{if(!confirm("Permanently delete this announcement?"))return;del.disabled=true;try{await request("/admin/announcements/"+encodeURIComponent(a.id),{method:"DELETE"});await loadAnnouncements()}catch(e){alert(e.message);del.disabled=false}});actions.append(toggle,del);card.append(actions);list.append(card)});
 }catch(e){status.textContent="Could not load announcements";list.append(el("div","empty-admin admin-error",e.message))}
}
async function saveAnnouncement(event){event.preventDefault();const button=document.getElementById("saveAnnouncement"),payload={title:document.getElementById("announcementTitle").value.trim(),body:document.getElementById("announcementBody").value.trim(),active:document.getElementById("announcementActive").checked};button.disabled=true;try{await request("/admin/announcements",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});document.getElementById("announcementForm").reset();document.getElementById("announcementActive").checked=true;await loadAnnouncements();alert("Announcement saved.")}catch(e){alert(e.message)}finally{button.disabled=false}}
async function loadActivity(){
 const status=document.getElementById("activityStatus"),list=document.getElementById("activityList");if(!status||!list)return;status.textContent="Loading…";list.textContent="";
 try{const p=new URLSearchParams(),q=document.getElementById("activitySearch").value.trim(),a=document.getElementById("activityAction").value.trim();if(q)p.set("search",q);if(a)p.set("action",a);const d=await request("/admin/activity?"+p.toString()),logs=d.logs||[];status.textContent=logs.length+" log entr"+(logs.length===1?"y":"ies");if(!logs.length){list.append(el("div","empty-admin","No matching audit records."));return}
 logs.forEach(x=>{const card=el("article","request-card"),head=el("div","request-head"),identity=el("div","user-identity");identity.append(el("strong","",String(x.action||"").replaceAll("_"," ").toUpperCase()),el("span","user-subline",(x.full_name||"Unknown admin")+" (@"+(x.username||"system")+")"));head.append(identity,el("span","request-status",String(x.entity_type||"").toUpperCase()));card.append(head);const meta=el("div","request-meta");[["Entity ID",x.entity_id||"—"],["Time",x.created_at?new Date(x.created_at).toLocaleString():"—"],["Email",x.email||"—"],["Details",JSON.stringify(x.details||{})]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));card.append(meta);list.append(card)});
 }catch(e){status.textContent="Could not load audit trail";list.append(el("div","empty-admin admin-error",e.message))}
}
async function loadSystem(){
 const list=document.getElementById("systemStatus");if(!list)return;list.textContent="Loading system status…";
 try{const d=await request("/admin/system"),c=d.counts||{};const rows=[["Database",d.database?"Connected":"Unavailable"],["Environment",d.environment],["Order fulfilment",d.orderFulfilmentEnabled?"Enabled":"Disabled — supplier integration not verified"],["Payment mode",d.paymentMode],["Customer accounts",c.users??0],["Orders recorded",c.orders??0],["Services configured",c.services??0],["Pending money requests",c.pending_money??0],["Open support tickets",c.open_tickets??0],["Secret configuration","Protected — managed in hosting environment"]];rows.forEach(([k,v])=>{const card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","",k),el("span","request-status",String(v)));card.append(head);list.append(card)})}catch(e){list.append(el("div","empty-admin admin-error",e.message))}
}

document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.getElementById("refreshAdmin").addEventListener("click",()=>{const active=document.querySelector(".admin-page.active");if(active?.id==="page-users")loadUsers();else if(active?.id==="page-orders")loadOrders();else if(active?.id==="page-services")loadServices();else if(active?.id==="page-growth")loadGrowth();else if(active?.id==="page-website")loadAnnouncements();else if(active?.id==="page-settings")loadSystem();else if(active?.id==="page-activity")loadActivity();else loadFinance()});
document.getElementById("refreshUsers").addEventListener("click",loadUsers);
document.getElementById("refreshOrders").addEventListener("click",loadOrders);
document.getElementById("refreshServices").addEventListener("click",loadServices);
document.getElementById("refreshGrowth").addEventListener("click",loadGrowth);
document.getElementById("announcementForm").addEventListener("submit",saveAnnouncement);
document.getElementById("refreshAnnouncements").addEventListener("click",loadAnnouncements);
document.getElementById("refreshSystem").addEventListener("click",loadSystem);
document.getElementById("refreshActivity").addEventListener("click",loadActivity);
document.getElementById("activitySearch").addEventListener("input",loadActivity);
document.getElementById("activityAction").addEventListener("input",loadActivity);
document.getElementById("referralSettingsForm").addEventListener("submit",saveReferralSettings);
document.getElementById("serviceSearch").addEventListener("input",loadServices);
document.getElementById("serviceCategoryFilter").addEventListener("change",loadServices);
document.getElementById("serviceForm").addEventListener("submit",saveService);
document.getElementById("resetServiceForm").addEventListener("click",resetServiceForm);
document.getElementById("orderSearch").addEventListener("input",loadOrders);
document.getElementById("orderStatusFilter").addEventListener("change",loadOrders);
document.getElementById("userSearch").addEventListener("input",loadUsers);
document.getElementById("userStatusFilter").addEventListener("change",loadUsers);
document.getElementById("sidebarToggle").addEventListener("click",()=>{const open=document.getElementById("adminSidebar").classList.toggle("open");document.getElementById("sidebarScrim").classList.toggle("show",open);document.getElementById("sidebarToggle").setAttribute("aria-expanded",String(open));});
document.getElementById("sidebarScrim").addEventListener("click",()=>{document.getElementById("adminSidebar").classList.remove("open");document.getElementById("sidebarScrim").classList.remove("show");document.getElementById("sidebarToggle").setAttribute("aria-expanded","false");});
const search=document.getElementById("adminSearch"),results=document.getElementById("searchResults");search.addEventListener("input",()=>{const q=search.value.trim().toLowerCase();results.textContent="";if(!q){results.hidden=true;return}const matches=Object.entries(titles).filter(([key,v])=>(key+" "+v.join(" ")).toLowerCase().includes(q));matches.forEach(([key,v])=>{const b=el("button","",v[0]+" — "+v[1]);b.addEventListener("click",()=>{showPage(key);search.value=""});results.append(b)});if(!matches.length)results.append(el("button","","No matching admin section"));results.hidden=false});
document.addEventListener("click",e=>{if(!results.contains(e.target)&&e.target!==search)results.hidden=true});
document.getElementById("adminLogout").addEventListener("click",async()=>{try{await request("/auth/logout",{method:"POST"})}finally{location.href="/#login"}});
request("/me").then(d=>{if(d.user.role!=="admin"){document.getElementById("adminStatus").textContent="Access denied";document.getElementById("requestsList").textContent="Administrator access required. Your account is not an admin account.";document.getElementById("pendingCount").textContent="—";document.getElementById("totalCount").textContent="—";return}return loadFinance()}).catch(e=>{if(e.message==="Authentication required."||e.message==="Session expired or account unavailable."){location.replace("/?next=%2Fadmin.html#login");return}document.getElementById("adminStatus").textContent="Could not verify access";document.getElementById("requestsList").textContent=e.message;document.getElementById("pendingCount").textContent="—";document.getElementById("totalCount").textContent="—"});
