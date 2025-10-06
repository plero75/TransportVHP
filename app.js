// -----------------------------------------------------------------------------
// Logique dynamique – Dashboard Hippodrome Paris-Vincennes
// -----------------------------------------------------------------------------

// === Endpoints ===
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// météo : direct (CORS OK)
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
// RSS : via proxy
const RSS_URL = `${PROXY}https://www.francetvinfo.fr/titres.rss`;
// Saint du jour : via proxy
const SAINT_URL = `${PROXY}https://nominis.cef.fr/json/nominis.php`;

// PRIM stop ids
const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  JOINVILLE: "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:"
};

// PRIM helpers
const PRIM_STOP = (ref) => `${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${encodeURIComponent(ref)}`;
const PRIM_GENERAL = (lineId) => `${PROXY}https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${encodeURIComponent(lineId)}`;

// GTFS line meta
const GTFS_LINE_URL = (lineId) =>
  `${PROXY}https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=id_line%3D%22${lineId}%22&limit=1`;

// Vélib
const VELIB_STATIONS = { VINCENNES: "12163", BREUIL: "12128" };
const VELIB_URL = (id) =>
  `${PROXY}https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records?where=stationcode%3D${encodeURIComponent(id)}&limit=1`;

// Sytadin
const SYTADIN_JSON = `${PROXY}https://opendata.sytadin.fr/velc/SYTR.json`;

// Courses PMU (daily)
const PMU_DAILY = (yyyymmdd) =>
  `${PROXY}https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${yyyymmdd}`;

// === État ===
let newsItems = [];
let currentNews = 0;
let lineMetaCache = new Map();
let tickerIndex = 0;
let tickerData = { timeWeather: "", saint: "", traffic: "" };

let dailyCoursesCache = { vin: [], eng: [], date: "" };

