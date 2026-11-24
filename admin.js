const api="/api";
async function request(path,options={}){const r=await fetch(api+path,{credentials:"include",...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed");return data}
const money=v=>"৳"+(Number(v||0)/100).toFixed(2);
let adminUsdToBdtRate=0;
let adminServicesCache=[];
let adminServicesPage=1;
const ADMIN_SERVICES_PAGE_SIZE=100;
let adminVisibleServices=[];
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
const titles={overview:["Overview","Your panel at a glance."],users:["Users","Manage customer accounts and wallet access."],orders:["Orders","Review and manage customer orders."],services:["Services","Manage gaming and social media services."],finance:["Finance","Review deposits, withdrawals and payment requests."],growth:["Growth & Referrals","Referral performance and commission controls."],support:["Support","Customer tickets and live support."],website:["Website Content","Manage website content and announcements."],notifications:["Notifications","Create and manage messages shown only in the notification bell."],settings:["Settings","General system configuration."],"system-settings":["System Settings","Payment, deposit, withdrawal and service quantity controls."],activity:["Activity Logs","Review administrative actions."]};
function showPage(page){if(page==="support"){location.href="/support-admin";return}if(!titles[page])return;document.querySelectorAll(".admin-page").forEach(x=>x.classList.toggle("active",x.id==="page-"+page));document.querySelectorAll(".admin-nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));document.getElementById("pageTitle").textContent=titles[page][0];document.getElementById("pageSubtitle").textContent=titles[page][1];document.getElementById("adminSidebar").classList.remove("open");document.getElementById("sidebarScrim").classList.remove("show");document.getElementById("sidebarToggle").setAttribute("aria-expanded","false");document.getElementById("searchResults").hidden=true;if(page==="users")loadUsers();if(page==="orders"){loadOrders();loadRealAdsOrders();}if(page==="services")loadServices();if(page==="finance")loadFinance();if(page==="growth")loadGrowth();if(page==="website")loadAnnouncements();if(page==="notifications")loadNotifications();if(page==="settings"){loadSystem();}if(page==="system-settings"){loadPaymentSettings();loadCryptoPaymentSettings();loadMaintenanceSettings();loadCurrencySettings();loadMoneyLimits();}if(page==="activity")loadActivity()}
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
async function loadFinance(){const status=document.getElementById("adminStatus"),list=document.getElementById("requestsList");status.textContent="Loading…";list.textContent="";try{const data=await request("/admin/money-requests");const requests=data.requests||[],pending=requests.filter(x=>x.status==="pending");document.getElementById("pendingCount").textContent=pending.length;document.getElementById("totalCount").textContent=requests.length;document.getElementById("financeBadge").title=pending.length+" pending";document.getElementById("financeBadge").style.display=pending.length?"block":"none";status.textContent="Admin access verified";if(!requests.length){list.append(el("div","empty-admin","No money requests found."));return}requests.forEach(m=>{const card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","",String(m.request_type||"").toUpperCase()+" · "+String(m.method||"").toUpperCase()),el("span","request-status",String(m.status||"").toUpperCase()));card.append(head);const meta=el("div","request-meta");[[ "Amount",money(m.amount_minor)],["User",String(m.username||"—")+" ("+String(m.email||"—")+")"],["Account / Sender",m.account_number||"—"],...(m.crypto_amount?[[ "USDT Amount",String(m.crypto_amount)+" USDT"],["USDT → BDT Rate","৳"+String(m.conversion_rate||"—")+" / USDT"]]:[]),["TrxID / Hash",m.trx_id||"—"],["Submitted",m.created_at?new Date(m.created_at).toLocaleString():"—"],["Review note",m.review_note||"—"]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));card.append(meta);if(m.status==="pending"){const actions=el("div","request-actions"),note=el("input");note.placeholder="Optional review note";note.maxLength=500;const yes=el("button","approve","Approve"),no=el("button","reject","Reject");const review=async decision=>{if(!confirm(decision==="approved"?"Verify the payment/TrxID before approving. Continue?":"Reject this request?"))return;yes.disabled=no.disabled=true;try{await request("/admin/money-requests/"+encodeURIComponent(m.id)+"/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({decision,note:note.value})});await loadFinance()}catch(e){alert(e.message);yes.disabled=no.disabled=false}};yes.addEventListener("click",()=>review("approved"));no.addEventListener("click",()=>review("rejected"));actions.append(note,yes,no);card.append(actions)}list.append(card)})}catch(e){status.textContent="Could not load requests";list.append(el("div","empty-admin admin-error",e.message))}}
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

