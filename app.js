import { CONFIG } from './config.js';

const proxy = CONFIG.proxy;
const cache = { 
    stops: null, 
    firstLast: null, 
    lastFetch: 0,
    trafficInfo: new Map(),
    generalMessages: new Map()
};
const ONE_DAY = 86_400_000;

// Directions connues pour chaque ligne
const DIRECTIONS = {
    rer: ["Cergy", "Poissy", "Marne-la-Vallée", "Boissy-Saint-Léger"],
    bus77: ["Vincennes Hippodrome", "Nogent-sur-Marne"],
    bus201: ["Château de Vincennes", "Boissy-Saint-Léger"],
    joinville: ["Direction Diverses"] // Pour les multiples lignes à Joinville
};

document.addEventListener("DOMContentLoaded", async () => {
    await loadStatic();
    loop();
    setInterval(loop, 60_000);
    startWeatherLoop();
    await loadImportantTrafficInfo();
    await trouverProchaineCourseVincennes();
});

function loop() {
    clock();
    fetchAll();
}

function clock() {
    const datetimeEl = document.getElementById("datetime");
    if (datetimeEl) {
        datetimeEl.textContent = new Date().toLocaleString("fr-FR", {
            weekday: "short",
            day: "2-digit", 
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    // Mise à jour séparée pour autres éléments temps
    const timeDisplayEl = document.getElementById("time-display");
    if (timeDisplayEl) {
        timeDisplayEl.textContent = new Date().toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    const dateCompleteEl = document.getElementById("date-complete");
    if (dateCompleteEl) {
        dateCompleteEl.textContent = new Date().toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric"
        });
    }
}

// Fonction loadStatic corrigée pour éviter QuotaExceededError
async function loadStatic() {
    try {
        // Essayer de récupérer du localStorage avec gestion d'erreur
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem("dashStatic") || "null");
        } catch (e) {
            console.warn("Erreur lecture localStorage:", e);
            localStorage.removeItem("dashStatic"); // Nettoyer si corrompu
        }

        if (saved && Date.now() - saved.lastFetch < ONE_DAY) {
            Object.assign(cache, saved);
            return;
        }

        const [stops, firstLast] = await Promise.all([
            fetch("./static/gtfs-stops.json").then((r) => r.ok ? r.json() : []),
            fetch("./static/gtfs-firstlast.json").then((r) => r.ok ? r.json() : {}),
        ]);

        const newCache = { stops, firstLast, lastFetch: Date.now() };
        Object.assign(cache, newCache);

        // Sauvegarder avec gestion d'erreur quota
        try {
            localStorage.setItem("dashStatic", JSON.stringify(newCache));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                console.warn("Quota localStorage dépassé, nettoyage...");
                localStorage.clear();
                try {
                    localStorage.setItem("dashStatic", JSON.stringify(newCache));
                } catch (e2) {
                    console.warn("Impossible de sauvegarder en localStorage:", e2);
                }
            } else {
                console.warn("Erreur localStorage:", e);
            }
        }
    } catch (e) {
        console.warn("Static GTFS indisponible :", e);
    }
}

function fetchAll() {
    horaireAvecTrafic("rer", CONFIG.stops.rer, CONFIG.lines.rer, "🚆 RER A");
    horaireAvecTrafic("bus77", CONFIG.stops.bus77, CONFIG.lines.bus77, "🚌 Bus 77");
    horaireAvecTrafic("bus201", CONFIG.stops.bus201, CONFIG.lines.bus201, "🚌 Bus 201");
    horaireJoinvilleAll();
    meteo();
    news();
    velib();
    sytadinStatus();
}

