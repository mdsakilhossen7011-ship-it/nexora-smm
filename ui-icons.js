/* Explicit NEXORA button icons: no text matching, overlays, or menu-toggle changes. */
(()=>{"use strict";
const P={
home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-6v-7H10v7H4a1 1 0 0 1-1-1z"/>',
register:'<circle cx="9" cy="7" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m4-10v6m-3-3h6"/>',
login:'<path d="M10 17l5-5-5-5M15 12H3m9-9h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6"/>',
wallet:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-5 6h2"/>',
edit:'<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
save:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z M17 21v-8H7v8M7 3v5h8"/>',
cancel:'<path d="m18 6-12 12M6 6l12 12"/>',
copy:'<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
send:'<path d="m22 2-7 20-4-9-9-4Z M22 2 11 13"/>',
refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/>',
check:'<path d="m5 12 4 4L19 6"/>',
plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z"/>',
user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
users:'<circle cx="10" cy="7" r="4"/><path d="M4 21v-2a6 6 0 0 1 12 0v2m1-14a4 4 0 0 1 0 8m2 2a5 5 0 0 1 2 4"/>',
play:'<path d="m8 5 12 7-12 7z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
message:'<path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/>',
layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
zap:'<path d="m13 2-3 8h7l-6 12 1-9H5l8-11Z"/>',
clipboard:'<rect x="8" y="4" width="12" height="16" rx="2"/><path d="M16 4V3a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/>'
};
const maps={
"/":[['#homeLogoutBtn','login'],['button[data-page="register"]','register'],['button[data-page="login"]','wallet'],['#authSubmit','login']],
"/dashboard.html":[['#editProfileBtn','edit'],['.nex-flat-btn[type="submit"]','save'],['#cancelProfileEdit','cancel'],['.nex-deposit-submit','wallet'],['#copyReferralLink','copy'],['#refreshSupport','refresh'],['#supportTicketForm button[type="submit"]','send'],['#replyForm button[type="submit"]','send'],['.support-ticket-row','message']],
"/admin.html":[['#adminLogout','login'],['#refreshAdmin, #refreshUsers, #refreshOrders, #refreshServices, #refreshGrowth, #refreshAnnouncements, #refreshPaymentSettings, #refreshSystem, #refreshActivity','refresh'],['#saveService, #saveReferralSettings, #saveAnnouncement, #savePaymentSettings','save'],['#resetServiceForm','cancel'],['#fetchSmmexoServices','refresh'],['#importSmmexoSelected','layers'],['#applyBulkPricing, #selectAllServices','check'],['.request-actions .approve','check'],['.request-actions .reject','cancel']],
"/support-admin.html":[['#supportLogout','login'],['#refreshTickets','refresh'],['#sendReply','send']],
"/facebook.html":[['.fb-tab[data-category="all"]','layers'],['.fb-tab[data-category="like"]','heart'],['.fb-tab[data-category="follow"]','user'],['.fb-tab[data-category="view"]','play'],['.fb-tab[data-category="comment"]','message'],['#submitOrder','zap']],
"/instagram.html":[['.ig-tab[data-category="all"]','layers'],['.ig-tab[data-category="like"]','heart'],['.ig-tab[data-category="follow"]','user'],['.ig-tab[data-category="view"]','play'],['.ig-tab[data-category="comment"]','message'],['#submitOrder','zap']],
"/tiktok.html":[['.ig-tab[data-category="all"]','layers'],['.ig-tab[data-category="like"]','heart'],['.ig-tab[data-category="follow"]','user'],['.ig-tab[data-category="view"]','play'],['.ig-tab[data-category="comment"]','message'],['#submitOrder','zap']],
"/youtube.html":[['.ig-tab[data-category="all"]','layers'],['.ig-tab[data-category="subscriber"]','user'],['.ig-tab[data-category="view"]','play'],['.ig-tab[data-category="watchtime"]','clock'],['.ig-tab[data-category="like"]','heart'],['.ig-tab[data-category="comment"]','message'],['#submitOrder','zap']],
"/telegram.html":[['.ig-tab[data-category="all"]','layers'],['.ig-tab[data-category="member"]','users'],['.ig-tab[data-category="view"]','play'],['.ig-tab[data-category="watchtime"]','clock'],['.ig-tab[data-category="like"]','heart'],['.ig-tab[data-category="comment"]','message'],['#submitOrder','zap']],
"/free-fire.html":[['#pasteUid','clipboard'],['#qtyMinus','minus'],['#qtyPlus','plus'],['#submitOrder','zap']]
};
const page=location.pathname.replace(/\/$/,"")||"/";
function iconize(el,key){
if(!el||el.dataset.nexoraIconized==="1"||el.querySelector(".nexora-btn-icon,svg,img,.menu-icon,.fb-service-icon,.ig-service-icon,.tt-service-icon,.ff-diamond-art"))return;
const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");svg.setAttribute("focusable","false");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","1.8");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.innerHTML=P[key]||P.zap;
const wrap=document.createElement("span");wrap.className="nexora-btn-icon";wrap.setAttribute("aria-hidden","true");wrap.append(svg);el.insertBefore(wrap,el.firstChild);el.dataset.nexoraIconized="1";
}
function scan(root){(maps[page]||[]).forEach(([sel,key])=>{if(root.matches&&root.matches(sel))iconize(root,key);root.querySelectorAll(sel).forEach(el=>iconize(el,key));});}
function start(){scan(document);const mo=new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{if(n.nodeType===1){scan(n);if(n.querySelector)scan(n);}})));mo.observe(document.body,{childList:true,subtree:true});}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
})();