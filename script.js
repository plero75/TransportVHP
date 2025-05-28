// script.js modifié pour GitHub Pages avec l'apikey dans l'URL (pas de header)

const API_KEY = "7nAc6NHplCJtJ46Qw32QFtefq3TQEYrT";
const allOriginsBase = "https://api.allorigins.win/raw?url=";

const endpoints = {
  rerA: `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:43159:&apikey=${API_KEY}`,
  bus77: `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:44304:&apikey=${API_KEY}`,
  bus201: `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=STIF:StopPoint:Q:44489:&apikey=${API_KEY}`,
  velibStatus: `https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json`,
  velibInfo: `https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_information.json`
};

function fetchPrimAPI(url, callback) {
  fetch(allOriginsBase + encodeURIComponent(url))
    .then(response => response.json())
    .then(callback)
    .catch(error => console.error("Erreur RATP:", error));
}

function updateTime() {
  const now = new Date();
  document.getElementById("last-update").textContent = now.toLocaleString("fr-FR");
}

function displayRER() {
  fetchPrimAPI(endpoints.rerA, data => {
    const info = data.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit;
    const html = info.map(el => {
      const ligne = el.MonitoredVehicleJourney.PublishedLineName;
      const dest = el.MonitoredVehicleJourney.DestinationName;
      const time = new Date(el.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime);
      return `→ ${dest} (Ligne ${ligne}) : ${time.getHours()}h${time.getMinutes().toString().padStart(2, '0')}`;
    }).join("<br>");
    document.getElementById("rer-a").innerHTML = html;
  });
}

function displayBus(id, endpoint) {
  fetchPrimAPI(endpoint, data => {
    const info = data.ServiceDelivery.StopMonitoringDelivery[0].MonitoredStopVisit;
    const html = info.map(el => {
      const dest = el.MonitoredVehicleJourney.DestinationName;
      const time = new Date(el.MonitoredVehicleJourney.MonitoredCall.ExpectedArrivalTime);
      return `→ ${dest} : ${time.getHours()}h${time.getMinutes().toString().padStart(2, '0')}`;
    }).join("<br>");
    document.getElementById(id).innerHTML = html;
  });
}

function displayVelib() {
  Promise.all([
    fetch(allOriginsBase + encodeURIComponent(endpoints.velibStatus)).then(res => res.json()),
    fetch(allOriginsBase + encodeURIComponent(endpoints.velibInfo)).then(res => res.json())
  ]).then(([status, info]) => {
    const ids = [12128, 12163];
    const html = ids.map(id => {
      const stat = status.data.stations.find(s => s.station_id == id);
      const inf = info.data.stations.find(s => s.station_id == id);
      return `<strong>${inf.name}</strong> : ${stat.num_bikes_available} vélos dont ${stat.num_ebikes_available} électriques, ${stat.num_docks_available} places dispo.`;
    }).join("<br>");
    document.getElementById("velib").innerHTML = html;
  }).catch(err => {
    document.getElementById("velib").innerText = "Erreur";
    console.error("Erreur Vélib'", err);
  });
}

function init() {
  updateTime();
  displayRER();
  displayBus("bus-77", endpoints.bus77);
  displayBus("bus-201", endpoints.bus201);
  displayVelib();
}

init();