// Fonction principale pour récupérer horaires + infos trafic
async function horaireAvecTrafic(id, stopId, lineId, title) {
    const scheduleEl = document.getElementById(`${id}-schedules`);
    const alertEl = document.getElementById(`${id}-alert`);
    const firstlastEl = document.getElementById(`${id}-firstlast`);
    const trafficEl = document.getElementById(`${id}-traffic`);

    // Vérifications sécuritaires
    if (!scheduleEl) {
        console.warn(`Element ${id}-schedules introuvable`);
        return;
    }

    try {
        // Paralléliser les appels
        const [stopData, trafficMessages, generalMessages] = await Promise.all([
            fetchStopMonitoring(stopId),
            fetchTrafficInfo(lineId, stopId),
            fetchGeneralMessage(lineId)
        ]);

        // Affichage infos trafic
        if (trafficEl) renderTrafficBanner(trafficEl, trafficMessages);

        // Affichage messages généraux/alertes
        if (alertEl) {
            if (generalMessages.length > 0) {
                alertEl.innerHTML = generalMessages.map(msg => `<div class="alert-item">${msg}</div>`).join('');
                alertEl.style.display = 'block';
            } else {
                alertEl.style.display = 'none';
            }
        }

        // Horaires premiers/derniers
        if (firstlastEl) {
            const fl = cache.firstLast?.[id];
            if (fl) firstlastEl.innerHTML = `♦️ ${fl.first} – ${fl.last}`;
        }

        const visits = stopData?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

        if (!visits.length) {
            handleNoService(scheduleEl, cache.firstLast?.[id], generalMessages);
            return;
        }

        // Rendu avec toutes les directions
        renderDirectionsComplete(scheduleEl, visits, DIRECTIONS[id], id);

    } catch (error) {
        console.error(`Erreur ${id}:`, error);
        scheduleEl.innerHTML = `<div class="error">Erreur de récupération des données</div>`;
    }
}

// Fetch Joinville tous bus
async function horaireJoinvilleAll() {
    const scheduleEl = document.getElementById("joinville-schedules");
    const trafficEl = document.getElementById("joinville-traffic");
    
    if (!scheduleEl) return;

    try {
        const stopData = await fetchStopMonitoring(CONFIG.stops.rer); // Joinville
        const visits = stopData?.Siri?.ServiceDelivery?.StopMonitoringDelivery?.[0]?.MonitoredStopVisit || [];

        if (trafficEl) {
            renderTrafficBanner(trafficEl, ["Informations en temps réel"]);
        }

        if (!visits.length) {
            scheduleEl.innerHTML = `<div class="no-service">Aucun bus prévu</div>`;
            return;
        }

        renderJoinvilleBusesAll(scheduleEl, visits);

    } catch (error) {
        console.error("Erreur Joinville:", error);
        scheduleEl.innerHTML = `<div class="error">Erreur de récupération</div>`;
    }
}

// Render Joinville tous bus
function renderJoinvilleBusesAll(scheduleEl, visits) {
    const lineMap = new Map();
    
    visits.forEach(v => {
        const mvj = v.MonitoredVehicleJourney;
        const lineRef = mvj.LineRef?.value || "Ligne inconnue";
        const lineCode = lineRef.split(":").pop() || lineRef;
        const dest = mvj.MonitoredCall?.DestinationDisplay || "Direction inconnue";
        
        if (!lineMap.has(lineCode)) {
            lineMap.set(lineCode, new Map());
        }
        
        if (!lineMap.get(lineCode).has(dest)) {
            lineMap.get(lineCode).set(dest, []);
        }
        
        lineMap.get(lineCode).get(dest).push(v);
    });

    let html = '';
    lineMap.forEach((directions, lineCode) => {
        directions.forEach((passages, dest) => {
            const blockEl = document.createElement('div');
            blockEl.className = 'block';
            
            const titleEl = document.createElement('div');
            titleEl.className = 'dir';
            titleEl.textContent = `${lineCode} ${dest}`;
            blockEl.appendChild(titleEl);
            
            if (passages.length === 0) {
                const noService = document.createElement('div');
                noService.className = 'no-passages';
                noService.textContent = 'Service terminé';
                blockEl.appendChild(noService);
            } else {
                const rowsEl = document.createElement('div');
                rowsEl.className = 'rows';
                
                passages.slice(0, 2).forEach(v => {
                    const call = v.MonitoredVehicleJourney.MonitoredCall;
                    const exp = new Date(call.ExpectedDepartureTime);
                    const timeToExp = Math.max(0, Math.round((exp - Date.now()) / 60000));
                    
                    const timeEl = document.createElement('div');
                    timeEl.className = 'time';
                    
                    const badgeEl = document.createElement('div');
                    badgeEl.className = 'badge';
                    badgeEl.textContent = timeToExp + ' min';
                    
                    timeEl.appendChild(badgeEl);
                    rowsEl.appendChild(timeEl);
                });
                
                blockEl.appendChild(rowsEl);
            }
            
            scheduleEl.appendChild(blockEl);
        });
    });
}

