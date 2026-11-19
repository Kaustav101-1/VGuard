(() => {
/* ================= Config ================= */
const CFG = window.STUDY_CONFIG || {};
const API = (CFG.APPS_SCRIPT_URL || "").trim();
const MIN_VIEW_MS = (CFG.MIN_VIEW_SECONDS ?? 8) * 1000;
const P_FALLBACK = CFG.P_EXPERIMENT_FALLBACK ?? 0.4;

/* Test runs: add ?test=survey, ?test=A, ?test=B, ?test=C or ?test=D to the link.
   They skip the wait, are saved with is_test = TRUE and never count towards quotas. */
const params = new URLSearchParams(location.search);
const TEST = (params.get("test") || "").trim();
const forced = ["survey","A","B","C","D"].includes(TEST) ? TEST : null;

/* ================= Study content (wording from the report, Appendix A and B) ================= */
const CHANNELS = ["General Trade","Brand store or large retailer","Online marketplace","Quick commerce or brand website"];
const CHANNEL_HELP = {"General Trade":"a local electrical shop or dealer","Brand store or large retailer":"e.g. a brand showroom, Croma, Reliance Digital","Online marketplace":"e.g. Amazon, Flipkart","Quick commerce or brand website":"e.g. Blinkit, Zepto, Instamart, or the brand's own site"};
const SOURCES = ["Parents or grandparents","Dealer or electrical shop","Advertisements","Online listings or reviews","Social media","Friends or colleagues"];
const BRAND_ITEMS = [
  ["trust","I trust [Brand]."],
  ["quality","The quality of [Brand] products is very high."],
  ["different","[Brand] offers something other brands do not."],
  ["new","[Brand] has launched something new recently."],
  ["easy_to_find","It is easy to find and compare [Brand] where I shop."],
  ["shortlist","I would put [Brand] on my shortlist."],
  ["likely_to_buy","I am likely to buy a [Brand] fan."]];
const RESEARCH_ITEMS = [["compare_online_myself","I compare models and reviews online myself before I decide."],["go_with_dealer_advice","I mostly go with what the dealer recommends."]];
const EXP_ITEMS = [["shortlist","I would put this fan on my shortlist."],["likely_to_buy","I am likely to buy this fan."],["page_made_vguard_trustworthy","The page made V-Guard seem trustworthy."],["page_made_fan_seem_new","The page made this fan seem new."]];
const VERSIONS = {A:{trust:false,innov:false},B:{trust:true,innov:false},C:{trust:false,innov:true},D:{trust:true,innov:true}};

/* ================= State ================= */
const app = document.getElementById("app"), bar = document.getElementById("bar");
let R, screens, idx, stimShownAt = 0;
const rid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g,"").slice(0,12) : Math.random().toString(36).slice(2,14));
function fresh(){
  R = {rid: rid(), started_at:new Date().toISOString(), a:{}, arm:null, version:null, brand_order:null, status:"in_progress", is_test: !!forced};
  idx = 0; buildScreens(); render();
}
const esc = s => String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const aw = b => R.a[b==="V-Guard"?"heard_vguard":"heard_atomberg"]==="Yes";

