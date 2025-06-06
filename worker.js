
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get("ref");
    const apiUrl = `https://prim.iledefrance-mobilites.fr/marketplace/stop-monitoring?MonitoringRef=${target}`;
    return fetch(apiUrl, {
      headers: {
        "apikey": "1oAFnUwiKJOYE61JL5mn6ykzi6iYZukI"
      }
    });
  }
};
