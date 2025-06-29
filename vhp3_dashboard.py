import csv
import datetime as dt
from pathlib import Path
import requests

GTFS_DIR = Path(__file__).resolve().parent / "data" / "gtfs"

class GTFS:
    def __init__(self, path: Path):
        self.path = path
        self.stops = {}
        self.routes = {}
        self.trips = {}
        self.calendar = {}
        self.stop_times = []
        self._load()

    def _load(self):
        self.stops = {r["stop_id"]: r for r in self._read_csv("stops.txt")}
        self.routes = {r["route_id"]: r for r in self._read_csv("routes.txt")}
        self.trips = {r["trip_id"]: r for r in self._read_csv("trips.txt")}
        self.calendar = {r["service_id"]: r for r in self._read_csv("calendar.txt")}
        self.stop_times = list(self._read_csv("stop_times.txt"))

    def _read_csv(self, name):
        with open(self.path / name, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                yield {k: v.strip() for k, v in row.items()}

    def service_active(self, service_id: str, date: dt.date) -> bool:
        info = self.calendar.get(service_id)
        if not info:
            return False
        weekday = date.strftime("%A").lower()
        if info.get(weekday) != "1":
            return False
        start = dt.datetime.strptime(info["start_date"], "%Y%m%d").date()
        end = dt.datetime.strptime(info["end_date"], "%Y%m%d").date()
        return start <= date <= end

    def next_departures(self, stop_id: str, now: dt.datetime | None = None, limit: int = 3):
        now = now or dt.datetime.now()
        upcoming = []
        for st in self.stop_times:
            if st["stop_id"] != stop_id:
                continue
            trip = self.trips.get(st["trip_id"])
            if not trip:
                continue
            if not self.service_active(trip["service_id"], now.date()):
                continue
            dep_time = dt.datetime.strptime(st["departure_time"], "%H:%M:%S").time()
            dep = dt.datetime.combine(now.date(), dep_time)
            if dep < now:
                continue
            route = self.routes.get(trip["route_id"], {})
            upcoming.append({
                "line": route.get("route_short_name", ""),
                "headsign": trip.get("trip_headsign", ""),
                "time": dep
            })
        upcoming.sort(key=lambda x: x["time"])
        return upcoming[:limit]

def fetch_real_time(stop_ref: str):
    url = f"https://ratp-proxy.hippodrome-proxy42.workers.dev/?url={stop_ref}"
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
    return resp.json()


def display_departures(stop_ref: str, gtfs: GTFS):
    try:
        data = fetch_real_time(stop_ref)
        visits = (
            data.get("Siri", {})
            .get("ServiceDelivery", {})
            .get("StopMonitoringDelivery", [{}])[0]
            .get("MonitoredStopVisit", [])
        )
        if not visits:
            raise ValueError("no real-time data")
        for v in visits:
            mvj = v.get("MonitoredVehicleJourney", {})
            call = mvj.get("MonitoredCall", {})
            print(
                f"{mvj.get('LineRef', '')} {mvj.get('DirectionName', '')} {call.get('ExpectedArrivalTime', '')}"
            )
    except Exception as exc:  # noqa: BLE001
        print(f"Real-time unavailable ({exc}); using GTFS schedule.")
        for dep in gtfs.next_departures(stop_ref):
            print(
                f"{dep['line']} {dep['headsign']} {dep['time'].strftime('%H:%M')}"
            )


def main():
    gtfs = GTFS(GTFS_DIR)
    for ref in [
        "STIF:StopPoint:Q:43135:",
        "STIF:StopPoint:Q:463641:",
        "STIF:StopPoint:Q:463644:",
    ]:
        name = gtfs.stops.get(ref, {}).get("stop_name", ref)
        print("---", name)
        display_departures(ref, gtfs)


if __name__ == "__main__":
    main()
