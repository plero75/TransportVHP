
const proxy = "https://transportvhp.hippodrome-proxy42.workers.dev/?ref=";
const points = {
  rer: "STIF:StopPoint:Q:43135:",
  bus77: "STIF:StopPoint:Q:463641:",
  bus201: "STIF:StopPoint:Q:463644:"
};
const velibStations = ["12128", "12163"]; // exemple

async function fetchTransports() {
  for (const [id, ref] of Object.entries(points)) {
    try {
      const response = await fetch(proxy + encodeURIComponent(ref));
      const data = await response.json();
      displayDepartures(data, id);
    } catch (e) {
      document.getElementById(id + "-data").innerHTML = "<p>Erreur chargement données</p>";
    }
  }

  fetchVelib();
  document.getElementById("timestamp").textContent = "Dernière mise à jour : " + new Date().toLocaleTimeString();
  setTimeout(fetchTransports, 60000);
}

function displayDepartures(data, id) {
  const container = document.getElementById(id + "-data");
  container.innerHTML = "";
  const journeys = data.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];
  if (journeys.length === 0) {
    container.innerHTML = "<p>Aucune donnée disponible.</p>";
    return;
  }
  for (const visit of journeys) {
    const line = visit.MonitoredVehicleJourney;
    const time = line.MonitoredCall?.ExpectedArrivalTime || "n/a";
    const direction = line.DirectionName || "Direction inconnue";
    container.innerHTML += `<div class="line"><strong>${line.LineRef}</strong> – ${direction}<br>${new Date(time).toLocaleTimeString()}</div>`;
  }
}

async function fetchVelib() {
  const container = document.getElementById("velib-data");
  container.innerHTML = "";
  for (const id of velibStations) {
    try {
      const res = await fetch(`https://velib-proxy.hippodrome-proxy42.workers.dev/station_status.json`);
      const status = await res.json();
      const station = status.data.stations.find(s => s.station_id === id);
      if (station) {
        container.innerHTML += `<div class="line">Station ${id} – Vélos : ${station.num_bikes_available}, Docks : ${station.num_docks_available}</div>`;
      }
    } catch (e) {
      container.innerHTML += `<div class="line">Erreur station ${id}</div>`;
    }
  }
}

fetchTransports();
