// =============================
// Dashboard IDFM – Debug build (UTF-8 safe, logs enabled)
// =============================

// Proxy (Open-Meteo direct)
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// ---- Endpoints ----
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
const SAINT_URL   = PROXY + encodeURIComponent('https://nominis.cef.fr/json/nominis.php');
const RSS_URL     = PROXY + encodeURIComponent("https://www.francetvinfo.fr/titres.rss");

// StopAreas
const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:",
  JOINVILLE: "STIF:StopArea:SP:70640:"
};

// PRIM/ODS helpers
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
  const stamp = Date.now();
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
    console.debug("GET JSON:", url, "→", r.status, `${Date.now()-stamp}ms`);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){
    console.error("fetchJSON ❌", url, e.message);
    return null;
  }
}
async function fetchText(url, timeout=12000){
  const stamp = Date.now();
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
    console.debug("GET TEXT:", url, "→", r.status, `${Date.now()-stamp}ms`);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }catch(e){
    console.error("fetchText ❌", url, e.message);
    return "";
  }
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
  const data=await fetchJSON(WEATHER_URL, 10000);
  const tempEl=document.getElementById("weather-temp");
  const descEl=document.getElementById("weather-desc");
  if(!data?.current_weather){
    if(descEl) descEl.textContent="Météo indisponible";
    tickerData.timeWeather="Météo indisponible";
    return;
  }
  const {temperature, weathercode}=data.current_weather;
  const t=`${Math.round(temperature)}°C`; if(tempEl) tempEl.textContent=t; if(descEl) descEl.textContent=weatherLabel(weathercode);
  tickerData.timeWeather=`${t} • ${weatherLabel(weathercode)}`;
  console.debug("MÉTÉO ✅", t, weathercode);
}
async function refreshSaint(){
  try{
    const data=await fetchJSON(SAINT_URL, 10000);
    const name=data?.response?.prenoms || "";
    const el=document.getElementById("saint"); if(el) el.textContent=name?`Fête : ${name}`:"Fête du jour";
    tickerData.saint = name ? `Fête : ${name}` : "";
    console.debug("SAINT ✅", name);
  }catch(e){ const el=document.getElementById("saint"); if(el) el.textContent="Fête du jour indisponible"; console.warn("SAINT ❌", e.message); }
}

// ==== News ====
async function refreshNews(){
  const xml=await fetchText(RSS_URL, 15000);
  let items=[];
  if(xml){
    try{
      const doc=new DOMParser().parseFromString(xml,"application/xml");
      items=[...doc.querySelectorAll("item")].slice(0,6).map(n=>({title:cleanText(n.querySelector("title")?.textContent||""), desc:cleanText(n.querySelector("description")?.textContent||"")}));
    }catch(e){ console.error("RSS parse ❌",e); }
  }
  newsItems=items; renderNews();
  console.debug("NEWS ✅", items.length, "items");
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
      console.debug("VÉLIB ✅", key, mech, elec, docks);
    }catch(e){ el.textContent="Indisponible"; console.warn("VÉLIB ❌", key, e.message); }
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
  console.debug("GENERAL MESSAGE ✅", msgs.length, "messages");
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
    block.innerHTML += placeholderDirHTML("Vers Boissy / Marne-la-Vallée","Service terminé");
  }
  cont.appendChild(block);

  await renderTrafficStripForLines(["C01742"], "rer-traffic");
  console.debug("RER A ✅", vParis.length, vBoissy.length);
}

// ==== Hippodrome 77 ====
async function renderHippo77(){
  const cont=document.getElementById("hippo77-body"); cont.innerHTML="";
  const data=await fetchJSON(PRIM_STOP(STOP_IDS.HIPPODROME), 12000);
  const visits=parseStop(data);
  const grouped=groupByLineAndDirection(visits,3);

  let target=null;
  for(const g of grouped){
    const m=await metaById(g.lineId);
    if((m.code||"").toUpperCase()==="77"){ target={ m, g }; break; }
  }
  const meta = target?.m || await metaByCode("77");
  const g = target?.g || { directions:[] };

  const block=document.createElement("div"); block.className="line-block";
  block.innerHTML=`<div class="line-header"><span class="pill" style="background:${meta.color};color:${meta.text}">${meta.code}</span><div class="name">Bus 77</div></div>`;

  if(g.directions.length){
    g.directions.slice(0,2).forEach(d=>{
      const rows=d.list.slice(0,3).map(cellHTML).join("");
      block.innerHTML += `<div class="dir">${d.dest}</div><div class="rows">${rows}</div>`;
    });
  }else{
    block.innerHTML += placeholderDirHTML("Direction 1","Pas de passage prévu");
    block.innerHTML += placeholderDirHTML("Direction 2","Pas de passage prévu");
  }
  cont.appendChild(block);

  await renderTrafficStripForLines(["C02251"], "hippo77-traffic");
  console.debug("HIPPO 77 ✅", g.directions?.length || 0);
}