// Fetch API avec gestion proxy
async function fetchStopMonitoring(stopId) {
    const url = proxy + encodeURIComponent(`${CONFIG.endpoints.stopMonitoring}?MonitoringRef=${stopId}`);
    const response = await fetch(url);
    return response.json();
}

async function fetchGeneralMessage(lineId) {
    const url = proxy + encodeURIComponent(`${CONFIG.endpoints.generalMessage}?LineRef=${lineId}`);
    try {
        const response = await fetch(url);
        const data = await response.json();
        const messages = data?.Siri?.ServiceDelivery?.GeneralMessageDelivery?.[0]?.InfoMessage || [];
        return messages.map(m => m?.Content?.Message?.[0]?.MessageText?.[0]?.value).filter(Boolean);
    } catch {
        return [];
    }
}

async function fetchTrafficInfo(lineId, stopId) {
    const url = proxy + encodeURIComponent(`${CONFIG.endpoints.situationExchange}?LineRef=${lineId}&StopPointRef=${stopId}`);
    try {
        const response = await fetch(url);
        const data = await response.json();
        const situations = data?.Siri?.ServiceDelivery?.SituationExchangeDelivery?.[0]?.Situations || [];
        return situations.map(s => s?.Description?.[0]?.value || s?.Summary?.[0]?.value).filter(Boolean);
    } catch {
        return [];
    }
}

// News corrigé avec vérifications
async function news() {
    const newsContainer = document.getElementById("news-container");
    if (!newsContainer) return;

    try {
        const rssUrl = proxy + encodeURIComponent("https://www.francetvinfo.fr/titres.rss");
        const response = await fetch(rssUrl);
        const text = await response.text();
        
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const items = [...xml.querySelectorAll("item")].slice(0, 5);
        
        if (items.length > 0) {
            newsContainer.innerHTML = items.map(item => {
                const title = item.querySelector("title")?.textContent || "Actualité";
                return `<div class="news-item">• ${title}</div>`;
            }).join('');
        } else {
            newsContainer.innerHTML = '<div class="news-item">Aucune actualité disponible</div>';
        }
    } catch (error) {
        console.warn("Erreur news:", error);
        if (newsContainer) {
            newsContainer.innerHTML = '<div class="news-item">Erreur de chargement des actualités</div>';
        }
    }
}

// Météo corrigée
async function meteo() {
    try {
        const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=48.835&longitude=2.45&current_weather=true&hourly=temperature_2m,relativehumidity_2m,windspeed_10m";
        const response = await fetch(weatherUrl);
        const data = await response.json();
        const current = data.current_weather;
        
        // Mise à jour température dans header
        const weatherTempEl = document.getElementById("weatherTemp");
        if (weatherTempEl) {
            weatherTempEl.textContent = Math.round(current.temperature) + "°C";
        }
        
        // Mise à jour météo détaillée
        const weatherTempBigEl = document.getElementById("weather-temp-big");
        if (weatherTempBigEl) {
            weatherTempBigEl.textContent = Math.round(current.temperature) + "°C";
        }
        
        const weatherWindEl = document.getElementById("weather-wind");
        if (weatherWindEl) {
            weatherWindEl.textContent = Math.round(current.windspeed) + " km/h";
        }
        
        const weatherDescEl = document.getElementById("weather-description");
        if (weatherDescEl) {
            weatherDescEl.textContent = getWeatherDescription(current.weathercode);
        }
        
        // Icon météo
        const weatherIconEl = document.getElementById("weatherIcon");
        if (weatherIconEl) {
            setWeatherIcon(weatherIconEl, current.weathercode);
        }
        
    } catch (error) {
        console.warn("Erreur météo:", error);
        const weatherTempEl = document.getElementById("weatherTemp");
        if (weatherTempEl) {
            weatherTempEl.textContent = "--°C";
        }
    }
}

