(()=>{"use strict";
const rules=[
[/logout|sign out/i,"log-out"],[/deposit|add money|add funds|top.?up|withdraw|wallet|payment/i,"wallet"],
[/order|purchase|buy|cart/i,"shopping-bag"],[/save|submit|confirm|approve|apply|send|place|continue/i,"check"],
[/refresh|reload|fetch|sync/i,"refresh-cw"],[/copy/i,"copy"],[/edit|update|change/i,"pencil"],
[/cancel|close|back/i,"x"],[/delete|remove|reject/i,"trash-2"],[/search|filter/i,"search"],
[/support|chat|message|reply|ticket/i,"message-circle"],[/import|download|export/i,"download"],
[/add|create|new|register/i,"plus"],[/view|details|open|explore/i,"eye"],
[/profile|account|user|follow/i,"user-round"],[/like|favorite|heart/i,"heart"],[/comment|reply/i,"message-square"],
[/subscriber|member|people/i,"users"],[/watch.?time|history|activity|logs|refresh inbox/i,"clock-3"],
[/diamond|gem/i,"gem"],[/membership|vip|crown/i,"crown"],[/level.?up|growth|trend/i,"trending-up"],
[/offer|gift|reward/i,"gift"],[/all|category|service|catalogue/i,"grid-2x2"],
[/home/i,"home"],[/dashboard|overview/i,"layout-dashboard"],[/setting|config/i,"settings"],
[/login|sign in/i,"log-in"],[/logout|sign out/i,"log-out"]
];
const paths={
"wallet":'<path d="M3 7V5a2 2 0 0 1 2-2h14v4"/><path d="M3 7h17a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M17 14h.01"/>',
"shopping-bag":'<path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',"check":'<path d="m5 12 4 4L19 6"/>',
"refresh-cw":'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3"/>',
"copy":'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
"pencil":'<path d="m15 5 4 4"/><path d="m4 20 4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15v5Z"/>',
"x":'<path d="m6 6 12 12M18 6 6 18"/>',"trash-2":'<path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>',
"search":'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',"message-circle":'<path d="M21 11.5a8.5 8.5 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-4.2A8 8 0 1 1 21 11.5Z"/>',
"download":'<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 17v4h14v-4"/>',"plus":'<path d="M12 5v14M5 12h14"/>',
"eye":'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
"heart":'<path d="M20.8 8.8c0 5.2-8.8 10-8.8 10s-8.8-4.8-8.8-10A4.8 4.8 0 0 1 12 6.2a4.8 4.8 0 0 1 8.8 2.6Z"/>',
"message-square":'<path d="M4 4h16v13H8l-4 3V4Z"/>',"users":'<path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
"clock-3":'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',"gem":'<path d="M6 3h12l4 6-10 12L2 9l4-6Z"/><path d="M2 9h20M6 3l6 18 6-18"/>',
"crown":'<path d="m2 8 5 4 5-7 5 7 5-4-2 12H4L2 8Z"/>',"trending-up":'<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
"gift":'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M2 8h20M12 8H7a3 3 0 1 1 3-3l2 3Zm0 0h5a3 3 0 1 0-3-3l-2 3Z"/>',
"grid-2x2":'<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
"home":'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10Z"/>',
"layout-dashboard":'<rect x="3" y="3" width="8" height="7" rx="1"/><rect x="13" y="3" width="8" height="11" rx="1"/><rect x="3" y="12" width="8" height="9" rx="1"/><rect x="13" y="16" width="8" height="5" rx="1"/>',
"user-round":'<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>',"settings":'<circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z"/>',
"log-out":'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
"log-in":'<path d="m10 17 5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>'
};
function makeIcon(name){const s=document.createElementNS("http://www.w3.org/2000/svg","svg");s.setAttribute("viewBox","0 0 24 24");s.setAttribute("aria-hidden","true");s.setAttribute("focusable","false");s.classList.add("nexora-ui-icon");s.innerHTML=paths[name]||paths["grid-2x2"];return s}
function labelFor(el){return [el.getAttribute("aria-label"),el.getAttribute("title"),el.innerText,el.textContent,el.id,el.className].filter(Boolean).join(" ").replace(/\s+/g," ").trim()}
function process(el){
 if(!el||el.nodeType!==1||el.dataset.uiIconDone)return;
 if(!el.matches("button,a,[role='button']"))return;
 if(el.matches(".brand,.service-card,.menu-toggle,.account-menu-toggle,[disabled]")||el.querySelector("svg")||el.querySelector(".menu-icon,.service-symbol"))return;
 const label=labelFor(el);if(!label)return;
 const rule=rules.find(([re])=>re.test(label));
 const iconName=rule?rule[1]:(el.tagName==="A"?"arrow-up-right":"check");
 el.classList.add("nexora-iconized");el.prepend(makeIcon(iconName));el.dataset.uiIconDone="1";
}
function enhance(root=document){if(root.nodeType===1)process(root);root.querySelectorAll?.("button,a,[role='button']").forEach(process)}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>enhance());else enhance();
new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node.nodeType===1)enhance(node)}))).observe(document.documentElement,{childList:true,subtree:true});
})();