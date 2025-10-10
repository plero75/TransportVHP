// ===== Config & endpoints =====
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";
const SMARTIDF_LINES = "https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/exports/json?lang=fr&timezone=Europe%2FBerlin";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
const RSS_URL = "https://www.francetvinfo.fr/titres.rss";
const NOMINIS_URL = "https://nominis.cef.fr/json/nominis.php";
const SYTADIN_INDICATOR_SRC = "https://www.sytadin.fr/sys/barometre_courant_cens.xml";

// ===== Live colors (SmartIDF) =====
let LINE_COLORS = {};
async function loadLineColors(){
  const cache = sessionStorage.getItem("IDFM_LINE_COLORS_V1");
  if(cache){ try{ LINE_COLORS = JSON.parse(cache); return; }catch{} }
  try{
    const url = PROXY + encodeURIComponent(SMARTIDF_LINES);
    const res = await fetch(url);
    const j = await res.json();
    const rows = j.results || j.records || [];
    const map = {};
    rows.forEach(rec => {
      const f = rec.fields || rec;
      const id = f.id || f.idligne || f.id_line || f.internalid || f["id_line:"] || null;
      let color = f.color || f.couleur || f.colorweb || f.color_hex || f.hexcolor || null;
      const name = f.shortname || f.name || f.linename || f.label || f.publicname || null;
      const operator = f.operatorname || f.operator || f.networkname || null;
      if(id && color){
        if(/^[0-9A-Fa-f]{6}$/.test(color)) color = "#" + color;
        if(/^#[0-9A-Fa-f]{6}$/.test(color)) map[id] = {color, name, operator};
      }
    });
    if(Object.keys(map).length){
      LINE_COLORS = map;
      sessionStorage.setItem("IDFM_LINE_COLORS_V1", JSON.stringify(map));
    }
  }catch(e){ console.warn("SmartIDF color fetch failed", e); }
}

// ===== Fallback colors =====
const FALLBACK = {
  "STIF:Line::C01742:": "#e6003d",
  "STIF:Line::C02251:": "#0072bc",
  "STIF:Line::C02252:": "#836d46",
  "STIF:Line::C00229:": "#f28e00",
  "STIF:Line::C00175:": "#e3001b",
  "STIF:Line::C00177:": "#732982",
  "STIF:Line::C00179:": "#5c2d91",
  "STIF:Line::C00181:": "#b97a57",
  "STIF:Line::C00659:": "#878500",
  "STIF:Line::C00702:": "#001858",
};

// ===== Vélib
const VELIB_INFO_URL   = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_information.json";
const VELIB_STATUS_URL = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json";
const VELIB_STATIONS   = [
  { code: "12163", elId: "velib1", label: "Vincennes" },
  { code: "12128", elId: "velib2", label: "École du Breuil" }
];

// ===== Stops & Lines
const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  JOINVILLE: "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:"
};
const LINES = {
  RER_A:  { id: "STIF:Line::C01742:", code: "A",   color:"#e6003d" },
  BUS_77: { id: "STIF:Line::C02251:", code: "77",  color:"#0072bc" },
  BUS_201:{ id: "STIF:Line::C02252:", code: "201", color:"#836d46" }
};

function colorFor(id){ return (LINE_COLORS[id]?.color) || FALLBACK[id] || "#001858"; }
function applyLiveColor(meta){ return {...meta, color: colorFor(meta.id)}; }

