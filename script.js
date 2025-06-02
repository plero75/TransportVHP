async function fetchTransportData(ref, targetId, label) {
  const url = `https://ratp-proxy.hippodrome-proxy42.workers.dev/?ref=STIF:StopPoint:Q:${ref}:`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Erreur API PRIM");
    const data = await res.json();

    const container = document.getElementById(targetId);
    container.innerHTML = `<h2>${label}</h2>`;

    if (!data.departures || data.departures.length === 0) {
      container.innerHTML += '<div>Pas de départ prochainement</div>';
      return;
    }

    data.departures.forEach(dep => {
      const delay = dep.delay;
      let style = '';
      if (delay <= 2) style = 'class="alert"';
      else if (delay <= 5) style = 'class="imminent"';

      container.innerHTML += `<div ${style}>${dep.time} → ${dep.destination}</div>`;
    });

    container.innerHTML += `<div><em>Service : ${data.service_start} - ${data.service_end}</em></div>`;
  } catch (err) {
    const container = document.getElementById(targetId);
    container.innerHTML = `<h2>${label}</h2><div>Erreur de chargement</div>`;
  }
}

async function fetchVelibData() {
  const infoURL = 'https://velib-proxy.hippodrome-proxy42.workers.dev/?url=https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_information.json';
  const statusURL = 'https://velib-proxy.hippodrome-proxy42.workers.dev/?url=https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json';

  try {
    const [infoRes, statusRes] = await Promise.all([fetch(infoURL), fetch(statusURL)]);
    const info = await infoRes.json();
    const status = await statusRes.json();

    const stationIds = ['12128', '12163'];
    const container = document.getElementById('velib');
    container.innerHTML = '<h2>Stations Vélib’</h2>';

    stationIds.forEach(id => {
      const stat = status.data.stations.find(s => s.station_id === id);
      const infoObj = info.data.stations.find(s => s.station_id === id);

      if (!stat || !infoObj) {
        container.innerHTML += `<div>Station ${id} non trouvée</div>`;
        return;
      }

      const mech = stat.num_bikes_available_types.find(t => t.mechanical)?.mechanical || 0;
      const elec = stat.num_bikes_available_types.find(t => t.ebike)?.ebike || 0;

      container.innerHTML += `
        <div><strong>${infoObj.name}</strong> (${infoObj.address})<br>
        🚲 ${mech} mécaniques | ⚡ ${elec} électriques | 🅿️ ${stat.num_docks_available} bornettes libres</div><br>`;
    });

  } catch (err) {
    document.getElementById('velib').innerHTML = 'Erreur chargement Vélib';
  }
}

function refreshAll() {
  fetchTransportData(43135, 'rerA', '🚈 RER A - Joinville-le-Pont');
  fetchTransportData(463641, 'bus77', '🚌 Bus 77 - Hippodrome');
  fetchTransportData(463644, 'bus201', '🚌 Bus 201 - École du Breuil');
  fetchVelibData();
}

setInterval(refreshAll, 60000);
refreshAll();

setInterval(() => {
  const clock = document.getElementById('clock');
  if (clock) clock.innerText = new Date().toLocaleTimeString();
}, 1000);
