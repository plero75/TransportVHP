// =====================
// Config / Endpoints
// =====================
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";

// APIs
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true";
const SAINT_URL   = PROXY + encodeURIComponent("https://nominis.cef.fr/json/nominis.php");
const RSS_URL     = PROXY + encodeURIComponent("https://www.francetvinfo.fr/titres.rss");

// PRIM stops
const STOP_IDS = {
  RER_A:      "STIF:StopArea:SP:43135:",
  JOINVILLE:  "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL:     "STIF:StopArea:SP:463644:"
};

// Joinville — affichage forcé (hors RER)
const JOINVILLE_BUS_CODES = ["101","106","108","110","112","201","281","317","393","520","77","N33"];

// Velib stations (Paris opendata)
const VELIB = { VINCENNES: "12163", BREUIL: "12128" };

// PMU (courses)
const PMU_DAY_URL = (dateStr) => PROXY + encodeURIComponent(`https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${dateStr}`);

// Sytadin / Paris (fallback si indispo)
const PARIS_ROAD = PROXY + encodeURIComponent("https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/comptages-routiers-permanents/records?limit=60&order_by=-t_1h");

// ODS referentiel
const ODS_BY_ID = (id)   => PROXY + encodeURIComponent(`https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=id_line%3D%22${id}%22&limit=1`);
const ODS_BY_CD = (cd)   => PROXY + encodeURIComponent(`https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=shortname_line%3D%22${encodeURIComponent(cd)}%22&limit=1`);
const PRIM_STOP = (ref)  => PROXY + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${ref}`);
const PRIM_GM   = (idLn) => PROXY + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=STIF:Line::${idLn}:`);

// =====================
// Utils
// =====================
function clean(s=""){return s.replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();}
async function fetchJSON(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  }catch(e){ console.error("fetchJSON",url,e.message); return null; }
}
async function fetchText(url, timeout=12000){
  try{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
    const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }catch(e){ console.error("fetchText",url,e.message); return ""; }
}
function minutesFromISO(iso){ if(!iso) return null; return Math.max(0, Math.round((new Date(iso)-Date.now())/60000)); }
function hhmm(iso){ if(!iso) return "—:—"; const d=new Date(iso); return d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}); }
function setLastUpdate(){ const el=document.getElementById("lastUpdate"); if(el) el.textContent=new Date().toLocaleTimeString("fr-FR"); }

// =====================
// Horloge / météo / saint
// =====================
function tickClock(){
  const now=new Date();
  const dEl=document.getElementById("dateLabel"), cEl=document.getElementById("clock");
  if(dEl) dEl.textContent = now.toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
  if(cEl) cEl.textContent = now.toLocaleTimeString("fr-FR");
}
async function refreshWeather(){
  const d=await fetchJSON(WEATHER_URL, 10000);
  if(!d?.current_weather) return;
  document.getElementById("weather-temp").textContent=`${Math.round(d.current_weather.temperature)}°C`;
  document.getElementById("weather-desc").textContent="";
}
async function refreshSaint(){
  const d=await fetchJSON(SAINT_URL, 10000);
  const name=d?.response?.prenoms||"";
  document.getElementById("saint").textContent = name? `Fête : ${name}` : "Fête du jour";
}

// =====================
// PRIM parsing / groupement
// =====================
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

// =====================
// Couleurs IDFM (référentiel + fallback)
// =====================
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

// =====================
// Rendue UI
// =====================
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

