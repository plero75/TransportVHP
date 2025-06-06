
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ref = url.searchParams.get("ref");
    if (!ref) return new Response("Paramètre `ref` manquant", { status: 400 });

    const apiUrl = "https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=" + encodeURIComponent(ref);
    const headers = { "apiKey": "1oAFnUwiKJOYE61JL5mn6ykzi6iYZukI" };

    try {
      const response = await fetch(apiUrl, { headers });
      const data = await response.text();
      return new Response(data, {
        status: response.status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (err) {
      return new Response("Erreur API", { status: 500 });
    }
  }
};