async function loadRealAdsOrders(){
 const status=document.getElementById("realAdsAdminStatus"),list=document.getElementById("realAdsAdminList");if(!status||!list)return;
 status.textContent="Loading Real Ads requests…";list.textContent="";
 try{
  const params=new URLSearchParams(),search=document.getElementById("realAdsAdminSearch")?.value.trim(),filter=document.getElementById("realAdsAdminFilter")?.value;
  if(search)params.set("search",search);if(filter)params.set("status",filter);
  const data=await request("/admin/real-ads/orders?"+params.toString()),orders=data.orders||[];status.textContent=orders.length+" request"+(orders.length===1?"":"s")+" loaded";
  if(!orders.length){list.append(el("div","empty-admin","No matching Real Ads requests."));return;}
  const labels={pending:"Pending",reviewing:"Reviewing",approved:"Approved for manual setup",rejected:"Rejected",completed:"Completed",canceled:"Canceled"};
  orders.forEach(order=>{
   const card=el("article","request-card order-card"),head=el("div","request-head"),identity=el("div","user-identity");
   identity.append(el("strong","","৳"+Number(order.budget_bdt).toLocaleString("en-BD")+" · Facebook Real Ads"),el("span","user-subline",(order.full_name||"Customer")+" (@"+(order.username||"—")+") · "+(order.email||"—")));
   head.append(identity,el("span","request-status user-state",labels[order.status]||order.status));card.append(head);
   const meta=el("div","request-meta");
   [["Request ID",order.id],["Customer phone",order.phone||"Not provided"],["Budget","৳"+Number(order.budget_bdt).toLocaleString("en-BD")],["Submitted",new Date(order.created_at).toLocaleString()],["Customer note",order.note||"—"]].forEach(([k,v])=>meta.append(el("span","",k+": "+String(v))));
   const video=el("a","user-action","Open Facebook video");video.href=order.video_url;video.target="_blank";video.rel="noopener noreferrer";meta.append(video);card.append(meta);
   const controls=el("div","user-actions"),select=document.createElement("select");select.className="user-action";select.setAttribute("aria-label","Request status");
   ["pending","reviewing","approved","rejected","completed","canceled"].forEach(value=>{const option=document.createElement("option");option.value=value;option.textContent=labels[value];option.selected=value===order.status;select.append(option)});
   const note=document.createElement("input");note.className="user-action";note.type="text";note.maxLength=1000;note.placeholder="Admin note for customer";note.value=order.admin_note||"";
   const save=el("button","user-action","Save status");
   save.addEventListener("click",async()=>{save.disabled=true;try{await request("/admin/real-ads/orders/"+encodeURIComponent(order.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:select.value,adminNote:note.value.trim()})});await loadRealAdsOrders()}catch(error){alert(error.message);save.disabled=false}});
   controls.append(select,note,save);card.append(controls);list.append(card);
  });
 }catch(error){status.textContent="Could not load Real Ads requests";list.append(el("div","empty-admin admin-error",error.message));}
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
   const detailBox=el("div","user-detail order-detail");detailBox.hidden=true;
   if(o.status==="processing"&&o.category==="free_fire"&&o.provider_order_id){
    const reconcile=el("button","user-action","FF delivery check");
    reconcile.addEventListener("click",async()=>{
     if(!detailBox.hidden){detailBox.hidden=true;reconcile.textContent="FF delivery check";return}
     reconcile.disabled=true;reconcile.textContent="Checking…";
     try{
      const d=await request("/admin/orders/"+encodeURIComponent(o.id)+"/ff-reconciliation");
      const p=d.order;detailBox.replaceChildren();
      const info=el("div","user-detail-grid");
      [["Customer",p.full_name+" (@"+p.username+")"],["Player UID",p.target],["Supplier order ID",p.provider_order_id],["Current NEXORA status",p.status],["Supplier callbacks received",String(d.events.length)]].forEach(([k,v])=>info.append(el("span","",k+": "+String(v??"—"))));
      detailBox.append(info,el("h3","user-activity-title","Supplier delivery evidence"));
      if(!d.events.length)detailBox.append(el("p","users-footnote","No supplier webhook has reached NEXORA for this order yet. The supplier's dashboard status alone does not prove the diamonds reached the UID."));
      d.events.forEach(ev=>{
       const item=el("p","user-activity-row","Supplier callback: "+String(ev.status||"").toUpperCase()+" · "+new Date(ev.created_at).toLocaleString());
       if(ev.payload?.content)item.append(document.createTextNode(" · Content: "+ev.payload.content));
       if(ev.payload?.codes?.length)item.append(document.createTextNode(" · Codes: "+ev.payload.codes.join(", ")));
       detailBox.append(item);
      });
      detailBox.append(el("p","users-footnote","Important: a supplier SUCCESS/COMPLETE callback is supplier-side evidence only. Keep this order Processing until the customer confirms the diamonds have appeared in the Player UID."));
      const copy=el("button","user-action","Copy secure callback URL for supplier");
      copy.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(d.callbackUrl);alert("Secure callback URL copied. Send it to the supplier only if they can resend this order's webhook.");}catch{prompt("Copy this secure callback URL and send it to the supplier:",d.callbackUrl)}});
      detailBox.append(copy);
      const confirmDelivery=el("button","user-action success","Mark delivered — customer confirmed");
      confirmDelivery.addEventListener("click",async()=>{
       const reason=prompt("Only continue AFTER the customer confirms diamonds arrived in UID "+p.target+". Record how/when the customer confirmed (10–250 characters):");
       if(reason===null)return;
       if(reason.trim().length<10||reason.trim().length>250){alert("Enter confirmation details (10–250 characters).");return}
       if(!confirm("Customer has confirmed receiving the diamonds in the correct UID. Mark this order COMPLETED?"))return;
       confirmDelivery.disabled=true;
       try{await request("/admin/orders/"+encodeURIComponent(o.id)+"/confirm-delivered",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:reason.trim(),customerConfirmed:true})});alert("Customer-confirmed delivery recorded. Order marked completed.");await loadOrders();}
       catch(error){alert(error.message);confirmDelivery.disabled=false}
      });
      detailBox.append(confirmDelivery);detailBox.hidden=false;reconcile.textContent="Hide delivery check";
     }catch(error){alert(error.message);reconcile.textContent="FF delivery check"}
     finally{reconcile.disabled=false}
    });
    actions.append(reconcile);
   }
   if(["facebook","instagram","tiktok","youtube","telegram"].includes(o.category)&&["pending","processing"].includes(o.status)){
    const complete=el("button","user-action success","Complete / Success");
    complete.addEventListener("click",async()=>{
     if(!confirm("Mark this social-service order as COMPLETED / SUCCESS? Only do this after confirming the supplier delivered the order."))return;
     complete.disabled=true;
     try{await request("/admin/orders/"+encodeURIComponent(o.id)+"/social-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"completed",reason:"Admin confirmed successful social-service delivery."})});alert("Order marked COMPLETED / SUCCESS.");await loadOrders()}catch(e){alert(e.message);complete.disabled=false}
    });
    const reject=el("button","user-action danger","Reject & Refund");
    reject.addEventListener("click",async()=>{
     const reason=prompt("Rejection reason (5–250 characters). The order charge will be refunded to the customer's wallet:");
     if(reason===null)return;
     if(reason.trim().length<5||reason.trim().length>250){alert("Reason must be 5–250 characters.");return}
     if(!confirm("Reject this social-service order and refund "+money(o.charge_minor)+" to the customer's wallet?"))return;
     reject.disabled=true;
     try{const result=await request("/admin/orders/"+encodeURIComponent(o.id)+"/social-status",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:"refunded",reason:reason.trim()})});alert("Order rejected. "+money(result.refunded_minor)+" refunded to the customer's wallet.");await loadOrders()}catch(e){alert(e.message);reject.disabled=false}
    });
    actions.append(complete,reject);
   }
   if(o.status==="pending"&&!["facebook","instagram","tiktok","youtube","telegram"].includes(o.category)){
    const cancel=el("button","user-action danger","Cancel & refund");
    cancel.addEventListener("click",async()=>{const reason=prompt("Cancellation reason (5–250 characters):");if(reason===null)return;if(reason.trim().length<5||reason.trim().length>250){alert("Reason must be 5–250 characters.");return}if(!confirm("Cancel this pending order and return "+money(o.charge_minor)+" to the customer's wallet?"))return;cancel.disabled=true;try{const result=await request("/admin/orders/"+encodeURIComponent(o.id)+"/cancel-refund",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason:reason.trim()})});alert(result.status==="refunded"?"Order canceled and wallet refund recorded.":"Order canceled. No charge was present to refund.");await loadOrders()}catch(e){alert(e.message);cancel.disabled=false}});
    actions.append(cancel);
   }
   card.append(actions,detailBox);list.append(card);
  });
 }catch(e){status.textContent="Could not load orders";list.append(el("div","empty-admin admin-error",e.message))}
}

