// =============================
// Dashboard IDFM – App Logic (final IDFM theme)
// =============================

// Proxy unique (voir règles en bas du fichier)
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// Endpoints (respect politique de proxy)
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
const SAINT_URL = PROXY + encodeURIComponent("https://nominis.cef.fr/json/nominis.php");
const RSS_URL = PROXY + encodeURIComponent("https://www.francetvinfo.fr/titres.rss");

const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  JOINVILLE: "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:"
};

// Constructions d’URL
const PRIM_STOP = ref => PROXY + encodeURIComponent(
  `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${ref}`
);
const PRIM_GENERAL_BY_LINE = idLine => PROXY + encodeURIComponent(
  `https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=STIF:Line::${idLine}:`
);
const GTFS_LINE_URL = idLine => PROXY + encodeURIComponent(
  `https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=id_line%3D%22${idLine}%22&limit=1`
);

// Données annexes
const VELIB_STATIONS = { VINCENNES: "12163", BREUIL: "12128" };
const VELIB_URL = id => PROXY + encodeURIComponent(
  `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records?where=stationcode%3D${id}&limit=1`
);
const SYTADIN_JSON = PROXY + encodeURIComponent("https://opendata.sytadin.fr/velc/SYTR.json");
const PARIS_ROAD_FALLBACK = PROXY + encodeURIComponent("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/records?limit=60&order_by=-t_1h");
const PMU_DAILY = yyyymmdd => PROXY + encodeURIComponent(`https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${yyyymmdd}`);

// État global
let newsItems = [];
let currentNews = 0;
let lineMetaCache = new Map();
let tickerIndex = 0;
let tickerData = { timeWeather: "", saint: "", traffic: "" };
let dailyCoursesCache = { vin: [], eng: [], date: "" };

// Paramètres
const IMMINENT_THRESHOLD_MIN = 1.5; // < 1min30
const GLOBAL_LINES = ["C01742","C02251","C01219"]; // RER A, 77, 201
const EXCLUDE_JOINVILLE = new Set(["C01742"]); // exclure RER A de "Joinville – tous bus"

// ============ Utils ============

async function fetchJSON(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"});
    clearTimeout(t); if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ console.error("fetchJSON", url, e.message); return null; }
}
async function fetchText(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"});
    clearTimeout(t); if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }catch(e){ console.error("fetchText", url, e.message); return ""; }
}
function cleanText(s=""){return s.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function minutesFromISO(iso){ if(!iso) return null; return Math.max(0, Math.round((new Date(iso).getTime()-Date.now())/60000)); }
function hhmm(iso){ if(!iso) return "—:—"; const d=new Date(iso); return d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}); }
function todayISO(){ return new Date().toISOString().slice(0,10); }

// ============ Header ============

function setClock(){
  const d=new Date();
  const elDate=document.getElementById("date");
  const elClock=document.getElementById("clock");
  if(elDate) elDate.textContent=d.toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  if(elClock) elClock.textContent=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
}
function setLastUpdate(){
  const el=document.getElementById("lastUpdate");
  if(el) el.textContent=`Maj ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`;
}

// ============ Météo & Saint ============

const WEATHER_CODES = {0:"Ciel dégagé",1:"Ciel dégagé",2:"Éclaircies",3:"Ciel couvert",45:"Brouillard",48:"Brouillard givrant",61:"Pluie faible",63:"Pluie",65:"Pluie forte",80:"Averses",81:"Averses",82:"Forte averse",95:"Orages",96:"Orages grêle",99:"Orages grêle"};
function weatherLabel(code){return WEATHER_CODES[code]||"Météo";}
async function refreshWeather(){
  const data=await fetchJSON(WEATHER_URL, 10000); // direct, pas de proxy
  const tempEl=document.getElementById("weather-temp");
  const descEl=document.getElementById("weather-desc");
  if(!data?.current_weather){
    if(descEl) descEl.textContent="Météo indisponible";
    tickerData.timeWeather="Météo indisponible";
    return;
  }
  const {temperature, weathercode}=data.current_weather;
  const t=`${Math.round(temperature)}°C`;
  if(tempEl) tempEl.textContent=t;
  if(descEl) descEl.textContent=weatherLabel(weathercode);
  tickerData.timeWeather=`${t} • ${weatherLabel(weathercode)}`;
}
async function refreshSaint(){
  try{
    const data=await fetchJSON(SAINT_URL, 10000);
    const name=data?.response?.prenoms || "";
    const el=document.getElementById("saint");
    if(el) el.textContent=name ? `Fête : ${name}` : "Fête du jour";
    tickerData.saint = name ? `Fête : ${name}` : "";
  }catch{
    const el=document.getElementById("saint");
    if(el) el.textContent="Fête du jour indisponible";
  }
}

