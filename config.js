export const CONFIG = {
    proxy: "https://ratp-proxy.hippodrome-proxy42.workers.dev?url=",
    
    stops: {
        rer: "STIF:StopArea:SP:43135:",
        bus77: "STIF:StopArea:SP:463641:",
        bus201: "STIF:StopArea:SP:463644:"
    },
    
    lines: {
        rer: "STIF:Line::C01742:",
        bus77: "STIF:Line::C01789:",
        bus201: "STIF:Line::C01805:"
    },
    
    endpoints: {
        stopMonitoring: "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring",
        generalMessage: "https://prim.iledefrance-mobilites.fr/marketplace/general-message",
        situationExchange: "https://prim.iledefrance-mobilites.fr/marketplace/situation-exchange"
    }
};