const serviceCategories={facebook:"Facebook",tiktok:"TikTok",instagram:"Instagram",youtube:"YouTube",telegram:"Telegram",free_fire:"Free Fire",pubg_mobile:"PUBG Mobile",mlbb:"Mobile Legends"};
function resetServiceForm(){document.getElementById("serviceForm").reset();document.getElementById("serviceId").value="";document.getElementById("serviceFormTitle").textContent="Add new service";document.getElementById("saveService").textContent="Save service";document.getElementById("serviceMin").value="1";document.getElementById("serviceMax").value="100000"}
function fillServiceForm(s){document.getElementById("serviceId").value=s.id;document.getElementById("serviceCategory").value=s.category;document.getElementById("serviceName").value=s.name;document.getElementById("serviceDescription").value=s.description||"";document.getElementById("servicePrice").value=(Number(s.price_per_1000_minor)/100).toFixed(2);document.getElementById("serviceCost").value=(Number(s.cost_per_1000_minor)/100).toFixed(2);document.getElementById("serviceMin").value=s.min_quantity;document.getElementById("serviceMax").value=s.max_quantity;document.getElementById("serviceProviderId").value=s.provider_service_id||"";document.getElementById("serviceFormTitle").textContent="Edit service";document.getElementById("saveService").textContent="Update service";document.getElementById("serviceForm").scrollIntoView({behavior:"smooth",block:"start"})}