// ============ News ============

async function refreshNews(){
  const xml=await fetchText(RSS_URL, 15000);
  let items=[];
  if(xml){
    try{
      const doc=new DOMParser().parseFromString(xml,"application/xml");
      items=[...doc.querySelectorAll("item")].slice(0,6).map(n=>({
        title: cleanText(n.querySelector("title")?.textContent||""),
        desc: cleanText(n.querySelector("description")?.textContent||"")
      }));
    }catch(e){ console.error("RSS parse", e); }
  }
  newsItems=items; renderNews();
}
function renderNews(){
  const cont=document.getElementById("news-carousel"); if(!cont) return;
  cont.innerHTML="";
  if(!newsItems.length){ cont.textContent="Actualités indisponibles"; return; }
  newsItems.forEach((it,i)=>{
    const d=document.createElement("div");
    d.className="news-card";
    d.innerHTML=`<div class="news-title">${it.title}</div><div class="news-desc">${it.desc}</div>`;
    cont.appendChild(d);
  });
}
function nextNews(){ if(!newsItems.length) return; currentNews=(currentNews+1)%newsItems.length; renderNews(); }

// ============ Vélib ============

async function refreshVelib(){
  const upd=async(key,id)=>{
    const el=document.getElementById(`velib-${key.toLowerCase()}`)||document.getElementById(`velib-${key}`);
    if(!el) return;
    try{
      const data=await fetchJSON(VELIB_URL(id), 10000);
      const st=data?.results?.[0];
      if(!st){ el.textContent="Indisponible"; return; }
      const mech=st.mechanical_bikes??0, elec=st.ebike_bikes??0, docks=st.numdocksavailable??0;
      el.textContent=`Mécaniques ${mech} • Électriques ${elec} • Bornes ${docks}`;
    }catch(e){ console.error("Vélib",key,e.message); el.textContent="Indisponible"; }
  };
  await Promise.all([upd("vincennes", VELIB_STATIONS.VINCENNES), upd("breuil", VELIB_STATIONS.BREUIL)]);
}

// ============ PRIM parsing & regroupements ============

function parseStop(data){
  const visits=data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit;
  if(!Array.isArray(visits)) return [];
  return visits.map(v=>{
    const mv=v.MonitoredVehicleJourney||{}; const call=mv.MonitoredCall||{};
    const lineRef=mv.LineRef?.value||mv.LineRef||""; const lineId=(lineRef.match(/C\d{5}/)||[null])[0];
    const dest=(call.DestinationDisplay?.[0]?.value||"").toString();
    const expected=call.ExpectedDepartureTime||call.ExpectedArrivalTime||null;
    const aimed=call.AimedDepartureTime||call.AimedArrivalTime||null;
    const minutes=minutesFromISO(expected);
    const dep=(call.DepartureStatus?.value||call.DepartureStatus||"").toLowerCase();
    const arr=(call.ArrivalStatus?.value||call.ArrivalStatus||"").toLowerCase();
    const prog=(Array.isArray(mv.ProgressStatus)?mv.ProgressStatus.map(x=>x?.value||x).join(" "):(mv.ProgressStatus?.value||mv.ProgressStatus||"")).toLowerCase();

    let delayMin=null;
    if(expected&&aimed){ const d=(new Date(expected)-new Date(aimed))/60000; if(Number.isFinite(d) && Math.round(d)!==0) delayMin=Math.max(0,Math.round(d)); }

    const cancelled = /cancel|annul|supprim/.test(dep+arr+prog);
    const notStopping = /notstopping|non desservi/.test(dep+arr+prog);
    const movedStop = /moved|déplac/.test(prog);
    const serviceEnded = /(no service|termin)/.test(dep+arr+prog);
    const first = /first/.test(prog);
    const last  = /last/.test(prog);

    return { lineId, dest: dest||"—", minutes, expected, aimed, delayMin, cancelled, notStopping, movedStop, serviceEnded, first, last };
  });
}
function groupByLineDest(visits, maxPerDest=3){
  const map=new Map();
  visits.forEach(v=>{
    const key=`${v.lineId}|${v.dest.toLowerCase()}`;
    if(!map.has(key)) map.set(key,{ lineId:v.lineId, dest:v.dest, list:[] });
    map.get(key).list.push(v);
  });
  return [...map.values()].map(g=>{
    const sorted=g.list
      .filter(x=>Number.isFinite(x.minutes))
      .sort((a,b)=>a.minutes-b.minutes)
      .slice(0,maxPerDest);
    return { lineId:g.lineId, dest:g.dest, list:sorted, raw:g.list };
  });
}