// ==== Breuil 77 & 201 ====
async function renderBreuil77201(){
  await renderBreuilLine("77","breuil77-body");
  await renderBreuilLine("201","breuil201-body");
  await renderTrafficStripForLines(["C02251","C01219"], "breuil-traffic");
}
async function renderBreuilLine(code, nodeId){
  const cont=document.getElementById(nodeId); cont.innerHTML="";
  const data=await fetchJSON(PRIM_STOP(STOP_IDS.BREUIL), 12000);
  const visits=parseStop(data);
  const grouped=groupByLineAndDirection(visits,3);
  let target=null;
  for(const g of grouped){
    const m=await metaById(g.lineId);
    if((m.code||"").toUpperCase()===code){ target={ m, g }; break; }
  }
  const meta = target?.m || await metaByCode(code);
  const g = target?.g || { directions:[] };

  const block=document.createElement("div"); block.className="line-block";
  block.innerHTML=`<div class="line-header"><span class="pill" style="background:${meta.color};color:${meta.text}">${meta.code}</span><div class="name">Bus ${code}</div></div>`;

  if(g.directions.length){
    g.directions.slice(0,2).forEach(d=>{
      const rows=d.list.slice(0,3).map(cellHTML).join("");
      block.innerHTML += `<div class="dir">${d.dest}</div><div class="rows">${rows}</div>`;
    });
  }else{
    block.innerHTML += placeholderDirHTML("Direction 1","Pas de passage prévu");
    block.innerHTML += placeholderDirHTML("Direction 2","Pas de passage prévu");
  }
  cont.appendChild(block);
  console.debug("BREUIL", code, "✅", g.directions?.length || 0);
}

// ==== Joinville — Tous bus (hors RER) ====
const JOINVILLE_BUS_CODES = ["101","108","110","201","281","317","393","77","520","N33","N34","N35"];
const JOINVILLE_SPLIT = Math.ceil(JOINVILLE_BUS_CODES.length/2);
async function renderJoinvilleAll(){
  const data=await fetchJSON(PRIM_STOP(STOP_IDS.JOINVILLE), 12000);
  const visits=parseStop(data).filter(v=>v.lineId);

  const grouped=groupByLineAndDirection(visits,3);
  const mapByCode=new Map();
  for(const g of grouped){
    const m=await metaById(g.lineId);
    const code=(m.code||"").toUpperCase();
    if(code==="A") continue;
    mapByCode.set(code,{ meta:m, directions:g.directions });
  }

  const left=document.getElementById("joinville-col-left");
  const right=document.getElementById("joinville-col-right");
  left.innerHTML=""; right.innerHTML="";

  const renderLine = async (code, parent)=>{
    const meta = mapByCode.get(code)?.meta || await metaByCode(code);
    const dirs = mapByCode.get(code)?.directions || [];
    const block=document.createElement("div"); block.className="line-block";
    block.innerHTML=`<div class="line-header"><span class="pill" style="background:${meta.color};color:${meta.text}">${meta.code}</span><div class="name">Bus ${meta.code}</div></div>`;
    if(dirs.length){
      const dToShow = dirs.slice(0,2);
      dToShow.forEach(d=>{
        const rows=d.list.slice(0,3).map(cellHTML).join("");
        block.innerHTML += `<div class="dir">${d.dest}</div><div class="rows">${rows}</div>`;
      });
      if(dirs.length===1) block.innerHTML += placeholderDirHTML("Autre direction","Pas de passage prévu");
    }else{
      block.innerHTML += placeholderDirHTML("Direction 1","Pas de passage prévu");
      block.innerHTML += placeholderDirHTML("Direction 2","Pas de passage prévu");
    }
    parent.appendChild(block);
  };

  const leftList = JOINVILLE_BUS_CODES.slice(0, JOINVILLE_SPLIT);
  const rightList = JOINVILLE_BUS_CODES.slice(JOINVILLE_SPLIT);
  for(const code of leftList) await renderLine(code, left);
  for(const code of rightList) await renderLine(code, right);
  console.debug("JOINVILLE ALL ✅ rendu", mapByCode.size, "lignes");
}

