const api="/api";
const packagesEl=document.getElementById("packageList");
const packageSelect=document.getElementById("packageSelect");
const quantityInput=document.getElementById("quantity");
const totalPrice=document.getElementById("totalPrice");
const submitButton=document.getElementById("submitOrder");
const feedback=document.getElementById("orderFeedback");
const categoryTabs=document.getElementById("categoryTabs");
let services=[];
let selected=null;
let activeCategory="diamonds";
const money=minor=>"৳"+(Number(minor||0)/100).toFixed(2);
function setFeedback(message,type=""){feedback.textContent=message;feedback.className="ff-feedback"+(type?" "+type:"")}
function priceFor(service,quantity){return Math.ceil(Number(service.price_per_1000_minor)*quantity/1000)}
function categoryFor(service){
 const name=String(service.name||"").toLowerCase();
 if(/weekly|monthly|membership|week pass|month pass/.test(name))return "memberships";
 if(/level\s*up|levelup|pass/.test(name))return "levelup";
 if(/special|offer|event|bonus|limited/.test(name))return "offers";
 if(/diamond|\b\d+\s*d\b/.test(name))return "diamonds";
 return "other";
}
function selectPackage(id){
 const wanted=String(id);
 selected=services.find(x=>String(x.id)===wanted)||null;
 packagesEl.querySelectorAll(".ff-package").forEach(card=>card.classList.toggle("selected",card.dataset.id===wanted));
 if(!selected){submitButton.disabled=true;setFeedback("This package is no longer available. Refresh and try again.","error");return}
 packageSelect.value=String(selected.id);
 quantityInput.value=String(selected.min_quantity);
 quantityInput.min=String(selected.min_quantity);
 quantityInput.max=String(selected.max_quantity);
 totalPrice.textContent=money(priceFor(selected,selected.min_quantity));
 submitButton.disabled=false;
 setFeedback(selected.name+" selected. Enter your Player UID to continue.","success");
}
function renderCategory(){
 categoryTabs.querySelectorAll(".ff-tab").forEach(tab=>{
  const active=tab.dataset.category===activeCategory;
  tab.classList.toggle("active",active);
  tab.setAttribute("aria-selected",String(active));
 });
 const visible=services.filter(service=>categoryFor(service)===activeCategory);
 packagesEl.replaceChildren();
 if(!visible.length){
  const empty=document.createElement("div");empty.className="ff-empty";
  empty.textContent=activeCategory==="diamonds"?"No diamond packages are available yet.": "No packages in this category yet. New options will appear here when enabled.";
  packagesEl.append(empty);return;
 }
 visible.forEach(service=>{
  const quantity=Number(service.min_quantity),price=priceFor(service,quantity);
  const card=document.createElement("button");card.type="button";card.className="ff-package";card.dataset.id=service.id;card.setAttribute("aria-pressed",String(Boolean(selected&&String(selected.id)===String(service.id))));
  if(selected&&String(selected.id)===String(service.id))card.classList.add("selected");
  const name=document.createElement("strong");name.textContent=service.name;
  const range=document.createElement("small");range.textContent=service.min_quantity===service.max_quantity?(activeCategory==="diamonds"?quantity+" diamonds":"Quantity "+quantity):"Quantity "+service.min_quantity+"–"+service.max_quantity;
  const cost=document.createElement("b");cost.textContent=money(price);
  card.append(name,range,cost);packagesEl.append(card);
 });
}
async function loadCatalogue(){
 try{
  const response=await fetch(api+"/services");if(!response.ok)throw new Error("Could not load the service catalogue.");
  const data=await response.json();services=(data.services||[]).filter(x=>x.category==="free_fire");
  packageSelect.innerHTML='<option value="">Choose a package</option>';
  services.forEach(service=>{const option=document.createElement("option");option.value=service.id;option.textContent=service.name;packageSelect.append(option)});
  if(!services.length){packagesEl.innerHTML='<div class="ff-empty">No Free Fire packages are available yet. Packages will appear after the admin adds and enables them.</div>';document.getElementById("catalogueNote").textContent="Free Fire catalogue is currently empty.";return}
  document.getElementById("catalogueNote").textContent="Live prices · Managed by NEXORA admin.";
  packageSelect.disabled=false;renderCategory();
 }catch(error){packagesEl.innerHTML='<div class="ff-empty">Unable to load packages. Please refresh the page.</div>';setFeedback(error.message,"error")}
}
categoryTabs.addEventListener("click",event=>{
 const tab=event.target.closest(".ff-tab");if(!tab)return;
 activeCategory=tab.dataset.category;renderCategory();
});
packagesEl.addEventListener("click",event=>{
 const card=event.target.closest("button.ff-package");if(!card||!packagesEl.contains(card))return;
 event.preventDefault();selectPackage(card.dataset.id);
});
packageSelect.addEventListener("change",()=>{
 if(packageSelect.value){const next=services.find(x=>String(x.id)===String(packageSelect.value));if(next){activeCategory=categoryFor(next);renderCategory();selectPackage(packageSelect.value)}}
 else{selected=null;submitButton.disabled=true;totalPrice.textContent=money(0);renderCategory();setFeedback("Select an available package to continue.")}
});
document.getElementById("freeFireForm").addEventListener("submit",async event=>{
 event.preventDefault();const uid=document.getElementById("playerUid").value.trim();
 if(!/^[0-9]{5,12}$/.test(uid)){setFeedback("Enter a valid 5–12 digit Free Fire UID.","error");return}
 if(!selected){setFeedback("Select a package first.","error");return}
 submitButton.disabled=true;submitButton.textContent="Checking account…";
 try{
  const me=await fetch(api+"/me",{credentials:"include"});
  if(me.status===401){setFeedback("Please login first. Your package selection will need to be selected again after login.","error");location.href="/#login";return}
  if(!me.ok)throw new Error("Could not verify your account. Please login again.");
  const quantity=Number(selected.min_quantity);
  const response=await fetch(api+"/orders",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({serviceId:selected.id,target:uid,quantity})});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||"Order could not be submitted.");
  setFeedback(result.message||"Order submitted. Check your order history for updates.","success");
 }catch(error){setFeedback(error.message,"error")}
 finally{submitButton.disabled=!selected;submitButton.innerHTML='Continue to order <span>↗</span>'}
});
loadCatalogue();
