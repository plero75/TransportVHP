// ===================== CONFIGURATION =====================
const apiToken = "7nAc6NHplCJtJ46Qw32QFtefq3TQEYrT";
const proxyUrl = "https://corsproxy.io/?";
const baseApiUrl = "https://api.iledefrance-mobilites.fr/";

// IDs des arrêts RATP (RER/Bus)
const stops = {
  rerAJoinville: "stop_area:IDFM:8775860", // Joinville-le-Pont
  bus77: "stop_area:IDFM:441602",         // Hippodrome de Vincennes
  bus201: "stop_area:IDFM:443473"         // Pyramide / École du Breuil
};

// ===================== FONCTIONS UTILES =====================
function formatTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function updateDateTime() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR");
  const timeStr = now.toLocaleTimeString("fr-FR");
  document.getElementById("date-heure").textContent = `${dateStr} – ${timeStr}`;
}

// ===================== FETCH TEMPS RÉEL =====================
async function fetchNextDepartures(stopId, lineName, elementId) {
  const url = `${proxyUrl}${baseApiUrl}v1/coverage/fr-idf/stop_areas/${stopId}/departures?count=4&data_freshness=realtime`;
  const headers = { Authorization: `Bearer ${apiToken}` };
  const res = await fetch(url, { headers });
  const data = await res.json();

  const filtered = data.departures.filter(d => d.display_informations.line.code === lineName);
  const times = filtered.map(d => formatTime(d.stop_date_time.departure_date_time));
  document.getElementById(elementId).innerHTML = times.join(" – ");
}

async function fetchTrafficInfo(lineId, elementId) {
  const url = `${proxyUrl}${baseApiUrl}v1/traffic_reports/lines/${lineId}`;
  const headers = { Authorization: `Bearer ${apiToken}` };
  const res = await fetch(url, { headers });
  const data = await res.json();
  document.getElementById(elementId).innerHTML = data.message || "Aucune alerte en cours";
}

async function fetchSchedule(stopId, elementId) {
  const url = `${proxyUrl}${baseApiUrl}v1/coverage/fr-idf/stop_areas/${stopId}/stop_schedules`;
  const headers = { Authorization: `Bearer ${apiToken}` };
  const res = await fetch(url, { headers });
  const data = await res.json();
  const schedules = data.stop_schedules[0]?.table?.rows?.[0];
  if (schedules) {
    const first = schedules.begin_time || "—";
    const last = schedules.end_time || "—";
    document.getElementById(elementId).innerHTML = `Premier : ${first} – Dernier : ${last}`;
  }
}

// ===================== FETCH VELIB =====================
async function fetchVelib(stationId, elementId) {
  const url = "https://corsproxy.io/?https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json";
  const res = await fetch(url);
  const data = await res.json();
  const station = data.data.stations.find(s => s.station_id === stationId);
  if (station) {
    const dispo = `
      🔋 Électriques : ${station.num_bikes_available_types.find(b => b.ebike)?.value || 0} <br>
      🚲 Mécaniques : ${station.num_bikes_available_types.find(b => !b.ebike)?.value || 0} <br>
      🅿️ Places libres : ${station.num_docks_available}
    `;
    document.getElementById(elementId).innerHTML = dispo;
  } else {
    document.getElementById(elementId).textContent = "Station non trouvée.";
  }
}

// ===================== INITIALISATION =====================
function startApp() {
  updateDateTime();
  setInterval(updateDateTime, 60000); // Mise à jour toutes les minutes

  // RER A
  fetchNextDepartures(stops.rerAJoinville, "A", "rerAProchainsTrains");
  fetchSchedule(stops.rerAJoinville, "rerAHorairesService");
  fetchTrafficInfo("line:RER:A", "rerAInfosTrafic");

  // Bus 77
  fetchNextDepartures(stops.bus77, "77", "bus77ProchainsTrains");
  fetchSchedule(stops.bus77, "bus77HorairesService");
  fetchTrafficInfo("line:BUS:77", "bus77InfosTrafic");

  // Bus 201
  fetchNextDepartures(stops.bus201, "201", "bus201ProchainsTrains");
  fetchSchedule(stops.bus201, "bus201HorairesService");
  fetchTrafficInfo("line:BUS:201", "bus201InfosTrafic");

  // Vélib’
  fetchVelib("12128", "velib12128");
  fetchVelib("12163", "velib12163");
}

document.addEventListener("DOMContentLoaded", startApp);
