// === Proxy & endpoints ===
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
const SAINT_URL   = PROXY + encodeURIComponent("https://nominis.cef.fr/json/nominis.php");

// === Stops (PRIM) ===
const STOP_IDS = {
  RER_A:      "STIF:StopArea:SP:43135:",
  JOINVILLE:  "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL:     "STIF:StopArea:SP:463644:"
};

// === Joinville — lignes forcées (hors RER) ===
const JOINVILLE_BUS_CODES = ["101","106","108","110","112","201","281","317","393","520","77","N33"];

// === URL helpers ===
const PRIM_STOP = ref   => PROXY + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${ref}`);
const PRIM_GM   = idLn  => PROXY + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=STIF:Line::${idLn}:`);
const ODS_BY_ID = id    => PROXY + encodeURIComponent(`https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=id_line%3D%22${id}%22&limit=1`);
const ODS_BY_CD = code  => PROXY + encodeURIComponent(`https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=shortname_line%3D%22${encodeURIComponent(code)}%22&limit=1`);

// === Utils ===
function clean(s=""){return s.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
async function fetchJSON(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ console.error("fetchJSON",url,e.message); return null; }
}
function minutesFromISO(iso){ if(!iso) return null; return Math.max(0, Math.round((new Date(iso)-Date.now())/60000)); }
function hhmm(iso){ if(!iso) return "—:—"; const d=new Date(iso); return d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}); }
function setLastUpdate(){ document.getElementById("lastUpdate").textContent=new Date().toLocaleTimeString("fr-FR"); }

// === Horloge / météo / saint ===
function tickClock(){
  const now=new Date();
  document.getElementById("clock").textContent = now.toLocaleTimeString("fr-FR");
  document.getElementById("dateLabel").textContent = now.toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
}
async function refreshWeather(){
  const d=await fetchJSON(WEATHER_URL,10000);
  if(!d?.current_weather) return;
  document.getElementById("weather-temp").textContent=`${Math.round(d.current_weather.temperature)}°C`;
  // sobriété : pas d’emoji
  document.getElementById("weather-desc").textContent = "";
}
async function refreshSaint(){
  const d=await fetchJSON(SAINT_URL,10000);
  const name=d?.response?.prenoms||"";
  document.getElementById("saint").textContent = name? `Fête : ${name}` : "Fête du jour";
}

// === PRIM parsing ===
function parseStop(data){
  const visits=data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit;
  if(!Array.isArray(visits)) return [];
  return visits.map(v=>{
    const mv=v.MonitoredVehicleJourney||{}; const call=mv.MonitoredCall||{};
    const lineRef=mv.LineRef?.value||mv.LineRef||""; const lineId=(lineRef.match(/C\d{5}/)||[null])[0];
    const dest = clean(call.DestinationDisplay?.[0]?.value||"");
    const expected=call.ExpectedDepartureTime||call.ExpectedArrivalTime||null;
    const aimed=call.AimedDepartureTime||call.AimedArrivalTime||null;
    const minutes=minutesFromISO(expected);
    let delayMin=null; if(expected&&aimed){ const d=Math.round((new Date(expected)-new Date(aimed))/60000); if(Number.isFinite(d)&&d>0) delayMin=d; }
    const status=(call.DepartureStatus||call.ArrivalStatus||"").toLowerCase();
    const cancelled=/cancel|annul|supprim/.test(status);
    return { lineId, dest, expected, minutes, delayMin, cancelled };
  });
}

// Groupement par ligne puis direction (3 prochains départs)
function groupByLineAndDir(visits, perDir=3){
  const byKey=new Map();
  visits.forEach(v=>{
    const key=(v.lineId||"")+"|"+v.dest.toLowerCase();
    if(!byKey.has(key)) byKey.set(key,{ lineId:v.lineId, dest:v.dest, list:[] });
    if(Number.isFinite(v.minutes)) byKey.get(key).list.push(v);
  });
  const byLine=new Map();
  for(const g of byKey.values()){
    if(!byLine.has(g.lineId)) byLine.set(g.lineId,{ lineId:g.lineId, dirs:[] });
    byLine.get(g.lineId).dirs.push({ dest:g.dest, list:g.list.sort((a,b)=>a.minutes-b.minutes).slice(0,perDir) });
  }
  return [...byLine.values()];
}

// === Couleurs IDFM ===
const metaCacheId=new Map(), metaCacheCode=new Map();
const FALLBACK={ "A":"#e41e26","77":"#0066cc","201":"#00aa55","101":"#f4b400","106":"#ef7d00","108":"#d94d8a","110":"#9b59b6","112":"#ff7f50","281":"#d2a000","317":"#2e86c1","393":"#16a085","520":"#7f8c8d","N33":"#2b2e83" };