// ============ Référentiel des lignes ============

function fallbackColor(lineId){
  // Fallbacks demandés (au cas où le référentiel ne renvoie rien)
  const map = {
    "C01742": "#e41e26", // RER A
    "C02251": "#0066cc", // Bus 77
    "C01219": "#00aa55", // Bus 201
    "C01135": "#ef7d00", // Bus 106
    "C01060": "#d94d8a", // Bus 108 (valeur indicative)
    "C01090": "#9b59b6", // Bus 110 (indicative)
    "C01635": "#d2a000", // Bus 281 (indicative)
    "C09033": "#2b2e83"  // Noctilien N33 (indicative)
  };
  return map[lineId] || "#2450a4";
}
async function fetchLineMeta(lineId){
  if(!lineId) return { code:"—", color:"#2450a4", textColor:"#fff" };
  if(lineMetaCache.has(lineId)) return lineMetaCache.get(lineId);
  const data=await fetchJSON(GTFS_LINE_URL(lineId), 10000);
  let meta={ code: lineId, color:fallbackColor(lineId), textColor:"#fff" };
  if(data?.results?.length){
    const e=data.results[0];
    meta={ code: e.shortname_line||e.name_line||lineId, color: e.colourweb_hexa||fallbackColor(lineId), textColor: e.textcolourweb_hexa||"#fff" };
  }
  lineMetaCache.set(lineId, meta);
  return meta;
}

// ============ Rendu temps ============

