#!/usr/bin/env node
/*
 * Odświeża data/potwory.json z list potworów na margoworld.pl (elity, elity II, herosi, tytani, kolosi).
 * Uruchamiane automatycznie raz w tygodniu przez GitHub Actions (.github/workflows/potwory.yml),
 * można też ręcznie:  node scripts/update-potwory.js
 * Dodatek pobiera ten plik z GitHuba raz na dobę — nowe potwory pojawiają się bez aktualizacji dodatku.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'potwory.json');
const PAGES = { elita: 'elite', e2: 'elite2', heros: 'heros', tytan: 'titan', kolos: 'kolos' };
const decode = (s) => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');

function parse(html) {
  const out = [], seen = new Set();
  const names = [...html.matchAll(/>\s*([^<>]{2,60}?)\s*\(\s*(\d{1,3})\s*lvl\s*\)/gi)];
  const icons = [...html.matchAll(/obrazki\/npc\/([A-Za-z0-9_\-\/.]+?\.gif)/g)].map((m) => ({ at: m.index, i: m[1] }));
  for (const m of names) {
    const n = decode(m[1]).replace(/\s+/g, ' ').trim(), lvl = Number(m[2]);
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    // najbliższa ikona w promieniu ~2000 znaków (najpierw przed nazwą — obrazek zwykle stoi przed podpisem)
    let best = null, bd = 1e9;
    for (const ic of icons) { const d = m.index - ic.at; const dist = d >= 0 ? d : -d * 1.5; if (dist < bd && dist < 2000) { bd = dist; best = ic; } }
    out.push({ n, lvl, i: best ? best.i : undefined });
  }
  return out;
}

(async () => {
  const old = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const prev = old.potwory || [];
  const byName = new Map(prev.map((o) => [o.n.toLowerCase(), o]));
  const result = [];
  for (const [t, page] of Object.entries(PAGES)) {
    const before = prev.filter((o) => o.t === t);
    let list = [];
    try {
      const r = await fetch(`https://margoworld.pl/npc/${page}`, { headers: { 'User-Agent': 'L4Tools-potwory/1.0 (+github.com/L4tuch/laddonz)' } });
      if (r.ok) list = parse(await r.text());
    } catch (e) { console.warn(t, e.message); }
    // zabezpieczenie: gdy strona zmieni wygląd i odczyt się nie uda, zostawiamy poprzednią listę
    if (list.length < Math.max(3, before.length * 0.6)) { console.warn(`${t}: odczytano ${list.length}, zostawiam ${before.length}`); result.push(...before); continue; }
    for (const o of list) {
      const p = byName.get(o.n.toLowerCase()) || {};
      result.push(Object.assign({ n: o.n, lvl: o.lvl, t }, o.i ? { i: o.i } : p.i ? { i: p.i } : {}, p.p ? { p: p.p } : {}));
    }
    console.log(`${t}: ${list.length}`);
  }
  // elity III nie mają osobnej listy na margoworld — przenosimy z poprzedniego pliku
  result.push(...prev.filter((o) => !PAGES[o.t] && !result.some((x) => x.n === o.n)));
  const changed = JSON.stringify(result) !== JSON.stringify(prev);
  if (changed) {
    fs.writeFileSync(FILE, JSON.stringify({ zrodlo: 'margoworld.pl', aktualizacja: new Date().toISOString().slice(0, 10), potwory: result }, null, 0) + '\n');
    console.log('Zapisano', result.length, 'potworów');
  } else console.log('Bez zmian');
})();
