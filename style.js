function updateTime() {
  const now = new Date();
  const timeString = now.toLocaleTimeString("fr-FR", {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const clockElement = document.getElementById("clock");
  if (clockElement) {
    clockElement.textContent = timeString;
  }
}

function formatDeparture(timeRemaining) {
  if (timeRemaining <= 2) {
    return '<span class="imminent">Arrivée imminente</span>';
  } else if (timeRemaining <= 5) {
    return '<span class="warn">' + timeRemaining + ' min</span>';
  } else {
    return timeRemaining + ' min';
  }
}

function displayDepartures(sectionId, title, departures) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.innerHTML = '<h2>' + title + '</h2>';

  departures.forEach(dep => {
    const line = document.createElement("div");
    line.className = "line";
    line.innerHTML = '<strong>' + dep.line + '</strong> → ' + dep.destination +
      '<span class="departure">' + formatDeparture(dep.time) + '</span>';
    section.appendChild(line);
  });
}

function loadPRIM(sectionId, ref, title) {
  fetch(`https://ratp-proxy.hippodrome-proxy42.workers.dev/?ref=STIF:StopPoint:Q:${ref}:`)
    .then(response => response.json())
    .then(data => {
      const departures = (data.departures || []).map(dep => ({
        line: dep.route.shortName || '?',
        destination: dep.headsign || '...',
        time: dep.display_in_minutes || 0
      }));
      displayDepartures(sectionId, title, departures);
    })
    .catch(error => console.error("Erreur PRIM", sectionId, error));
}

function getVelibData() {
  Promise.all([
    fetch("https://velib-proxy.hippodrome-proxy42.workers.dev/station_status.json"),
    fetch("https://velib-proxy.hippodrome-proxy42.workers.dev/station_information.json")
  ]).then(async ([statusRes, infoRes]) => {
    const [statusData, infoData] = await Promise.all([statusRes.json(), infoRes.json()]);
    const stations = statusData.data.stations;
    const infos = infoData.data.stations;
    const stationIds = ["21048", "21047"];
    const displayStations = stations.filter(st => stationIds.includes(st.station_id))
      .map(st => {
        const info = infos.find(i => i.station_id === st.station_id) || {};
        return {
          name: info.name || "Inconnu",
          bikes: st.num_bikes_available,
          docks: st.num_docks_available
        };
      });

    const section = document.getElementById("velib");
    section.innerHTML = "<h2>Stations Vélib’</h2>";
    displayStations.forEach(st => {
      const line = document.createElement("div");
      line.className = "line";
      line.innerHTML = `<strong>${st.name}</strong> → <span class="departure">${st.bikes} vélos / ${st.docks} bornettes</span>`;
      section.appendChild(line);
    });
  }).catch(err => console.error("Erreur Vélib", err));
}

function init() {
  updateTime();
  setInterval(updateTime, 1000);

  loadPRIM("rerA", "43135", "RER A : Joinville-le-Pont");
  loadPRIM("bus77", "463641", "Bus 77 : Hippodrome de Vincennes");
  loadPRIM("bus201", "463644", "Bus 201 : École du Breuil");
  getVelibData();
}

document.addEventListener("DOMContentLoaded", init);