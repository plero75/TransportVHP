// =============================
// Dashboard IDFM – Logic complet
// =============================

// Proxy & règles (Open-Meteo direct)
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// ---- Endpoints ----
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
const SAINT_URL   = PROXY + encodeURIComponent("https://nominis.cef.fr/json/nominis.php");
const RSS_URL     = PROXY + encodeURIComponent("https://www.francetvinfo.fr/titres.rss");

// StopAreas
const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:",
  JOINVILLE: "STIF:StopArea:SP:70640:"
};

// Constructions d'URL PRIM/ODS
const PRIM_STOP = ref => PROXY + encodeURIComponent(
  `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${ref}`
);
const PRIM_GENERAL_BY_LINE = idLine => PROXY + encodeURIComponent(
  `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=STIF:Line::${idLine}:`
);
const ODS_LINE_BY_ID = id => PROXY + encodeURIComponent(
  `https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=id_line%3D%22${id}%22&limit=1`
);
const ODS_LINE_BY_CODE = code => PROXY + encodeURIComponent(
  `https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=shortname_line%3D%22${encodeURIComponent(code)}%22&limit=1`
);

// Vélib & routier & PMU
const VELIB_STATIONS = { VINCENNES: "12163", BREUIL: "12128" };
const VELIB_URL = id => PROXY + encodeURIComponent(
  `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records?where=stationcode%3D${id}&limit=1`
);
const SYTADIN_JSON = PROXY + encodeURIComponent("https://opendata.sytadin.fr/velc/SYTR.json");
const PARIS_ROAD_FALLBACK = PROXY + encodeURIComponent("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/records?limit=60&order_by=-t_1h");
const PMU_DAILY = yyyymmdd => PROXY + encodeURIComponent(`https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${yyyymmdd}`);

// ==== État global ====
let newsItems = [];
let tickerIndex = 0;
let tickerData = { timeWeather: "", saint: "", traffic: "" };
let dailyCoursesCache = { vin: [], eng: [], date: "" };
const IMMINENT = 1.5; // < 1m30
const GLOBAL_LINES = ["C01742","C02251","C01219"]; // RER A, 77, 201