const selectedServiceIds=new Set();
function updateBulkPricingControls(){
 const count=document.getElementById("bulkServiceCount"),button=document.getElementById("applyBulkPricing");
 if(count)count.textContent=selectedServiceIds.size+" selected";
 if(button)button.disabled=selectedServiceIds.size===0;
}
async function applyBulkPricing(event){
 event.preventDefault();
 const serviceIds=[...selectedServiceIds],price=Number(document.getElementById("bulkSellingPrice").value),cost=Number(document.getElementById("bulkPurchaseCost").value);
 if(!serviceIds.length){alert("Select at least one service first.");return}
 if(!Number.isFinite(price)||price<0||!Number.isFinite(cost)||cost<0){alert("Enter valid BDT prices.");return}
 if(!confirm("Update selling price to ৳"+price.toFixed(2)+" and purchase cost to ৳"+cost.toFixed(2)+" for "+serviceIds.length+" selected services?"))return;
 const button=document.getElementById("applyBulkPricing");button.disabled=true;
 try{
  const data=await request("/admin/services/bulk-pricing",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({serviceIds,price,cost})});
  selectedServiceIds.clear();updateBulkPricingControls();await loadServices();alert("Updated prices for "+data.updatedCount+" services.");
 }catch(error){alert(error.message)}finally{updateBulkPricingControls()}
}
function adminServiceKind(service){
 const text=(String(service.name||"")+" "+String(service.description||"")).toLowerCase();
 if(/watch[ -]?time|watch hours?|hours? watch/.test(text))return "watchtime";
 if(/subscriber|\bsubs?\b/.test(text))return "subscribers";
 if(/follower|\bfollows?\b/.test(text))return "followers";
 if(/comment|\breply\b/.test(text))return "comments";
 if(/story[ -]?views?/.test(text))return "story_views";
 if(/live[ -]?views?|live stream/.test(text))return "live_views";
 if(/\bviews?\b/.test(text))return "views";
 if(/\blikes?\b/.test(text))return "likes";
 if(/\bmembers?\b|group joins?|channel joins?/.test(text))return "members";
 if(/reaction/.test(text))return "reactions";
 if(/shares?/.test(text))return "shares";
 if(/saves?/.test(text))return "saves";
 return "other";
}
async function selectAndEnableVisibleServices(){
 const category=document.getElementById("serviceCategoryFilter").value;
 const button=document.getElementById("selectEnableServices"),status=document.getElementById("selectEnableServicesStatus");
 if(!category){status.textContent="আগে একটি Category নির্বাচন করো।";alert("একটি নির্দিষ্ট Category নির্বাচন করো। All categories অবস্থায় bulk enable হবে না।");return;}
 const candidates=adminServicesCache.filter(s=>s.category===category&&String(s.provider_service_id||"").startsWith("smmcoder:"));
 const groups=new Map();
 for(const service of candidates){const kind=adminServiceKind(service);if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push(service);}
 const buckets=[...groups.values()];
 for(const bucket of buckets)bucket.sort((a,b)=>Number(a.cost_per_1000_minor||0)-Number(b.cost_per_1000_minor||0)||String(a.name).localeCompare(String(b.name)));
 const services=[];
 for(let round=0;services.length<100;round++){let added=false;for(const bucket of buckets){if(bucket[round]&&services.length<100){services.push(bucket[round]);added=true;}}if(!added)break;}
 if(!services.length){status.textContent="এই Category-তে SMMCoder-এর কোনো সার্ভিস নেই।";return;}
 const serviceIds=services.map(s=>s.id).filter(Boolean);
 if(!serviceIds.length){status.textContent="কোনো valid service ID পাওয়া যায়নি।";return;}
 const disabledCount=services.filter(s=>!s.enabled).length;
 if(!disabledCount){status.textContent="এই ১০০টি বা তার কম সার্ভিস আগেই Enable আছে।";return;}
 const categoryName=serviceCategories[category]||category;
 if(!confirm(categoryName+" Category-র "+services.length+"টি balanced service (লাইক, কমেন্ট, ফলোয়ার, ভিউ ইত্যাদি) এর supplier cost থেকে ৳135/USD ধরে ৭% লাভসহ Selling Price auto set করে Enable হবে। Purchase rates provider catalogue থেকে নেওয়া।"))return;
 button.disabled=true;status.textContent=services.length+"টি সার্ভিস Select ও Enable হচ্ছে…";
 serviceIds.forEach(id=>selectedServiceIds.add(id));
 document.querySelectorAll("#servicesList .service-card input[type=checkbox]").forEach(box=>{box.checked=serviceIds.includes(box.dataset.serviceId)});
 updateBulkPricingControls();
 try{
  const data=await request("/admin/services/bulk-enable",{method:"PATCH",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({serviceIds})});
  selectedServiceIds.clear();updateBulkPricingControls();
  status.textContent="সফল: "+data.enabledCount+"টি "+categoryName+" সার্ভিসে ৳135/USD conversion ও ৭% লাভসহ Selling Price auto set করে Enable হয়েছে।";
  await loadServices();
 }catch(error){status.textContent="Enable করা যায়নি: "+error.message;}
 finally{button.disabled=false;}
}
async function checkSmmCoderConnection(){
 const status=document.getElementById("smmCoderStatus"),result=document.getElementById("smmCoderSyncResult"),button=document.getElementById("checkSmmCoder");
 if(!status||!result)return;
 button.disabled=true;status.textContent="Checking API…";result.textContent="Contacting SMMCoder securely from the NEXORA server…";
 try{const d=await request("/admin/smmcoder/status");if(!d.connected){status.textContent="Not configured";result.textContent=d.message||"Add the provider API key in Render Environment.";return;}status.textContent="Connected";result.textContent="API connected · "+d.serviceCount+" provider services · Balance: "+Number(d.balance||0).toFixed(4)+" "+(d.currency||"USD")+" · Order submission "+(d.ordersEnabled?"enabled":"disabled");}
 catch(e){status.textContent="Connection failed";result.textContent=e.message;}
 finally{button.disabled=false;}
}
async function syncSmmCoderServices(){
 const button=document.getElementById("syncSmmCoder"),status=document.getElementById("smmCoderStatus"),result=document.getElementById("smmCoderSyncResult");
 if(!confirm("Fetch SMMCoder's current service list and import supported Facebook, Instagram, TikTok, YouTube and Telegram services with a 7% markup? New services remain DISABLED; existing service enable/disable states are preserved."))return;
 button.disabled=true;status.textContent="Syncing…";result.textContent="Fetching provider catalogue and calculating prices…";
 try{const d=await request("/admin/smmcoder/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});status.textContent="Sync complete";result.textContent="Imported "+d.importedCount+" · Updated "+d.updatedCount+" · Skipped "+d.skippedCount+" · Markup 7%. All newly imported services remain disabled.";await loadServices();}
 catch(e){status.textContent="Sync failed";result.textContent=e.message;}
 finally{button.disabled=false;}
}
async function loadServices(){
 const status=document.getElementById("servicesStatus"),list=document.getElementById("servicesList");if(!status||!list)return;
 status.textContent="Loading services…";list.textContent="";
 try{
  const [data,currency]=await Promise.all([request("/admin/services"),request("/admin/currency")]);
  adminUsdToBdtRate=Number(currency.usd_to_bdt_rate||0);
  adminServicesCache=data.services||[];
  adminServicesPage=1;
  renderServices();
 }catch(e){status.textContent="Could not load services";list.append(el("div","empty-admin admin-error",e.message))}
}
function renderServices(){
 const status=document.getElementById("servicesStatus"),list=document.getElementById("servicesList");if(!status||!list)return;
 const q=document.getElementById("serviceSearch").value.trim().toLowerCase(),cat=document.getElementById("serviceCategoryFilter").value;
 const all=adminServicesCache,filtered=all.filter(s=>(!cat||s.category===cat)&&(!q||(s.name+" "+s.description+" "+s.category).toLowerCase().includes(q))).sort((a,b)=>Number(a.price_per_1000_minor||0)-Number(b.price_per_1000_minor||0)||String(a.name).localeCompare(String(b.name)));
 const totalPages=Math.max(1,Math.ceil(filtered.length/ADMIN_SERVICES_PAGE_SIZE));
 adminServicesPage=Math.min(Math.max(1,adminServicesPage),totalPages);
 const start=(adminServicesPage-1)*ADMIN_SERVICES_PAGE_SIZE;
 const services=filtered.slice(start,start+ADMIN_SERVICES_PAGE_SIZE);
 adminVisibleServices=services;
 status.textContent=filtered.length+" matching · "+all.length+" total services · Page "+adminServicesPage+"/"+totalPages;
 list.textContent="";
 if(!services.length){list.append(el("div","empty-admin","No matching services found."));return}
 services.forEach(s=>{
  const card=el("article","request-card service-card"),head=el("div","request-head"),identity=el("div","user-identity"),selectLabel=el("label","service-select-label"),selectBox=el("input");
  selectBox.type="checkbox";selectBox.dataset.serviceId=s.id;selectBox.checked=selectedServiceIds.has(s.id);selectBox.setAttribute("aria-label","Select "+s.name+" for bulk pricing");selectBox.addEventListener("change",()=>{if(selectBox.checked)selectedServiceIds.add(s.id);else selectedServiceIds.delete(s.id);updateBulkPricingControls()});selectLabel.append(selectBox,document.createTextNode(" Select"));
  identity.append(el("strong","",s.name),el("span","user-subline",(serviceCategories[s.category]||s.category)+" · "+(s.provider_service_id||"No supplier ID")));head.append(selectLabel);
  head.append(identity,el("span","request-status user-state "+(s.enabled?"is-active":"is-blocked"),s.enabled?"ENABLED":"DISABLED"));card.append(head);
  const price=Number(s.price_per_1000_minor)/100,manualCost=Number(s.cost_per_1000_minor)/100,supplierUsd=Number(s.supplier_rate_usd_per_1000||0),cost=manualCost,meta=el("div","request-meta");
  [["Selling / 1000","৳"+price.toFixed(2)],["Purchase / 1000","৳"+cost.toFixed(2)],["Profit / 1000","৳"+(price-cost).toFixed(2)],["Margin",price>0?(((price-cost)/price)*100).toFixed(1)+"%":"—"],["Quantity",s.min_quantity+" – "+s.max_quantity],["Orders used",String(s.order_count||0)]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));if(supplierUsd>0){meta.append(el("span","","Supplier cost / 1K: $"+supplierUsd.toFixed(4)+" USD"));meta.append(el("span","","Supplier cost in BDT / 1K: "+"৳"+(supplierUsd*135).toFixed(2)));}card.append(meta);
  if(s.description)card.append(el("p","users-footnote",s.description));
  const actions=el("div","user-actions"),edit=el("button","user-action","Edit"),toggle=el("button",s.enabled?"user-action danger":"user-action success",s.enabled?"Disable":"Enable"),del=el("button","user-action danger","Delete");
  edit.addEventListener("click",()=>fillServiceForm(s));
  toggle.addEventListener("click",async()=>{if(s.enabled&&!confirm("Disable this service?"))return;if(!s.enabled&&!confirm("Enable this service? Confirm that its supplier mapping and fulfilment have been verified."))return;toggle.disabled=true;try{await request("/admin/services/"+encodeURIComponent(s.id)+"/status",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled:!s.enabled})});await loadServices()}catch(e){alert(e.message);toggle.disabled=false}});
  del.addEventListener("click",async()=>{if(!confirm("Permanently delete this service? Services already used by orders cannot be deleted; disable them instead."))return;del.disabled=true;try{await request("/admin/services/"+encodeURIComponent(s.id),{method:"DELETE"});await loadServices()}catch(e){alert(e.message);del.disabled=false}});
  actions.append(edit,toggle,del);card.append(actions);list.append(card);
 });
 if(totalPages>1){
  const pager=el("div","user-actions"),previous=el("button","user-action","Previous"),next=el("button","user-action","Next"),pageLabel=el("span","users-footnote","Page "+adminServicesPage+" of "+totalPages);
  previous.disabled=adminServicesPage===1;next.disabled=adminServicesPage===totalPages;
  previous.addEventListener("click",()=>{adminServicesPage--;renderServices()});
  next.addEventListener("click",()=>{adminServicesPage++;renderServices()});
  pager.append(previous,pageLabel,next);list.append(pager);
 }
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

