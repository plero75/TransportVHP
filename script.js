
// ========== Variables utiles ==========
const apiToken = "7nAc6NHplCJtJ46Qw32QFtefq3TQEYrT";
const proxy = "https://corsproxy.io/?";

// ========== MAJ date et heure ==========
function updateDateTime() {
  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-FR", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString("fr-FR", { hour: '2-digit', minute: '2-digit' });
  document.getElementById("datetime").textContent = dateStr + " - " + timeStr;
}
setInterval(updateDateTime, 1000);
updateDateTime();

// ========== Vélib’ ==========
function fetchVelib() {
  const url = proxy + encodeURIComponent("https://velib-metropole-opendata.smovengo.cloud/opendata/Velib_Metropole/station_status.json");
  fetch(url)
    .then(res => res.json())
    .then(data => {
      const stations = [12128, 12163];
      stations.forEach(id => {
        const station = data.data.stations.find(s => s.station_id == id);
        if (station) {
          document.getElementById(`velib_${id}_mech`).textContent = station.num_bikes_available_types.find(b => b.type === "mechanical")?.value || 0;
          document.getElementById(`velib_${id}_elec`).textContent = station.num_bikes_available_types.find(b => b.type === "ebike")?.value || 0;
          document.getElementById(`velib_${id}_free`).textContent = station.num_docks_available;
        }
      });
    });
}
fetchVelib();
setInterval(fetchVelib, 60000);

// ========== Infos trafic RER / Bus ==========
function fetchTrafficInfo(lineCode, containerId) {
  const url = proxy + encodeURIComponent(`https://api.iledefrance-mobilites.fr/v1/network/lines/${lineCode}/traffic`);
  fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` }
  })
    .then(res => res.json())
    .then(data => {
      const info = data.message || "RAS";
      document.getElementById(containerId).textContent = info;
    });
}
fetchTrafficInfo("RER.A", "trafic_rer");
fetchTrafficInfo("BUS.77", "trafic_77");
fetchTrafficInfo("BUS.201", "trafic_201");

// ========== Prochains passages RER Joinville ==========
function fetchNextPassages(stopId, containerId) {
  const url = proxy + encodeURIComponent(`https://api.iledefrance-mobilites.fr/v1/stop-areas/${stopId}/departures?count=3`);
  fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` }
  })
    .then(res => res.json())
    .then(data => {
      const list = document.getElementById(containerId);
      list.innerHTML = "";
      data.departures.forEach(dep => {
        const li = document.createElement("li");
        li.textContent = `${dep.display_informations.direction} - ${dep.stop_date_time.departure_time.slice(0, 5)}`;
        list.appendChild(li);
      });
    });
}
fetchNextPassages("stop_area:IDFM:8775860", "rer_directions");

// ========== Horaires de service ==========
function fetchServiceTimes(stopId, containerId) {
  const url = proxy + encodeURIComponent(`https://api.iledefrance-mobilites.fr/v1/coverage/IDFM/stop_areas/${stopId}/route_schedules`);
  fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` }
  })
    .then(res => res.json())
    .then(data => {
      const schedules = data.route_schedules[0]?.table?.rows;
      if (schedules?.length > 0) {
        const first = schedules[0].stop_time.departure_time;
        const last = schedules[schedules.length - 1].stop_time.departure_time;
        document.getElementById(containerId).textContent = `Premier : ${first.slice(0, 5)} | Dernier : ${last.slice(0, 5)}`;
      }
    });
}
fetchServiceTimes("stop_area:IDFM:8775860", "rer_hours"); // Joinville
fetchServiceTimes("stop_area:IDFM:49168", "bus77_hours"); // Hippodrome
fetchServiceTimes("stop_area:IDFM:48485", "bus201_hours"); // Pyramide