function getWeatherDescription(code) {
    const descriptions = {
        0: "Ciel dégagé",
        1: "Peu nuageux", 
        2: "Partiellement nuageux",
        3: "Couvert",
        45: "Brouillard",
        48: "Brouillard givrant",
        51: "Bruine légère",
        53: "Bruine modérée", 
        61: "Pluie légère",
        63: "Pluie modérée",
        65: "Pluie forte"
    };
    return descriptions[code] || "Temps variable";
}

function setWeatherIcon(iconEl, code) {
    iconEl.className = "weather-icon";
    
    if ([0].includes(code)) {
        iconEl.classList.add("sunny");
    } else if ([1, 2, 3].includes(code)) {
        iconEl.classList.add("cloudy"); 
    } else if ([51, 53, 61, 63, 65].includes(code)) {
        iconEl.classList.add("rainy");
    } else {
        iconEl.classList.add("windy");
    }
}

// Vélib corrigé
async function velib() {
    try {
        const [infoRes, statusRes] = await Promise.all([
            fetch("https://velib-metropole-opendata.smoove.pro/opendata_VelibMetropole_station_information.json"),
            fetch("https://velib-metropole-opendata.smoove.pro/opendata_VelibMetropole_station_status.json")
        ]);
        
        const infoData = await infoRes.json();
        const statusData = await statusRes.json();
        
        const stations = infoData.data.stations;
        const statuses = statusData.data.stations;
        
        // Station Hippodrome (12163)
        const hipInfo = stations.find(s => s.station_id === "12163");
        const hipStatus = statuses.find(s => s.station_id === "12163");
        
        if (hipInfo && hipStatus) {
            updateVelibDisplay("hip", hipStatus);
        }
        
        // Station Breuil (12128)  
        const breuiInfo = stations.find(s => s.station_id === "12128");
        const breuiStatus = statuses.find(s => s.station_id === "12128");
        
        if (breuiInfo && breuiStatus) {
            updateVelibDisplay("bre", breuiStatus);
        }
        
    } catch (error) {
        console.warn("Erreur Vélib:", error);
    }
}

function updateVelibDisplay(prefix, status) {
    const mecaEl = document.getElementById(`velib-${prefix}-meca`);
    const elecEl = document.getElementById(`velib-${prefix}-elec`);
    const docksEl = document.getElementById(`velib-${prefix}-docks`);
    
    if (mecaEl) mecaEl.textContent = status.num_bikes_available_types?.mechanical || 0;
    if (elecEl) elecEl.textContent = status.num_bikes_available_types?.ebike || 0;
    if (docksEl) docksEl.textContent = status.num_docks_available || 0;
}

// Sytadin status
async function sytadinStatus() {
    const sytadinEl = document.getElementById("sytadin-status");
    if (!sytadinEl) return;

    try {
        const sytadinUrl = proxy + encodeURIComponent("https://www.sytadin.fr/sysbarometre/courant/cens.xml");
        const response = await fetch(sytadinUrl);
        const text = await response.text();
        
        // Parse basic traffic info
        let status = "Lecture des conditions...";
        if (text.includes("fluide")) {
            status = "Trafic fluide en région";
        } else if (text.includes("dense") || text.includes("chargé")) {
            status = "Trafic chargé en région";
        } else if (text.includes("difficile")) {
            status = "Conditions difficiles";
        }
        
        sytadinEl.textContent = status;
        
        // Update road statuses
        updateRoadStatus("a86", text.includes("A86") ? "busy" : "fluid");
        updateRoadStatus("a4", text.includes("A4") ? "busy" : "fluid");  
        updateRoadStatus("n406", "fluid"); // Default
        
    } catch (error) {
        console.warn("Erreur Sytadin:", error);
        if (sytadinEl) {
            sytadinEl.textContent = "Informations indisponibles";
        }
    }
}