async function loadNotifications(){
 const status=document.getElementById("notificationStatus"),list=document.getElementById("notificationsList");if(!status||!list)return;
 status.textContent="Loading…";list.textContent="";
 try{const data=await request("/admin/notifications"),items=data.notifications||[];status.textContent=items.length+" notification"+(items.length===1?"":"s");
 if(!items.length){list.append(el("div","empty-admin","No notifications created yet."));return}
 items.forEach(n=>{const card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","",n.title),el("span","request-status user-state "+(n.active?"is-active":"is-blocked"),n.active?"PUBLISHED":"HIDDEN"));card.append(head,el("p","announcement-copy",n.body));const meta=el("div","request-meta");meta.append(el("span","","Created by: @"+n.created_by),el("span","",n.created_at?new Date(n.created_at).toLocaleString():""));card.append(meta);const actions=el("div","user-actions"),toggle=el("button",n.active?"user-action danger":"user-action success",n.active?"Hide notification":"Publish notification"),del=el("button","user-action danger","Delete");toggle.addEventListener("click",async()=>{toggle.disabled=true;try{await request("/admin/notifications/"+encodeURIComponent(n.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({active:!n.active})});await loadNotifications()}catch(e){alert(e.message);toggle.disabled=false}});del.addEventListener("click",async()=>{if(!confirm("Permanently delete this notification?"))return;del.disabled=true;try{await request("/admin/notifications/"+encodeURIComponent(n.id),{method:"DELETE"});await loadNotifications()}catch(e){alert(e.message);del.disabled=false}});actions.append(toggle,del);card.append(actions);list.append(card)});
 }catch(e){status.textContent="Could not load notifications";list.append(el("div","empty-admin admin-error",e.message))}
}
async function saveNotification(event){event.preventDefault();const button=document.getElementById("saveNotification"),payload={title:document.getElementById("notificationTitle").value.trim(),body:document.getElementById("notificationBody").value.trim(),active:document.getElementById("notificationActive").checked};button.disabled=true;try{await request("/admin/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});document.getElementById("notificationForm").reset();document.getElementById("notificationActive").checked=true;await loadNotifications();alert("Notification published.")}catch(e){alert(e.message)}finally{button.disabled=false}}

async function loadActivity(){
 const status=document.getElementById("activityStatus"),list=document.getElementById("activityList");if(!status||!list)return;status.textContent="Loading…";list.textContent="";
 try{const p=new URLSearchParams(),q=document.getElementById("activitySearch").value.trim(),a=document.getElementById("activityAction").value.trim();if(q)p.set("search",q);if(a)p.set("action",a);const d=await request("/admin/activity?"+p.toString()),logs=d.logs||[];status.textContent=logs.length+" log entr"+(logs.length===1?"y":"ies");if(!logs.length){list.append(el("div","empty-admin","No matching audit records."));return}
 logs.forEach(x=>{const card=el("article","request-card"),head=el("div","request-head"),identity=el("div","user-identity");identity.append(el("strong","",String(x.action||"").replaceAll("_"," ").toUpperCase()),el("span","user-subline",(x.full_name||"Unknown admin")+" (@"+(x.username||"system")+")"));head.append(identity,el("span","request-status",String(x.entity_type||"").toUpperCase()));card.append(head);const meta=el("div","request-meta");[["Entity ID",x.entity_id||"—"],["Time",x.created_at?new Date(x.created_at).toLocaleString():"—"],["Email",x.email||"—"],["Details",JSON.stringify(x.details||{})]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));card.append(meta);list.append(card)});
 }catch(e){status.textContent="Could not load audit trail";list.append(el("div","empty-admin admin-error",e.message))}
}
async function loadMaintenanceSettings(){const status=document.getElementById("maintenanceStatus");if(!status)return;status.textContent="Loading…";try{const d=await request("/admin/maintenance");document.getElementById("maintenanceEnabled").checked=!!d.enabled;document.getElementById("maintenanceMessage").value=d.message||"";status.textContent=d.enabled?"Maintenance is ON":"Maintenance is OFF";}catch(e){status.textContent=e.message;}}
async function saveMaintenanceSettings(event){event.preventDefault();const button=document.getElementById("saveMaintenance"),status=document.getElementById("maintenanceStatus"),enabled=document.getElementById("maintenanceEnabled").checked,message=document.getElementById("maintenanceMessage").value.trim();if(enabled&&message.length<5){status.textContent="Please write a reason (at least 5 characters).";return;}if(!confirm((enabled?"Turn ON":"Turn OFF")+" site maintenance mode?"))return;button.disabled=true;status.textContent="Saving…";try{const d=await request("/admin/maintenance",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({enabled,message})});status.textContent=d.enabled?"Maintenance is ON":"Maintenance is OFF";}catch(e){status.textContent=e.message;}finally{button.disabled=false;}}
async function loadMoneyLimits(){const ds=document.getElementById("depositLimitStatus"),ws=document.getElementById("withdrawLimitStatus");if(!ds||!ws)return;ds.textContent="Loading…";ws.textContent="Loading…";try{const d=await request("/admin/money-limits");document.getElementById("minimumDepositAmount").value=Number(d.minimum_deposit||100);document.getElementById("minimumWithdrawAmount").value=Number(d.minimum_withdrawal||100);ds.textContent="Minimum deposit: ৳"+Number(d.minimum_deposit||100);ws.textContent="Minimum withdraw: ৳"+Number(d.minimum_withdrawal||100);}catch(e){ds.textContent=e.message;ws.textContent=e.message;}}
async function saveDepositLimit(event){event.preventDefault();const b=document.getElementById("saveDepositLimit"),s=document.getElementById("depositLimitStatus"),v=Number(document.getElementById("minimumDepositAmount").value);if(!Number.isInteger(v)||v<1||v>50000){s.textContent="Enter a whole amount from ৳1 to ৳50,000.";return;}b.disabled=true;s.textContent="Saving…";try{const c=await request("/admin/money-limits");const d=await request("/admin/money-limits",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({minimumDeposit:v,minimumWithdrawal:Number(c.minimum_withdrawal||100)})});s.textContent="Saved · Minimum deposit ৳"+d.minimum_deposit;}catch(e){s.textContent=e.message;}finally{b.disabled=false;}}
async function saveWithdrawLimit(event){event.preventDefault();const b=document.getElementById("saveWithdrawLimit"),s=document.getElementById("withdrawLimitStatus"),v=Number(document.getElementById("minimumWithdrawAmount").value);if(!Number.isInteger(v)||v<1||v>50000){s.textContent="Enter a whole amount from ৳1 to ৳50,000.";return;}b.disabled=true;s.textContent="Saving…";try{const c=await request("/admin/money-limits");const d=await request("/admin/money-limits",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({minimumDeposit:Number(c.minimum_deposit||100),minimumWithdrawal:v})});s.textContent="Saved · Minimum withdraw ৳"+d.minimum_withdrawal;}catch(e){s.textContent=e.message;}finally{b.disabled=false;}}
async function loadPaymentSettings(){const status=document.getElementById("paymentSettingsStatus");if(!status)return;status.textContent="Loading…";try{const d=await request("/admin/payment-settings"),p=d.settings||{};for(const [key,id] of Object.entries({bkash:"payBkash",nagad:"payNagad"}))document.getElementById(id).value=p[key]?.number||"";for(const [key,id] of Object.entries({bkash:"typeBkash",nagad:"typeNagad"}))document.getElementById(id).value=p[key]?.type||"personal";status.textContent="Deposit payment numbers loaded";}catch(e){status.textContent=e.message;}}
async function loadCryptoPaymentSettings(){const status=document.getElementById("cryptoPaymentSettingsStatus");if(!status)return;status.textContent="Loading…";try{const d=await request("/admin/crypto-payment-settings");document.getElementById("cryptoBep20Address").value=d.bep20_address||"";document.getElementById("cryptoBinancePayId").value=d.binance_pay_id||"";document.getElementById("usdtToBdtRate").value=Number(d.usdt_bdt_rate||0)||"";status.textContent="Crypto settings loaded";}catch(e){status.textContent=e.message;}}
async function saveCryptoPaymentSettings(event){event.preventDefault();const button=document.getElementById("saveCryptoPaymentSettings"),status=document.getElementById("cryptoPaymentSettingsStatus");button.disabled=true;status.textContent="Saving…";try{await request("/admin/crypto-payment-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({bep20_address:document.getElementById("cryptoBep20Address").value.trim(),binance_pay_id:document.getElementById("cryptoBinancePayId").value.trim(),usdt_bdt_rate:Number(document.getElementById("usdtToBdtRate").value)})});status.textContent="Crypto deposit settings saved";}catch(e){status.textContent=e.message;}finally{button.disabled=false;}}
async function savePaymentSettings(event){event.preventDefault();const button=document.getElementById("savePaymentSettings"),status=document.getElementById("paymentSettingsStatus");button.disabled=true;status.textContent="Saving…";const settings={};for(const key of ["bkash","nagad"]){const cap=key[0].toUpperCase()+key.slice(1);settings[key]={number:document.getElementById("pay"+cap).value.trim(),type:document.getElementById("type"+cap).value};}try{await request("/admin/payment-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({settings})});status.textContent="Deposit payment numbers saved successfully";}catch(e){status.textContent=e.message;}finally{button.disabled=false;}}
function updateCurrencyPreview(){const rate=Number(document.getElementById("usdToBdtRate")?.value||0),preview=document.getElementById("currencyPreview");if(!preview)return;preview.textContent=rate>0&&Number.isFinite(rate)?"$1 = ৳"+rate.toFixed(2)+" · $0.10 = ৳"+(rate*.1).toFixed(2)+" · $1.00 = ৳"+rate.toFixed(2):"Enter a rate to preview USD conversion.";}
async function loadCurrencySettings(){const status=document.getElementById("currencySettingsStatus");if(!status)return;status.textContent="Loading…";try{const d=await request("/admin/currency");document.getElementById("usdToBdtRate").value=Number(d.usd_to_bdt_rate||0)||"";updateCurrencyPreview();adminUsdToBdtRate=Number(d.usd_to_bdt_rate||0);status.textContent=d.usd_to_bdt_rate>0?"Rate loaded · ৳"+Number(d.usd_to_bdt_rate).toFixed(2)+" per USD":"No exchange rate set yet";}catch(e){status.textContent=e.message;}}
async function saveCurrencySettings(event){event.preventDefault();const button=document.getElementById("saveCurrencySettings"),status=document.getElementById("currencySettingsStatus"),usdToBdtRate=Number(document.getElementById("usdToBdtRate").value);if(!Number.isFinite(usdToBdtRate)||usdToBdtRate<1||usdToBdtRate>10000){status.textContent="Enter a valid exchange rate.";return;}button.disabled=true;status.textContent="Saving…";try{const d=await request("/admin/currency",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({usdToBdtRate})});status.textContent="Saved · 1 USD = ৳"+Number(d.settings.usd_to_bdt_rate).toFixed(2);}catch(e){status.textContent=e.message;}finally{button.disabled=false;}}
async function loadSystem(){
 const list=document.getElementById("systemStatus");if(!list)return;list.textContent="Loading system status…";
 try{const d=await request("/admin/system"),c=d.counts||{};const rows=[["Database",d.database?"Connected":"Unavailable"],["Environment",d.environment],["Order fulfilment",d.orderFulfilmentEnabled?"Enabled":"Disabled — supplier integration not verified"],["Payment mode",d.paymentMode],["Customer accounts",c.users??0],["Orders recorded",c.orders??0],["Services configured",c.services??0],["Pending money requests",c.pending_money??0],["Open support tickets",c.open_tickets??0],["Secret configuration","Protected — managed in hosting environment"]];rows.forEach(([k,v])=>{const card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","",k),el("span","request-status",String(v)));card.append(head);list.append(card)})}catch(e){list.append(el("div","empty-admin admin-error",e.message))}
}

document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.getElementById("refreshAdmin").addEventListener("click",()=>{const active=document.querySelector(".admin-page.active");if(active?.id==="page-users")loadUsers();else if(active?.id==="page-orders")loadOrders();else if(active?.id==="page-services")loadServices();else if(active?.id==="page-growth")loadGrowth();else if(active?.id==="page-website")loadAnnouncements();else if(active?.id==="page-settings")loadSystem();else if(active?.id==="page-system-settings"){loadPaymentSettings();loadCryptoPaymentSettings();loadMaintenanceSettings();loadCurrencySettings();loadMoneyLimits();}else if(active?.id==="page-activity")loadActivity();else loadFinance()});
document.getElementById("refreshUsers").addEventListener("click",loadUsers);
document.getElementById("refreshOrders").addEventListener("click",loadOrders);
document.getElementById("refreshRealAdsAdmin").addEventListener("click",loadRealAdsOrders);
document.getElementById("realAdsAdminSearch").addEventListener("input",loadRealAdsOrders);
document.getElementById("realAdsAdminFilter").addEventListener("change",loadRealAdsOrders);
document.getElementById("refreshServices").addEventListener("click",loadServices);
document.getElementById("checkSmmCoder").addEventListener("click",checkSmmCoderConnection);
document.getElementById("syncSmmCoder").addEventListener("click",syncSmmCoderServices);
document.getElementById("refreshGrowth").addEventListener("click",loadGrowth);
document.getElementById("announcementForm").addEventListener("submit",saveAnnouncement);
document.getElementById("refreshAnnouncements").addEventListener("click",loadAnnouncements);
document.getElementById("notificationForm").addEventListener("submit",saveNotification);
document.getElementById("refreshNotifications").addEventListener("click",loadNotifications);
document.getElementById("refreshSystem").addEventListener("click",loadSystem);
document.getElementById("paymentSettingsForm").addEventListener("submit",savePaymentSettings);
document.getElementById("depositLimitForm").addEventListener("submit",saveDepositLimit);
document.getElementById("withdrawLimitForm").addEventListener("submit",saveWithdrawLimit);
document.getElementById("refreshDepositLimit").addEventListener("click",loadMoneyLimits);
document.getElementById("refreshWithdrawLimit").addEventListener("click",loadMoneyLimits);
document.getElementById("currencySettingsForm").addEventListener("submit",saveCurrencySettings);
document.getElementById("refreshCurrencySettings").addEventListener("click",loadCurrencySettings);
document.getElementById("usdToBdtRate").addEventListener("input",updateCurrencyPreview);
document.getElementById("maintenanceForm").addEventListener("submit",saveMaintenanceSettings);
document.getElementById("refreshMaintenance").addEventListener("click",loadMaintenanceSettings);
document.getElementById("refreshPaymentSettings").addEventListener("click",loadPaymentSettings);
document.getElementById("cryptoPaymentSettingsForm").addEventListener("submit",saveCryptoPaymentSettings);
document.getElementById("refreshCryptoPaymentSettings").addEventListener("click",loadCryptoPaymentSettings);
document.getElementById("refreshActivity").addEventListener("click",loadActivity);
document.getElementById("activitySearch").addEventListener("input",loadActivity);
document.getElementById("activityAction").addEventListener("input",loadActivity);
document.getElementById("referralSettingsForm").addEventListener("submit",saveReferralSettings);
document.getElementById("serviceSearch").addEventListener("input",()=>{adminServicesPage=1;renderServices()});
document.getElementById("serviceCategoryFilter").addEventListener("change",()=>{adminServicesPage=1;renderServices()});
document.getElementById("serviceForm").addEventListener("submit",saveService);
document.getElementById("bulkQuantityForm").addEventListener("submit",applyBulkEnabledServiceQuantities);
async function applyBulkEnabledServiceQuantities(event){
 event.preventDefault();
 const minQuantity=Number(document.getElementById("bulkMinQuantity").value);
 const maxQuantity=Number(document.getElementById("bulkMaxQuantity").value);
 const button=document.getElementById("applyBulkQuantity");
 const status=document.getElementById("bulkQuantityStatus");
 if(!Number.isSafeInteger(minQuantity)||!Number.isSafeInteger(maxQuantity)||minQuantity<1||maxQuantity<1||minQuantity>maxQuantity||maxQuantity>10000000){
  status.textContent="সঠিক Minimum ও Maximum দাও। Minimum যেন Maximum-এর বেশি না হয়।";return;
 }
 if(!confirm("Facebook, Instagram, TikTok, YouTube ও Telegram-এর বর্তমানে Enable থাকা সব সার্ভিসের Min "+minQuantity+" এবং Max "+maxQuantity+" করা হবে। Disabled সার্ভিস বদলাবে না। চালিয়ে যাবে?"))return;
 button.disabled=true;status.textContent="Enabled সার্ভিসগুলোর Quantity Limit আপডেট হচ্ছে…";
 try{
  const data=await request("/admin/services/bulk-update-enabled-quantities",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({minQuantity,maxQuantity})});
  const counts=data.counts||{};
  status.textContent="আপডেট হয়েছে: মোট "+data.updatedCount+"টি। FB "+(counts.facebook||0)+", Instagram "+(counts.instagram||0)+", TikTok "+(counts.tiktok||0)+", YouTube "+(counts.youtube||0)+", Telegram "+(counts.telegram||0)+".";
  await loadServices();
 }catch(error){status.textContent="আপডেট করা যায়নি: "+error.message;}
 finally{button.disabled=false;}
}
document.getElementById("bulkPricingForm").addEventListener("submit",applyBulkPricing);
document.getElementById("selectAllServices").addEventListener("click",()=>{document.querySelectorAll("#servicesList .service-card input[type=checkbox]").forEach(box=>{box.checked=true;selectedServiceIds.add(box.dataset.serviceId)});updateBulkPricingControls()});
document.getElementById("selectEnableServices").addEventListener("click",selectAndEnableVisibleServices);
document.getElementById("resetServiceForm").addEventListener("click",resetServiceForm);
document.getElementById("orderSearch").addEventListener("input",loadOrders);
document.getElementById("orderStatusFilter").addEventListener("change",loadOrders);
document.getElementById("userSearch").addEventListener("input",loadUsers);
document.getElementById("userStatusFilter").addEventListener("change",loadUsers);
document.getElementById("sidebarToggle").addEventListener("click",()=>{const open=document.getElementById("adminSidebar").classList.toggle("open");document.getElementById("sidebarScrim").classList.toggle("show",open);document.getElementById("sidebarToggle").setAttribute("aria-expanded",String(open));});
document.getElementById("sidebarScrim").addEventListener("click",()=>{document.getElementById("adminSidebar").classList.remove("open");document.getElementById("sidebarScrim").classList.remove("show");document.getElementById("sidebarToggle").setAttribute("aria-expanded","false");});
const search=document.getElementById("adminSearch"),results=document.getElementById("searchResults");search.addEventListener("input",()=>{const q=search.value.trim().toLowerCase();results.textContent="";if(!q){results.hidden=true;return}const matches=Object.entries(titles).filter(([key,v])=>(key+" "+v.join(" ")).toLowerCase().includes(q));matches.forEach(([key,v])=>{const b=el("button","",v[0]+" — "+v[1]);b.addEventListener("click",()=>{showPage(key);search.value=""});results.append(b)});if(!matches.length)results.append(el("button","","No matching admin section"));results.hidden=false});
document.addEventListener("click",e=>{if(!results.contains(e.target)&&e.target!==search)results.hidden=true});

async function applyFFResellerFivePercentMarkup(){
 const button=document.getElementById("applyFFResellerFivePercent"),status=document.getElementById("ffResellerPricingStatus");
 if(!button||!status)return;
 if(!confirm("Apply a 5% markup over the stored BDT purchase cost to all 32 FF Reseller packages? Purchase costs will not change. All services will remain disabled."))return;
 button.disabled=true;status.textContent="Checking FF Reseller packages…";
 let updated=0;
 try{
  const data=await request("/admin/services"),services=(data.services||[]).filter(s=>String(s.provider_service_id||"").startsWith("ffreseller:"));
  if(services.length!==32)throw new Error("Expected exactly 32 FF Reseller packages, found "+services.length+". No prices were changed.");
  const ids=new Set();
  for(const s of services){
   if(!s.id||ids.has(s.provider_service_id))throw new Error("Missing service ID or duplicate supplier ID. No prices were changed.");
   ids.add(s.provider_service_id);
   if(s.enabled)throw new Error("A FF Reseller package is already enabled. No prices were changed.");
   if(!Number.isInteger(Number(s.cost_per_1000_minor))||Number(s.cost_per_1000_minor)<=0)throw new Error("Invalid BDT purchase cost for "+s.name+". No prices were changed.");
  }
  status.textContent="Applying 5% markup…";
  for(const s of services){
   const costMinor=Number(s.cost_per_1000_minor),sellingMinor=Math.ceil(costMinor*1.05);
   await request("/admin/services/"+encodeURIComponent(s.id),{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({category:s.category,name:s.name,description:s.description||"",price:sellingMinor/100,cost:costMinor/100,minQuantity:s.min_quantity,maxQuantity:s.max_quantity,providerServiceId:s.provider_service_id})});
   updated++;
   status.textContent="Updated "+updated+" of 32 FF packages…";
  }
  status.textContent="Success: 5% markup applied to all 32 FF packages. Purchase costs unchanged; all remain disabled.";
  await loadServices();
 }catch(error){
  status.textContent="Stopped after "+updated+" updates: "+error.message+(updated?" Refresh and check the FF prices before retrying.":"");
  await loadServices();
 }finally{button.disabled=false;}
}
document.getElementById("applyFFResellerFivePercent").addEventListener("click",applyFFResellerFivePercentMarkup);
const importFFResellerButton=document.getElementById("importFFResellerCatalogue");
if(importFFResellerButton){importFFResellerButton.addEventListener("click",async()=>{const status=document.getElementById("ffResellerCatalogueStatus");if(!confirm("Import all 32 FF Reseller packages into NEXORA as disabled services? No supplier orders will be placed and no supplier balance will be spent."))return;importFFResellerButton.disabled=true;status.textContent="Importing 32 FF Reseller packages…";try{const data=await request("/admin/ff-reseller/import-catalogue",{method:"POST",headers:{"Accept":"application/json"}});status.textContent="Imported "+data.importedCount+" packages; skipped "+data.skippedCount+". All packages remain disabled. Set selling prices and enable them in the service list.";await loadServices();}catch(error){status.textContent="Import failed: "+error.message;}finally{importFFResellerButton.disabled=false;}});}

document.getElementById("backToAdmin").addEventListener("click",()=>{document.body.classList.remove("system-settings-view");document.getElementById("backToAdmin").hidden=true;history.replaceState(null,"",location.pathname);showPage("overview");loadFinance();});
document.getElementById("adminLogout").addEventListener("click",async()=>{try{await request("/auth/logout",{method:"POST"})}finally{location.href="/#login"}});
const requestedAdminView=new URLSearchParams(location.search).get("view");const systemSettingsView=requestedAdminView==="system-settings"||requestedAdminView==="settings";if(systemSettingsView){document.body.classList.add("system-settings-view");document.getElementById("backToAdmin").hidden=false;showPage(requestedAdminView==="system-settings"?"system-settings":"settings");}request("/me").then(d=>{if(d.user.role!=="admin"){document.getElementById("adminStatus").textContent="Access denied";document.getElementById("requestsList").textContent="Administrator access required. Your account is not an admin account.";document.getElementById("pendingCount").textContent="—";document.getElementById("totalCount").textContent="—";return}if(!systemSettingsView)return loadFinance()}).catch(e=>{if(e.message==="Authentication required."||e.message==="Session expired or account unavailable."){location.replace("/?next=%2Fadmin.html#login");return}document.getElementById("adminStatus").textContent="Could not verify access";document.getElementById("requestsList").textContent=e.message;document.getElementById("pendingCount").textContent="—";document.getElementById("totalCount").textContent="—"});