function renderTimeCell(v){
  const cls = v.cancelled ? "time-box cancelled"
           : (Number.isFinite(v.minutes) && v.minutes <= IMMINENT_THRESHOLD_MIN) ? "time-box imminent"
           : v.delayMin>0 ? "time-box delay"
           : "time-box";
  const minuteLabel = Number.isFinite(v.minutes) ? v.minutes : "—";
  const exactLine   = v.expected ? `<div class="time-sub">Estimé ${hhmm(v.expected)}</div>` : "";
  let info = "";
  if(v.cancelled)         info = `<div class="info-sub cancelled">Supprimé</div>`;
  else if(v.notStopping)  info = `<div class="info-sub cancelled">Non desservi</div>`;
  else if(v.movedStop)    info = `<div class="info-sub delay">Arrêt déplacé</div>`;
  else if(v.delayMin>0)   info = `<div class="info-sub delay">+${v.delayMin} min</div>`;
  else if(v.first)        info = `<div class="info-sub ok">Premier passage</div>`;
  else if(v.last)         info = `<div class="info-sub ok">Dernier passage</div>`;
  else if(v.serviceEnded) info = `<div class="info-sub service">Service terminé</div>`;
  return `<div class="time-wrap"><span class="${cls}">${minuteLabel}</span>${exactLine}${info}</div>`;
}
function computeLineWideStatus(group){
  const anyEnded = group.raw.some(v => v.serviceEnded);
  const anyInterrupted = group.raw.some(v => v.cancelled && !Number.isFinite(v.minutes));
  const anyMoved = group.raw.some(v => v.movedStop || v.notStopping);
  if(anyEnded) return { type:"ended", text:"Service terminé" };
  if(anyInterrupted) return { type:"interrupted", text:"Service interrompu" };
  if(anyMoved) return { type:"moved", text:"Arrêt déplacé" };
  return null;
}
function severityOrder(s=""){ const x=s.toLowerCase(); if(/(critical|severe|majeur|important)/.test(x)) return 0; if(/(moderate|moyen)/.test(x)) return 1; if(/(minor|info|faible)/.test(x)) return 2; return 3; }
async function fetchGeneralMessagesForLines(idLines){
  const uniq=[...new Set(idLines.filter(Boolean))];
  const acc=[];
  await Promise.all(uniq.map(async id=>{
    const data=await fetchJSON(PRIM_GENERAL_BY_LINE(id), 10000);
    const delivs=data?.Siri?.ServiceDelivery?.GeneralMessageDelivery||[];
    delivs.forEach(d=>{
      (d.InfoMessage||[]).forEach(m=>{
        const txt=cleanText(m?.Content?.Message?.[0]?.MessageText?.[0]?.value || m?.Description || "");
        const sev=cleanText(m?.Content?.Message?.[0]?.MessageType?.[0]?.value || m?.Priority || "info");
        if(txt) acc.push({ lineId:id, text:txt, severity:sev });
      });
    });
  }));
  const best=new Map();
  acc.forEach(it=>{
    const cur=best.get(it.lineId);
    if(!cur || severityOrder(it.severity)<severityOrder(cur.severity)) best.set(it.lineId, it);
  });
  return [...best.values()];
}
function renderAlertStrip(containerId, meta, statusObj, gmText){
  const box=document.getElementById(containerId); if(!box) return;
  box.innerHTML="";
  if(!statusObj && !gmText) return;
  const div=document.createElement("div");
  const cls = statusObj?.type==="ended" ? "alert-line ended"
            : statusObj?.type==="interrupted" ? "alert-line interrupted"
            : statusObj?.type==="moved" ? "alert-line moved"
            : "alert-line info";
  div.className=cls;
  const label = statusObj ? statusObj.text : "Information trafic";
  const text  = gmText ? ` — ${gmText}` : "";
  div.innerHTML = `<span class="line-pill" style="background:${meta.color};color:${meta.textColor}">${meta.code}</span><span class="alert-text">${label}${text}</span>`;
  box.appendChild(div);
}

// ============ RER A : directions fixes ============