// === Utils ===
async function fetchJSON(url, timeout=12000) {
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"});
    clearTimeout(t); if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ console.error("fetchJSON",url,e.message); return null; }
}
async function fetchText(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"});
    clearTimeout(t); if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }catch(e){ console.error("fetchText",url,e.message); return ""; }
}
function cleanText(s=""){return s.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
function minutesFromISO(iso){ if(!iso) return null; return Math.max(0, Math.round((new Date(iso).getTime()-Date.now())/60000)); }
function hhmm(iso){ if(!iso) return "—:—"; const d=new Date(iso); return d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function setClock(){
  const d=new Date();
  const elDate=document.getElementById("date");
  const elClock=document.getElementById("clock");
  if(elDate) elDate.textContent=d.toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  if(elClock) elClock.textContent=d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
}
function setLastUpdate(){ const el=document.getElementById("lastUpdate"); if(el) el.textContent=`Maj ${new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}`; }

// === Météo & Saint ===
const WEATHER_CODES = {
  0:"Ciel dégagé",1:"Ciel dégagé",2:"Éclaircies",3:"Ciel couvert",45:"Brouillard",48:"Brouillard givrant",
  61:"Pluie faible",63:"Pluie",65:"Pluie forte",80:"Averses",81:"Averses",82:"Forte averse",95:"Orages",96:"Orages grêle",99:"Orages grêle"
};
function weatherLabel(code){ return WEATHER_CODES[code] || "Météo"; }
async function refreshWeather(){
  const data=await fetchJSON(WEATHER_URL,10000);
  const tempEl=document.getElementById("weather-temp");
  const descEl=document.getElementById("weather-desc");
  if(!data?.current_weather){ if(descEl) descEl.textContent="Météo indisponible"; tickerData.timeWeather="Météo indisponible"; return; }
  const {temperature,weathercode}=data.current_weather;
  const tempStr=`${Math.round(temperature)}°C`;
  if(tempEl) tempEl.textContent=tempStr;
  if(descEl) descEl.textContent=weatherLabel(weathercode);
  tickerData.timeWeather=`${tempStr} • ${weatherLabel(weathercode)}`;
}
async function refreshSaint(){
  try{
    const data=await fetchJSON(SAINT_URL,10000);
    const name=data?.response?.prenoms||"";
    const el=document.getElementById("saint");
    if(el) el.textContent=name?`Fête : ${name}`:"Fête du jour";
    tickerData.saint=name?`Fête : ${name}`:"";
  }catch{
    const el=document.getElementById("saint");
    if(el) el.textContent="Fête du jour indisponible";
  }
}

// === News France Info ===
async function refreshNews(){
  const xml=await fetchText(RSS_URL,15000); let items=[];
  if(xml){
    try{
      const doc=new DOMParser().parseFromString(xml,"application/xml");
      items=[...doc.querySelectorAll("item")].slice(0,6).map(n=>({
        title: cleanText(n.querySelector("title")?.textContent||""),
        desc: cleanText(n.querySelector("description")?.textContent||"")
      }));
    }catch(e){ console.error("RSS parse",e); }
  }
  newsItems=items; renderNews();
}
function renderNews(){
  const cont=document.getElementById("news-carousel"); if(!cont) return;
  cont.innerHTML="";
  if(!newsItems.length){ cont.textContent="Actualités indisponibles"; return; }
  newsItems.forEach((it,idx)=>{
    const d=document.createElement("div");
    d.className="news-card"+(idx===currentNews?" active":"");
    d.innerHTML=`<div class="news-title">${it.title}</div><div class="news-desc">${it.desc}</div>`;
    cont.appendChild(d);
  });
}
function nextNews(){ if(!newsItems.length) return; currentNews=(currentNews+1)%newsItems.length; renderNews(); }

// === Vélib (30s) ===
async function refreshVelib(){
  const upd=async(key,id)=>{
    const el=document.getElementById(`velib-${key.toLowerCase()}`); if(!el) return;
    try{
      const data=await fetchJSON(VELIB_URL(id),10000);
      const st=data?.results?.[0];
      if(!st){ el.textContent="Indisponible"; return; }
      const mech=st.mechanical_bikes??0, elec=st.ebike_bikes??0, docks=st.numdocksavailable??0;
      el.textContent=`Vélos méca ${mech} • élec ${elec} • bornes ${docks}`;
    }catch(e){ console.error("Vélib",key,e.message); el.textContent="Indisponible"; }
  };
  await Promise.all([upd("vincennes",VELIB_STATIONS.VINCENNES), upd("breuil",VELIB_STATIONS.BREUIL)]);
}

// === PRIM parsing + statuts étendus ===
function parseStop(data){
  const visits=data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit;
  if(!Array.isArray(visits)) return [];
  return visits.map(v=>{
    const mv=v.MonitoredVehicleJourney||{}; const call=mv.MonitoredCall||{};
    const lineRef=mv.LineRef?.value||mv.LineRef||""; const lineId=(lineRef.match(/C\d{5}/)||[null])[0];
    const dest=cleanText(call.DestinationDisplay?.[0]?.value||"");
    const expected=call.ExpectedDepartureTime||call.ExpectedArrivalTime||null;
    const aimed=call.AimedDepartureTime||call.AimedArrivalTime||null;
    const minutes=minutesFromISO(expected);
    const depStatus=(call.DepartureStatus?.value||call.DepartureStatus||"").toLowerCase();
    const arrStatus=(call.ArrivalStatus?.value||call.ArrivalStatus||"").toLowerCase();
    const progress=(Array.isArray(mv.ProgressStatus)?mv.ProgressStatus.map(x=>x?.value||x).join(" "):(mv.ProgressStatus?.value||mv.ProgressStatus||"")).toLowerCase();
    // retard = Expected vs Aimed
    let delayMin=null;
    if(expected&&aimed){
      const d=(new Date(expected)-new Date(aimed))/60000;
      if(Number.isFinite(d) && Math.round(d)!==0) delayMin=Math.max(0,Math.round(d));
    }
    // flags
    const cancelled= /cancel|annul|supprim/.test(depStatus+arrStatus+progress);
    const notStopping= /notstopping|non desservi/.test(depStatus+arrStatus+progress);
    const movedStop= /moved|déplac/.test(progress);
    const serviceEnded= /(no service|termin)/.test(depStatus+arrStatus+progress);
    const first= /first/.test(progress);
    const last= /last/.test(progress);

    return { lineId, dest: dest||"—", minutes, expected, aimed, delayMin, cancelled, notStopping, movedStop, serviceEnded, first, last };
  });
}

async function fetchLineMeta(lineId){
  if(!lineId) return { code:"—", color:"#2450a4", textColor:"#fff" };
  if(lineMetaCache.has(lineId)) return lineMetaCache.get(lineId);
  const data=await fetchJSON(GTFS_LINE_URL(lineId),10000);
  let meta={ code: lineId||"—", color:"#2450a4", textColor:"#fff" };
  if(data?.results?.length){
    const e=data.results[0];
    meta={ code:e.shortname_line||e.name_line||lineId, color:e.colourweb_hexa||"#0055c8", textColor:e.textcolourweb_hexa||"#fff" };
  }
  lineMetaCache.set(lineId,meta);
  return meta;
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
    return { lineId:g.lineId, dest:g.dest, list:sorted };
  });
}

