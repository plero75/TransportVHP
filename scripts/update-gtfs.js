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
    {"nom": "Joinville-le-Pont", "stop_name": "Joinville-le-Pont", "route_id": "IDFM:C01742", "ligne": "RER A"},
]

today = datetime.now().date()
days = [today]

print("Téléchargement des données GTFS…")
resp = requests.get(GTFS_URL)
z = zipfile.ZipFile(BytesIO(resp.content))

stops = pd.read_csv(z.open("stops.txt"))
stop_times = pd.read_csv(z.open("stop_times.txt"), low_memory=False)
trips = pd.read_csv(z.open("trips.txt"), low_memory=False)
calendar = pd.read_csv(z.open("calendar.txt"))
calendar_dates = pd.read_csv(z.open("calendar_dates.txt")) if "calendar_dates.txt" in z.namelist() else pd.DataFrame()
routes = pd.read_csv(z.open("routes.txt"))

resultats = {
    "rer": {"horaires": [], "gares_par_destination": {}, "premier_dernier": {}},
    "bus77": {"horaires": [], "gares_par_destination": {}, "premier_dernier": {}},
    "bus201": {"horaires": [], "gares_par_destination": {}, "premier_dernier": {}},
    "lastFetch": int(datetime.now().timestamp())
}

for target in TARGETS:
    ligne = target["ligne"]
    route_id = target["route_id"]
    trips_line = trips[trips['route_id'] == route_id]

    # Stop IDs
    if ligne == "RER A":
        stop_ids = stops[stops['stop_name'].str.contains(target["stop_name"], case=False)]['stop_id'].tolist()
    else:
        parent_station = target["parent_station"]
        stop_ids = stops[stops['parent_station'] == parent_station]['stop_id'].tolist()
        if parent_station in stops['stop_id'].values:
            stop_ids.append(parent_station)

    horaires_ligne = []
    destinations_seen = set()

    for day in days:
        dow = day.weekday()
        active_service_ids = []

        for _, row in calendar.iterrows():
            start = datetime.strptime(str(row['start_date']), "%Y%m%d").date()
            end = datetime.strptime(str(row['end_date']), "%Y%m%d").date()
            if not (start <= day <= end): continue
            if dow < 5 and row['monday']: active_service_ids.append(row['service_id'])
            if dow == 5 and row['saturday']: active_service_ids.append(row['service_id'])
            if dow == 6 and row['sunday']: active_service_ids.append(row['service_id'])

        if not calendar_dates.empty:
            today_exceptions = calendar_dates[calendar_dates['date'] == int(day.strftime("%Y%m%d"))]
            for _, ex in today_exceptions.iterrows():
                if ex['exception_type'] == 1 and ex['service_id'] not in active_service_ids:
                    active_service_ids.append(ex['service_id'])
                if ex['exception_type'] == 2 and ex['service_id'] in active_service_ids:
                    active_service_ids.remove(ex['service_id'])

        trips_today = trips_line[trips_line['service_id'].isin(active_service_ids)]

        for _, trip in trips_today.iterrows():
            trip_id = trip['trip_id']
            dest = trip['trip_headsign'] if 'trip_headsign' in trip else "?"

            stops_trip = stop_times[stop_times['trip_id'] == trip_id]
            stops_filtered = stops_trip[stops_trip['stop_id'].isin(stop_ids)]
            if stops_filtered.empty:
                continue

            for _, st in stops_filtered.iterrows():
                time_str = st['departure_time'][:5]
                horaires_ligne.append({"time": time_str, "destination": dest})

            # Ajouter la séquence d’arrêts une seule fois par destination
            if dest not in resultats[f"bus{ligne.lower()}" if ligne != "RER A" else "rer"]["gares_par_destination"]:
                stop_names = stops[stops['stop_id'].isin(stops_trip['stop_id'])]['stop_name'].tolist()
                resultats[f"bus{ligne.lower()}" if ligne != "RER A" else "rer"]["gares_par_destination"][dest] = stop_names

    # Trier les horaires et enregistrer
    horaires_ligne.sort(key=lambda x: x['time'])
    resultats[f"bus{ligne.lower()}" if ligne != "RER A" else "rer"]["horaires"].extend(horaires_ligne)

    # Calcul premier/dernier passage par destination
    horaires_par_dest = collections.defaultdict(list)
    for h in horaires_ligne:
        horaires_par_dest[h["destination"]].append(h["time"])

    premiers_derniers = {
        dest: {
            "premier": horaires[0],
            "dernier": horaires[-1]
        }
        for dest, horaires in horaires_par_dest.items() if horaires
    }

    resultats[f"bus{ligne.lower()}" if ligne != "RER A" else "rer"]["premier_dernier"] = premiers_derniers

# Export JSON
with open("static/horaires_export.json", "w", encoding="utf-8") as f:
    json.dump(resultats, f, indent=2, ensure_ascii=False)

print("✅ Données GTFS extraites avec succès dans static/horaires_export.json")
