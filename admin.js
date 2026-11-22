const api="/api";
async function request(path,options={}){const r=await fetch(api+path,{credentials:"include",...options});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Request failed");return data}
const money=v=>"৳"+(Number(v||0)/100).toFixed(2);
let adminUsdToBdtRate=0;
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e}
const titles={overview:["Overview","Your panel at a glance."],users:["Users","Manage customer accounts and wallet access."],orders:["Orders","Review and manage customer orders."],services:["Services","Manage gaming and social media services."],finance:["Finance","Review deposits, withdrawals and payment requests."],growth:["Growth & Referrals","Referral performance and commission controls."],support:["Support","Customer tickets and live support."],website:["Website Content","Manage banners, notices and announcements."],settings:["Settings","Payment, security and panel configuration."],activity:["Activity Logs","Review administrative actions."]};
function showPage(page){if(page==="support"){location.href="/support-admin";return}if(!titles[page])return;document.querySelectorAll(".admin-page").forEach(x=>x.classList.toggle("active",x.id==="page-"+page));document.querySelectorAll(".admin-nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));document.getElementById("pageTitle").textContent=titles[page][0];document.getElementById("pageSubtitle").textContent=titles[page][1];document.getElementById("adminSidebar").classList.remove("open");document.getElementById("sidebarScrim").classList.remove("show");document.getElementById("sidebarToggle").setAttribute("aria-expanded","false");document.getElementById("searchResults").hidden=true;if(page==="users")loadUsers();if(page==="orders")loadOrders();if(page==="services")loadServices();if(page==="finance")loadFinance();if(page==="growth")loadGrowth();if(page==="website")loadAnnouncements();if(page==="settings"){loadSystem();loadPaymentSettings();loadCryptoPaymentSettings();loadMaintenanceSettings();loadCurrencySettings();loadMoneyLimits();}if(page==="activity")loadActivity()}
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
   if(o.status==="pending"){
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
async function loadServices(){
 const status=document.getElementById("servicesStatus"),list=document.getElementById("servicesList");if(!status||!list)return;
 status.textContent="Loading services…";list.textContent="";
 try{
  const [data,currency]=await Promise.all([request("/admin/services"),request("/admin/currency")]);adminUsdToBdtRate=Number(currency.usd_to_bdt_rate||0);const q=document.getElementById("serviceSearch").value.trim().toLowerCase(),cat=document.getElementById("serviceCategoryFilter").value;
  const all=data.services||[],services=all.filter(s=>(!cat||s.category===cat)&&(!q||(s.name+" "+s.description+" "+s.category).toLowerCase().includes(q)));
  status.textContent=services.length+" of "+all.length+" services";
  if(!services.length){list.append(el("div","empty-admin","No matching services found."));return}
  services.forEach(s=>{
   const card=el("article","request-card service-card"),head=el("div","request-head"),identity=el("div","user-identity"),selectLabel=el("label","smmexo-select-label"),selectBox=el("input");
   selectBox.type="checkbox";selectBox.dataset.serviceId=s.id;selectBox.checked=selectedServiceIds.has(s.id);selectBox.setAttribute("aria-label","Select "+s.name+" for bulk pricing");selectBox.addEventListener("change",()=>{if(selectBox.checked)selectedServiceIds.add(s.id);else selectedServiceIds.delete(s.id);updateBulkPricingControls()});selectLabel.append(selectBox,document.createTextNode(" Select"));
   identity.append(el("strong","",s.name),el("span","user-subline",(serviceCategories[s.category]||s.category)+" · "+(s.provider_service_id||"No supplier ID")));head.append(selectLabel);
   head.append(identity,el("span","request-status user-state "+(s.enabled?"is-active":"is-blocked"),s.enabled?"ENABLED":"DISABLED"));card.append(head);
   const price=Number(s.price_per_1000_minor)/100,manualCost=Number(s.cost_per_1000_minor)/100,supplierUsd=Number(s.supplier_rate_usd_per_1000||0),cost=supplierUsd>0&&adminUsdToBdtRate>0?supplierUsd*adminUsdToBdtRate:manualCost,meta=el("div","request-meta");
   [["Selling / 1000","৳"+price.toFixed(2)],["Purchase / 1000","৳"+cost.toFixed(2)],["Profit / 1000","৳"+(price-cost).toFixed(2)],["Margin",price>0?(((price-cost)/price)*100).toFixed(1)+"%":"—"],["Quantity",s.min_quantity+" – "+s.max_quantity],["Orders used",String(s.order_count||0)]].forEach(([k,v])=>meta.append(el("span","",k+": "+v)));if(supplierUsd>0){meta.append(el("span","","Supplier cost / 1K: $"+supplierUsd.toFixed(4)+" USD"));meta.append(el("span","","Supplier cost in BDT / 1K: "+(adminUsdToBdtRate>0?"৳"+(supplierUsd*adminUsdToBdtRate).toFixed(2):"Set USD/BDT rate in Settings")));}card.append(meta);
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
document.getElementById("refreshAdmin").addEventListener("click",()=>{const active=document.querySelector(".admin-page.active");if(active?.id==="page-users")loadUsers();else if(active?.id==="page-orders")loadOrders();else if(active?.id==="page-services")loadServices();else if(active?.id==="page-growth")loadGrowth();else if(active?.id==="page-website")loadAnnouncements();else if(active?.id==="page-settings")loadSystem();else if(active?.id==="page-activity")loadActivity();else loadFinance()});
document.getElementById("refreshUsers").addEventListener("click",loadUsers);
document.getElementById("refreshOrders").addEventListener("click",loadOrders);
document.getElementById("refreshServices").addEventListener("click",loadServices);
document.getElementById("refreshGrowth").addEventListener("click",loadGrowth);
document.getElementById("announcementForm").addEventListener("submit",saveAnnouncement);
document.getElementById("refreshAnnouncements").addEventListener("click",loadAnnouncements);
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
document.getElementById("serviceSearch").addEventListener("input",loadServices);
document.getElementById("serviceCategoryFilter").addEventListener("change",loadServices);
document.getElementById("serviceForm").addEventListener("submit",saveService);
document.getElementById("enableFacebookServices").addEventListener("click",enableEligibleFacebookServices);
document.getElementById("enableInstagramServices").addEventListener("click",enableEligibleInstagramServices);
async function enableEligibleInstagramServices(){
 const button=document.getElementById("enableInstagramServices"),status=document.getElementById("instagramBulkEnableStatus");
 if(!confirm("Enable all imported SMMEXO Instagram services with purchase cost ৳1–৳10 per 1,000 and a selling price above purchase cost? Only eligible Instagram services will be enabled."))return;
 button.disabled=true;status.textContent="Enabling eligible Instagram services…";
 try{const data=await request("/admin/services/bulk-enable-instagram",{method:"POST",headers:{"Accept":"application/json"}});status.textContent=data.enabledCount+" eligible Instagram services enabled.";await loadServices();}
 catch(error){status.textContent="Could not enable services: "+error.message;}
 finally{button.disabled=false;}
}
async function enableEligibleTikTokServices(){
 const button=document.getElementById("enableTikTokServices"),status=document.getElementById("tiktokBulkEnableStatus");
 if(!confirm("Enable all imported SMMEXO TikTok services with purchase cost ৳1–৳10 per 1,000 and a selling price above purchase cost? Only eligible TikTok services will be enabled."))return;
 button.disabled=true;status.textContent="Enabling eligible TikTok services…";
 try{const data=await request("/admin/services/bulk-enable-tiktok",{method:"POST",headers:{"Accept":"application/json"}});status.textContent=data.enabledCount+" eligible TikTok services enabled.";await loadServices();}
 catch(error){status.textContent="Could not enable services: "+error.message;}
 finally{button.disabled=false;}
}
async function enableEligibleTelegramServices(){
 const button=document.getElementById("enableTelegramServices"),status=document.getElementById("telegramBulkEnableStatus");
 if(!confirm("Enable all imported SMMEXO Telegram services with purchase cost ৳1–৳100 per 1,000 and a selling price above purchase cost? Only eligible Telegram services will be enabled."))return;
 button.disabled=true;status.textContent="Enabling eligible Telegram services…";
 try{const data=await request("/admin/services/bulk-enable-telegram",{method:"POST",headers:{"Accept":"application/json"}});status.textContent=data.enabledCount+" eligible Telegram services enabled.";await loadServices();}
 catch(error){status.textContent="Could not enable services: "+error.message;}
 finally{button.disabled=false;}
}
async function enableEligibleYouTubeServices(){
 const button=document.getElementById("enableYouTubeServices"),status=document.getElementById("youtubeBulkEnableStatus");
 if(!confirm("Enable all imported SMMEXO YouTube services with purchase cost ৳1–৳200 per 1,000 and a selling price above purchase cost? Only eligible YouTube services will be enabled."))return;
 button.disabled=true;status.textContent="Enabling eligible YouTube services…";
 try{const data=await request("/admin/services/bulk-enable-youtube",{method:"POST",headers:{"Accept":"application/json"}});status.textContent=data.enabledCount+" eligible YouTube services enabled.";await loadServices();}
 catch(error){status.textContent="Could not enable services: "+error.message;}
 finally{button.disabled=false;}
}
async function enableEligibleFacebookServices(){
 const button=document.getElementById("enableFacebookServices"),status=document.getElementById("facebookBulkEnableStatus");
 if(!confirm("Enable all imported SMMEXO Facebook services with purchase cost ৳1–৳30 per 1,000 and a selling price above purchase cost? Only eligible Facebook services will be enabled."))return;
 button.disabled=true;status.textContent="Enabling eligible Facebook services…";
 try{const data=await request("/admin/services/bulk-enable-facebook",{method:"POST",headers:{"Accept":"application/json"}});status.textContent=data.enabledCount+" eligible Facebook services enabled.";await loadServices();}
 catch(error){status.textContent="Could not enable services: "+error.message;}
 finally{button.disabled=false;}
}
document.getElementById("enableTikTokServices").addEventListener("click",enableEligibleTikTokServices);
document.getElementById("enableYouTubeServices").addEventListener("click",enableEligibleYouTubeServices);
document.getElementById("enableTelegramServices").addEventListener("click",enableEligibleTelegramServices);
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
document.getElementById("resetServiceForm").addEventListener("click",resetServiceForm);
document.getElementById("orderSearch").addEventListener("input",loadOrders);
document.getElementById("orderStatusFilter").addEventListener("change",loadOrders);
document.getElementById("userSearch").addEventListener("input",loadUsers);
document.getElementById("userStatusFilter").addEventListener("change",loadUsers);
document.getElementById("sidebarToggle").addEventListener("click",()=>{const open=document.getElementById("adminSidebar").classList.toggle("open");document.getElementById("sidebarScrim").classList.toggle("show",open);document.getElementById("sidebarToggle").setAttribute("aria-expanded",String(open));});
document.getElementById("sidebarScrim").addEventListener("click",()=>{document.getElementById("adminSidebar").classList.remove("open");document.getElementById("sidebarScrim").classList.remove("show");document.getElementById("sidebarToggle").setAttribute("aria-expanded","false");});
const search=document.getElementById("adminSearch"),results=document.getElementById("searchResults");search.addEventListener("input",()=>{const q=search.value.trim().toLowerCase();results.textContent="";if(!q){results.hidden=true;return}const matches=Object.entries(titles).filter(([key,v])=>(key+" "+v.join(" ")).toLowerCase().includes(q));matches.forEach(([key,v])=>{const b=el("button","",v[0]+" — "+v[1]);b.addEventListener("click",()=>{showPage(key);search.value=""});results.append(b)});if(!matches.length)results.append(el("button","","No matching admin section"));results.hidden=false});
document.addEventListener("click",e=>{if(!results.contains(e.target)&&e.target!==search)results.hidden=true});

const smmexoSelectedIds=new Set();
function updateSmmexoImportButton(){
 const button=document.getElementById("importSmmexoSelected");
 if(!button)return;
 button.disabled=smmexoSelectedIds.size===0;
 button.textContent="Import selected ("+smmexoSelectedIds.size+")";
}
const smmexoFetchButton=document.getElementById("fetchSmmexoServices");
if(smmexoFetchButton){
 smmexoFetchButton.addEventListener("click",async()=>{
  const status=document.getElementById("smmexoSupplierStatus"),list=document.getElementById("smmexoSupplierList");
  smmexoFetchButton.disabled=true;
  status.textContent="Connecting to SMMEXO…";
  list.replaceChildren();
  smmexoSelectedIds.clear();
  updateSmmexoImportButton();
  try{
   const response=await fetch("/api/admin/smmexo/services",{method:"POST",credentials:"include",headers:{"Accept":"application/json"}});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||("Supplier request failed ("+response.status+")."));
   status.textContent="Loaded "+data.count+" SMMEXO services · Currency: "+data.currency+" · Select services to import";
   if(!Array.isArray(data.services)||!data.services.length){list.append(el("div","empty-admin","SMMEXO returned no services."));return;}
   data.services.forEach(service=>{
    const card=el("article","request-card"),head=el("div","request-head");
    const selectLabel=document.createElement("label");
    selectLabel.className="smmexo-select-label";
    const checkbox=document.createElement("input");
    checkbox.type="checkbox";
    checkbox.setAttribute("aria-label","Select SMMEXO service "+service.serviceId);
    checkbox.addEventListener("change",()=>{
     if(checkbox.checked)smmexoSelectedIds.add(service.serviceId);
     else smmexoSelectedIds.delete(service.serviceId);
     updateSmmexoImportButton();
    });
    selectLabel.append(checkbox,document.createTextNode(" Select"));
    head.append(selectLabel,el("strong","","#"+service.serviceId+" · "+service.name),el("span","request-status","$"+Number(service.rate).toFixed(4)+" / 1K"));
    const meta=el("div","request-meta");
    [["Category",service.category],["Type",service.type],["Minimum",service.min],["Maximum",service.max],["Refill",service.refill?"Yes":"No"],["Cancel",service.cancel?"Yes":"No"]].forEach(([label,value])=>meta.append(el("span","",label+": "+String(value??"—"))));
    card.append(head,meta);list.append(card);
   });
  }catch(error){status.textContent="Could not load SMMEXO catalogue";list.append(el("div","empty-admin admin-error",error.message));}
  finally{smmexoFetchButton.disabled=false;}
 });
}
const importFacebookSmmexoButton=document.getElementById("importFacebookSmmexo");
if(importFacebookSmmexoButton){
 importFacebookSmmexoButton.addEventListener("click",async()=>{
  const status=document.getElementById("smmexoSupplierStatus"),list=document.getElementById("smmexoSupplierList");
  importFacebookSmmexoButton.disabled=true;
  list.replaceChildren();
  status.textContent="Fetching Facebook services and current USD/BDT rate…";
  try{
   const [response,currency]=await Promise.all([
    fetch("/api/admin/smmexo/services",{method:"POST",credentials:"include",headers:{"Accept":"application/json"}}),
    request("/admin/currency")
   ]);
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||("Supplier request failed ("+response.status+")."));
   const usdToBdt=Number(currency.usd_to_bdt_rate||0);
   if(!Number.isFinite(usdToBdt)||usdToBdt<=0)throw new Error("Set a valid USD to BDT exchange rate in Admin Panel → Settings → Currency before importing by BDT rate.");
   const facebook=(data.services||[]).filter(service=>/facebook|fb\s/.test((String(service.category||"")+" "+String(service.name||"")).toLowerCase()));
   const eligible=facebook.filter(service=>{const costBdt=Number(service.rate)*usdToBdt;return Number.isFinite(costBdt)&&costBdt>=1&&costBdt<=30;});
   if(!eligible.length){status.textContent="No Facebook services have a converted wholesale cost between ৳1 and ৳30 per 1,000. Nothing was imported.";list.append(el("div","empty-admin","Checked "+facebook.length+" Facebook services using ৳"+usdToBdt.toFixed(2)+" per USD."));return;}
   const serviceIds=eligible.map(service=>String(service.serviceId)).filter(Boolean);
   status.textContent="Found "+serviceIds.length+" Facebook services priced ৳1–৳30 per 1,000. Importing as disabled entries…";
   let importedCount=0,skippedCount=0,skipped=[];
   for(let i=0;i<serviceIds.length;i+=100){
    const imported=await fetch("/api/admin/smmexo/import",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({serviceIds:serviceIds.slice(i,i+100),facebookMarkupPercent:10})});
    const result=await imported.json().catch(()=>({}));
    if(!imported.ok)throw new Error(result.error||("Import failed ("+imported.status+")."));
    importedCount+=Number(result.importedCount||0);skippedCount+=Number(result.skippedCount||0);skipped.push(...(result.skipped||[]));
   }
   status.textContent="Facebook low-rate import complete: "+importedCount+" added, "+skippedCount+" skipped. Purchase cost: ৳1–৳30 / 1K. Selling price: purchase cost + 10% markup (converted at ৳"+usdToBdt.toFixed(2)+"/USD). All imported services remain disabled.";
   if(skipped.length)list.append(el("div","empty-admin",skipped.map(item=>"#"+item.serviceId+": "+item.reason).join(" · ")));
   eligible.forEach(service=>{const costBdt=Number(service.rate)*usdToBdt,card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","","#"+service.serviceId+" · "+service.name),el("span","request-status","৳"+costBdt.toFixed(2)+" / 1K"));const meta=el("div","request-meta");[["Supplier rate","$"+Number(service.rate).toFixed(4)+" / 1K"],["Category",service.category],["Minimum",service.min],["Maximum",service.max]].forEach(([label,value])=>meta.append(el("span","",label+": "+String(value??"—"))));card.append(head,meta);list.append(card);});
   await loadServices();
  }catch(error){status.textContent="Facebook import failed";list.prepend(el("div","empty-admin admin-error",error.message));}
  finally{importFacebookSmmexoButton.disabled=false;}
 });
}
const importInstagramSmmexoButton=document.getElementById("importInstagramSmmexo");
if(importInstagramSmmexoButton){
 importInstagramSmmexoButton.addEventListener("click",async()=>{
  const status=document.getElementById("smmexoSupplierStatus"),list=document.getElementById("smmexoSupplierList");
  importInstagramSmmexoButton.disabled=true;
  list.replaceChildren();
  status.textContent="Fetching Instagram services and current USD/BDT rate…";
  try{
   const [response,currency]=await Promise.all([
    fetch("/api/admin/smmexo/services",{method:"POST",credentials:"include",headers:{"Accept":"application/json"}}),
    request("/admin/currency")
   ]);
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||("Supplier request failed ("+response.status+")."));
   const usdToBdt=Number(currency.usd_to_bdt_rate||0);
   if(!Number.isFinite(usdToBdt)||usdToBdt<=0)throw new Error("Set a valid USD to BDT exchange rate in Admin Panel → Settings → Currency before importing by BDT rate.");
   const instagram=(data.services||[]).filter(service=>/instagram|insta\b|ig\b/.test((String(service.category||"")+" "+String(service.name||"")).toLowerCase()));
   const eligible=instagram.filter(service=>{const costBdt=Number(service.rate)*usdToBdt;return Number.isFinite(costBdt)&&costBdt>=1&&costBdt<=10;});
   if(!eligible.length){status.textContent="No Instagram services have a converted wholesale cost between ৳1 and ৳10 per 1,000. Nothing was imported.";list.append(el("div","empty-admin","Checked "+instagram.length+" Instagram services using ৳"+usdToBdt.toFixed(2)+" per USD."));return;}
   const serviceIds=eligible.map(service=>String(service.serviceId)).filter(Boolean);
   status.textContent="Found "+serviceIds.length+" Instagram services priced ৳1–৳10 per 1,000. Importing as disabled entries…";
   let importedCount=0,skippedCount=0,skipped=[];
   for(let i=0;i<serviceIds.length;i+=100){
    const imported=await fetch("/api/admin/smmexo/import",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({serviceIds:serviceIds.slice(i,i+100),instagramMarkupPercent:10})});
    const result=await imported.json().catch(()=>({}));
    if(!imported.ok)throw new Error(result.error||("Import failed ("+imported.status+")."));
    importedCount+=Number(result.importedCount||0);skippedCount+=Number(result.skippedCount||0);skipped.push(...(result.skipped||[]));
   }
   status.textContent="Instagram low-rate import complete: "+importedCount+" added, "+skippedCount+" skipped. Purchase cost: ৳1–৳10 / 1K. Selling price: purchase cost + 10% markup (converted at ৳"+usdToBdt.toFixed(2)+"/USD). All imported services remain disabled.";
   if(skipped.length)list.append(el("div","empty-admin",skipped.map(item=>"#"+item.serviceId+": "+item.reason).join(" · ")));
   eligible.forEach(service=>{const costBdt=Number(service.rate)*usdToBdt,card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","","#"+service.serviceId+" · "+service.name),el("span","request-status","৳"+costBdt.toFixed(2)+" / 1K"));const meta=el("div","request-meta");[["Supplier rate","$"+Number(service.rate).toFixed(4)+" / 1K"],["Category",service.category],["Minimum",service.min],["Maximum",service.max]].forEach(([label,value])=>meta.append(el("span","",label+": "+String(value??"—"))));card.append(head,meta);list.append(card);});
   await loadServices();
  }catch(error){status.textContent="Instagram import failed";list.prepend(el("div","empty-admin admin-error",error.message));}
  finally{importInstagramSmmexoButton.disabled=false;}
 });
}
const importTikTokSmmexoButton=document.getElementById("importTikTokSmmexo");
if(importTikTokSmmexoButton){
 importTikTokSmmexoButton.addEventListener("click",async()=>{
  const status=document.getElementById("smmexoSupplierStatus"),list=document.getElementById("smmexoSupplierList");
  importTikTokSmmexoButton.disabled=true;
  list.replaceChildren();
  status.textContent="Fetching TikTok services and current USD/BDT rate…";
  try{
   const [response,currency]=await Promise.all([
    fetch("/api/admin/smmexo/services",{method:"POST",credentials:"include",headers:{"Accept":"application/json"}}),
    request("/admin/currency")
   ]);
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||("Supplier request failed ("+response.status+")."));
   const usdToBdt=Number(currency.usd_to_bdt_rate||0);
   if(!Number.isFinite(usdToBdt)||usdToBdt<=0)throw new Error("Set a valid USD to BDT exchange rate in Admin Panel → Settings → Currency before importing by BDT rate.");
   const tiktok=(data.services||[]).filter(service=>/tiktok|tik\s?tok/.test((String(service.category||"")+" "+String(service.name||"")).toLowerCase()));
   const eligible=tiktok.filter(service=>{const costBdt=Number(service.rate)*usdToBdt;return Number.isFinite(costBdt)&&costBdt>=1&&costBdt<=10;});
   if(!eligible.length){status.textContent="No TikTok services have a converted wholesale cost between ৳1 and ৳10 per 1,000. Nothing was imported.";list.append(el("div","empty-admin","Checked "+tiktok.length+" TikTok services using ৳"+usdToBdt.toFixed(2)+" per USD."));return;}
   const serviceIds=eligible.map(service=>String(service.serviceId)).filter(Boolean);
   status.textContent="Found "+serviceIds.length+" TikTok services priced ৳1–৳10 per 1,000. Importing as disabled entries…";
   let importedCount=0,skippedCount=0,skipped=[];
   for(let i=0;i<serviceIds.length;i+=100){
    const imported=await fetch("/api/admin/smmexo/import",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({serviceIds:serviceIds.slice(i,i+100),tiktokMarkupPercent:10})});
    const result=await imported.json().catch(()=>({}));
    if(!imported.ok)throw new Error(result.error||("Import failed ("+imported.status+")."));
    importedCount+=Number(result.importedCount||0);skippedCount+=Number(result.skippedCount||0);skipped.push(...(result.skipped||[]));
   }
   status.textContent="TikTok low-rate import complete: "+importedCount+" added, "+skippedCount+" skipped. Purchase cost: ৳1–৳10 / 1K. Selling price: purchase cost + 10% markup (converted at ৳"+usdToBdt.toFixed(2)+"/USD). All imported services remain disabled.";
   if(skipped.length)list.append(el("div","empty-admin",skipped.map(item=>"#"+item.serviceId+": "+item.reason).join(" · ")));
   eligible.forEach(service=>{const costBdt=Number(service.rate)*usdToBdt,card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","","#"+service.serviceId+" · "+service.name),el("span","request-status","৳"+costBdt.toFixed(2)+" / 1K"));const meta=el("div","request-meta");[["Supplier rate","$"+Number(service.rate).toFixed(4)+" / 1K"],["Category",service.category],["Minimum",service.min],["Maximum",service.max]].forEach(([label,value])=>meta.append(el("span","",label+": "+String(value??"—"))));card.append(head,meta);list.append(card);});
   await loadServices();
  }catch(error){status.textContent="TikTok import failed";list.prepend(el("div","empty-admin admin-error",error.message));}
  finally{importTikTokSmmexoButton.disabled=false;}
 });
}
const importYouTubeSmmexoButton=document.getElementById("importYouTubeSmmexo");
if(importYouTubeSmmexoButton){
 importYouTubeSmmexoButton.addEventListener("click",async()=>{
  const status=document.getElementById("smmexoSupplierStatus"),list=document.getElementById("smmexoSupplierList");
  importYouTubeSmmexoButton.disabled=true;
  list.replaceChildren();
  status.textContent="Fetching YouTube services and current USD/BDT rate…";
  try{
   const [response,currency]=await Promise.all([
    fetch("/api/admin/smmexo/services",{method:"POST",credentials:"include",headers:{"Accept":"application/json"}}),
    request("/admin/currency")
   ]);
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||("Supplier request failed ("+response.status+")."));
   const usdToBdt=Number(currency.usd_to_bdt_rate||0);
   if(!Number.isFinite(usdToBdt)||usdToBdt<=0)throw new Error("Set a valid USD to BDT exchange rate in Admin Panel → Settings → Currency before importing by BDT rate.");
   const youtube=(data.services||[]).filter(service=>/youtube|tik\s?tok/.test((String(service.category||"")+" "+String(service.name||"")).toLowerCase()));
   const eligible=youtube.filter(service=>{const costBdt=Number(service.rate)*usdToBdt;return Number.isFinite(costBdt)&&costBdt>=1&&costBdt<=200;});
   if(!eligible.length){status.textContent="No YouTube services have a converted wholesale cost between ৳1 and ৳100 per 1,000. Nothing was imported.";list.append(el("div","empty-admin","Checked "+youtube.length+" YouTube services using ৳"+usdToBdt.toFixed(2)+" per USD."));return;}
   const serviceIds=eligible.map(service=>String(service.serviceId)).filter(Boolean);
   status.textContent="Found "+serviceIds.length+" YouTube services priced ৳1–৳200 per 1,000. Importing as disabled entries…";
   let importedCount=0,skippedCount=0,skipped=[];
   for(let i=0;i<serviceIds.length;i+=100){
    const imported=await fetch("/api/admin/smmexo/import",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({serviceIds:serviceIds.slice(i,i+100),youtubeMarkupPercent:10})});
    const result=await imported.json().catch(()=>({}));
    if(!imported.ok)throw new Error(result.error||("Import failed ("+imported.status+")."));
    importedCount+=Number(result.importedCount||0);skippedCount+=Number(result.skippedCount||0);skipped.push(...(result.skipped||[]));
   }
   status.textContent="YouTube low-rate import complete: "+importedCount+" added, "+skippedCount+" skipped. Purchase cost: ৳1–৳200 / 1K. Selling price: purchase cost + 10% markup (converted at ৳"+usdToBdt.toFixed(2)+"/USD). All imported services remain disabled.";
   if(skipped.length)list.append(el("div","empty-admin",skipped.map(item=>"#"+item.serviceId+": "+item.reason).join(" · ")));
   eligible.forEach(service=>{const costBdt=Number(service.rate)*usdToBdt,card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","","#"+service.serviceId+" · "+service.name),el("span","request-status","৳"+costBdt.toFixed(2)+" / 1K"));const meta=el("div","request-meta");[["Supplier rate","$"+Number(service.rate).toFixed(4)+" / 1K"],["Category",service.category],["Minimum",service.min],["Maximum",service.max]].forEach(([label,value])=>meta.append(el("span","",label+": "+String(value??"—"))));card.append(head,meta);list.append(card);});
   await loadServices();
  }catch(error){status.textContent="YouTube import failed";list.prepend(el("div","empty-admin admin-error",error.message));}
  finally{importYouTubeSmmexoButton.disabled=false;}
 });
}
const importTelegramSmmexoButton=document.getElementById("importTelegramSmmexo");
if(importTelegramSmmexoButton){
 importTelegramSmmexoButton.addEventListener("click",async()=>{
  const status=document.getElementById("smmexoSupplierStatus"),list=document.getElementById("smmexoSupplierList");
  importTelegramSmmexoButton.disabled=true;
  list.replaceChildren();
  status.textContent="Fetching Telegram services and current USD/BDT rate…";
  try{
   const [response,currency]=await Promise.all([
    fetch("/api/admin/smmexo/services",{method:"POST",credentials:"include",headers:{"Accept":"application/json"}}),
    request("/admin/currency")
   ]);
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||("Supplier request failed ("+response.status+")."));
   const usdToBdt=Number(currency.usd_to_bdt_rate||0);
   if(!Number.isFinite(usdToBdt)||usdToBdt<=0)throw new Error("Set a valid USD to BDT exchange rate in Admin Panel → Settings → Currency before importing by BDT rate.");
   const telegram=(data.services||[]).filter(service=>/telegram/.test((String(service.category||"")+" "+String(service.name||"")).toLowerCase()));
   const eligible=telegram.filter(service=>{const costBdt=Number(service.rate)*usdToBdt;return Number.isFinite(costBdt)&&costBdt>=1&&costBdt<=100;});
   if(!eligible.length){status.textContent="No Telegram services have a converted wholesale cost between ৳1 and ৳200 per 1,000. Nothing was imported.";list.append(el("div","empty-admin","Checked "+telegram.length+" Telegram services using ৳"+usdToBdt.toFixed(2)+" per USD."));return;}
   const serviceIds=eligible.map(service=>String(service.serviceId)).filter(Boolean);
   status.textContent="Found "+serviceIds.length+" Telegram services priced ৳1–৳100 per 1,000. Importing as disabled entries…";
   let importedCount=0,skippedCount=0,skipped=[];
   for(let i=0;i<serviceIds.length;i+=100){
    const imported=await fetch("/api/admin/smmexo/import",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({serviceIds:serviceIds.slice(i,i+100),telegramMarkupPercent:10})});
    const result=await imported.json().catch(()=>({}));
    if(!imported.ok)throw new Error(result.error||("Import failed ("+imported.status+")."));
    importedCount+=Number(result.importedCount||0);skippedCount+=Number(result.skippedCount||0);skipped.push(...(result.skipped||[]));
   }
   status.textContent="Telegram low-rate import complete: "+importedCount+" added, "+skippedCount+" skipped. Purchase cost: ৳1–৳100 / 1K. Selling price: purchase cost + 10% markup (converted at ৳"+usdToBdt.toFixed(2)+"/USD). All imported services remain disabled.";
   if(skipped.length)list.append(el("div","empty-admin",skipped.map(item=>"#"+item.serviceId+": "+item.reason).join(" · ")));
   eligible.forEach(service=>{const costBdt=Number(service.rate)*usdToBdt,card=el("article","request-card"),head=el("div","request-head");head.append(el("strong","","#"+service.serviceId+" · "+service.name),el("span","request-status","৳"+costBdt.toFixed(2)+" / 1K"));const meta=el("div","request-meta");[["Supplier rate","$"+Number(service.rate).toFixed(4)+" / 1K"],["Category",service.category],["Minimum",service.min],["Maximum",service.max]].forEach(([label,value])=>meta.append(el("span","",label+": "+String(value??"—"))));card.append(head,meta);list.append(card);});
   await loadServices();
  }catch(error){status.textContent="Telegram import failed";list.prepend(el("div","empty-admin admin-error",error.message));}
  finally{importTelegramSmmexoButton.disabled=false;}
 });
}
const importSmmexoButton=document.getElementById("importSmmexoSelected");
if(importSmmexoButton){
 importSmmexoButton.addEventListener("click",async()=>{
  const status=document.getElementById("smmexoSupplierStatus"),list=document.getElementById("smmexoSupplierList");
  const serviceIds=[...smmexoSelectedIds];
  if(!serviceIds.length)return;
  importSmmexoButton.disabled=true;
  status.textContent="Importing "+serviceIds.length+" selected services…";
  try{
   const response=await fetch("/api/admin/smmexo/import",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({serviceIds})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||("Import failed ("+response.status+")."));
   smmexoSelectedIds.clear();
   status.textContent="Imported "+data.importedCount+" services; skipped "+data.skippedCount+". All imported services are disabled until pricing is set.";
   if(data.skipped?.length){
    const note=el("div","empty-admin");
    note.textContent=data.skipped.map(item=>"#"+item.serviceId+": "+item.reason).join(" · ");
    list.prepend(note);
   }
   updateSmmexoImportButton();
   await loadServices();
  }catch(error){
   status.textContent="Import failed";
   list.prepend(el("div","empty-admin admin-error",error.message));
  }finally{updateSmmexoImportButton();}
 });
}
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
const adminMoreToggle=document.getElementById("adminMoreToggle"),adminMoreMenu=document.getElementById("adminMoreMenu");adminMoreToggle.addEventListener("click",()=>{const open=adminMoreMenu.hidden;adminMoreMenu.hidden=!open;adminMoreToggle.setAttribute("aria-expanded",String(open));});document.addEventListener("click",event=>{if(!event.target.closest(".admin-more-wrap")){adminMoreMenu.hidden=true;adminMoreToggle.setAttribute("aria-expanded","false");}});document.addEventListener("keydown",event=>{if(event.key==="Escape"){adminMoreMenu.hidden=true;adminMoreToggle.setAttribute("aria-expanded","false");}});
document.getElementById("adminLogout").addEventListener("click",async()=>{try{await request("/auth/logout",{method:"POST"})}finally{location.href="/#login"}});
const systemSettingsView=new URLSearchParams(location.search).get("view")==="system-settings";if(systemSettingsView){document.body.classList.add("system-settings-view");document.getElementById("backToAdmin").hidden=false;showPage("settings");}request("/me").then(d=>{if(d.user.role!=="admin"){document.getElementById("adminStatus").textContent="Access denied";document.getElementById("requestsList").textContent="Administrator access required. Your account is not an admin account.";document.getElementById("pendingCount").textContent="—";document.getElementById("totalCount").textContent="—";return}if(!systemSettingsView)return loadFinance()}).catch(e=>{if(e.message==="Authentication required."||e.message==="Session expired or account unavailable."){location.replace("/?next=%2Fadmin.html#login");return}document.getElementById("adminStatus").textContent="Could not verify access";document.getElementById("requestsList").textContent=e.message;document.getElementById("pendingCount").textContent="—";document.getElementById("totalCount").textContent="—"});