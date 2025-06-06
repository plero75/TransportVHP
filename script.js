
const proxyURL = 'https://ratp-proxy.hippodrome-proxy42.workers.dev/?ref=';

const rerID = 'STIF:StopPoint:Q:43135:';
const busIDs = ['STIF:StopPoint:Q:463641:', 'STIF:StopPoint:Q:463644:'];
const velibStations = [12128, 12163];

async function fetchData(ref) {
  const response = await fetch(proxyURL + encodeURIComponent(ref));
  return response.json();
}

async function refreshAll() {
  try {
    const rer = await fetchData(rerID);
    document.getElementById('rer-data').innerText = JSON.stringify(rer, null, 2);
    const buses = await Promise.all(busIDs.map(id => fetchData(id)));
    document.getElementById('bus-data').innerText = JSON.stringify(buses, null, 2);
    const velib = await Promise.all(velibStations.map(id => fetch(`https://velib-proxy.hippodrome-proxy42.workers.dev/?station=${id}`).then(r => r.json())));
    document.getElementById('velib-data').innerText = JSON.stringify(velib, null, 2);
  } catch (e) {
    console.error("Erreur API:", e);
  }
}
refreshAll();
setInterval(refreshAll, 60000);
