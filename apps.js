// -----------------------------------------------------------------------------
// Tableau d'affichage – Hippodrome Paris-Vincennes (version GitHub Pages compatible)
// -----------------------------------------------------------------------------

const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const WEATHER_URL = `${PROXY}https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true`;
const RSS_URL = `${PROXY}https://www.francetvinfo.fr/titres.rss`;

const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  JOINVILLE_AREA: "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:"
};

const LINES = {
  RER_A:   { id: "C01742", navitia: "line:IDFM:C01742", label: "RER A" },
  BUS_77:  { id: "C02251", navitia: "line:IDFM:C02251", label: "Bus 77" },
  BUS_106: { id: "C01135", navitia: "line:IDFM:C01135", label: "Bus 106" },
  BUS_201: { id: "C01219", navitia: "line:IDFM:C01219", label: "Bus 201" }
};

const VELIB_STATIONS = { VINCENNES: "12163", BREUIL: "12128" };

const WEATHER_CODES = {
  0: "Ciel dégagé", 1: "Principalement clair", 2: "Partiellement nuageux", 3: "Couvert",
  45: "Brouillard", 48: "Brouillard givrant",
  51: "Bruine faible", 53: "Bruine", 55: "Bruine forte",
  61: "Pluie faible", 63: "Pluie modérée", 65: "Pluie forte",
  80: "Averses faibles", 81: "Averses modérées", 82: "Fortes averses",
  95: "Orages", 96: "Orages grêle", 99: "Orages grêle"
};

// ---------- Utils ----------
function decodeEntities(str = ""){
  return str.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"')
    .replace(/&#039;/gi,"'").replace(/&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").trim();
}
function cleanText(str=""){return decodeEntities(str).replace(/<[^>]*>/g," ").replace(/[<>]/g," ").replace(/\s+/g," ").trim();}
async function fetchJSON(url, timeout=12000, retries=1){
  for(let a=0;a<=retries;a++){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
      const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(e){ if(a===retries){console.error("fetchJSON",url,e.message); return null;}
      await new Promise(res=>setTimeout(res, 400+300*a));}
  } return null;
}
async function fetchText(url, timeout=12000, retries=1){
  for(let a=0;a<=retries;a++){
    try{
      const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeout);
      const r=await fetch(url,{signal:c.signal, cache:"no-store"}); clearTimeout(t);
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    }catch(e){ if(a===retries){console.error("fetchText",url,e.message); return null;}
      await new Promise(res=>setTimeout(res, 400+300*a));}
  } return null;
}

// ---------- Weather ----------
function weatherEmojiFromCode(code){
  if([0,1].includes(code)) return "☀️";
  if([2,3].includes(code)) return "⛅";
  if([61,63,65,80,81,82].includes(code)) return "🌧️";
  if([95,96,99].includes(code)) return "⛈️";
  if([45,48].includes(code)) return "🌫️";
  return "🌤️";
}
async function refreshWeather(){
  const data=await fetchJSON(WEATHER_URL,10000,1);
  const tempEl=document.getElementById("weather-temp"); const descEl=document.getElementById("weather-desc"); const emojiEl=document.getElementById("weather-emoji");
  if(!data?.current_weather){ tempEl.textContent="--°"; descEl.textContent="Météo indisponible"; emojiEl.textContent="—"; return; }
  const { temperature, weathercode }=data.current_weather;
  tempEl.textContent=`${Math.round(temperature)}°`;
  descEl.textContent=WEATHER_CODES[weathercode]||"Conditions actuelles";
  emojiEl.textContent=weatherEmojiFromCode(weathercode);
}

// ---------- Vélib ----------
async function refreshVelib(){
  for(const [key,stationId] of Object.entries(VELIB_STATIONS)){
    try{
      const url=`${PROXY}https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records?where=stationcode%3D${encodeURIComponent(stationId)}&limit=1`;
      const data=await fetchJSON(url,10000,1); const st=data?.results?.[0]||null;
      const el=document.getElementById(`velib-${key.toLowerCase()}`); if(!el) continue;
      if(!st){ el.textContent="Données indisponibles"; continue;}
      const mech=st.mechanical_bikes ?? st.mechanical ?? 0;
      const ebike=st.ebike_bikes ?? st.ebike ?? 0;
      const docks=st.numdocksavailable ?? st.num_docks_available ?? 0;
      el.innerHTML=`
        <div>
          <div class="velib-icon">🚲</div>
          <div class="velib-value">${mech}</div>
          <div class="velib-label">méca</div>
        </div>
        <div>
          <div class="velib-icon">🔌</div>
          <div class="velib-value">${ebike}</div>
          <div class="velib-label">élec</div>
        </div>
        <div>
          <div class="velib-icon">🅿️</div>
          <div class="velib-value">${docks}</div>
          <div class="velib-label">bornes</div>
        </div>`;
    }catch(e){ console.error("Vélib",stationId,e.message);}
  }
}