function updateRoadStatus(roadId, status) {
    const el = document.getElementById(`${roadId}-status`);
    if (!el) return;
    
    const statusTexts = {
        fluid: "Fluide",
        busy: "Chargé",
        blocked: "Difficile"
    };
    
    el.textContent = statusTexts[status] || "Inconnu";
    el.className = `road-state ${status}`;
}

// Courses Vincennes corrigé
async function trouverProchaineCourseVincennes() {
    const racesEl = document.getElementById("races-vincennes");
    if (!racesEl) return;

    try {
        const response = await fetch("./static/races.json");
        if (!response.ok) throw new Error("Fichier courses introuvable");
        
        const races = await response.json();
        const today = new Date().toDateString();
        const todayRaces = races.filter(r => new Date(r.date).toDateString() === today);
        
        if (todayRaces.length > 0) {
            racesEl.innerHTML = todayRaces.slice(0, 3).map(race => 
                `<div class="race-item">
                    <span class="race-name">${race.name}</span>
                    <span class="race-time">${race.time}</span>
                </div>`
            ).join('');
        } else {
            racesEl.innerHTML = '<div class="races-loading">Aucune course aujourd\'hui</div>';
        }
        
    } catch (error) {
        console.warn("Erreur courses:", error);
        if (racesEl) {
            racesEl.innerHTML = '<div class="races-loading">Programme indisponible</div>';
        }
    }
}

// Autres fonctions utiles...
function startWeatherLoop() {
    meteo(); // Initial call
    setInterval(meteo, 10 * 60 * 1000); // Every 10 minutes
}

