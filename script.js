
const proxy = "https://transportvhp.hippodrome-proxy42.workers.dev/?ref=";
const refs = {
  rer: "STIF:StopPoint:Q:43135:",
  bus77: "STIF:StopPoint:Q:463641:",
  bus201: "STIF:StopPoint:Q:463644:"
};
const velibStations = ["12128", "12163"];

async function fetchPrim(ref) {
  const url = proxy + encodeURIComponent(ref);
  try {
    const response = await fetch(url);
    const json = await response.json();
    return json.Siri?.ServiceDelivery?.StopMonitoringDelivery[0]?.MonitoredStopVisit || [];
  } catch (err) {
    console.error("Erreur PRIM:", err);
    return [];
  }
}

function displayPrimData(data, elementId) {
  const container = document.getElementById(elementId);
  container.innerHTML = "";
  if (!data.length) {
    container.textContent = "Aucune donnée disponible.";
    return;
  }
  data.slice(0, 5).forEach(item => {
    const aimed = item.MonitoredVehicleJourney.MonitoredCall.AimedDepartureTime;
    const dest = item.MonitoredVehicleJourney.DestinationName;
    const div = document.createElement("div");
    div.textContent = `→ ${dest} à ${new Date(aimed).toLocaleTimeString("fr-FR")}`;
    container.appendChild(div);
  });
}

async function fetchVelib(stationCode) {
  const url = `https://velib-proxy.hippodrome-proxy42.workers.dev/station_status.json`;
  const infoUrl = `https://velib-proxy.hippodrome-proxy42.workers.dev/station_information.json`;
  const [status, info] = await Promise.all([fetch(url).then(r => r.json()), fetch(infoUrl).then(r => r.json())]);
  const statusMap = {};
  status.data.stations.forEach(s => statusMap[s.station_id] = s);
  const container = document.getElementById("velib-data");
  container.innerHTML = "";
  info.data.stations
    .filter(s => velibStations.includes(s.station_code))
    .forEach(s => {
      const stat = statusMap[s.station_id];
      const div = document.createElement("div");
      div.textContent = `${s.name} : ${stat.num_bikes_available} vélos / ${stat.num_docks_available} bornes`;
      container.appendChild(div);
    });
}

async function refreshAll() {
  displayPrimData(await fetchPrim(refs.rer), "rer-data");
  displayPrimData(await fetchPrim(refs.bus77), "bus77-data");
  displayPrimData(await fetchPrim(refs.bus201), "bus201-data");
  fetchVelib();
}
refreshAll();
setInterval(refreshAll, 60000);
