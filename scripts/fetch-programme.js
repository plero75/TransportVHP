import fetch from "node-fetch";
import fs from "fs";
import { JSDOM } from "jsdom";

async function findTodayReunion() {
  const url = "https://www.letrot.com/fr/hippodrome/7-vincennes/calendrier";
  console.log(`🌐 Téléchargement du calendrier depuis ${url}`);
  let html;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error("❌ Erreur lors du téléchargement :", err);
    return null;
  }
  try {
    const dom = new JSDOM(html);
    const rows = dom.window.document.querySelectorAll(".table tbody tr");
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const row of rows) {
      const dateStr = row.querySelector("td:nth-child(1)")?.textContent?.trim();
      const [day, month, year] = dateStr?.split("/")?.map(Number);
      const isoDate = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
      if (isoDate === todayStr) {
        const heureStr = row.querySelector("td:nth-child(2)")?.textContent?.trim() || "";
        const description = row.querySelector("td:nth-child(3)")?.textContent?.trim() || "";
        return { date: isoDate, heure: heureStr, description };
      }
    }
  } catch (err) {
    console.error("❌ Erreur parsing HTML Letrot :", err);
  }
  return null;
}

async function main() {
  const reunion = await findTodayReunion();
  if (reunion) {
    fs.writeFileSync("static/programme.json", JSON.stringify(reunion, null, 2));
    console.log("✅ Fichier static/programme.json généré :", reunion);
  } else {
    console.warn("⚠️ Aucune réunion trouvée pour aujourd'hui.");
  }
}

main();