async function metaById(lineId){
  if(!lineId) return { code:"", color:"#2450a4", text:"#fff" };
  if(metaCacheId.has(lineId)) return metaCacheId.get(lineId);
  const data=await fetchJSON(ODS_BY_ID(lineId), 10000);
  let m={ code:lineId, color:"#2450a4", text:"#fff" };
  if(data?.results?.length){
    const e=data.results[0];
    m={ code:e.shortname_line||lineId, color:e.colourweb_hexa||"#2450a4", text:e.textcolourweb_hexa||"#fff" };
  }
  metaCacheId.set(lineId,m); return m;
}

async function metaByCode(code){
  if(!code) return { code:"", color:"#2450a4", text:"#fff" };
  if(metaCacheCode.has(code)) return metaCacheCode.get(code);
  const data=await fetchJSON(ODS_BY_CD(code), 10000);
  let m={ code, color:FALLBACK[code]||"#2450a4", text:"#fff" };
  if(data?.results?.length){
    const e=data.results[0];
    m={ code:e.shortname_line||code, color:e.colourweb_hexa||FALLBACK[code]||"#2450a4", text:e.textcolourweb_hexa||"#fff" };
  }
  metaCacheCode.set(code,m); return m;
}

// === Rendu cellules / blocs ===
function cellHTML(v){
  const cls = v.cancelled ? "badge cancelled"
    : (Number.isFinite(v.minutes) && v.minutes<=1.5) ? "badge imminent"
    : (v.delayMin>0 ? "badge delay" : "badge");
  const sub = v.expected ? `<div class="sub">Prévu ${hhmm(v.expected)}${v.delayMin>0?` — Retardé +${v.delayMin} min`:``}</div>` : "";
  const min = Number.isFinite(v.minutes) ? String(v.minutes).padStart(2,"0") : "—";
  return `<div class="time"><div class="${cls}">${min}</div>${sub}</div>`;
}

function directionsHTML(dirs){
  if(!dirs?.length){
    return `<div class="dir">Direction 1</div><div class="note">Pas de passage prévu</div>
            <div class="dir">Direction 2</div><div class="note">Pas de passage prévu</div>`;
  }
  // Assure deux directions visibles
  let html="";
  const cap = dirs.slice(0,2);
  cap.forEach(d=>{
    const rows = d.list.length ? d.list.map(cellHTML).join("") : `<div class="note">Pas de passage prévu</div>`;
    html += `<div class="dir">${d.dest || "Direction"}</div><div class="rows">${rows}</div>`;
  });
  if(cap.length===1){
    html += `<div class="dir">Autre direction</div><div class="note">Pas de passage prévu</div>`;
  }
  return html;
}

function lineBlock(meta, dirs, title=""){
  return `<div class="block">
    <div class="title"><span class="pill" style="background:${meta.color};color:${meta.text}">${meta.code}</span><div class="name">${title}</div></div>
    ${directionsHTML(dirs)}
  </div>`;
}

// === Sections ===

