// -----------------------------------------------------------------------------
// Dashboard Transports – Hippodrome Paris-Vincennes
// -----------------------------------------------------------------------------
// ⚙️ Inclut : RER A, Bus 77/201, météo, Vélib’, trafic, news, courses
// -----------------------------------------------------------------------------

// === Constantes principales ===
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true"; // ✅ direct, sans proxy
const RSS_URL = "https://www.francetvinfo.fr/titres.rss";

const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  JOINVILLE: "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:"
};

const LINES = {
  RER_A:   { id: "C01742", label: "RER A" },
  BUS_77:  { id: "C02251", label: "Bus 77" },
  BUS_201: { id: "C01219", label: "Bus 201" }
};

const VELIB_STATIONS = { VINCENNES: "12163", BREUIL: "12128" };

// === État global ===
let newsItems = [];
let currentNews = 0;
let generalMessages = [];

// === Utils ===
async function fetchJSON(url, timeout = 10000) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(url, { signal: c.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    console.error("fetchJSON", url, e.message);
    return null;
  }
}

async function fetchText(url, timeout = 10000) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeout);
    const r = await fetch(url, { signal: c.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    console.error("fetchText", url, e.message);
    return "";
  }
}

function cleanText(str = "") {
  return str.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function minutesFromISO(iso) {
  if (!iso) return null;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
}

// === Horloge ===
function setClock() {
  const el = document.getElementById("clock");
  if (el) el.textContent = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// === Météo ===
const WEATHER_CODES = {
  0: "Ciel dégagé", 1: "Principalement clair", 2: "Partiellement nuageux", 3: "Couvert",
  61: "Pluie faible", 63: "Pluie modérée", 65: "Pluie forte",
  80: "Averses faibles", 81: "Averses modérées", 82: "Fortes averses",
  95: "Orages", 96: "Orages grêle", 99: "Orages grêle"
};

function weatherEmojiFromCode(code) {
  if ([0, 1].includes(code)) return "☀️";
  if ([2, 3].includes(code)) return "⛅";
  if ([61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌤️";
}

async function refreshWeather() {
  try {
    const data = await fetchJSON(WEATHER_URL, 10000);
    const tempEl = document.getElementById("weather-temp");
    const descEl = document.getElementById("weather-desc");
    const emojiEl = document.getElementById("weather-emoji");

    if (!data?.current_weather) throw new Error("no data");
    const { temperature, weathercode } = data.current_weather;

    const text = WEATHER_CODES[weathercode] || "Conditions actuelles";
    if (tempEl) tempEl.textContent = `${Math.round(temperature)}°`;
    if (descEl) descEl.textContent = text;
    if (emojiEl) emojiEl.textContent = weatherEmojiFromCode(weathercode);
  } catch (e) {
    console.warn("refreshWeather", e.message);
    document.getElementById("weather-desc").textContent = "Météo indisponible";
  }
}

// === News France Info ===
async function refreshNews() {
  const xml = await fetchText(PROXY + encodeURIComponent(RSS_URL));
  let items = [];
  if (xml) {
    try {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      items = [...doc.querySelectorAll("item")].slice(0, 6).map(node => ({
        title: cleanText(node.querySelector("title")?.textContent || ""),
        desc: cleanText(node.querySelector("description")?.textContent || "")
      }));
    } catch (e) {
      console.error("refreshNews parse", e);
    }
  }
  newsItems = items;
  renderNews();
}

function renderNews() {
  const cont = document.getElementById("news-carousel");
  if (!cont) return;
  cont.innerHTML = "";
  if (!newsItems.length) {
    cont.innerHTML = "<div class='news-card active'>Aucune actualité</div>";
    return;
  }
  newsItems.forEach((n, i) => {
    const card = document.createElement("div");
    card.className = "news-card" + (i === currentNews ? " active" : "");
    card.innerHTML = `<div class="news-title">${n.title}</div><div class="news-desc">${n.desc}</div>`;
    cont.appendChild(card);
  });
}

function nextNews() {
  if (!newsItems.length) return;
  currentNews = (currentNews + 1) % newsItems.length;
  renderNews();
}

// === Vélib ===
async function refreshVelib() {
  for (const [key, stationId] of Object.entries(VELIB_STATIONS)) {
    const el = document.getElementById(`velib-${key.toLowerCase()}`);
    if (!el) continue;
    try {
      const url = `https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/velib-disponibilite-en-temps-reel/records?where=stationcode%3D${stationId}&limit=1`;
      const data = await fetchJSON(url);
      const st = data?.results?.[0];
      if (!st) {
        el.textContent = "Indispo";
        continue;
      }
      const mech = st.mechanical_bikes || 0;
      const ebike = st.ebike_bikes || 0;
      const docks = st.numdocksavailable || 0;
      el.textContent = `🚲${mech} 🔌${ebike} 🅿️${docks}`;
    } catch (e) {
      console.error("refreshVelib", e);
      el.textContent = "Indispo";
    }
  }
}

// === Trafic général IDFM ===
async function fetchGeneralMessages() {
  const ids = Object.values(LINES).map(l => l.id);
  const msgs = [];
  await Promise.all(ids.map(async id => {
    const url = PROXY + encodeURIComponent(`https://prim.iledefrance-mobilites.fr/marketplace/general-message?LineRef=${id}`);
    const data = await fetchJSON(url);
    const deliveries = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery || [];
    deliveries.forEach(del => (del.InfoMessage || []).forEach(msg => {
      const txt = cleanText(msg?.Content?.Message?.[0]?.MessageText?.[0]?.value || msg?.Description || "");
      if (txt) msgs.push({ line: id, text: txt });
    }));
  }));
  generalMessages = msgs;
  renderGeneralMessages();
}

function renderGeneralMessages() {
  const banner = document.getElementById("traffic-banner");
  if (!banner) return;
  if (!generalMessages.length) {
    banner.className = "traffic-banner ok";
    banner.textContent = "🟢 Trafic normal sur les lignes suivies.";
  } else {
    banner.className = "traffic-banner alert";
    banner.textContent = "⚠️ " + generalMessages.map(m => `[${m.line}] ${m.text}`).join(" • ");
  }
}

// === Boucles automatiques ===
let loopsStarted = false;
function startLoops() {
  if (loopsStarted) return;
  loopsStarted = true;
  setInterval(refreshWeather, 30 * 60 * 1000);
  setInterval(refreshVelib, 3 * 60 * 1000);
  setInterval(fetchGeneralMessages, 5 * 60 * 1000);
  setInterval(nextNews, 12000);
  setInterval(setClock, 1000);
}

// === Init ===
async function init() {
  setClock();
  await Promise.allSettled([
    refreshWeather(),
    refreshNews(),
    refreshVelib(),
    fetchGeneralMessages()
  ]);
  renderGeneralMessages();
  startLoops();
}
init();