/* ================= Screens ================= */
function buildScreens(){
  screens = [
    {id:"consent", custom:renderConsent},
    {id:"profile", eyebrow:"About you", title:"A few quick questions", qs:[
      {k:"age", type:"number", label:"Your age (in years)"},
      {k:"gender", type:"single", label:"Gender", opts:["Male","Female","Other"]},
      {k:"region", type:"single", label:"Where do you live?", opts:["South India","Rest of India"], help:"South India = Andhra Pradesh, Karnataka, Kerala, Tamil Nadu, Telangana, Puducherry"},
      {k:"works_in_industry", type:"single", label:"Do you work in market research, advertising, or the home-appliance industry?", opts:["Yes","No"]},
      {k:"bought_fan", type:"single", label:"Have you ever bought a ceiling fan yourself?", opts:["Yes","No"]}], after:assign},
    // ---- Study 1: survey, blocks B to F in the order of Appendix A ----
    {id:"s_channel", arm:"survey", eyebrow:"Where you buy", title:"Where you buy fans", qs:[
      {k:"last_purchase_channel", type:"single", label:"Where did you buy your last fan, or where will you buy the next?", opts:CHANNELS, help:CHANNELS.map(c=>c+": "+CHANNEL_HELP[c]).join(" · ")}]},
    {id:"s_aware", arm:"survey", eyebrow:"Brands", title:"Fan brands you know", qs:[
      {k:"heard_vguard", type:"single", label:"Have you heard of V-Guard ceiling fans?", opts:["Yes","No"]},
      {k:"heard_atomberg", type:"single", label:"Have you heard of Atomberg ceiling fans?", opts:["Yes","No"]}],
      after:()=>{ R.brand_order = Math.random()<.5 ? "V-Guard>Atomberg" : "Atomberg>V-Guard"; return true; }},
    {id:"s_source", arm:"survey", when:()=>aw("V-Guard"), eyebrow:"V-Guard", title:"How you came to know V-Guard", qs:[
      {k:"how_knew_vguard", type:"single", label:"How did you first come to know V-Guard?", opts:SOURCES}]},
    {id:"s_brand1", arm:"survey", brandSlot:0},
    {id:"s_brand2", arm:"survey", brandSlot:1},
    {id:"s_research", arm:"survey", eyebrow:"How you shop", title:"How you research a purchase", intro:"How much do you agree with each statement?", qs:
      RESEARCH_ITEMS.map(([k,t])=>({k, type:"likert", label:t}))},
    // ---- Study 2: experiment ----
    {id:"e_aware", arm:"experiment", eyebrow:"Brands", title:"One quick check", qs:[
      {k:"heard_vguard", type:"single", label:"Have you heard of V-Guard ceiling fans?", opts:["Yes","No"]}],
      after:()=> R.a.heard_vguard==="Yes" ? true : screenOut("experiment_unaware_vguard")},
    {id:"e_page", arm:"experiment", custom:renderStimulus},
    {id:"e_debrief", arm:"experiment", custom:renderDebrief},
    {id:"done", custom:renderDone},
  ];
}
function active(){ return screens.filter(s => (!s.arm || s.arm===R.arm) && (!s.when || s.when()) && (s.brandSlot===undefined || brandFor(s.brandSlot))); }
function brandFor(slot){ if(!R.brand_order) return null; const known = R.brand_order.split(">").filter(aw); return known[slot] || null; }

/* ================= Server calls ================= */
async function call(body){
  if(!API) throw new Error("no_api");
  // text/plain keeps this a "simple" request, which Apps Script accepts from any site.
  const res = await fetch(API, {method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body)});
  const out = await res.json();
  if(!out.ok) throw new Error(out.error || "server_error");
  return out;
}

/* Arm and version are chosen BEFORE awareness is asked, so the survey keeps the natural awareness mix (needed for H3). */
async function assign(){
  const a = R.a;
  if(a.age<22 || a.age>40) return screenOut("age");
  if(a.works_in_industry==="Yes") return screenOut("industry");
  if(forced){ R.arm = forced==="survey" ? "survey" : "experiment"; R.version = forced==="survey" ? null : forced; return true; }
  try{
    const r = await call({action:"assign", region:a.region, age:a.age});
    if(!r.arm) return screenOut("quota_full");
    R.arm = r.arm; R.version = r.version;
  }catch{
    R.arm = Math.random() < P_FALLBACK ? "experiment" : "survey";
    R.version = R.arm==="experiment" ? "ABCD"[Math.floor(Math.random()*4)] : null;
    R.assigned_offline = true;
  }
  return true;
}
function screenOut(reason){
  R.status="screened_out"; R.screen_reason=reason; save();
  const msg = reason==="quota_full"
    ? "We already have enough answers from people like you, so there is nothing more to fill in. Thank you for offering your time."
    : "This study is looking for a specific group of people, and you don't fit it this time. There is nothing more to fill in.";
  renderEnd("Thank you for your time", msg);
  return false;
}

