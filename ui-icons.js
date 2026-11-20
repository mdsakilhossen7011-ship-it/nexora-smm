(()=>{"use strict";
const rules=[
[/logout|sign out/i,"log-out"],[/deposit|add money|add funds|top.?up|withdraw|wallet|payment/i,"wallet"],
[/order|purchase|buy|cart/i,"shopping-bag"],[/save|submit|confirm|approve|apply|send|place/i,"check"],
[/refresh|reload|fetch|sync/i,"refresh-cw"],[/copy/i,"copy"],[/edit|update|change/i,"pencil"],
[/cancel|close|back/i,"x"],[/delete|remove|reject/i,"trash-2"],[/search|filter/i,"search"],
[/support|chat|message|reply|ticket/i,"message-circle"],[/import|download|export/i,"download"],
[/add|create|new|register/i,"plus"],[/view|details|open|explore/i,"arrow-up-right"],
[/clear|reset/i,"rotate-ccw"],[/profile|account|user/i,"user-round"],[/settings|config/i,"settings"],
[/history|activity|logs/i,"clock-3"],[/service|catalogue|category/i,"grid-2x2"],[/login|sign in/i,"log-in"]
];
const paths={
"wallet":'<path d="M3 7V5a2 2 0 0 1 2-2h14v4"/><path d="M3 7h17a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M17 14h.01"/>',
"shopping-bag":'<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
"check":'<path d="m5 12 4 4L19 6"/>',"refresh-cw":'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
"copy":'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
"pencil":'<path d="m15 5 4 4"/><path d="m4 20 4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-0 5Z"/>',
"x":'<path d="m6 6 12 12M18 6 6 18"/>',"trash-2":'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
"search":'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',"message-circle":'<path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-4.2A8 8 0 1 1 21 11.5Z"/>',
"download":'<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v4h14v-4"/>',"plus":'<path d="M12 5v14M5 12h14"/>',
"arrow-up-right":'<path d="M7 17 17 7M7 7h10v10"/>',"rotate-ccw":'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
"user-round":'<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',"settings":'<path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z"/>',
"clock-3":'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',"grid-2x2":'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
"log-out":'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',"log-in":'<path d="m10 17 5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>'
};
function icon(name){const s=document.createElementNS("http://www.w3.org/2000/svg","svg");s.setAttribute("viewBox","0 0 24 24");s.setAttribute("aria-hidden","true");s.classList.add("nexora-ui-icon");s.innerHTML=paths[name]||paths["arrow-up-right"];return s}
function enhance(root=document){root.querySelectorAll('button,a.btn,a.service-card-cta,.quick-grid button,.admin-nav,.quick-actions a,.nex-profile-actions a,.user-action,.request-actions button,.service-card-cta').forEach(el=>{
 if(el.dataset.uiIconDone||el.querySelector("svg")||el.matches(".menu-toggle,.account-menu-toggle"))return;
 const label=(el.getAttribute("aria-label")||el.innerText||el.textContent||"").trim();
 if(!label)return;
 const rule=rules.find(([re])=>re.test(label));if(!rule)return;
 el.classList.add("nexora-iconized");el.prepend(icon(rule[1]));el.dataset.uiIconDone="1";
 });}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>enhance());else enhance();
new MutationObserver(m=>m.forEach(x=>x.addedNodes.forEach(n=>{if(n.nodeType===1)enhance(n)}))).observe(document.documentElement,{childList:true,subtree:true});
})();