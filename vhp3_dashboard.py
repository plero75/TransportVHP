import argparse
import csv
import datetime as dt
import json
import os
from typing import List, Dict, Optional

import requests

PROXY_URL = "https://transportvhp.hippodrome-proxy42.workers.dev/?ref="
POINTS = {
    "rer": "STIF:StopPoint:Q:43135:",
    "bus77": "STIF:StopPoint:Q:463641:",
    "bus201": "STIF:StopPoint:Q:463644:"
}

# Map API stop references to GTFS stop identifiers
REF_TO_GTFS = {
    "STIF:StopPoint:Q:43135:": "stop_rer",
    "STIF:StopPoint:Q:463641:": "stop_bus77",
    "STIF:StopPoint:Q:463644:": "stop_bus201",
}

class GTFS:
    def __init__(self, path: str):
        self.path = path
        self.routes: Dict[str, Dict[str, str]] = {}
        self.trips: Dict[str, Dict[str, str]] = {}
        self.stop_times: List[Dict[str, str]] = []
        self.calendar: Dict[str, Dict[str, str]] = {}
        self._load()

    def _load(self) -> None:
        def read(name):
            fp = os.path.join(self.path, name)
            with open(fp, newline='') as f:
                return list(csv.DictReader(f))

        for r in read('routes.txt'):
            self.routes[r['route_id']] = r
        for t in read('trips.txt'):
            self.trips[t['trip_id']] = t
        self.stop_times = read('stop_times.txt')
        for cal in read('calendar.txt'):
            self.calendar[cal['service_id']] = cal

    def _service_active(self, service: Dict[str, str], date: dt.date) -> bool:
        start = dt.datetime.strptime(service['start_date'], '%Y%m%d').date()
        end = dt.datetime.strptime(service['end_date'], '%Y%m%d').date()
        if not (start <= date <= end):
            return False
        weekday = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'][date.weekday()]
        return service.get(weekday, '0') == '1'

    def next_departures(self, stop_id: str, date_time: dt.datetime, limit: int = 3) -> List[Dict[str, str]]:
        results = []
        active_services = {sid for sid, srv in self.calendar.items() if self._service_active(srv, date_time.date())}

        for st in self.stop_times:
            if st['stop_id'] != stop_id:
                continue
            trip = self.trips.get(st['trip_id'])
            if not trip or trip['service_id'] not in active_services:
                continue
            # Parse time in HH:MM:SS possibly >24h
            h, m, s = map(int, st['departure_time'].split(':'))
            dep_time = (date_time.replace(hour=0, minute=0, second=0, microsecond=0)
                        + dt.timedelta(hours=h, minutes=m, seconds=s))
            if dep_time >= date_time:
                route = self.routes.get(trip['route_id'], {})
                results.append({
                    'line': route.get('route_short_name', trip['route_id']),
                    'direction': trip.get('trip_headsign', ''),
                    'time': dep_time
                })
        results.sort(key=lambda x: x['time'])
        return results[:limit]

def fetch_realtime(ref: str) -> Optional[List[Dict[str, str]]]:
    url = PROXY_URL + requests.utils.quote(ref, safe='')
    try:
        resp = requests.get(url, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        visits = (data.get('Siri', {})
                     .get('ServiceDelivery', {})
                     .get('StopMonitoringDelivery', [{}])[0]
                     .get('MonitoredStopVisit', []))
        results = []
        for visit in visits:
            mvj = visit.get('MonitoredVehicleJourney', {})
            call = mvj.get('MonitoredCall', {})
            t = call.get('ExpectedArrivalTime')
            if t:
                try:
                    dt_obj = dt.datetime.fromisoformat(t)
                except ValueError:
                    continue
                results.append({
                    'line': mvj.get('LineRef', ''),
                    'direction': mvj.get('DirectionName', ''),
                    'time': dt_obj
                })
        return results if results else None
    except Exception:
        return None

def main():
    parser = argparse.ArgumentParser(description="Display upcoming departures for VHP3")
    parser.add_argument('--gtfs', default='data/gtfs', help='Path to GTFS directory')
    args = parser.parse_args()

    gtfs = GTFS(args.gtfs)
    now = dt.datetime.now()
    for key, ref in POINTS.items():
        print(f"\n=== {key.upper()} ===")
        realtime = fetch_realtime(ref)
        if realtime:
            departures = realtime
            print("Real-time data:")
        else:
            stop_id = REF_TO_GTFS.get(ref)
            departures = gtfs.next_departures(stop_id, now)
            print("Using GTFS schedule:")
        for dep in departures:
            time_str = dep['time'].strftime('%H:%M')
            direction = dep.get('direction', '')
            print(f"{dep['line']} -> {direction} at {time_str}")

if __name__ == '__main__':
    main()