// ==== Routier ====
function distanceKm(lat1, lon1, lat2, lon2){
  const R=6371, dLat=(lat2-lat1)*Math.PI/180, dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
async function refreshRoad(){
  const cont=document.getElementById("road-list"); const fb=document.getElementById("road-fallback");
  cont.textContent="Chargement…";
  try{
    let used=false;
    const syt=await fetchJSON(SYTADIN_JSON, 12000);
    if(syt && (Array.isArray(syt) || syt.records)){
      const entries=Array.isArray(syt)? syt : (syt.records||[]).map(r=>r.fields||r);
      const KEYS=["Périph","A4","A86","Vincennes","Joinville","Charenton"];
      const filtered=entries.filter(e=>e.libelle && KEYS.some(k=>new RegExp(k,"i").test(e.libelle))).slice(0,8);
      cont.innerHTML = filtered.map(e=>`<div class="course"><div class="badge-time">${e.horaire||""}</div><div class="course-name">${e.libelle||""}</div><div class="course-meta">${e.commentaire||e.indice_traffic||""}</div></div>`).join("");
      used = filtered.length>0;
      console.debug("SYTADIN ✅", filtered.length, "événements");
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
      console.debug("PARIS ROUTIER ✅", rows.length, "lignes");
    }
  }catch(e){ cont.innerHTML=`<div class='small'>Données routières indisponibles</div>`; console.warn("ROUTIER ❌", e.message); }
}

// ==== Courses (1/jour + décompte) ====
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
    row.innerHTML=`<div class='badge-time'>${c.heure}</div><div><div class='course-name'>${c.ref?c.ref+' – ':''}${c.nom}</div><div class='course-meta'>${c.distance} m • ${c.discipline}</div></div><div class='countdown' data-ts='${c.ts}'>${fmtCountdown(c.ts)}</div>`;
    cont.appendChild(row);
  });
}
function tickCountdowns(){ document.querySelectorAll(".countdown").forEach(el=>{ const ts=Number(el.getAttribute("data-ts")||0); el.textContent=fmtCountdown(ts); }); }
function loadCoursesCache(){ try{ const raw=localStorage.getItem("courses-cache"); if(!raw) return; const p=JSON.parse(raw); if(p?.date===todayISO()) dailyCoursesCache=p; }catch{} }
async function fetchDailyCourses(){
  const key=todayISO(); if(dailyCoursesCache.date===key && dailyCoursesCache.vin.length) return;
  const d=new Date(); const yyyymmdd=`${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
  const data=await fetchJSON(PMU_DAILY(yyyymmdd), 15000);
  const vin=[], eng=[];
  if(data?.programme?.reunions){
    data.programme.reunions.forEach(r=>{
      const code=r.hippodrome?.code||""; const isVin=code==="VIN", isEng=code==="ENG";
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
  console.debug("COURSES ✅", "VIN", vin.length, "ENG", eng.length);
}
async function refreshCoursesOncePerDayAndRender(){
  loadCoursesCache();
  await fetchDailyCourses();
  renderCoursesList("courses-vincennes", dailyCoursesCache.vin);
  renderCoursesList("courses-enghien", dailyCoursesCache.eng);
}

// ==== Ticker ====
function updateTicker(){
  const slot=document.getElementById("ticker-slot"); if(!slot) return;
  const clock=new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  const entries=[`${clock} • ${tickerData.timeWeather}`, tickerData.saint, tickerData.traffic].filter(Boolean);
  slot.textContent = entries.length ? entries[tickerIndex % entries.length] : "Chargement…";
  tickerIndex++;
}

// ==== Orchestration ====
async function renderLine1(){
  await Promise.all([ renderRerA(), renderHippo77(), renderBreuil77201() ]);
}
async function renderLine2(){
  await renderJoinvilleAll();
}

function startLoops(){
  setInterval(setClock, 1000);
  setInterval(()=>{ updateTicker(); setLastUpdate(); }, 10000);

  setInterval(refreshVelib, 30*1000);
  setInterval(async ()=>{ await Promise.all([ renderLine1(), renderLine2() ]); }, 60*1000);

  setInterval(refreshWeather, 30*60*1000);
  setInterval(refreshSaint,   24*60*60*1000);
  setInterval(refreshRoad,     5*60*1000);
  setInterval(refreshNews,    15*60*1000);
  setInterval(refreshTrafficBanner, 5*60*1000);
  setInterval(tickCountdowns, 1000);
}

(async function init(){
  console.debug("INIT ▶");
  setClock();
  await Promise.allSettled([
    refreshWeather(),
    refreshSaint(),
    refreshNews(),
    refreshVelib(),
    refreshRoad(),
    refreshTrafficBanner(),
    renderLine1(),
    renderLine2(),
    refreshCoursesOncePerDayAndRender()
  ]);
  updateTicker();
  setLastUpdate();
  startLoops();
  console.debug("INIT ✅ prêt");
})();