// =====================
// Sections TRANSPORTS
// =====================
async function renderRerA(intoId){
  const node=document.getElementById(intoId); if(!node) return; node.innerHTML="";
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
async function renderHippo77(){
  const node=document.getElementById("hippo-body"); if(!node) return; node.innerHTML="";
  const raw=await fetchJSON(PRIM_STOP(STOP_IDS.HIPPODROME), 12000);
  const visits=parseStop(raw);
  const grouped=groupByLineAndDir(visits,3);

  let target=null;
  for(const g of grouped){ const m=await metaById(g.lineId); if((m.code||"").toUpperCase()==="77"){ target={m,dirs:g.dirs}; break; } }
  const meta = (target?.m) || await metaByCode("77");
  const dirs = (target?.dirs) || [];
  const wrap=document.createElement("div"); wrap.innerHTML=lineBlock(meta, dirs);
  node.appendChild(wrap.firstChild);
}
async function renderBreuil(){
  const node=document.getElementById("breuil-body"); if(!node) return; node.innerHTML="";
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
async function renderJoinvilleAll(){
  const L= document.getElementById("joinville-left"),
        R= document.getElementById("joinville-right");
  if(!L||!R) return;
  L.innerHTML=""; R.innerHTML="";

  const raw=await fetchJSON(PRIM_STOP(STOP_IDS.JOINVILLE),12000);
  const visits=parseStop(raw).filter(v=>v.lineId);
  const grouped=groupByLineAndDir(visits,3);
  const byCode=new Map();
  for(const g of grouped){ const m=await metaById(g.lineId); byCode.set((m.code||"").toUpperCase(), {meta:m, dirs:g.dirs}); }

  const half=Math.ceil(JOINVILLE_BUS_CODES.length/2);
  const leftList=JOINVILLE_BUS_CODES.slice(0,half);
  const rightList=JOINVILLE_BUS_CODES.slice(half);

  async function renderList(list,parent){
    for(const code of list){
      const info = byCode.get(code) || { meta: await metaByCode(code), dirs: [] };
      const wrap=document.createElement("div"); wrap.innerHTML=lineBlock(info.meta, info.dirs);
      parent.appendChild(wrap.firstChild);
    }
  }
  await renderList(leftList, L);
  await renderList(rightList, R);
}

// =====================
// Bandeau trafic global (/general-message)
// =====================
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

// =====================
// Vélib (30 s)
// =====================
async function refreshVelib(){
  async function one(stationCode, targetId){
    const url=PROXY+encodeURIComponent(`https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records?where=stationcode%3D${stationCode}&limit=1`);
    const d=await fetchJSON(url,10000);
    const el=document.getElementById(targetId);
    if(!el){return;}
    const st=d?.results?.[0];
    if(!st){ el.textContent="Indisponible"; return; }
    const mech=st.mechanical_bikes ?? st.mechanical ?? 0;
    const ebike=st.ebike_bikes ?? st.ebike ?? 0;
    const docks=st.numdocksavailable ?? st.num_docks_available ?? 0;
    el.innerHTML = `
      <div class="item"><div class="velib-value">${mech}</div><div class="velib-label">méca</div></div>
      <div class="item"><div class="velib-value">${ebike}</div><div class="velib-label">élec</div></div>
      <div class="item"><div class="velib-value">${docks}</div><div class="velib-label">bornes</div></div>
    `;
  }
  await Promise.all([
    one(VELIB.VINCENNES, "velib-vincennes"),
    one(VELIB.BREUIL, "velib-breuil")
  ]);
}

// =====================
// Trafic routier (fallback Paris opendata)
// =====================
function distanceKm(lat1,lon1,lat2,lon2){
  const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
async function refreshRoad(){
  const cont=document.getElementById("road-list"); if(!cont) return;
  cont.textContent="Chargement…";
  try{
    const data=await fetchJSON(PARIS_ROAD, 12000);
    const results=data?.results||[];
    const center={lat:48.825, lon:2.45};
    const KEY=["Périph","A4","A86","Vincennes","Joinville","Charenton"];
    const seen=new Set(), rows=[];
    for(const rec of results){
      const lib=(rec.libelle||"").replace(/_/g," ").trim();
      if(!lib || seen.has(lib)) continue;
      const pt=rec.geo_point_2d;
      if(pt){
        const d=distanceKm(center.lat, center.lon, pt.lat, pt.lon);
        if(d>6) continue;
      }
      if(!KEY.some(k=>new RegExp(k,"i").test(lib))) continue;
      seen.add(lib);
      rows.push({ lib, status:rec.etat_trafic||"—" });
      if(rows.length>=6) break;
    }
    cont.innerHTML="";
    if(!rows.length){ cont.innerHTML='<div class="road"><span class="badge-road">OK</span> Circulation fluide autour de Vincennes</div>'; return; }
    rows.forEach(r=>{
      const sev=/ralenti|dense|satur|bouch/i.test(r.status) ? "warn" : "";
      const div=document.createElement("div"); div.className="road";
      div.innerHTML=`<span class="badge-road ${sev}">${sev? "Alerte":"OK"}</span> ${r.lib} — ${r.status}`;
      cont.appendChild(div);
    });
  }catch(e){
    cont.innerHTML='<div class="road"><span class="badge-road warn">Alerte</span> Données routières indisponibles</div>';
  }
}

// =====================
// News France Info (15 min, rotation 10 s)
// =====================
let news=[], newsIdx=0;
async function refreshNews(){
  const xml=await fetchText(RSS_URL,15000);
  if(!xml){ document.getElementById("news-carousel").textContent="Actus indisponibles"; return; }
  try{
    const doc=new DOMParser().parseFromString(xml,"application/xml");
    const nodes=[...doc.querySelectorAll("item")].slice(0,8);
    news=nodes.map(n=>({
      title:clean(n.querySelector("title")?.textContent||""),
      desc:clean(n.querySelector("description")?.textContent||"")
    }));
    renderNews();
  }catch{ document.getElementById("news-carousel").textContent="Actus indisponibles"; }
}
function renderNews(){
  const cont=document.getElementById("news-carousel"); if(!cont) return;
  cont.innerHTML="";
  if(!news.length){ cont.textContent="Actus indisponibles"; return; }
  news.forEach((n,i)=>{
    const d=document.createElement("div");
    d.className="news-card"+(i===newsIdx?" active":"");
    d.innerHTML=`<div class="news-title">${n.title}</div><div class="news-desc">${n.desc}</div>`;
    cont.appendChild(d);
  });
}
function nextNews(){
  if(!news.length) return;
  newsIdx=(newsIdx+1)%news.length;
  renderNews();
}

// =====================
// Courses (PMU) — 1/jour + décompte live
// =====================
let coursesCache={ vin:[], eng:[], dayStr:null };
function todayPmuStr(){
  const d=new Date();
  return `${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
}
async function fetchCoursesOncePerDay(){
  const day=todayPmuStr();
  if(coursesCache.dayStr===day) return coursesCache;

  const data=await fetchJSON(PMU_DAY_URL(day),15000);
  const vin=[], eng=[];
  if(data?.programme?.reunions){
    data.programme.reunions.forEach(r=>{
      const hip=r.hippodrome?.code;
      const list=(hip==="VIN")?vin : (hip==="ENG"?eng:null);
      if(!list) return;
      (r.courses||[]).forEach(c=>{
        const ts=Date.parse(c.heureDepart);
        if(!Number.isFinite(ts)) return;
        list.push({
          ts, heure:new Date(ts).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),
          lib:c.libelle, dist:c.distance, disc:c.discipline, dot:c.montantPrix, ref:`R${r.numOfficiel||""}C${c.numOrdre||""}`
        });
      });
    });
  }
  vin.sort((a,b)=>a.ts-b.ts); eng.sort((a,b)=>a.ts-b.ts);
  coursesCache={ vin, eng, dayStr:day };
  return coursesCache;
}
function renderCourses(list, intoId){
  const cont=document.getElementById(intoId); if(!cont) return;
  cont.innerHTML="";
  if(!list.length){ cont.innerHTML="<div class='course-meta'>Aucune course aujourd’hui.</div>"; return; }
  const now=Date.now();
  list.forEach(it=>{
    const mins = Math.round((it.ts-now)/60000);
    const when = mins>0 ? `dans ${mins} min` : (mins>-60 ? "en cours" : "terminée");
    const row=document.createElement("div"); row.className="course";
    row.innerHTML = `
      <div class="badge-time">${it.heure}</div>
      <div>
        <div class="course-name">${it.ref} — ${it.lib}</div>
        <div class="course-meta">${it.dist} m • ${it.disc} • ${when}</div>
      </div>
      <div class="course-meta">${Number(it.dot||0).toLocaleString("fr-FR")} €</div>`;
    cont.appendChild(row);
  });
}
async function refreshCourses(){
  const {vin,eng}=await fetchCoursesOncePerDay();
  renderCourses(vin, "courses-vincennes");
  renderCourses(eng, "courses-enghien");
}

// =====================
// Orchestration
// =====================
async function renderLine1And2(){
  await Promise.all([
    renderRerA("rerA-body"),
    renderRerA("rerA-body-dup"),
    renderHippo77(),
    renderBreuil(),
    renderJoinvilleAll()
  ]);
}

async function init(){
  tickClock();
  await Promise.all([
    refreshWeather(),
    refreshSaint(),
    refreshBanner(),
    renderLine1And2(),
    refreshVelib(),
    refreshRoad(),
    refreshNews(),
    refreshCourses()
  ]);
  setLastUpdate();

  // Loops
  setInterval(tickClock, 1000);
  setInterval(async ()=>{ await renderLine1And2(); setLastUpdate(); }, 60*1000);
  setInterval(refreshBanner, 5*60*1000);
  setInterval(refreshWeather, 10*60*1000);
  setInterval(refreshSaint,   6*60*60*1000);
  setInterval(refreshVelib,   30*1000);
  setInterval(refreshRoad,    5*60*1000);
  setInterval(refreshNews,    15*60*1000);
  setInterval(nextNews,       10*1000);
  setInterval(refreshCourses, 60*1000); // pour mettre à jour le décompte
}
init();