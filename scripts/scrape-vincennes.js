import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import fs from "fs";

async function scrapeVincennesCalendar() {
  const url = "https://www.letrot.com/fr/hippodrome/7-vincennes/calendrier";
  console.log(`🌐 Téléchargement Vincennes depuis ${url}`);
  let html;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Erreur HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.error("❌ Erreur lors du téléchargement :", err);
    return [];
  }
  const races = [];
  try {
    const dom = new JSDOM(html);
    const rows = dom.window.document.querySelectorAll(".table tbody tr");
    rows.forEach(row => {
      const dateStr = row.querySelector("td:nth-child(1)")?.textContent?.trim();
      const heureStr = row.querySelector("td:nth-child(2)")?.textContent?.trim() || "00:00";
      const description = row.querySelector("td:nth-child(3)")?.textContent?.trim() || "";
      races.push({ date: dateStr, heure: heureStr, description });
    });
  } catch (err) {
    console.error("❌ Erreur parsing HTML :", err);
  }
  return races;
}

async function main() {
  const races = await scrapeVincennesCalendar();
  if (races.length) {
    fs.writeFileSync("static/races.json", JSON.stringify(races, null, 2));
    console.log("✅ Fichier static/races.json généré :", races.length, "courses.");
  } else {
    console.warn("⚠️ Aucune course trouvée sur Vincennes.");
  }
}

main();