// ---------- RSS France Info ----------
async function refreshNews(){
  const xml=await fetchText(RSS_URL,15000,1); let items=[];
  if(xml){ 
    try{ 
      const doc=new DOMParser().parseFromString(xml,"application/xml"); 
      const nodes=Array.from(doc.querySelectorAll("item")).slice(0,6);
      items=nodes.map(node=>({
        title: cleanText(node.querySelector("title")?.textContent||""),
        desc: cleanText(node.querySelector("description")?.textContent||""),
        source: cleanText(node.querySelector("source")?.textContent||"France Info")
      })); 
    }catch(e){ console.error("RSS parse",e);} 
  }
  newsItems=items; renderNews();
}
function renderNews(){
  const cont=document.getElementById("news-carousel"); if(!cont) return; cont.innerHTML="";
  if(!newsItems.length){ cont.innerHTML='<div class="news-card active"><div class="news-title">Actualités indisponibles</div></div>'; return; }
  newsItems.forEach((n,i)=>{ const d=document.createElement("div"); d.className="news-card"+(i===currentNews?" active":""); d.innerHTML=`<div class="news-title">${n.title}</div><div class="news-desc">${n.desc}</div>`; cont.appendChild(d); });
}
function nextNews(){ if(!newsItems.length) return; currentNews=(currentNews+1)%newsItems.length; renderNews(); }

// ---------- GTFS Ligne Metadata ----------
async function fetchLineMetadata(lineId){
  if(!lineId) return { id: lineId, code: "?", color: "#2450a4", textColor: "#fff" };
  if(lineMetaCache.has(lineId)) return lineMetaCache.get(lineId);
  const url = `${PROXY}https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets/referentiel-des-lignes/records?where=id_line%3D%22${lineId}%22&limit=1`;
  const data=await fetchJSON(url,10000);
  let meta = { id: lineId, code: lineId||"?", color:"#2450a4", textColor:"#fff" };
  if(data?.results?.length){
    const e=data.results[0];
    meta={ id: lineId, code:e.shortname_line||lineId, color:e.colourweb_hexa||"#0055c8", textColor:e.textcolourweb_hexa||"#fff" };
  }
  lineMetaCache.set(lineId, meta);
  return meta;
}

// ---------- Courses ----------
async function getVincennesCoursesToday(){
  const d=new Date();
  const pmu=`${String(d.getDate()).padStart(2,"0")}${String(d.getMonth()+1).padStart(2,"0")}${d.getFullYear()}`;
  const url=`${PROXY}https://offline.turfinfo.api.pmu.fr/rest/client/7/programme/${pmu}`;
  const data=await fetchJSON(url,15000,1); const res=[];
  if(data?.programme?.reunions){
    data.programme.reunions.forEach(reunion=>{
      if(reunion.hippodrome?.code!=="VIN") return;
      reunion.courses?.forEach(course=>{
        const start=new Date(course.heureDepart);
        if(Number.isNaN(start.getTime())) return;
        res.push({ 
          heure: start.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"}),
          nom: course.libelle, distance: course.distance, discipline: course.discipline, dotation: course.montantPrix, ts: start.getTime(),
          r: reunion.numOfficiel, c: course.numOrdre 
        });
      });
    });
  }
  return res.sort((a,b)=>a.ts-b.ts);
}
async function refreshCourses(){
  const courses=await getVincennesCoursesToday();
  const cont=document.getElementById("courses-list"); if(!cont) return;
  cont.innerHTML="";
  if(!courses.length){ cont.innerHTML="<div class='muted'>Aucune course aujourd’hui.</div>"; return; }
  courses.forEach(c=>{
    const row=document.createElement("div");
    row.className="course";
    row.innerHTML=`<div class="badge-time">${c.heure}</div><div>${c.nom}</div>`;
    cont.appendChild(row);
  });
}

// ---------- Initialisation ----------
async function init(){
  await Promise.allSettled([
    refreshWeather(),
    refreshVelib(),
    refreshNews(),
    refreshCourses()
  ]);
  setInterval(refreshWeather, 30*60*1000);
  setInterval(refreshVelib, 3*60*1000);
  setInterval(refreshNews, 15*60*1000);
  setInterval(refreshCourses, 5*60*1000);
  setInterval(nextNews, 12000);
}
init();