// Saint du jour
async function updateSaintDuJour() {
    const saintEl = document.getElementById("saint-complete");
    if (!saintEl) return;

    try {
        const response = await fetch("https://nominis.cef.fr/json/nominis.php");
        const data = await response.json();
        saintEl.textContent = `Sainte ${data.saints[0]?.nom || "Inconnue"}`;
    } catch {
        const date = new Date();
        saintEl.textContent = `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
    }
}

// Messages trafic très importants 
async function loadImportantTrafficInfo() {
    const bannerEl = document.getElementById('important-traffic-banner');
    if (!bannerEl) return;
    
    try {
        const messages = await fetchGeneralMessagesSomehow();
        
        if (messages.length > 0) {
            bannerEl.innerHTML = messages.join(' • ');
            bannerEl.style.display = 'block';
            
            setInterval(() => {
                bannerEl.classList.toggle('pulse');
            }, 2000);
        }
        
    } catch (error) {
        console.warn('Impossible de charger les infos trafic importantes:', error);
    }
}

async function fetchGeneralMessagesSomehow() {
    try {
        const sytadinUrl = proxy + encodeURIComponent("https://www.sytadin.fr/sysbarometre/courant/cens.xml");
        const response = await fetch(sytadinUrl);
        const text = await response.text();
        
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, "application/xml");
        const alerts = [...xml.querySelectorAll("alert")].map(alert => {
            return alert.querySelector("message")?.textContent;
        }).filter(Boolean);
        
        return alerts.length > 0 ? alerts : [];
    } catch {
        return [];
    }
}

// Fonctions de rendu (restantes du code précédent)
function renderTrafficBanner(element, messages) {
    if (!messages.length) {
        element.style.display = 'none';
        return;
    }
    
    element.innerHTML = messages.map(msg => `<div class="traffic-msg show">${msg}</div>`).join('');
    element.style.display = 'block';
}

function handleNoService(scheduleEl, firstLast, generalMessages) {
    const repriseMsg = generalMessages.find(msg => /reprise|reprend|première/i.test(msg));
    let repriseInfo = '';
    if (repriseMsg) {
        repriseInfo = ` - ${repriseMsg}`;
    } else if (firstLast?.first) {
        repriseInfo = ` - Reprise prévue à ${firstLast.first}`;
    }

    scheduleEl.innerHTML = `<div class="service-ended">Service terminé${repriseInfo}</div>`;
}

function renderDirectionsComplete(scheduleEl, visits, allDirections, lineId) {
    const directionMap = new Map();
    allDirections.forEach(dir => directionMap.set(dir, []));
    
    visits.forEach(v => {
        const call = v.MonitoredVehicleJourney.MonitoredCall;
        const dest = Array.isArray(call.DestinationDisplay) ? 
            call.DestinationDisplay[0]?.value : 
            call.DestinationDisplay || "Direction inconnue";
        
        if (!directionMap.has(dest)) {
            directionMap.set(dest, []);
        }
        directionMap.get(dest).push(v);
    });

    scheduleEl.innerHTML = '';
    
    directionMap.forEach((passages, direction) => {
        const blockEl = document.createElement('div');
        blockEl.className = 'block';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'dir';
        titleEl.textContent = direction;
        blockEl.appendChild(titleEl);
        
        if (passages.length === 0) {
            const noService = document.createElement('div');
            noService.className = 'no-passages';
            noService.textContent = 'Aucun passage prévu';
            blockEl.appendChild(noService);
        } else {
            const rowsEl = document.createElement('div');
            rowsEl.className = 'rows';
            
            passages.slice(0, 3).forEach(v => {
                const call = v.MonitoredVehicleJourney.MonitoredCall;
                const exp = new Date(call.ExpectedDepartureTime);
                const timeToExp = Math.max(0, Math.round((exp - Date.now()) / 60000));
                const status = getVehicleStatus(call, v.MonitoredVehicleJourney);
                
                const timeEl = document.createElement('div');
                timeEl.className = 'time';
                
                const badgeEl = document.createElement('div');
                badgeEl.className = `badge ${status.className}`;
                badgeEl.textContent = timeToExp + ' min';
                
                if (status.text) {
                    const statusEl = document.createElement('div');
                    statusEl.className = `status ${status.className}`;
                    statusEl.textContent = status.text;
                    timeEl.appendChild(statusEl);
                }
                
                timeEl.appendChild(badgeEl);
                rowsEl.appendChild(timeEl);
                
                if (status.animate) {
                    setTimeout(() => animateElement(badgeEl, status.className), 100);
                }
            });
            
            blockEl.appendChild(rowsEl);
        }
        
        scheduleEl.appendChild(blockEl);
    });
}

function getVehicleStatus(call, mvj) {
    const exp = new Date(call.ExpectedDepartureTime);
    const aim = new Date(call.AimedDepartureTime);
    const status = (call.ArrivalStatus || mvj.ProgressStatus || "").toLowerCase();
    const timeToExp = Math.max(0, Math.round((exp - Date.now()) / 60000));
    
    if (status.includes("cancelled")) {
        return { className: 'cancelled', text: 'Supprimé', animate: true };
    }
    
    if (timeToExp <= 1) {
        return { className: 'imminent', text: 'Imminent', animate: true };
    }
    
    if (status.includes("inprogress")) {
        return { className: 'instation', text: 'À quai', animate: true };
    }
    
    if (exp > aim) {
        const delay = Math.round((exp - aim) / 60000);
        if (delay > 0) {
            return { className: 'delay', text: `Retard ${delay} min`, animate: true };
        }
    }
    
    return { className: 'normal', text: '', animate: false };
}

function animateElement(element, statusClass) {
    element.classList.add(`animate-${statusClass}`);
    setTimeout(() => element.classList.remove(`animate-${statusClass}`), 4000);
}

// Initialisation du saint du jour
updateSaintDuJour();
