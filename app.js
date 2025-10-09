// -----------------------------------------------------------------------------
// Dashboard Transports – Hippodrome Paris-Vincennes
// -----------------------------------------------------------------------------
// ✅ Version finale : vraies directions, temps fusionné, statut coloré,
// suppression du "prévu", cadres auto-ajustés, groupement par direction
// -----------------------------------------------------------------------------

// === Constantes principales ===
const PROXY = "https://ratp-proxy.hippodrome-proxy42.workers.dev/?url=";
const API_BASE = "https://prim.iledefrance-mobilites.fr/marketplace";

// === Identifiants d’arrêts ===
const STOP_IDS = {
  RER_A: "STIF:StopArea:SP:43135:",
  JOINVILLE: "STIF:StopArea:SP:70640:",
  HIPPODROME: "STIF:StopArea:SP:463641:",
  BREUIL: "STIF:StopArea:SP:463644:"
};

// === Lignes à afficher ===
const LINES = {
  RER_A: { id: "STIF:Line::C01742:", label: "RER A" },
  BUS_77: { id: "STIF:Line::C02251:", label: "BUS 77" },
  BUS_201: { id: "STIF:Line::C02252:", label: "BUS 201" }
};

// === Fonction principale ===
async function fetchDepartures(stopId, lineId) {
  const url = `${PROXY}${API_BASE}/stop-monitoring?MonitoringRef=${encodeURIComponent(
    stopId
  )}&LineRef=${encodeURIComponent(lineId)}`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await res.json();
    return (
      data?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]
        ?.MonitoredStopVisit || []
    );
  } catch (err) {
    console.error("Erreur fetch:", err);
    return [];
  }
}

// === Helpers ===
function minutesUntil(timeStr) {
  const diff = new Date(timeStr) - new Date();
  return Math.floor(diff / 60000);
}
function formatTime(timeStr) {
  const d = new Date(timeStr);
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// === Rendu principal avec regroupement par direction ===
async function renderDepartures(stopId, lineKey, containerId) {
  const line = LINES[lineKey];
  const visits = await fetchDepartures(stopId, line.id);
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  if (!visits.length) {
    container.innerHTML = `<div class="no-service">🚫 Service terminé</div>`;
    return;
  }

  // --- Grouper par direction ---
  const grouped = {};
  visits.forEach((v) => {
    const dir =
      v.MonitoredVehicleJourney?.DestinationName?.[0]?.value ||
      v.MonitoredVehicleJourney?.DirectionName?.[0]?.value ||
      "Direction inconnue";
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(v);
  });

  // --- Parcourir chaque direction ---
  Object.entries(grouped).forEach(([direction, group]) => {
    const directionDiv = document.createElement("div");
    directionDiv.className = "direction-block";
    directionDiv.innerHTML = `<div class="direction-title">👉 ${direction}</div>`;

    group.slice(0, 4).forEach((item) => {
      const mvj = item.MonitoredVehicleJourney;
      const call = mvj.MonitoredCall;
      const aimed = call.AimedArrivalTime || call.AimedDepartureTime;
      const expected = call.ExpectedArrivalTime || call.ExpectedDepartureTime;
      const minutes = minutesUntil(expected);
      const displayTime = `${formatTime(expected)} (${minutes} min)`;

      // === Statut ===
      const status = call.ArrivalStatus || mvj.ProgressStatus || "";
      let stateClass = "";
      let statusLabel = "";
      if (status.includes("cancelled")) {
        stateClass = "cancelled";
        statusLabel = "❌ Supprimé";
      } else if (minutes <= 1) {
        stateClass = "imminent";
        statusLabel = "🟢 Imminent";
      } else if (status.includes("inProgress")) {
        stateClass = "in-station";
        statusLabel = "🚉 En station";
      } else if (expected && aimed && expected !== aimed) {
        stateClass = "delayed";
        const delay = minutesUntil(expected) - minutesUntil(aimed);
        statusLabel = `⚠️ Retard +${delay} min`;
      }

      const itemDiv = document.createElement("div");
      itemDiv.className = `departure ${stateClass}`;
      itemDiv.innerHTML = `
        <div class="time">${displayTime}</div>
        <div class="status">${statusLabel || ""}</div>
      `;
      directionDiv.appendChild(itemDiv);
    });

    container.appendChild(directionDiv);
  });
}

// === Initialisation ===
async function initDashboard() {
  await renderDepartures(STOP_IDS.RER_A, "RER_A", "rerA");
  await renderDepartures(STOP_IDS.JOINVILLE, "BUS_77", "bus77");
  await renderDepartures(STOP_IDS.HIPPODROME, "BUS_201", "bus201");
}
initDashboard();

// === Styles dynamiques injectés ===
const style = document.createElement("style");
style.innerHTML = `
body {
  font-family: "Arial", sans-serif;
  color: #fff;
  background: #0b0b0b;
}
.direction-block {
  background: rgba(255,255,255,0.05);
  margin-bottom: 10px;
  padding: 10px;
  border-radius: 12px;
}
.direction-title {
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 6px;
  color: #00b4d8;
  border-bottom: 1px solid rgba(255,255,255,0.15);
  padding-bottom: 4px;
}
.departure {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  margin: 3px 0;
  border-radius: 8px;
  background: rgba(255,255,255,0.1);
  transition: background 0.3s;
}
.departure .time {
  font-weight: 600;
  font-size: 1em;
}
.departure .status {
  font-size: 0.9em;
  opacity: 0.9;
  text-align: right;
}
.cancelled { background: rgba(255,0,0,0.15); color: #ff6b6b; }
.delayed { background: rgba(255,165,0,0.15); color: #ffa500; }
.imminent { background: rgba(0,255,0,0.2); color: #00ff7f; animation: blink 1s infinite; }
.in-station { background: rgba(0,153,255,0.15); color: #00aaff; }
.no-service { text-align:center; padding:10px; color:#bbb; }
@keyframes blink { 50% { opacity: 0.4; } }
`;
document.head.appendChild(style);
