
const STOPS = {
  rer: "STIF:StopPoint:Q:43135:",
  bus77: "STIF:StopPoint:Q:463641:",
  bus201: "STIF:StopPoint:Q:463644:"
};

const proxy = "https://transportvhp.hippodrome-proxy42.workers.dev";

async function fetchDepartures(stopId, label) {
  try {
    const res = await fetch(`${proxy}/stop-areas/${stopId}/departures?duration=60`);
    const data = await res.json();

    const lines = data.departures.map(dep => 
      `<div class="line">
         <strong>${dep.display_informations.label}</strong> → ${dep.display_informations.direction} à ${dep.stop_date_time.departure_time.slice(0, 5)}
       </div>`
    ).join("");

    document.getElementById(label).innerHTML = `<h2>${label.toUpperCase()}</h2>${lines}`;
  } catch (e) {
    console.error("Erreur récupération", e);
  }
}

function refreshAll() {
  fetchDepartures(STOPS.rer, "rer");
  fetchDepartures(STOPS.bus77, "bus");
  fetchDepartures(STOPS.bus201, "bus");

  document.getElementById("timestamp").textContent = `Mis à jour à ${new Date().toLocaleTimeString()}`;
}

refreshAll();
setInterval(refreshAll, 60000);
