
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const ref = url.searchParams.get("ref");
    if (!ref) {
      return new Response("Missing ref", { status: 400 });
    }
    const target = "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=" + encodeURIComponent(ref);
    const headers = {
      "apikey": "1oAFnUwiKJOYE61JL5mn6ykzi6iYZukI"
    };
    const resp = await fetch(target, { headers });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { "Content-Type": "application/json" }
    });
  }
};