function renderTimeCell(v){
  const cls = v.cancelled ? "time-box cancelled"
           : v.delayMin>0 ? "time-box delay"
           : v.minutes===0 ? "time-box imminent"
           : "time-box";
  const minuteLabel = Number.isFinite(v.minutes) ? v.minutes : "—";
  const aimedLine = v.aimed ? `<div class="time-sub">Prévu ${hhmm(v.aimed)}</div>` : "";
  const exactLine = v.expected ? `<div class="time-sub">Estimé ${hhmm(v.expected)}</div>` : "";

  let info = "";
  if (v.cancelled) info = `<div class="info-sub cancelled">Supprimé</div>`;
  else if (v.notStopping) info = `<div class="info-sub cancelled">Non desservi</div>`;
  else if (v.movedStop) info = `<div class="info-sub delay">Arrêt déplacé</div>`;
  else if (v.delayMin>0) info = `<div class="info-sub delay">Retardé de +${v.delayMin} min</div>`;
  else if (v.first) info = `<div class="info-sub ok">Premier passage</div>`;
  else if (v.last) info = `<div class="info-sub ok">Dernier passage</div>`;
  else if (v.serviceEnded) info = `<div class="info-sub service">Service terminé</div>`;

  return `
    <div class="time-wrap">
      <span class="${cls}">${minuteLabel}</span>
      ${aimedLine}${exactLine}${info}
    </div>
  `;
}

async function renderRer(){
  const cont=document.getElementById("rer-body");
  cont.textContent="Chargement…";
  const data=await fetchJSON(PRIM_STOP(STOP_IDS.RER_A),12000);
  const groups=groupByLineDest(parseStop(data),3).slice(0,6);
  cont.innerHTML="";
  for(const g of groups){
    const row=document.createElement("div"); row.className="row";
    row.innerHTML=`
      <span class="line-pill rer-a">A</span>
      <div class="dest">${g.dest}</div>
      <div class="times">${g.list.map(renderTimeCell).join("")}</div>
    `;
    cont.appendChild(row);
  }
  if(!groups.length){
    cont.innerHTML=`<div class="small">Pas de passage prévu. Le panneau reste affiché.</div>`;
  }
}

