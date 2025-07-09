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

print("\u2B07\ufe0f Téléchargement du GTFS...")
resp = requests.get(GTFS_URL)
z = zipfile.ZipFile(BytesIO(resp.content))

stops = pd.read_csv(z.open("stops.txt"))
stop_times = pd.read_csv(z.open("stop_times.txt"), low_memory=False)
trips = pd.read_csv(z.open("trips.txt"), low_memory=False)
calendar = pd.read_csv(z.open("calendar.txt"))
calendar_dates = pd.read_csv(z.open("calendar_dates.txt")) if "calendar_dates.txt" in z.namelist() else pd.DataFrame()
routes = pd.read_csv(z.open("routes.txt"))

export = {
    "rer": {"horaires": [], "gares_par_destination": {}, "premiers_derniers": {}},
    "bus77": {"horaires": [], "gares_par_destination": collections.OrderedDict(), "premiers_derniers": {}},
    "bus201": {"horaires": [], "gares_par_destination": collections.OrderedDict(), "premiers_derniers": {}},
    "lastFetch": int(datetime.now().timestamp())
}

aujourd_hui = datetime.now().date()
dow = aujourd_hui.weekday()

active_services = set()
for _, row in calendar.iterrows():
    start = datetime.strptime(str(row['start_date']), "%Y%m%d").date()
    end = datetime.strptime(str(row['end_date']), "%Y%m%d").date()
    if start <= aujourd_hui <= end:
        if (dow == 0 and row['monday']) or (dow == 1 and row['tuesday']) or \
           (dow == 2 and row['wednesday']) or (dow == 3 and row['thursday']) or \
           (dow == 4 and row['friday']) or (dow == 5 and row['saturday']) or \
           (dow == 6 and row['sunday']):
            active_services.add(row['service_id'])

if not calendar_dates.empty:
    for _, row in calendar_dates.iterrows():
        if int(row['date']) == int(aujourd_hui.strftime("%Y%m%d")):
            if row['exception_type'] == 1:
                active_services.add(row['service_id'])
            elif row['exception_type'] == 2 and row['service_id'] in active_services:
                active_services.remove(row['service_id'])

for target in TARGETS:
    stop_ids = stops[stops['parent_station'] == target['parent_station']]['stop_id'].tolist()
    if target['parent_station'] in stops['stop_id'].values:
        stop_ids.append(target['parent_station'])

    route_trips = trips[(trips['route_id'] == target['route_id']) & (trips['service_id'].isin(active_services))]
    for trip_id in route_trips['trip_id'].unique():
        trip_info = route_trips[route_trips['trip_id'] == trip_id].iloc[0]
        headsign = trip_info['trip_headsign']

        stops_this_trip = stop_times[stop_times['trip_id'] == trip_id].sort_values('stop_sequence')
        stop_seq_ids = stops_this_trip['stop_id'].tolist()
        horaires = stops_this_trip[stops_this_trip['stop_id'].isin(stop_ids)]

        for _, h in horaires.iterrows():
            heure = h['departure_time'][:5]
            gares_restantes = stops[stops['stop_id'].isin(
                stops_this_trip[stops_this_trip['stop_sequence'] > h['stop_sequence']]['stop_id']
            )]['stop_name'].tolist()

            if target['ligne'] == "RER A":
                export['rer']['horaires'].append({"time": heure, "destination": headsign, "gares_restantes": gares_restantes})
                if headsign not in export['rer']['gares_par_destination']:
                    export['rer']['gares_par_destination'][headsign] = gares_restantes
            else:
                export[f"bus{target['ligne']}"]['horaires'].append({"time": heure, "destination": headsign})
                if headsign not in export[f"bus{target['ligne']}"]['gares_par_destination']:
                    export[f"bus{target['ligne']}"]['gares_par_destination'][headsign] = gares_restantes

for section in ['rer', 'bus77', 'bus201']:
    par_dest = collections.defaultdict(list)
    for h in export[section]['horaires']:
        par_dest[h['destination']].append(h['time'])
    for dest, horaires in par_dest.items():
        try:
            horaires_sorted = sorted(horaires, key=lambda x: int(x.split(':')[0]) * 60 + int(x.split(':')[1]))
            export[section]['premiers_derniers'][dest] = {
                "premier": horaires_sorted[0],
                "dernier": horaires_sorted[-1]
            }
        except:
            continue

with open("static/horaires_export.json", "w", encoding="utf-8") as f:
    json.dump(export, f, indent=2, ensure_ascii=False)

print("\u2705 Export terminé dans static/horaires_export.json")