/* ================= Rendering ================= */
function progress(){ const list=active(); const i=list.indexOf(screens[idx]); bar.style.width = Math.round(100*Math.max(0,i)/(list.length-1))+"%"; }
function render(){
  const s = screens[idx]; progress(); window.scrollTo(0,0);
  if(s.custom) return s.custom(s);
  if(s.brandSlot!==undefined){
    const b = brandFor(s.brandSlot), p = b==="V-Guard"?"vguard":"atomberg", n = R.brand_order.split(">").filter(aw).length;
    return renderForm({eyebrow:"Brand ratings"+(n>1?" · "+(s.brandSlot+1)+" of "+n:""), title:"Your view of "+b, intro:"How much do you agree with each statement about "+b+" ceiling fans?",
      qs:BRAND_ITEMS.map(([k,t])=>({k:p+"_"+k, type:"likert", label:t.replace("[Brand]",b)}))}, s);
  }
  renderForm(s, s);
}
function qHTML(q){
  const v = R.a[q.k];
  if(q.type==="number") return `<div class="item"><label for="q_${q.k}"><b>${esc(q.label)}</b></label><input id="q_${q.k}" type="number" inputmode="numeric" min="15" max="99" value="${v??""}"></div>`;
  if(q.type==="single") return `<fieldset class="item"><legend>${esc(q.label)}</legend>${q.help?`<p class="small muted">${esc(q.help)}</p>`:""}<div class="opts ${q.opts.length<=3?"grid2":""}">${q.opts.map((o,i)=>`<label class="opt"><input type="radio" id="q_${q.k}_${i}" name="${q.k}" value="${esc(o)}" ${v===o?"checked":""}>${esc(o)}</label>`).join("")}</div></fieldset>`;
  if(q.type==="likert") return `<fieldset class="item"><legend>${esc(q.label)}</legend><div class="likert">${[1,2,3,4,5,6,7].map(n=>`<label><input type="radio" id="q_${q.k}_${n}" name="${q.k}" value="${n}" ${v===n?"checked":""} aria-label="${n}${n===1?" strongly disagree":n===7?" strongly agree":""}">${n}</label>`).join("")}</div><div class="ends"><span>Strongly disagree</span><span>Strongly agree</span></div></fieldset>`;
}
function renderForm(def, s, extraTop=""){
  app.innerHTML = `${extraTop}<div>${def.eyebrow?`<p class="eyebrow">${esc(def.eyebrow)}</p>`:""}<h2>${esc(def.title)}</h2>${def.intro?`<p class="muted" style="margin-top:6px">${esc(def.intro)}</p>`:""}</div>
    ${def.qs.map(qHTML).join("")}<p class="err" id="err" hidden></p>
    <div class="actions">${backBtn()}<button class="primary" id="next">Next</button></div>`;
  wireBack();
  document.getElementById("next").onclick = () => { if(collect(def.qs)) advance(s); };
}
function collect(qs){
  const err = document.getElementById("err"); let ok = true;
  for(const q of qs){
    let v;
    if(q.type==="number"){ const n = parseInt(document.getElementById("q_"+q.k).value,10); v = Number.isFinite(n)&&n>=15&&n<=99 ? n : undefined; }
    else { const c = app.querySelector(`input[name="${q.k}"]:checked`); v = c ? (q.type==="likert"?+c.value:c.value) : undefined; }
    if(v===undefined) ok=false; else R.a[q.k]=v;
  }
  err.hidden = ok; if(!ok) err.textContent = "Please answer every question on this page before you continue.";
  return ok;
}
function backBtn(){
  const list=active(); const i=list.indexOf(screens[idx]);
  const locked = screens[idx].id==="e_debrief" || (list[i-1]?.id==="profile" && R.arm);
  return i>0 && !locked ? `<button id="back">Back</button>` : `<span></span>`;
}
function wireBack(){ const b=document.getElementById("back"); if(b) b.onclick=()=>{ const list=active(); idx=screens.indexOf(list[list.indexOf(screens[idx])-1]); render(); }; }
async function advance(s){
  const nx = document.getElementById("next");
  if(s.after){
    if(nx){ nx.disabled = true; nx.textContent = "Please wait…"; }
    const ok = await s.after();
    if(ok===false) return;
  }
  const list = active(); const next = list[list.indexOf(s)+1];
  if((next.id==="done" || s.id==="e_page") && R.status!=="complete"){ R.status="complete"; R.completed_at=new Date().toISOString(); save(); }
  idx = screens.indexOf(next); render();
}

