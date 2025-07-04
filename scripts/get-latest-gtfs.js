import fetch from "node-fetch";
import fs from "fs";

const DATASET_PAGE = "https://data.iledefrance-mobilites.fr/explore/dataset/offre-horaires-tc-gtfs-idfm/files/";

export async function getLatestZipUrl() {
  const res = await fetch(DATASET_PAGE, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GTFSbot/1.0)" }
  });
  if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
  const html = await res.text();
  fs.writeFileSync("debug_idfm.html", html);
  const matches = [...html.matchAll(/href=['"]([^'"]*\/files\/[a-zA-Z0-9]+\/download\/)['"]/gi)];
  if (!matches.length) {
    throw new Error("❌ Aucun ZIP GTFS trouvé sur la page source !");
  }
  return "https://data.iledefrance-mobilites.fr" + matches[0][1];
}

// Petit main de démo pour test
getLatestZipUrl().then(url => console.log("Dernier ZIP :", url)).catch(console.error);