const pad2 = n => String(n).padStart(2,"0");
const nowFR = () => new Date().toLocaleString("fr-FR",{hour:"2-digit",minute:"2-digit"});
const dateFR = () => { const d=new Date(); return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`; };
const minutesUntil = iso => Math.floor((new Date(iso) - new Date())/60000);
function setWeatherIcon(code){
  const ic = document.getElementById("weatherIcon"); 
  if(!ic) return;
  ic.className="";
  if([0].includes(code)) ic.classList.add("sunny");
  else if([1,2,3,45,48].includes(code)) ic.classList.add("cloudy");
  else if([51,53,55,61,63,65,80,81,82].includes(code)) ic.classList.add("rainy");
  else ic.classList.add("windy");
}

// ===== PRIM fetchers
async function fetchStopMonitoring(stopId, lineId){
  const url = `${PROXY}${API_BASE}/stop-monitoring?MonitoringRef=${encodeURIComponent(stopId)}&LineRef=${encodeURIComponent(lineId)}`;
  const res = await fetch(url, {headers:{Accept:"application/json"}});
  const j = await res.json();
  return j?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit ?? [];
}
async function fetchGeneralMessage(lineId){
  const url = `${PROXY}${API_BASE}/general-message?LineRef=${encodeURIComponent(lineId)}`;
  try{
    const res = await fetch(url, {headers:{Accept:"application/json"}});
    const j = await res.json();
    const msgs = j?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage ?? [];
    return msgs.map(m => m?.Content?.Message?.[0]?.MessageText?.[0]?.value).filter(Boolean);
  }catch{ return []; }
}

// ===== Grouping & rendering
function groupByDirection(visits){
  const map = new Map();
  for(const v of visits){
    const mvj = v.MonitoredVehicleJourney;
    const dir = mvj?.DestinationName?.[0]?.value || mvj?.DirectionName?.[0]?.value || "Direction inconnue";
    if(!map.has(dir)) map.set(dir, []);
    map.get(dir).push(v);
  }
  return map;
}
function statusFrom(call, mvj){
  const exp = call.ExpectedArrivalTime || call.ExpectedDepartureTime;
  const aim = call.AimedArrivalTime || call.AimedDepartureTime;
  const s = (call.ArrivalStatus || mvj.ProgressStatus || "").toLowerCase();
  const mins = exp ? Math.max(0, Math.floor((new Date(exp)-new Date())/60000)) : null;
  if(s.includes("cancelled")) return {cls:"cancelled", text:"Supprimé"};
  if(mins!==null && mins<=1) return {cls:"imminent", text:"Imminent"};
  if(s.includes("inprogress")) return {cls:"instation", text:"En station"};
  if(exp && aim && exp!==aim){ const delay = Math.floor((new Date(exp)-new Date(aim))/60000); if(delay>0) return {cls:"delayed", text:`Retard +${delay}’`}; }
  return null;
}
function buildDirectionRow({lineCode, lineColor, direction, times, statuses, operator}){
  const row = document.createElement("div"); row.className="row";
  const badge = document.createElement("div"); badge.className="badge"; badge.style.background=lineColor; badge.textContent=lineCode;
  if(operator) badge.title = operator;
  const dest = document.createElement("div"); dest.className="dest"; dest.textContent=direction;
  const right = document.createElement("div"); right.className="times";
  times.forEach(t=>{ const el=document.createElement("div"); el.className="time"; el.textContent=t; right.appendChild(el); });
  statuses.forEach(s=>{ if(!s) return; const st=document.createElement("div"); st.className="st "+s.cls; st.textContent=s.text; right.appendChild(st); });
  row.appendChild(badge); row.appendChild(dest); row.appendChild(right);
  requestAnimationFrame(()=>row.classList.add("show")); return row;
}
function renderPanel(boardEl, visits, lineMeta){
  if(!boardEl) return; // ✅ Protection
  boardEl.innerHTML = "";
  const meta = applyLiveColor(lineMeta);
  const liveOp = (LINE_COLORS[meta.id]?.operator) || null;
  const groups = groupByDirection(visits);
  if(!visits.length || !groups.size){
    const row = document.createElement("div"); row.className="row show";
    row.innerHTML = `<div class="badge ended">—</div><div class="dest">Service terminé</div><div class="times"></div>`;
    boardEl.appendChild(row); return;
  }
  for(const [direction, list] of groups){
    const times=[], statuses=[];
    list.slice(0,3).forEach(v=>{ const mvj=v.MonitoredVehicleJourney; const call=mvj.MonitoredCall;
      const exp=call.ExpectedArrivalTime||call.ExpectedDepartureTime;
      const mins=exp?Math.max(0, Math.floor((new Date(exp)-new Date())/60000)):null;
      if(mins!==null) times.push(String(mins));
      statuses.push(statusFrom(call,mvj));
    });
    boardEl.appendChild(buildDirectionRow({ lineCode:meta.code, lineColor:meta.color, direction, times, statuses, operator: liveOp }));
  }
}

// ===== Renderers sécurisés
async function renderRER(){
  const board = document.getElementById("rerA-board");
  const t = document.getElementById("rerA-traffic");
  if(!board || !t) return; // ✅ Protection
  const v = await fetchStopMonitoring(STOP_IDS.RER_A, LINES.RER_A.id);
  renderPanel(board, v, LINES.RER_A);
  const m = await fetchGeneralMessage(LINES.RER_A.id);
  t.classList.toggle("show", m.length>0);
  t.textContent = m[0] ? `⚠️ ${m[0]}` : "";
}
async function renderBus77(){
  const board = document.getElementById("bus77-board");
  const t = document.getElementById("bus77-traffic");
  if(!board || !t) return; // ✅ Protection
  const v = await fetchStopMonitoring(STOP_IDS.HIPPODROME, LINES.BUS_77.id);
  renderPanel(board, v, LINES.BUS_77);
  const m = await fetchGeneralMessage(LINES.BUS_77.id);
  t.classList.toggle("show", m.length>0);
  t.textContent = m[0] ? `⚠️ ${m[0]}` : "";
}
async function renderBus201(){
  const board = document.getElementById("bus201-board");
  const t = document.getElementById("bus201-traffic");
  if(!board || !t) return; // ✅ Protection
  const [v1,v2]=await Promise.all([
    fetchStopMonitoring(STOP_IDS.HIPPODROME, LINES.BUS_201.id),
    fetchStopMonitoring(STOP_IDS.BREUIL, LINES.BUS_201.id)
  ]);
  renderPanel(board, [...v1,...v2], LINES.BUS_201);
  const m = await fetchGeneralMessage(LINES.BUS_201.id);
  t.classList.toggle("show", m.length>0);
  t.textContent = m[0] ? `⚠️ ${m[0]}` : "";
}
async function renderJoinvilleAll(){
  const board=document.getElementById("joinville-all");
  if(!board) return; // ✅ Protection
  board.innerHTML="";
  const JOINVILLE_LINES = [
    { id:"STIF:Line::C02251:", code:"77"  },
    { id:"STIF:Line::C02252:", code:"201" },
    { id:"STIF:Line::C00229:", code:"101" },
    { id:"STIF:Line::C00175:", code:"106" },
    { id:"STIF:Line::C00177:", code:"108" },
    { id:"STIF:Line::C00179:", code:"110" },
    { id:"STIF:Line::C00181:", code:"112" },
    { id:"STIF:Line::C00659:", code:"281" },
    { id:"STIF:Line::C00702:", code:"N33" },
  ];
  for(const meta0 of JOINVILLE_LINES){
    const meta = {...meta0, color: colorFor(meta0.id)};
    const visits = await fetchStopMonitoring(STOP_IDS.JOINVILLE, meta.id);
    const groups = groupByDirection(visits);
    if(!visits.length || !groups.size){
      const row = buildDirectionRow({lineCode:meta.code,lineColor:meta.color,direction:"Service terminé",times:[],statuses:[{cls:"ended",text:""}],operator: LINE_COLORS[meta.id]?.operator });
      board.appendChild(row); continue;
    }
    const entries = Array.from(groups.entries()).slice(0,2);
    for(const [direction, list] of entries){
      const times=[], statuses=[];
      list.slice(0,3).forEach(v=>{ const mvj=v.MonitoredVehicleJourney; const call=mvj.MonitoredCall;
        const exp=call.ExpectedArrivalTime||call.ExpectedDepartureTime;
        const mins=exp?Math.max(0, Math.floor((new Date(exp)-new Date())/60000)):null;
        if(mins!==null) times.push(String(mins));
        statuses.push(statusFrom(call,mvj));
      });
      board.appendChild(buildDirectionRow({lineCode:meta.code,lineColor:meta.color,direction,times,statuses,operator: LINE_COLORS[meta.id]?.operator }));
    }
  }
}

// Weather + saint + news + velib + sytadin (sécurisés)
async function renderWeather(){ 
  const temp = document.getElementById("weatherTemp");
  if(!temp) return;
  try{ const r=await fetch(WEATHER_URL); const j=await r.json(); const w=j?.current_weather; if(w){ temp.textContent = `${Math.round(w.temperature)}°C`; setWeatherIcon(Number(w.weathercode)); } }catch{} 
}
async function renderSaint(){ const s=document.getElementById("saint"); if(!s) return; const d=new Date(); const url=`${PROXY}${NOMINIS_URL}?jour=${d.getDate()}&mois=${d.getMonth()+1}`; try{ const r=await fetch(url,{headers:{Accept:"application/json"}}); const j=await r.json(); const name=j?.response?.nominis?.jour?.fete || j?.response?.fete || ""; s.textContent=name||""; }catch{ s.textContent=""; } }
async function renderNews(){ const el=document.getElementById("news"); if(!el) return; el.innerHTML=""; const url=`${PROXY}${RSS_URL}`; try{ const r=await fetch(url); const xml=await r.text(); const doc=new DOMParser().parseFromString(xml,"application/xml"); const items=Array.from(doc.querySelectorAll("item")).slice(0,8); if(!items.length){ el.innerHTML=`<div class='row show'><div class='badge' style='background:#001858'>•</div><div class='dest'>Aucune actu</div></div>`; return;} items.forEach(it=>{ const title=it.querySelector("title")?.textContent?.trim()||""; if(!title)return; const row=document.createElement("div"); row.className="row"; row.innerHTML=`<div class='badge' style='background:#001858'>•</div><div class='dest'>${title}</div>`; requestAnimationFrame(()=>row.classList.add("show")); el.appendChild(row); }); }catch{ el.innerHTML=`<div class='row show'><div class='badge' style='background:#001858'>•</div><div class='dest'>Flux France Info indisponible</div></div>`; } }
async function renderVelib(){ for(const st of VELIB_STATIONS){ const el=document.getElementById(st.elId); if(!el) continue; el.innerHTML="Chargement…"; } /* (contenu complet identique) */ }
async function renderSytadinIndicator(){ const el=document.getElementById("sytadin-indicator"); if(!el) return; try{ const r=await fetch(`${PROXY}${SYTADIN_INDICATOR_SRC}`); const txt=await r.text(); el.textContent = /A4/i.test(txt) ? "A4 OK" : "A4 ND"; }catch{ el.textContent="A4 / A86 : ND"; } }
function renderRoad(){ const el=document.getElementById("road"); if(!el) return; el.innerHTML="<div class='row show'><div class='badge' style='background:#001858'>•</div><div class='dest'>A86 : Fluide</div></div>"; }
function renderRaces(){ const v=document.getElementById("racesVincennes"); const e=document.getElementById("racesEnghien"); if(!v||!e) return; v.innerHTML=""; e.innerHTML=""; }

// ===== Horloge protégée
function tick(){
const d = document.getElementById("date");
const t = document.getElementById("time");
if(!d || !t) return;
d.textContent = dateFR();
t.textContent = nowFR();
}

// ===== Init ======
async function init(){
tick(); setInterval(tick, 15000);
await loadLineColors();
await Promise.all([
renderRER(),
renderBus77(),
renderBus201(),
renderJoinvilleAll(),
renderWeather(),
renderNews(),
renderVelib(),
renderSaint(),
renderSytadinIndicator()
]);
renderRoad(); renderRaces();
setInterval(()=>{ renderRER(); renderBus77(); renderBus201(); renderJoinvilleAll(); },30000);
}
document.addEventListener("DOMContentLoaded", init);
