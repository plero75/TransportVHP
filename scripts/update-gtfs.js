import zipfile
import pandas as pd
import requests
from io import BytesIO
from datetime import datetime, timedelta
import json
import collections

GTFS_URL = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip"

TARGETS = [
    {"nom": "Hippodrome de Vincennes", "parent_station": "IDFM:463642", "route_id": "IDFM:C02251", "ligne": "77"},
    {"nom": "École du Breuil", "parent_station": "IDFM:463645", "route_id": "IDFM:C01219", "ligne": "201"},
    {"nom": "École du Breuil", "parent_station": "IDFM:463645", "route_id": "IDFM:C02251", "ligne": "77"},
    {"nom": "Joinville-le-Pont", "parent_station": "IDFM:70640", "route_id": "STIF:Line::C01742:", "ligne": "RER A"},
]

print("Téléchargement des données GTFS…")
resp = requests.get(GTFS_URL)
z = zipfile.ZipFile(BytesIO(resp.content))

stops = pd.read_csv(z.open("stops.txt"))
stop_times = pd.read_csv(z.open("stop_times.txt"), low_memory=False)
trips = pd.read_csv(z.open("trips.txt"), low_memory=False)
calendar = pd.read_csv(z.open("calendar.txt"))
calendar_dates = pd.read_csv(z.open("calendar_dates.txt")) if "calendar_dates.txt" in z.namelist() else pd.DataFrame()

today = datetime.now().date()
dow = today.weekday()
active_service_ids = []

# Détecter les services actifs aujourd'hui
for _, row in calendar.iterrows():
    start = datetime.strptime(str(row['start_date']), "%Y%m%d").date()
    end = datetime.strptime(str(row['end_date']), "%Y%m%d").date()
    if start <= today <= end:
        if (dow < 5 and row['monday']) or (dow == 5 and row['saturday']) or (dow == 6 and row['sunday']):
            active_service_ids.append(row['service_id'])

if not calendar_dates.empty:
    today_str = int(today.strftime("%Y%m%d"))
    exceptions = calendar_dates[calendar_dates['date'] == today_str]
    for _, ex in exceptions.iterrows():
        if ex['exception_type'] == 1 and ex['service_id'] not in active_service_ids:
            active_service_ids.append(ex['service_id'])
        elif ex['exception_type'] == 2 and ex['service_id'] in active_service_ids:
            active_service_ids.remove(ex['service_id'])

result = {
    "rer": {"horaires": [], "first_last": {}, "gares_par_destination": {}},
    "bus77": {"horaires": [], "first_last": {}, "gares_par_destination": {}},
    "bus201": {"horaires": [], "first_last": {}, "gares_par_destination": {}},
    "lastFetch": int(datetime.now().timestamp())
}

for target in TARGETS:
    nom = target["nom"]
    parent = target["parent_station"]
    route_id = target["route_id"]
    ligne = target["ligne"]

    stop_ids = stops[stops['parent_station'] == parent]['stop_id'].tolist()
    if parent in stops['stop_id'].values:
        stop_ids.append(parent)

    trips_line = trips[trips['route_id'] == route_id]
    trips_today = trips_line[trips_line['service_id'].isin(active_service_ids)]
    trip_ids_today = trips_today['trip_id'].tolist()

    horaires = []
    destinations = collections.defaultdict(list)

    for trip_id in trip_ids_today:
        current_stops = stop_times[(stop_times['trip_id'] == trip_id) & (stop_times['stop_id'].isin(stop_ids))]
        if current_stops.empty:
            continue
        for _, st in current_stops.iterrows():
            time = st['departure_time'][:5]
            seq = st['stop_sequence']
            dest = trips_today[trips_today['trip_id'] == trip_id]['trip_headsign'].values[0]
            horaires.append({"time": time, "destination": dest})

            remaining_stops = stop_times[(stop_times['trip_id'] == trip_id) & (stop_times['stop_sequence'] > seq)]
            names = stops[stops['stop_id'].isin(remaining_stops['stop_id'])]['stop_name'].tolist()
            if dest not in destinations:
                destinations[dest] = names

    if ligne == "RER A":
        result["rer"]["horaires"].extend(horaires)
        result["rer"]["gares_par_destination"] = destinations
    elif ligne == "77":
        result["bus77"]["horaires"].extend(horaires)
        for dest, names in destinations.items():
            result["bus77"]["gares_par_destination"][dest] = names
    elif ligne == "201":
        result["bus201"]["horaires"].extend(horaires)
        for dest, names in destinations.items():
            result["bus201"]["gares_par_destination"][dest] = names

# Ajout des premiers/derniers horaires
for key in ["rer", "bus77", "bus201"]:
    times_by_dest = collections.defaultdict(list)
    for h in result[key]["horaires"]:
        times_by_dest[h["destination"]].append(h["time"])
    result[key]["first_last"] = {
        dest: {"first": min(times), "last": max(times)}
        for dest, times in times_by_dest.items()
    }

# Export final
with open("static/horaires_export.json", "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

print("✅ Fichier exporté avec premiers/derniers horaires + gares par destination.")