// RER A — 2 sens Paris / Boissy (classification par mots-clés)
async function renderRerA(){
  const node=document.getElementById("rerA-body"); node.innerHTML="";
  const raw=await fetchJSON(PRIM_STOP(STOP_IDS.RER_A), 12000);
  const visits=parseStop(raw);

  const rxParis=/(paris|défense|nanterre|poissy|cergy|nation|etoile|haussmann)/i;
  const rxBoissy=/(boissy|marne|val d'europe|chessy|torcy|noisiel|bussy|noisy|fontenay|bry|champigny)/i;

  const vParis = visits.filter(v=>rxParis.test(v.dest)).slice(0,3);
  const vBoissy= visits.filter(v=>rxBoissy.test(v.dest)).slice(0,3);

  const meta={code:"RER A", color:"#e41e26", text:"#fff"};
  const wrap=document.createElement("div");
  wrap.innerHTML=lineBlock(meta,[{dest:"Vers Paris", list:vParis},{dest:"Vers Boissy", list:vBoissy}]);
  node.appendChild(wrap.firstChild);
}

// Hippodrome — Bus 77 (2 sens forcés)
async function renderHippo77(){
  const node=document.getElementById("hippo-body"); node.innerHTML="";
  const raw=await fetchJSON(PRIM_STOP(STOP_IDS.HIPPODROME), 12000);
  const visits=parseStop(raw);
  const grouped=groupByLineAndDir(visits,3);

  // Cherche la ligne 77 parmi les résultats, sinon fallback meta
  let target=null;
  for(const g of grouped){ const m=await metaById(g.lineId); if((m.code||"").toUpperCase()==="77"){ target={m,dirs:g.dirs}; break; } }
  const meta = (target?.m) || await metaByCode("77");
  const dirs = (target?.dirs) || [];
  const wrap=document.createElement("div");
  wrap.innerHTML=lineBlock(meta, dirs);
  node.appendChild(wrap.firstChild);
}

// École du Breuil — Bus 201 et 77 (2 sens forcés pour chaque)
async function renderBreuil(){
  const node=document.getElementById("breuil-body"); node.innerHTML="";
  const raw=await fetchJSON(PRIM_STOP(STOP_IDS.BREUIL), 12000);
  const visits=parseStop(raw);
  const grouped=groupByLineAndDir(visits,3);

  async function renderOne(code){
    let found=null;
    for(const g of grouped){ const m=await metaById(g.lineId); if((m.code||"").toUpperCase()===code){ found={m,dirs:g.dirs}; break; } }
    const meta = (found?.m) || await metaByCode(code);
    const dirs = (found?.dirs) || [];
    const wrap=document.createElement("div"); wrap.innerHTML=lineBlock(meta, dirs);
    node.appendChild(wrap.firstChild);
  }

  await renderOne("201");
  await renderOne("77");
}

// Joinville — Bus (résumé top 4 lignes présentes), 2 sens si possible
async function renderJoinvilleBus(){
  const node=document.getElementById("joinvillebus-body"); node.innerHTML="";
  const raw=await fetchJSON(PRIM_STOP(STOP_IDS.JOINVILLE),12000);
  const visits=parseStop(raw).filter(v=>v.lineId);
  const grouped=groupByLineAndDir(visits,3).slice(0,4);

  for(const g of grouped){
    const meta=await metaById(g.lineId);
    const wrap=document.createElement("div"); wrap.innerHTML=lineBlock(meta, g.dirs);
    node.appendChild(wrap.firstChild);
  }
}

// Joinville — Tous les bus (2 colonnes) — affichage forcé même sans passage
async function renderJoinvilleAll(){
  const L= document.getElementById("joinville-left"),
        R= document.getElementById("joinville-right");
  L.innerHTML=""; R.innerHTML="";

  const raw=await fetchJSON(PRIM_STOP(STOP_IDS.JOINVILLE),12000);
  const visits=parseStop(raw).filter(v=>v.lineId);
  const grouped=groupByLineAndDir(visits,3);

  // Map par shortname
  const byCode=new Map();
  for(const g of grouped){
    const m=await metaById(g.lineId);
    byCode.set((m.code||"").toUpperCase(), {meta:m, dirs:g.dirs});
  }

  const half=Math.ceil(JOINVILLE_BUS_CODES.length/2);
  const leftList=JOINVILLE_BUS_CODES.slice(0,half);
  const rightList=JOINVILLE_BUS_CODES.slice(half);

  async function renderList(list, parent){
    for(const code of list){
      const info = byCode.get(code) || { meta: await metaByCode(code), dirs: [] };
      const wrap=document.createElement("div"); wrap.innerHTML=lineBlock(info.meta, info.dirs);
      parent.appendChild(wrap.firstChild);
    }
  }
  await renderList(leftList, L);
  await renderList(rightList, R);
}

// === Bandeau trafic global (/general-message) ===
async function refreshBanner(){
  // RER A (C01742), 77 (C02251), 201 (C01219)
  const LINES=["C01742","C02251","C01219"];
  const msgs=[];
  await Promise.all(LINES.map(async id=>{
    const data=await fetchJSON(PRIM_GM(id), 10000);
    const del=data?.Siri?.ServiceDelivery?.GeneralMessageDelivery||[];
    del.forEach(d=>{
      (d.InfoMessage||[]).forEach(m=>{
        const txt=clean(m?.Content?.Message?.[0]?.MessageText?.[0]?.value||"");
        if(txt) msgs.push(txt);
      });
    });
  }));
  const banner=document.getElementById("banner");
  if(!msgs.length){ banner.className="banner ok"; banner.textContent="Trafic normal sur les lignes suivies."; }
  else { banner.className="banner alert"; banner.textContent=msgs.join("  |  "); }
}

// === Loops ===
function startLoops(){
  setInterval(tickClock, 1000);
  setInterval(refreshWeather, 30*60*1000);
  setInterval(refreshSaint,   6*60*60*1000);
  setInterval(async ()=>{
    await Promise.all([
      renderRerA(),
      renderHippo77(),
      renderBreuil(),
      renderJoinvilleBus(),
      renderJoinvilleAll(),
      refreshBanner()
    ]);
    setLastUpdate();
  }, 60*1000);
}

// === Init ===
(async function init(){
  tickClock();
  await Promise.all([
    refreshWeather(),
    refreshSaint(),
    refreshBanner(),
    renderRerA(),
    renderHippo77(),
    renderBreuil(),
    renderJoinvilleBus(),
    renderJoinvilleAll()
  ]);
  setLastUpdate();
  startLoops();
})();