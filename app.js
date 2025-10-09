// ===== Config & endpoints =====
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";
const SMARTIDF_LINES = "https://data.smartidf.services/api/explore/v2.1/catalog/datasets/referentiel-des-lignes0/records?limit=5000";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
const RSS_URL = "https://www.francetvinfo.fr/titres.rss";
const NOMINIS_URL = "https://nominis.cef.fr/json/nominis.php";
const SYTADIN_INDICATOR_SRC = "https://www.sytadin.fr/sys/barometre_courant_cens.xml";

// ===== Live colors (SmartIDF) =====
let LINE_COLORS = {}; // id -> {color,name,operator}
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
      const id = f.id || f.idligne || f.id_line || f.line_id || f.internalid || f["id_line:"] || null;
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

// ===== Fallback (pour nos lignes si SmartIDF indispo) =====
const FALLBACK = {
  "STIF:Line::C01742:": "#e6003d", // RER A
  "STIF:Line::C02251:": "#0072bc", // 77
  "STIF:Line::C02252:": "#836d46", // 201
  "STIF:Line::C00229:": "#f28e00", // 101
  "STIF:Line::C00175:": "#e3001b", // 106
  "STIF:Line::C00177:": "#732982", // 108
  "STIF:Line::C00179:": "#5c2d91", // 110
  "STIF:Line::C00181:": "#b97a57", // 112
  "STIF:Line::C00659:": "#878500", // 281
  "STIF:Line::C00702:": "#001858", // N33
};

// ===== Vélib
const VELIB_INFO_URL   = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_information.json";
const VELIB_STATUS_URL = "https://velib-metropole-opendata.smoove.pro/opendata/Velib_Metropole/station_status.json";
const VELIB_STATIONS   = [
  { code: "12163", elId: "velib1", label: "Vincennes" },
  { code: "12128", elId: "velib2", label: "École du Breuil" }
];

// ===== Stops & Lines (IDs fixes)
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

// Helpers live color
function colorFor(id){ return (LINE_COLORS[id]?.color) || FALLBACK[id] || "#001858"; }
function applyLiveColor(meta){ return {...meta, color: colorFor(meta.id)}; }

