/* One shared drawer controller for homepage, service pages and dashboard */
(()=> {
 const backdrop=document.getElementById("nexoraDrawerBackdrop");
 const toggle=document.getElementById("menuToggle")||document.getElementById("accountMenuToggle");
 const menu=document.getElementById("navLinks")||document.getElementById("mobileMenu")||document.getElementById("accountMenu");
 if(!backdrop||!toggle||!menu)return;
 toggle.classList.add("drawer-toggle");menu.classList.add("drawer-menu");
 // Move the panel out of sticky/backdrop-filter headers so it stays crisp and truly viewport-fixed.
 if(menu.parentElement!==document.body)document.body.appendChild(menu);
 if(backdrop.parentElement!==document.body)document.body.insertBefore(backdrop,document.body.firstChild);
 // Apply the exact same icon set to every page's shared drawer, including the homepage.
 const menuIcons=[["developer-api","⌘"],["top-leaders","★"],["money-history","◷"],["live-chat","▣"],["dashboard","▦"],["profile","♙"],["deposit","＋"],["withdraw","⇧"],["orders","▤"],["referral","♧"]];
 const iconFor=(el)=>{const href=(el.getAttribute("href")||"").toLowerCase();const label=(el.textContent||"").trim().toLowerCase();if(el.matches(".menu-logout")||label==="logout")return "↪";if(href==="/"||label==="home")return "⌂";for(const [key,glyph] of menuIcons){if(href.includes(key)||label===key.replace("-"," "))return glyph;}return "";};
 menu.querySelectorAll("a,button").forEach(el=>{if(el.querySelector(".menu-icon"))return;const glyph=iconFor(el);if(!glyph)return;const icon=document.createElement("span");icon.className="menu-icon";icon.setAttribute("aria-hidden","true");icon.textContent=glyph;el.insertBefore(icon,el.firstChild);if(el.children.length===2&&el.lastElementChild===icon){const label=document.createElement("span");label.textContent=el.textContent.replace(glyph,"").trim();el.appendChild(label);}});
 const isOpen=()=>menu.classList.contains("is-open")||menu.classList.contains("open");
 function open(){
   menu.hidden=false;menu.classList.add("is-open","open");
   backdrop.classList.add("is-open");document.body.classList.add("nexora-drawer-lock");
   toggle.setAttribute("aria-expanded","true");toggle.setAttribute("aria-label","Close navigation menu");
   toggle.textContent="×";
 }
 function close(){
   menu.classList.remove("is-open","open");backdrop.classList.remove("is-open");
   document.body.classList.remove("nexora-drawer-lock");
   toggle.setAttribute("aria-expanded","false");toggle.setAttribute("aria-label","Open navigation menu");
   toggle.textContent="☰";
 }
 // Capture the toggle before older page-specific click handlers can run.
 document.addEventListener("click",event=>{
   if(event.target.closest("#menuToggle,#accountMenuToggle")){
     event.preventDefault();event.stopImmediatePropagation();
     isOpen()?close():open();return;
   }
   if(event.target===backdrop||event.target.closest("#nexoraDrawerBackdrop")){close();return;}
   if(isOpen()&&menu.contains(event.target)&&(event.target.closest("a")||event.target.closest("button"))){close();}
 },true);
 backdrop.addEventListener("click",close);
 document.addEventListener("keydown",event=>{if(event.key==="Escape")close();});
 window.addEventListener("resize",()=>{if(window.innerWidth>700)close();});

 // Site-wide announcement bell beside the three-dot menu.
 const bell=document.createElement("button");
 bell.type="button";bell.className="nexora-notification-bell";
 bell.setAttribute("aria-label","Notifications");bell.setAttribute("aria-haspopup","dialog");
 bell.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="nexora-notification-count" hidden></span>';
 toggle.parentNode.insertBefore(bell,toggle);
 const noticeOverlay=document.createElement("div");
 noticeOverlay.className="nexora-notification-overlay";noticeOverlay.hidden=true;
 noticeOverlay.innerHTML='<section class="nexora-notification-dialog" role="dialog" aria-modal="true" aria-labelledby="nexoraNoticeTitle"><header><div><small>NEXORA SMM</small><h2 id="nexoraNoticeTitle">Notifications</h2></div><button type="button" class="nexora-notification-close" aria-label="Close notifications">×</button></header><div class="nexora-notification-list" aria-live="polite"><p class="nexora-notification-empty">Loading alerts…</p></div></section>';
 document.body.appendChild(noticeOverlay);
 const noticeList=noticeOverlay.querySelector(".nexora-notification-list");
 const noticeCount=bell.querySelector(".nexora-notification-count");
 const noticeKey="nexora_read_announcements_v1";
 let noticeItems=[];
 const readIds=()=>{try{return new Set(JSON.parse(localStorage.getItem(noticeKey)||"[]"))}catch{return new Set()}};
 const updateNoticeBadge=()=>{const read=readIds(),count=noticeItems.filter(x=>!read.has(x.id)).length;noticeCount.textContent=count>99?"99+":String(count);noticeCount.hidden=count===0;bell.classList.toggle("has-unread",count>0);};
 const renderNotices=()=>{
   noticeList.replaceChildren();
   if(!noticeItems.length){const empty=document.createElement("p");empty.className="nexora-notification-empty";empty.textContent="No new announcements right now.";noticeList.append(empty);return;}
   const read=readIds();
   noticeItems.forEach(item=>{
     const card=document.createElement("article");card.className="nexora-notification-item"+(read.has(item.id)?" is-read":"");
     const top=document.createElement("div");top.className="nexora-notification-item-top";
     const title=document.createElement("strong");title.textContent=item.title||"Important alert";
     const tag=document.createElement("span");tag.textContent=read.has(item.id)?"READ":"NEW";top.append(title,tag);
     const body=document.createElement("p");body.textContent=item.body||"";
     const date=document.createElement("time");date.textContent=item.created_at?new Date(item.created_at).toLocaleString():"";
     card.append(top,body,date);noticeList.append(card);
   });
 };
 const loadNotices=async()=>{
   try{const response=await fetch("/api/public/announcements",{credentials:"same-origin",cache:"no-store"});if(!response.ok)throw new Error("Could not load alerts.");const data=await response.json();noticeItems=Array.isArray(data.announcements)?data.announcements:[];
     updateNoticeBadge();if(!noticeOverlay.hidden)renderNotices();
   }catch(error){if(!noticeItems.length){noticeList.replaceChildren();const empty=document.createElement("p");empty.className="nexora-notification-empty";empty.textContent="Notifications are temporarily unavailable.";noticeList.append(empty);}}
 };
 const closeNotices=()=>{noticeOverlay.hidden=true;document.body.classList.remove("nexora-notification-lock");bell.focus();};
 const openNotices=()=>{
   noticeOverlay.hidden=false;document.body.classList.add("nexora-notification-lock");
   const read=new Set([...readIds(),...noticeItems.map(x=>x.id)]);
   try{localStorage.setItem(noticeKey,JSON.stringify([...read].slice(-100)));}catch{}
   updateNoticeBadge();renderNotices();noticeOverlay.querySelector(".nexora-notification-close").focus();
 };
 bell.addEventListener("click",openNotices);
 noticeOverlay.querySelector(".nexora-notification-close").addEventListener("click",closeNotices);
 noticeOverlay.addEventListener("click",event=>{if(event.target===noticeOverlay)closeNotices();});
 document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!noticeOverlay.hidden)closeNotices();});
 loadNotices();window.addEventListener("focus",loadNotices);setInterval(loadNotices,60000);

})();