import zipfile
import pandas as pd
import requests
from io import BytesIO
from datetime import datetime
import json

GTFS_URL = "https://eu.ftp.opendatasoft.com/stif/GTFS/IDFM-gtfs.zip"

TARGETS = [
    {"nom": "Hippodrome de Vincennes", "parent_station": "IDFM:463642"},
    {"nom": "École du Breuil", "parent_station": "IDFM:463645"},
    {"nom": "Joinville-le-Pont", "parent_station": "IDFM:70640"},
]

print("⬇️ Téléchargement du GTFS...")
resp = requests.get(GTFS_URL)
z = zipfile.ZipFile(BytesIO(resp.content))

stops = pd.read_csv(z.open("stops.txt"))
stop_times = pd.read_csv(z.open("stop_times.txt"), low_memory=False)
trips = pd.read_csv(z.open("trips.txt"), low_memory=False)
calendar = pd.read_csv(z.open("calendar.txt"))
calendar_dates = pd.read_csv(z.open("calendar_dates.txt")) if "calendar_dates.txt" in z.namelist() else pd.DataFrame()

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

export = {"horaires": {}, "lastFetch": int(datetime.now().timestamp())}

for target in TARGETS:
    stop_ids = stops[stops['parent_station'] == target['parent_station']]['stop_id'].tolist()
    if target['parent_station'] in stops['stop_id'].values:
        stop_ids.append(target['parent_station'])

    horaires = []
    trip_ids = trips[trips['service_id'].isin(active_services)]['trip_id'].unique()
    for trip_id in trip_ids:
        st = stop_times[(stop_times['trip_id'] == trip_id) & (stop_times['stop_id'].isin(stop_ids))]
        for _, row in st.iterrows():
            horaires.append(row['departure_time'][:5])

    try:
        horaires_sorted = sorted(horaires, key=lambda x: int(x[:2])*60 + int(x[3:]))
        premier = horaires_sorted[0]
        dernier = horaires_sorted[-1]
        export['horaires'][f"{target['nom']} - {target['parent_station']}"] = {"premier": premier, "dernier": dernier}
    except:
        continue

with open("static/horaires_export.json", "w", encoding="utf-8") as f:
    json.dump(export, f, indent=2, ensure_ascii=False)

print("✅ Export terminé → static/horaires_export.json")