function renderConsent(s){
  app.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px"><p class="eyebrow">About 5 minutes</p><h1>Help us understand how people choose ceiling fans</h1>
    <p>We are MBA students at IIM Bangalore. This short study asks how you shop for ceiling fans. Some people will answer questions about fan brands; others will look at a product listing and tell us what they think of it.</p>
    <p class="muted small">Participation is voluntary and anonymous. We do not ask for your name, phone number or email. You can stop at any time. Answers are used only for a class research project.</p></div>
    <label class="opt"><input type="checkbox" id="agree">I am 18 or older and agree to take part.</label>
    <p class="err" id="err" hidden>Tick the box to continue.</p>
    <div class="actions"><span></span><button class="primary" id="next">Start</button></div>`;
  document.getElementById("agree").checked = !!R.a.consent;
  document.getElementById("next").onclick = () => { const ok=document.getElementById("agree").checked; document.getElementById("err").hidden=ok; if(ok){R.a.consent=true; advance(s);} };
}

/* ---- Stimulus: identical in all four versions except the two lines (Figure 3.1) ---- */
const FAN_SVG = `<svg viewBox="0 0 200 200" width="100%" height="100%" role="img" aria-label="Ceiling fan with three wooden-finish blades">
  <circle cx="100" cy="108" r="88" fill="none" stroke="#ececec" stroke-width="2"/>
  <rect x="96" y="18" width="8" height="52" fill="#9aa3ab"/><rect x="72" y="14" width="56" height="10" rx="3" fill="#b8c0c7"/>
  <g transform="translate(100 108)">${[0,120,240].map(r=>`<path transform="rotate(${r})" d="M0 -14 C 16 -30 22 -68 6 -86 C -8 -92 -22 -84 -20 -66 C -18 -46 -10 -28 0 -14Z" fill="#cfa66e" stroke="#b48a52" stroke-width="1.5"/>`).join("")}
  <circle r="20" fill="#2d3640"/><circle r="9" fill="#556270"/></g></svg>`;
function listingHTML(v){
  const ver = VERSIONS[v];
  const slot1 = ver.trust ? `<div class="slot hl"><b>Trusted by Indian households since 1977</b></div>` : `<div class="slot">Suitable for rooms up to 150 sq ft</div>`;
  const slot2 = ver.innov ? `<div class="slot hl"><b>NEW LAUNCH 2026</b> · Latest-generation design with upgraded motor technology</div>` : `<div class="slot">Available in white and walnut brown finishes</div>`;
  return `<div class="mk" aria-label="Product listing">
    <div class="crumb">Home &amp; Kitchen › Fans › Ceiling Fans &nbsp;|&nbsp; Sold and shipped by authorised seller</div>
    <div class="body"><div class="img">${FAN_SVG}</div>
      <div class="info"><div class="bl">Brand: V-Guard</div>
        <div class="title">V-Guard Ceiling Fan, 1200 mm (48 inch), BLDC Motor, Remote Control</div>
        <div class="stars">★★★★☆ 4.2 out of 5 · <span>1,284 ratings</span></div>
        ${slot1}${slot2}
        <div class="price">₹3,299 <small>M.R.P. <s>₹4,799</s> (31% off)</small></div>
        <ul><li>1200 mm sweep, BLDC motor, 28 W power consumption</li><li>Remote control with speed settings</li><li>2-year manufacturer warranty</li><li>Free delivery · 7-day replacement</li></ul>
        <div class="btns" aria-hidden="true"><span style="background:var(--mk-cart)">Add to cart</span><span style="background:var(--mk-buy)">Buy now</span></div>
      </div></div>
    <div class="foot">Research stimulus: simulated product page created for an academic study (not an actual listing).</div></div>`;
}
function renderStimulus(s){
  const top = `<div style="display:flex;flex-direction:column;gap:6px"><p class="eyebrow">Product listing</p><h2>Imagine you are shopping online for a new ceiling fan</h2><p class="muted">You come across the listing below. Look at it as you normally would, then answer the questions under it.</p></div>${listingHTML(R.version)}`;
  stimShownAt = Date.now();
  renderForm({qs:EXP_ITEMS.map(([k,t])=>({k:"e_"+k, type:"likert", label:t})), title:"What do you think of this fan?", intro:"How much do you agree with each statement?"}, s, top);
  const nx = document.getElementById("next"); nx.disabled = true;
  setTimeout(()=>{ nx.disabled=false; }, forced ? 0 : MIN_VIEW_MS);
  const orig = nx.onclick; nx.onclick = () => { R.seconds_on_page = Math.round((Date.now()-stimShownAt)/1000); orig(); };
}
function renderDebrief(s){
  app.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px"><p class="eyebrow">Before you go</p><h2>About the listing you saw</h2>
    <p>The product page was made for this study. People were shown slightly different versions of it so we could see which details affect how a fan is judged.</p>
    <div class="note">If your version said <b>“NEW LAUNCH 2026”</b>, that line was invented for the study. It does not describe a real V-Guard product launch. The price, rating and listing are also illustrative.</div>
    <p class="muted small">Please don't tell others which version you saw until the study closes, so their answers stay unbiased.</p></div>
    <div class="actions"><span></span><button class="primary" id="next">Finish</button></div>`;
  document.getElementById("next").onclick = () => advance(s);
}
function renderDone(){ renderEnd("Thank you!","Your answers have been recorded. You can close this page now."); }
function renderEnd(title,msg){
  bar.style.width="100%";
  app.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px"><h1>${esc(title)}</h1><p>${esc(msg)}</p><p class="muted small" id="savemsg"></p></div>
    <div class="actions" id="retrywrap" hidden><span></span><button class="primary" id="retry">Try saving again</button></div>`;
  document.getElementById("retry").onclick = () => save();
  showSaveState();
}

/* ================= Saving ================= */
let saveState = "idle";
function rowFor(){
  const a = R.a;
  const common = {rid:R.rid, is_test:R.is_test, started_at:R.started_at, completed_at:R.completed_at||"",
    age:a.age, gender:a.gender, region:a.region, works_in_industry:a.works_in_industry,
    first_time_buyer: a.bought_fan ? (a.bought_fan==="No"?"Yes":"No") : "", heard_vguard:a.heard_vguard||""};
  if(R.status==="screened_out") return {kind:"screened", row:{...common, screen_reason:R.screen_reason, arm:R.arm||"", version:R.version||""}};
  if(R.arm==="survey"){
    const row = {...common, heard_atomberg:a.heard_atomberg, last_purchase_channel:a.last_purchase_channel, how_knew_vguard:a.how_knew_vguard||"", brand_order:R.brand_order};
    for(const b of ["vguard","atomberg"]) for(const [k] of BRAND_ITEMS) row[b+"_"+k] = a[b+"_"+k] ?? "";
    for(const [k] of RESEARCH_ITEMS) row[k] = a[k];
    return {kind:"survey", row};
  }
  const v = VERSIONS[R.version];
  const row = {...common, version:R.version, trust_line_shown:v.trust?"Yes":"No", new_line_shown:v.innov?"Yes":"No", seconds_on_page:R.seconds_on_page};
  for(const [k] of EXP_ITEMS) row[k] = a["e_"+k];
  return {kind:"experiment", row};
}
const PENDING = "vg_pending";
function pendingAll(){ try{ return JSON.parse(localStorage.getItem(PENDING)||"[]"); }catch{ return []; } }
function pendingSet(list){ try{ localStorage.setItem(PENDING, JSON.stringify(list)); }catch{} }
async function save(){
  const payload = {action:"save", ...rowFor()};
  pendingSet([...pendingAll().filter(p=>p.row.rid!==payload.row.rid), payload]);
  saveState = "saving"; showSaveState();
  try{ await call(payload); pendingSet(pendingAll().filter(p=>p.row.rid!==payload.row.rid)); saveState = "saved"; }
  catch{ saveState = "failed"; }
  showSaveState();
}
// Send any answers that failed to save on an earlier visit from this browser.
async function flushPending(){
  for(const p of pendingAll()){
    try{ await call(p); pendingSet(pendingAll().filter(x=>x.row.rid!==p.row.rid)); }catch{ return; }
  }
}
function showSaveState(){
  const el=document.getElementById("savemsg"), rw=document.getElementById("retrywrap"); if(!el) return;
  el.textContent = saveState==="saved" ? "Saved." : saveState==="saving" ? "Saving…" :
    saveState==="failed" ? (API ? "We couldn't reach the server, so your answers aren't saved yet. Check your connection and try again; if you close the page, they will be sent the next time you open this link." : "Saving is not set up for this form yet.") : "";
  if(rw) rw.hidden = !(saveState==="failed" && API);
}

/* ================= Boot ================= */
document.getElementById("testpill").hidden = !forced;
document.getElementById("cfgwarn").hidden = !!API;
fresh();
if(API) flushPending();
})();