// ===== Utils
const pad2 = n => String(n).padStart(2,"0");
const nowFR = () => new Date().toLocaleString("fr-FR",{hour:"2-digit",minute:"2-digit"});
const dateFR = () => { const d=new Date(); return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`; };
const minutesUntil = iso => Math.floor((new Date(iso) - new Date())/60000);
function setWeatherIcon(code){
  const ic = document.getElementById("weatherIcon"); ic.className="";
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

// ===== Renderers
async function renderRER(){ const v=await fetchStopMonitoring(STOP_IDS.RER_A, LINES.RER_A.id); renderPanel(document.getElementById("rerA-board"), v, LINES.RER_A); const m=await fetchGeneralMessage(LINES.RER_A.id); const t=document.getElementById("rerA-traffic"); t.classList.toggle("show", m.length>0); t.textContent = m[0] ? `⚠️ ${m[0]}` : ""; }
async function renderBus77(){ const v=await fetchStopMonitoring(STOP_IDS.HIPPODROME, LINES.BUS_77.id); renderPanel(document.getElementById("bus77-board"), v, LINES.BUS_77); const m=await fetchGeneralMessage(LINES.BUS_77.id); const t=document.getElementById("bus77-traffic"); t.classList.toggle("show", m.length>0); t.textContent = m[0] ? `⚠️ ${m[0]}` : ""; }
async function renderBus201(){ const [v1,v2]=await Promise.all([ fetchStopMonitoring(STOP_IDS.HIPPODROME, LINES.BUS_201.id), fetchStopMonitoring(STOP_IDS.BREUIL, LINES.BUS_201.id) ]); renderPanel(document.getElementById("bus201-board"), [...v1,...v2], LINES.BUS_201); const m=await fetchGeneralMessage(LINES.BUS_201.id); const t=document.getElementById("bus201-traffic"); t.classList.toggle("show", m.length>0); t.textContent = m[0] ? `⚠️ ${m[0]}` : ""; }

// Tous bus
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
async function renderJoinvilleAll(){
  const board=document.getElementById("joinville-all"); board.innerHTML="";
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

// Weather + saint + news + velib + sytadin
async function renderWeather(){ try{ const r=await fetch(WEATHER_URL); const j=await r.json(); const w=j?.current_weather; if(w){ document.getElementById("weatherTemp").textContent = `${Math.round(w.temperature)}°C`; document.getElementById("weather").title = `${Math.round(w.temperature)}°C, vent ${Math.round(w.windspeed)} km/h`; setWeatherIcon(Number(w.weathercode)); } }catch{} }
async function renderSaint(){ const d=new Date(); const url=`${PROXY}${NOMINIS_URL}?jour=${d.getDate()}&mois=${d.getMonth()+1}`; try{ const r=await fetch(url,{headers:{Accept:"application/json"}}); const j=await r.json(); const s=j?.response?.nominis?.jour?.fete || j?.response?.fete || ""; document.getElementById("saint").textContent = s || ""; }catch{ document.getElementById("saint").textContent=""; } }
async function renderNews(){ const el=document.getElementById("news"); el.innerHTML=""; const url=`${PROXY}${RSS_URL}`; try{ const r=await fetch(url); const xml=await r.text(); const doc=new DOMParser().parseFromString(xml,"application/xml"); const items=Array.from(doc.querySelectorAll("item")).slice(0,8); if(!items.length){ const row=document.createElement("div"); row.className="row show"; row.innerHTML=`<div class="badge" style="background:#001858">•</div><div class="dest">Aucune actu pour le moment</div><div class="times"></div>`; el.appendChild(row); return; } items.forEach(it=>{ const title=it.querySelector("title")?.textContent?.trim()||""; if(!title) return; const row=document.createElement("div"); row.className="row"; row.innerHTML=`<div class="badge" style="background:#001858">•</div><div class="dest">${title}</div><div class="times"></div>`; requestAnimationFrame(()=>row.classList.add("show")); el.appendChild(row); }); }catch{ const row=document.createElement("div"); row.className="row show"; row.innerHTML=`<div class="badge" style="background:#001858">•</div><div class="dest">Flux France Info indisponible</div><div class="times"></div>`; el.appendChild(row);} }
async function renderVelib(){ const [infoRes,statusRes]=await Promise.all([ fetch(VELIB_INFO_URL).then(r=>r.json()).catch(()=>null), fetch(VELIB_STATUS_URL).then(r=>r.json()).catch(()=>null) ]); const info=infoRes?.data?.stations||[]; const status=statusRes?.data?.stations||[]; const byInfo=new Map(info.map(s=>[String(s.stationCode),s])); const byStat=new Map(status.map(s=>[String(s.stationCode),s])); for(const st of VELIB_STATIONS){ const el=document.getElementById(st.elId); el.innerHTML=""; const i=byInfo.get(st.code); const s=byStat.get(st.code); if(!i||!s){ el.innerHTML = `<div class="row show"><div class="badge" style="background:#4b5563">V</div><div class="dest">Données Vélib’ indisponibles (${st.label})</div><div class="times"></div></div>`; continue; } let mech=0,eBike=0; const types=s.num_bikes_available_types; if(Array.isArray(types)){ types.forEach(t=>{ if(t?.ebike) eBike+=+t.ebike||0; if(t?.mechanical) mech+=+t.mechanical||0; }); } else if(types&&typeof types==="object"){ eBike=+types.ebike||0; mech=+types.mechanical||0; } const places=+s.num_docks_available||0; el.appendChild(makeKPI("🚲",String(mech),"mécaniques")); el.appendChild(makeKPI("⚡",String(eBike),"électriques")); el.appendChild(makeKPI("🅿️",String(places),"places")); } function makeKPI(icon,val,label){ const box=document.createElement("div"); box.className="kpi"; box.innerHTML=`<div class="value">${val}</div><div class="label">${label}</div>`; const ico=document.createElement("div"); ico.textContent=icon; ico.style.fontSize="1.2rem"; box.prepend(ico); return box; } }
async function renderSytadinIndicator(){ const el=document.getElementById("sytadin-indicator"); try{ const r=await fetch(`${PROXY}${SYTADIN_INDICATOR_SRC}`); const txt=await r.text(); const a4=/A4/i.test(txt)?"A4: ok":"A4: n/d"; const a86=/A86/i.test(txt)?"A86: ok":"A86: n/d"; el.textContent=`${a4} • ${a86}`; }catch{ el.textContent="A4 / A86 : données indisponibles"; } }

// ===== Road & Races placeholders =====
function renderRoad(){ const el=document.getElementById("road"); el.innerHTML=""; ["A86 • Fluide","A4 • Chargé sens Paris"].forEach(t=>{ const d=document.createElement("div"); d.className="row"; d.innerHTML=`<div class='badge' style='background:#001858'>•</div><div class='dest'>${t}</div><div class='times'></div>`; requestAnimationFrame(()=>d.classList.add("show")); el.appendChild(d); }); }
function renderRaces(){ const v=document.getElementById("racesVincennes"); const e=document.getElementById("racesEnghien"); const make=(badge,title,time)=>{ const t=document.createElement("div"); t.className="ticket"; t.innerHTML=`<span class="badge-blue">${badge}</span><div class="t-info"><span class="t-title">${title}</span><span class="t-time mono">${time}</span></div>`; return t; }; v.innerHTML=""; e.innerHTML=""; [ ["R1C1","Prix de l'Étrier","13:50"], ["R1C2","Prix de Paris","14:25"], ["R1C3","Prix Masséna","15:05"], ["R1C4","Prix de Vincennes","15:45"] ].forEach(x=>v.appendChild(make(...x))); [ ["R2C1","Prix d'Enghien","13:45"], ["R2C2","Prix Soisy","14:20"], ["R2C3","Prix du Val-d'Oise","15:00"] ].forEach(x=>e.appendChild(make(...x))); }

// ===== Clock =====
function tick(){ document.getElementById("date").textContent = dateFR(); document.getElementById("time").textContent = nowFR(); }

// ===== Init =====
async function init(){
  tick(); setInterval(tick, 15000);
  await loadLineColors();
  await Promise.all([ renderRER(), renderBus77(), renderBus201(), renderJoinvilleAll(), renderWeather(), renderNews(), renderVelib(), renderSaint(), renderSytadinIndicator() ]);
  renderRoad(); renderRaces();
  setInterval(()=>{ renderRER(); renderBus77(); renderBus201(); renderJoinvilleAll(); }, 30000);
  setInterval(()=>{ renderWeather(); }, 600000);
  setInterval(()=>{ renderNews(); }, 120000);
  setInterval(()=>{ renderVelib(); }, 60000);
  setInterval(()=>{ renderSaint(); }, 3600000);
  setInterval(()=>{ renderSytadinIndicator(); }, 300000);
}
document.addEventListener("DOMContentLoaded", init);
