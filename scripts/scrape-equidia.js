import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import fs from "fs";

const MONTHS_AHEAD = 3;

async function scrapeEquidiaVincennes() {
  const today = new Date();
  const races = [];
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth() + i);
    const monthStr = targetDate.toISOString().slice(0,7);
    const url = `https://www.equidia.fr/courses-hippique/trot?month=${monthStr}`;
    console.log(`🌐 Téléchargement Equidia pour ${monthStr}...`);
    let html;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) { console.warn(`⚠️ Erreur HTTP ${res.status} (${url})`); continue; }
      html = await res.text();
    } catch (err) {
      console.error("❌ Erreur fetch :", err);
      continue;
    }
    try {
      const dom = new JSDOM(html);
      const rows = dom.window.document.querySelectorAll("table tbody tr");
      for (const row of rows) {
        const dateStr = row.querySelector("td:nth-child(1)")?.textContent?.trim();
        const lieu = row.querySelector("td:nth-child(2)")?.textContent?.trim();
        const type = row.querySelector("td:nth-child(3)")?.textContent?.trim();
        if (lieu?.toLowerCase().includes("vincennes")) {
          races.push({ date: dateStr, lieu, type });
        }
      }
    } catch (err) {
      console.error("❌ Erreur parsing Equidia HTML :", err);
    }
  }
  return races;
}

async function main() {
  const races = await scrapeEquidiaVincennes();
  if (races.length) {
    fs.writeFileSync("static/races.json", JSON.stringify(races, null, 2));
    console.log("✅ Fichier static/races.json généré :", races.length, "courses.");
  } else {
    console.warn("⚠️ Aucune course trouvée sur Equidia.");
  }
}

main();