function classifyRer(visits){
  const parisRegex=/(paris|la défense|nanterre|poissy|cergy|houilles|sartrouville|etoile|nation|haussmann)/i;
  const boissyRegex=/(boissy|marne|val d'europe|torcy|noisiel|bussy|chessy|noisy|fontenay|bry|champigny)/i;
  const paris=[], boissy=[];
  visits.forEach(v=>{ const label=`${v.dest}`.toLowerCase();
    if(parisRegex.test(label)) paris.push(v); else if(boissyRegex.test(label)) boissy.push(v);
  });
  return { paris: groupByLineDest(paris,3), boissy: groupByLineDest(boissy,3) };
}

async function renderRer(){
  const cont=document.getElementById("rer-body"); cont.textContent="Chargement…";
  const data=await fetchJSON(PRIM_STOP(STOP_IDS.RER_A), 12000);
  const visits=parseStop(data);
  const { paris, boissy }=classifyRer(visits);
  const metaA={ code:"A", color:"#e41e26", textColor:"#fff" };
  const msgs=await fetchGeneralMessagesForLines(["C01742"]);
  const gm = msgs[0]?.text || "";
  let lineStatus=null;
  for(const g of [...paris,...boissy]){ lineStatus=computeLineWideStatus(g); if(lineStatus) break; }
  renderAlertStrip("rer-alert", metaA, lineStatus, gm);

  cont.innerHTML="";
  const ensureDir = (label, arr) => {
    if(arr.length){
      arr.forEach(g=>{
        const row=document.createElement("div"); row.className="row";
        row.innerHTML = `<span class="line-pill rer-a">A</span><div class="dest">${g.dest}</div><div class="times">${g.list.map(renderTimeCell).join("")}</div>`;
        cont.appendChild(row);
      });
    } else {
      const row=document.createElement("div"); row.className="row";
      row.innerHTML = `<span class="line-pill rer-a">A</span><div class="dest">${label}</div><div class="times"><div class="time-wrap"><span class="time-box cancelled">—</span><div class="info-sub service">Service terminé</div></div></div>`;
      cont.appendChild(row);
    }
  };
  // Ordre fixe : Paris → Boissy
  ensureDir("Vers Paris / La Défense", paris);
  ensureDir("Vers Boissy / Marne-la-Vallée", boissy);

  await renderTrafficStripForLines(["C01742"], "rer-traffic");
}

async function renderRerColumn(){
  const cont=document.getElementById("bus-joinville-alert"); // juste pour garder structure (non utilisé ici)
  // Déjà affiché dans renderRer() en ligne 3
}

// ============ Bus ============

async function renderBusForStop(stopId, bodyId, alertContainerId, trafficNodeId, filterByLineIds=null){
  const cont=document.getElementById(bodyId); cont.textContent="Chargement…";
  const data=await fetchJSON(PRIM_STOP(stopId), 12000);
  let visits=parseStop(data);

  // Filtrage optionnel (ex: Breuil 77 vs 201)
  if(Array.isArray(filterByLineIds) && filterByLineIds.length){
    const set=new Set(filterByLineIds);
    visits=visits.filter(v=>set.has(v.lineId));
  }

  // Pour "Joinville – tous bus", exclure le RER
  if(bodyId==="bus-joinville-body") visits = visits.filter(v=>!EXCLUDE_JOINVILLE.has(v.lineId));

  const groups=groupByLineDest(visits, 3);

  const idLines=[...new Set(groups.map(g=>g.lineId).filter(Boolean))];
  const gmsgs=await fetchGeneralMessagesForLines(idLines);
  const gmByLine=new Map(); gmsgs.forEach(m=>gmByLine.set(m.lineId,m.text));

  cont.innerHTML="";
  if(!groups.length){
    cont.innerHTML=`<div class="row"><span class="line-pill">BUS</span><div class="dest">—</div><div class="times"><div class="time-wrap"><span class="time-box cancelled">—</span><div class="info-sub service">Service terminé</div></div></div></div>`;
  } else {
    for(const g of groups){
      const meta=await fetchLineMeta(g.lineId);
      const lineStatus=computeLineWideStatus(g);
      if(lineStatus){
        renderAlertStrip(alertContainerId, meta, lineStatus, gmByLine.get(g.lineId));
      }
      const row=document.createElement("div"); row.className="row";
      row.innerHTML=`
        <span class="line-pill" style="background:${meta.color};color:${meta.textColor}">${meta.code}</span>
        <div class="dest">${g.dest}</div>
        <div class="times">${g.list.map(renderTimeCell).join("")}</div>`;
      cont.appendChild(row);
    }
  }
  if(trafficNodeId) await renderTrafficStripForLines(idLines, trafficNodeId);
}

// Strips trafic (noeuds)
async function renderTrafficStripForLines(lineIds, nodeId){
  const el=document.getElementById(nodeId); if(!el) return;
  try{
    const msgs=await fetchGeneralMessagesForLines(lineIds);
    if(!msgs.length){ el.className="traffic-sub ok"; el.textContent="Trafic normal"; return; }
    el.className="traffic-sub alert";
    el.textContent = msgs.map(m=>`[${m.lineId}] ${m.text}`).join(" • ");
  }catch(e){
    el.className="traffic-sub alert"; el.textContent="Information trafic indisponible";
  }
}
async function refreshTrafficBanner(){
  const msgs=await fetchGeneralMessagesForLines(GLOBAL_LINES);
  const banner=document.getElementById("banner-alert");
  if(!msgs.length){
    banner.className="traffic-banner ok";
    banner.textContent="Trafic normal sur les lignes suivies.";
  }else{
    banner.className="traffic-banner alert";
    banner.textContent=msgs.map(m=>`[${m.lineId}] ${m.text}`).join(" • ");
  }
  tickerData.traffic=banner.textContent;
}

// ============ Trafic routier ============

function distanceKm(lat1, lon1, lat2, lon2){
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
async function refreshRoad(){
  const cont=document.getElementById("road-list");
  const fb=document.getElementById("road-fallback");
  cont.textContent="Chargement…";
  try{
    let used = false;
    const syt=await fetchJSON(SYTADIN_JSON, 12000);
    if(syt && (Array.isArray(syt) || syt.records)){
      const entries=Array.isArray(syt)? syt : (syt.records||[]).map(r=>r.fields||r);
      const KEYS=["Périph","A4","A86","Vincennes","Joinville","Charenton"];
      const filtered=entries.filter(e=>e.libelle && KEYS.some(k=>new RegExp(k,"i").test(e.libelle))).slice(0,8);
      cont.innerHTML = filtered.map(e=>`<div class="course"><div class="badge-time">${e.horaire||""}</div><div class="course-name">${e.libelle||""}</div><div class="course-meta">${e.commentaire||e.indice_traffic||""}</div></div>`).join(""); 
      used = filtered.length>0;
    }
    if(!used){
      const par=await fetchJSON(PARIS_ROAD_FALLBACK, 12000);
      const results=par?.results||[];
      const center={lat:48.825, lon:2.45};
      const seen=new Set(); const rows=[];
      for(const rec of results){
        const name=(rec.libelle||"").replace(/_/g," ").trim();
        if(!name || seen.has(name)) continue;
        const point=rec.geo_point_2d;
        if(point){
          const d=distanceKm(center.lat, center.lon, point.lat, point.lon);
          if(d>5) continue;
        }
        seen.add(name);
        rows.push({name,status:rec.etat_trafic||"—", time:rec.t_1h?new Date(rec.t_1h).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}):"--:--"});
        if(rows.length>=6) break;
      }
      cont.innerHTML = rows.length ? rows.map(r=>`<div class="course"><div class="badge-time">${r.time}</div><div class="course-name">${r.name}</div><div class="course-meta">${r.status}</div></div>`).join("") : `<div class="small">Pas de perturbation détectée.</div>`;
      if(fb) fb.textContent = "Source: SYTADIN / Ville de Paris (fallback).";
    }
  }catch(e){ console.error("Road", e); cont.innerHTML=`<div class='small'>Données routières indisponibles</div>`; }
}