async function renderBusForStop(stopId, bodyId){
  const cont=document.getElementById(bodyId);
  cont.textContent="Chargement…";
  const data=await fetchJSON(PRIM_STOP(stopId),12000);
  const groups=groupByLineDest(parseStop(data),3);
  cont.innerHTML="";
  if(!groups.length){ cont.innerHTML=`<div class="small">Aucun passage prévu. Le panneau reste affiché.</div>`; return; }
  for(const g of groups){
    const meta=await fetchLineMeta(g.lineId);
    const row=document.createElement("div"); row.className="row";
    row.innerHTML=`
      <span class="line-pill" style="background:${meta.color};color:${meta.textColor}">${meta.code}</span>
      <div class="dest">${g.dest}</div>
      <div class="times">${g.list.map(renderTimeCell).join("")}</div>
    `;
    cont.appendChild(row);
  }
}

async function renderLine1(){
  await Promise.all([
    renderBusForStop(STOP_IDS.HIPPODROME,"bus-hippodrome-body"),
    renderBusForStop(STOP_IDS.BREUIL,"bus-breuil-body"),
    renderRer()
  ]);
}

async function renderLine2(){
  const contRer=document.getElementById("rer-col");
  const contBus=document.getElementById("bus-joinville-body");
  contRer.textContent="Chargement…";
  contBus.textContent="Chargement…";
  const dataRer=await fetchJSON(PRIM_STOP(STOP_IDS.RER_A),12000);
  const groupsRer=groupByLineDest(parseStop(dataRer),3).slice(0,10);
  contRer.innerHTML="";
  for(const g of groupsRer){
    const row=document.createElement("div"); row.className="row";
    row.innerHTML=`
      <span class="line-pill rer-a">A</span>
      <div class="dest">${g.dest}</div>
      <div class="times">${g.list.map(renderTimeCell).join("")}</div>
    `;
    contRer.appendChild(row);
  }
  const dataJoin=await fetchJSON(PRIM_STOP(STOP_IDS.JOINVILLE),12000);
  const groupsBus=groupByLineDest(parseStop(dataJoin),3);
  contBus.innerHTML="";
  for(const g of groupsBus){
    const meta=await fetchLineMeta(g.lineId);
    const row=document.createElement("div"); row.className="row";
    row.innerHTML=`
      <span class="line-pill" style="background:${meta.color};color:${meta.textColor}">${meta.code}</span>
      <div class="dest">${g.dest}</div>
      <div class="times">${g.list.map(renderTimeCell).join("")}</div>
    `;
    contBus.appendChild(row);
  }
}

// === Trafic banner (general-message) ===
async function refreshTrafficBanner(){
  const ids=["STIF:Line::C01742:","STIF:Line::C02251:","STIF:Line::C01219:"]; // RER A, 77, 201
  const msgs=[];
  await Promise.all(ids.map(async id=>{
    const data=await fetchJSON(PRIM_GENERAL(id),10000);
    const deliveries=data?.Siri?.ServiceDelivery?.GeneralMessageDelivery||[];
    deliveries.forEach(del=> (del.InfoMessage||[]).forEach(m=>{
      const txt=cleanText(m?.Content?.Message?.[0]?.MessageText?.[0]?.value||m?.Description||"");
      if(txt) msgs.push({id,txt});
    }));
  }));
  const banner=document.getElementById("traffic-banner");
  if(!msgs.length){ banner.className="traffic-banner ok"; banner.textContent="Trafic normal sur les lignes suivies."; }
  else { banner.className="traffic-banner alert"; banner.textContent=msgs.map(m=>`[${m.id}] ${m.txt}`).join(" • "); }
  tickerData.traffic=banner.textContent;
}