// ==== Utils ====
async function fetchJSON(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ console.error("fetchJSON", url, e.message); return null; }
}
async function fetchText(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }catch(e){ console.error("fetchText", url, e.message); return ""; }
}
function cleanText(s=""){return s.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function minutesFromISO(iso){ if(!iso) return null; return Math.max(0, Math.round((new Date(iso)-Date.now())/60000)); }
function hhmm(iso){ if(!iso) return "—:—"; const d=new Date(iso); return d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function setClock(){
  const now=new Date();
  const dEl=document.getElementById("date"); const cEl=document.getElementById("clock");
  if(dEl) dEl.textContent=now.toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  if(cEl) cEl.textContent=now.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
}
function setLastUpdate(){ const el=document.getElementById("lastUpdate"); if(el) el.textContent=`Maj ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`; }

// ==== Météo & Saint ====
const WEATHER_CODES = {0:"Ciel dégagé",1:"Ciel dégagé",2:"Éclaircies",3:"Ciel couvert",45:"Brouillard",48:"Brouillard givrant",61:"Pluie faible",63:"Pluie",65:"Pluie forte",80:"Averses",81:"Averses",82:"Forte averse",95:"Orages",96:"Orages grêle",99:"Orages grêle"};
function weatherLabel(c){return WEATHER_CODES[c]||"Météo";}
async function refreshWeather(){
  const data=await fetchJSON(WEATHER_URL, 10000); // direct
  const tempEl=document.getElementById("weather-temp");
  const descEl=document.getElementById("weather-desc");
  if(!data?.current_weather){ if(descEl) descEl.textContent="Météo indisponible"; tickerData.timeWeather="Météo indisponible"; return; }
  const {temperature, weathercode}=data.current_weather;
  const t=`${Math.round(temperature)}°C`; if(tempEl) tempEl.textContent=t; if(descEl) descEl.textContent=weatherLabel(weathercode);
  tickerData.timeWeather=`${t} • ${weatherLabel(weathercode)}`;
}
async function refreshSaint(){
  try{
    const data=await fetchJSON(SAINT_URL, 10000);
    const name=data?.response?.prenoms || "";
    const el=document.getElementById("saint"); if(el) el.textContent=name?`Fête : ${name}`:"Fête du jour";
    tickerData.saint = name ? `Fête : ${name}` : "";
  }catch{ const el=document.getElementById("saint"); if(el) el.textContent="Fête du jour indisponible"; }
}

// ==== News ====
async function refreshNews(){
  const xml=await fetchText(RSS_URL, 15000);
  let items=[];
  if(xml){
    try{
      const doc=new DOMParser().parseFromString(xml,"application/xml");
      items=[...doc.querySelectorAll("item")].slice(0,6).map(n=>({title:cleanText(n.querySelector("title")?.textContent||""), desc:cleanText(n.querySelector("description")?.textContent||"")}));
    }catch(e){ console.error("RSS parse",e); }
  }
  newsItems=items; renderNews();
}
function renderNews(){
  const cont=document.getElementById("news-carousel"); if(!cont) return;
  cont.innerHTML="";
  if(!newsItems.length){ cont.textContent="Actualités indisponibles"; return; }
  newsItems.forEach(it=>{
    const d=document.createElement("div"); d.className="news-card";
    d.innerHTML=`<div class="news-title">${it.title}</div><div class="news-desc">${it.desc}</div>`;
    cont.appendChild(d);
  });
}

// ==== Vélib ====
async function refreshVelib(){
  const upd=async(key,id)=>{
    const el=document.getElementById(`velib-${key}`); if(!el) return;
    try{
      const data=await fetchJSON(VELIB_URL(id), 10000);
      const st=data?.results?.[0]; if(!st){ el.textContent="Indisponible"; return; }
      const mech=st.mechanical_bikes??0, elec=st.ebike_bikes??0, docks=st.numdocksavailable??0;
      el.textContent=`Mécaniques ${mech} • Électriques ${elec} • Bornes ${docks}`;
    }catch(e){ el.textContent="Indisponible"; }
  };
  await Promise.all([upd("vincennes", VELIB_STATIONS.VINCENNES), upd("breuil", VELIB_STATIONS.BREUIL)]);
}

// ==== PRIM parsing & groupements ====
function parseStop(data){
  const visits=data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit;
  if(!Array.isArray(visits)) return [];
  return visits.map(v=>{
    const mv=v.MonitoredVehicleJourney||{}; const call=mv.MonitoredCall||{};
    const lineRef=mv.LineRef?.value||mv.LineRef||""; const lineId=(lineRef.match(/C\d{5}/)||[null])[0];
    const dest=(call.DestinationDisplay?.[0]?.value||"").toString().trim()||"—";
    const expected=call.ExpectedDepartureTime||call.ExpectedArrivalTime||null;
    const aimed=call.AimedDepartureTime||call.AimedArrivalTime||null;
    const minutes=minutesFromISO(expected);
    let delayMin=null; if(expected&&aimed){ const d=Math.round((new Date(expected)-new Date(aimed))/60000); if(Number.isFinite(d)&&d>0) delayMin=d; }
    const dep=(call.DepartureStatus?.value||call.DepartureStatus||"").toLowerCase();
    const arr=(call.ArrivalStatus?.value||call.ArrivalStatus||"").toLowerCase();
    const prog=(Array.isArray(mv.ProgressStatus)?mv.ProgressStatus.map(x=>x?.value||x).join(" "):(mv.ProgressStatus?.value||mv.ProgressStatus||"")).toLowerCase();
    const cancelled=/cancel|annul|supprim/.test(dep+arr+prog);
    return { lineId, dest, expected, minutes, delayMin, cancelled };
  });
}
function groupByLineAndDirection(visits, perDir=3){
  const map=new Map();
  visits.forEach(v=>{
    const key=(v.lineId||"")+"|"+v.dest.toLowerCase();
    if(!map.has(key)) map.set(key,{ lineId:v.lineId, dest:v.dest, list:[] });
    if(Number.isFinite(v.minutes)) map.get(key).list.push(v);
  });
  const byLine=new Map();
  for(const g of map.values()){
    if(!byLine.has(g.lineId)) byLine.set(g.lineId,{ lineId:g.lineId, directions:[] });
    const sorted=g.list.sort((a,b)=>a.minutes-b.minutes).slice(0,perDir);
    byLine.get(g.lineId).directions.push({ dest:g.dest, list:sorted });
  }
  return [...byLine.values()];
}

// ==== Référentiel des lignes ====
const metaCacheById=new Map(), metaCacheByCode=new Map();
const FALLBACK_COLOR={ "A":"#e41e26","77":"#0066cc","201":"#00aa55","106":"#ef7d00","108":"#d94d8a","110":"#9b59b6","281":"#d2a000","N33":"#2b2e83" };
async function metaById(lineId){
  if(!lineId) return { code:"", color:"#2450a4", text:"#fff" };
  if(metaCacheById.has(lineId)) return metaCacheById.get(lineId);
  const data=await fetchJSON(ODS_LINE_BY_ID(lineId), 10000);
  let m={ code: lineId, color:"#2450a4", text:"#fff" };
  if(data?.results?.length){ const e=data.results[0]; m={ code:e.shortname_line||e.name_line||lineId, color:e.colourweb_hexa||"#2450a4", text:e.textcolourweb_hexa||"#fff" }; }
  metaCacheById.set(lineId,m); return m;
}
async function metaByCode(code){
  if(!code) return { code:"", color:"#2450a4", text:"#fff" };
  if(metaCacheByCode.has(code)) return metaCacheByCode.get(code);
  const data=await fetchJSON(ODS_LINE_BY_CODE(code), 10000);
  let m={ code, color:FALLBACK_COLOR[code]||"#2450a4", text:"#fff" };
  if(data?.results?.length){ const e=data.results[0]; m={ code:e.shortname_line||code, color:e.colourweb_hexa||FALLBACK_COLOR[code]||"#2450a4", text:e.textcolourweb_hexa||"#fff" }; }
  metaCacheByCode.set(code,m); return m;
}

// ==== Cellules temps ====
function cellHTML(v){
  const cls = v.cancelled ? "box cancelled"
           : (Number.isFinite(v.minutes) && v.minutes<=IMMINENT) ? "box imminent"
           : (v.delayMin>0) ? "box delay" : "box";
  const min = Number.isFinite(v.minutes) ? v.minutes : "—";
  const sub = v.expected ? `<div class="sub">${hhmm(v.expected)}${v.delayMin>0?`  +${v.delayMin} min`:``}</div>` : "";
  return `<div class="time"><div class="${cls}">${min}</div>${sub}</div>`;
}
function placeholderDirHTML(destLabel, message){
  return `<div class="dir">${destLabel}</div><div class="rows"><div class="time"><div class="box cancelled">—</div><div class="sub">${message}</div></div></div>`;
}

// ==== Alertes globales ====
function severityOrder(s=""){ const x=s.toLowerCase(); if(/critical|severe|majeur|important/.test(x)) return 0; if(/moderate|moyen/.test(x)) return 1; if(/minor|faible|info/.test(x)) return 2; return 3; }
async function fetchGeneralMessagesForLines(idLines){
  const uniq=[...new Set(idLines.filter(Boolean))];
  const acc=[];
  await Promise.all(uniq.map(async id=>{
    const data=await fetchJSON(PRIM_GENERAL_BY_LINE(id), 10000);
    const delivs=data?.Siri?.ServiceDelivery?.GeneralMessageDelivery||[];
    delivs.forEach(d=>{ (d.InfoMessage||[]).forEach(m=>{
      const txt=cleanText(m?.Content?.Message?.[0]?.MessageText?.[0]?.value || m?.Description || "");
      const sev=cleanText(m?.Content?.Message?.[0]?.MessageType?.[0]?.value || m?.Priority || "info");
      if(txt) acc.push({ lineId:id, text:txt, severity:sev });
    });});
  }));
  const best=new Map();
  acc.forEach(it=>{ const cur=best.get(it.lineId); if(!cur || severityOrder(it.severity)<severityOrder(cur.severity)) best.set(it.lineId,it); });
  return [...best.values()];
}
async function refreshTrafficBanner(){
  const msgs=await fetchGeneralMessagesForLines(GLOBAL_LINES);
  const banner=document.getElementById("banner-alert");
  if(!msgs.length){ banner.className="traffic-banner ok"; banner.textContent="Trafic normal sur les lignes suivies."; }
  else{ banner.className="traffic-banner alert"; banner.textContent=msgs.map(m=>`[${m.lineId}] ${m.text}`).join(" • "); }
  tickerData.traffic=banner.textContent;
}
async function renderTrafficStripForLines(lineIds, nodeId){
  const el=document.getElementById(nodeId); if(!el) return;
  try{
    const msgs=await fetchGeneralMessagesForLines(lineIds);
    if(!msgs.length){ el.className="traffic-sub ok"; el.textContent="Trafic normal"; return; }
    el.className="traffic-sub alert"; el.textContent = msgs.map(m=>`[${m.lineId}] ${m.text}`).join(" • ");
  }catch{ el.className="traffic-sub alert"; el.textContent="Information trafic indisponible"; }
}

// ==== RER A (2 directions fixes) ====
async function renderRerA(){
  const cont=document.getElementById("rerA-body"); cont.innerHTML="";
  const data=await fetchJSON(PRIM_STOP(STOP_IDS.RER_A), 12000);
  const visits=parseStop(data);

  const parisRx=/(paris|la défense|nanterre|poissy|cergy|houilles|etoile|nation)/i;
  const boissyRx=/(boissy|marne|val d'europe|torcy|noisiel|bussy|chessy|noisy|fontenay|bry|champigny)/i;
  const vParis=visits.filter(v=>parisRx.test(v.dest));
  const vBoissy=visits.filter(v=>boissyRx.test(v.dest));

  const block=document.createElement("div"); block.className="line-block";
  block.innerHTML=`<div class="line-header"><span class="pill rer-a">A</span><div class="name">RER A</div></div>`;

  if(vParis.length){
    const sorted=vParis.filter(x=>Number.isFinite(x.minutes)).sort((a,b)=>a.minutes-b.minutes).slice(0,3);
    block.innerHTML += `<div class="dir">Vers Paris / La Défense</div><div class="rows">${sorted.map(cellHTML).join("")}</div>`;
  }else{
    block.innerHTML += placeholderDirHTML("Vers Paris / La Défense","Service terminé");
  }
  if(vBoissy.length){
    const sorted=vBoissy.filter(x=>Number.isFinite(x.minutes)).sort((a,b)=>a.minutes-b.minutes).slice(0,3);
    block.innerHTML += `<div class="dir">Vers Boissy / Marne-la-Vallée</div><div class="rows">${sorted.map(cellHTML).join("")}</div>`;
  }else{
    block.innerHTML += placeholderDirHTML("Vers Boissy / Marne-la