// ============ Courses (1/jour + décompte) ============

function fmtCountdown(ts){
  const diff=ts-Date.now(); if(diff<=0) return "0:00:00";
  const s=Math.floor(diff/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
  return `${h}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
function renderCoursesList(nodeId, list){
  const cont=document.getElementById(nodeId); cont.innerHTML="";
  if(!list.length){ cont.innerHTML=`<div class='small'>Aucune course prévue aujourd’hui.</div>`; return; }
  list.forEach(c=>{
    const row=document.createElement("div"); row.className="course";
    row.innerHTML=`<div class='badge-time'>${c.heure}</div><div><div class='course-name'>${c.ref?c.ref+" – ":""}${c.nom}</div><div class='course-meta'>${c.distance} m • ${c.discipline}</div></div><div class='countdown' data-ts='${c.ts}'>${fmtCountdown(c.ts)}</div>`;
    cont.appendChild(row);
  });
}
function tickCountdowns(){ document.querySelectorAll(".countdown").forEach(el=>{ const ts=Number(el.getAttribute("data-ts")||0); el.textContent=fmtCountdown(ts); }); }
function loadCoursesCache(){ try{ const raw=localStorage.getItem("courses-cache"); if(!raw) return; const p=JSON.parse(raw); if(p?.date===todayISO()) dailyCoursesCache=p; }catch{} }
async function fetchDailyCourses(){
  const key=todayISO(); if(dailyCoursesCache.date===key && dailyCoursesCache.vin.length) return;
  const d=new Date();
  const yyyymmdd=`${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
  const data=await fetchJSON(PMU_DAILY(yyyymmdd), 15000);
  const vin=[], eng=[];
  if(data?.programme?.reunions){
    data.programme.reunions.forEach(r=>{
      const code=r.hippodrome?.code||"";
      const isVin=code==="VIN", isEng=code==="ENG";
      r.courses?.forEach(c=>{
        const start=new Date(c.heureDepart); if(Number.isNaN(start.getTime())) return;
        const obj={ ts:start.getTime(), heure:start.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}), nom:c.libelle, distance:c.distance||0, discipline:c.discipline||"", ref:r.numOfficiel&&c.numOrdre?`R${r.numOfficiel}C${c.numOrdre}`:"" };
        if(isVin) vin.push(obj); if(isEng) eng.push(obj);
      });
    });
  }
  vin.sort((a,b)=>a.ts-b.ts); eng.sort((a,b)=>a.ts-b.ts);
  dailyCoursesCache={ vin, eng, date:key };
  try{ localStorage.setItem("courses-cache", JSON.stringify(dailyCoursesCache)); }catch{}
}
async function refreshCoursesOncePerDayAndRender(){
  await fetchDailyCourses();
  renderCoursesList("courses-vincennes", dailyCoursesCache.vin);
  renderCoursesList("courses-enghien", dailyCoursesCache.eng);
}