// === Sytadin (fallback liste) ===
async function refreshRoad(){
  const cont=document.getElementById("road-list");
  const fb=document.getElementById("road-fallback");
  cont.textContent="Chargement…";
  try{
    const data=await fetchJSON(SYTADIN_JSON,12000);
    const arr=Array.isArray(data)?data:(data?.records||[]).map(r=>r.fields||r);
    const KEYWORDS=["Périph","A4","A86","Vincennes","Joinville","Charenton"];
    const filtered=arr.filter(e=>e.libelle && KEYWORDS.some(k=>new RegExp(k,"i").test(e.libelle))).slice(0,8);
    cont.innerHTML="";
    if(!filtered.length){ cont.innerHTML=`<div class="small">Pas de perturbation détectée à proximité.</div>`; }
    else{
      filtered.forEach(e=>{
        const row=document.createElement("div"); row.className="course";
        row.innerHTML=`<div class="badge-time">${e.horaire||""}</div><div class="course-name">${e.libelle||""}</div><div class="course-meta">${e.commentaire||e.indice_traffic||""}</div>`;
        cont.appendChild(row);
      });
    }
    if(fb) fb.textContent="Si la carte n’apparait pas, Sytadin limite l’intégration. Les événements principaux sont listés à droite.";
  }catch(e){ console.error("Sytadin",e); cont.innerHTML=`<div class="small">Données routières indisponibles</div>`; }
}

// === Courses — 1 fetch / jour + compte à rebours ===
function formatCountdown(ts){
  const diff=ts-Date.now(); if(diff<=0) return "0:00:00";
  const s=Math.floor(diff/1000), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), ss=s%60;
  return `${String(h)}:${String(m).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
function renderCoursesList(nodeId, list){
  const cont=document.getElementById(nodeId); cont.innerHTML="";
  if(!list.length){ cont.innerHTML=`<div class="small">Aucune course prévue aujourd’hui.</div>`; return; }
  list.forEach(c=>{
    const row=document.createElement("div"); row.className="course";
    row.innerHTML=`
      <div class="badge-time">${c.heure}</div>
      <div><div class="course-name">${c.ref?c.ref+" – ":""}${c.nom}</div><div class="course-meta">${c.distance} m • ${c.discipline}</div></div>
      <div class="countdown" data-ts="${c.ts}">${formatCountdown(c.ts)}</div>`;
    cont.appendChild(row);
  });
}
function tickCountdowns(){ document.querySelectorAll(".countdown").forEach(el=>{ const ts=Number(el.getAttribute("data-ts")||0); el.textContent=formatCountdown(ts); }); }

function loadCoursesCache(){ try{ const raw=localStorage.getItem("courses-cache"); if(!raw) return; const p=JSON.parse(raw); if(p?.date===todayISO()) dailyCoursesCache=p; }catch{} }
async function fetchDailyCourses(){
  const key=todayISO(); if(dailyCoursesCache.date===key && dailyCoursesCache.vin.length) return;
  const d=new Date();
  const yyyymmdd=`${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
  const data=await fetchJSON(PMU_DAILY(yyyymmdd),15000);
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

// === Ticker ===
function updateTicker(){
  const slot=document.getElementById("ticker-slot"); if(!slot) return;
  const clock=new Date().toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  const entries=[`${clock} • ${tickerData.timeWeather}`, tickerData.saint, tickerData.traffic].filter(Boolean);
  slot.textContent= entries.length? entries[tickerIndex%entries.length] : "Chargement…";
  tickerIndex++;
}

// === Boucles ===
function startLoops(){
  setInterval(setClock,1000);
  setInterval(()=>{updateTicker(); setLastUpdate();},10000);

  setInterval(refreshVelib, 30*1000);

  setInterval(async ()=>{ await Promise.all([ renderLine1(), renderLine2() ]); }, 60*1000);

  setInterval(refreshWeather, 30*60*1000);
  setInterval(refreshSaint, 30*60*1000);
  setInterval(refreshRoad, 5*60*1000);
  setInterval(refreshNews, 15*60*1000);
  setInterval(refreshTrafficBanner, 5*60*1000);

  setInterval(tickCountdowns, 1000); // synchro horloge pour courses
}

// === Init ===
(async function init(){
  setClock();
  loadCoursesCache();
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
})();
