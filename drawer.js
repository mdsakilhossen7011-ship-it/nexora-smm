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
})();