// ============ Orchestration ============

async function renderLine1(){
  await renderBusForStop(STOP_IDS.HIPPODROME, "bus-hippodrome-body", "bus-hippodrome-alert", "bus-hippodrome-traffic");
}
async function renderLine2(){
  await Promise.all([
    renderBusForStop(STOP_IDS.BREUIL, "bus-breuil77-body", "bus-breuil77-alert", "bus-breuil77-traffic", ["C02251"]), // 77
    renderBusForStop(STOP_IDS.BREUIL, "bus-breuil201-body", "bus-breuil201-alert", "bus-breuil201-traffic", ["C01219"]) // 201
  ]);
}
async function renderLine3(){
  await renderRer();
}
async function renderLine4(){
  await renderBusForStop(STOP_IDS.JOINVILLE, "bus-joinville-body", "bus-joinville-alert", "bus-joinville-traffic");
}

// Ticker (bas de page)
function updateTicker(){
  const slot=document.getElementById("ticker-slot"); if(!slot) return;
  const clock=new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  const entries=[`${clock} • ${tickerData.timeWeather}`, tickerData.saint, tickerData.traffic].filter(Boolean);
  slot.textContent = entries.length ? entries[tickerIndex % entries.length] : "Chargement…";
  tickerIndex++;
}

// Boucles
function startLoops(){
  // Horloge & ticker
  setInterval(setClock, 1000);
  setInterval(()=>{ updateTicker(); setLastUpdate(); }, 10000);

  // Données fréquentes
  setInterval(refreshVelib, 30*1000);
  setInterval(async ()=>{ await Promise.all([ renderLine1(), renderLine2(), renderLine3(), renderLine4() ]); }, 60*1000);

  // Données moins fréquentes
  setInterval(refreshWeather, 10*60*1000); // météo : 10 min (conforme tableau)
  setInterval(refreshSaint,   24*60*60*1000);
  setInterval(refreshRoad,     5*60*1000);
  setInterval(refreshNews,    15*60*1000);
  setInterval(refreshTrafficBanner, 5*60*1000);

  // Décomptes courses
  setInterval(tickCountdowns, 1000);
}

// Init
(async function init(){
  setClock();

  // Chargement initial
  await Promise.allSettled([
    refreshWeather(),
    refreshSaint(),
    refreshNews(),
    refreshVelib(),
    refreshRoad(),
    refreshTrafficBanner(),
    renderLine1(),
    renderLine2(),
    renderLine3(),
    renderLine4(),
    refreshCoursesOncePerDayAndRender()
  ]);

  updateTicker();
  setLastUpdate();
  startLoops();
})();
