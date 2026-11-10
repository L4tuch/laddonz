/* ───────────────────────── main.js ─────────────────────────
 * Start: czekamy aż gra się wczyta, potem uruchamiamy panel.
 */
(async function boot() {
  if (W.__MargoPanelStarted) return;
  W.__MargoPanelStarted = true;
  // dziennik błędów strony (przetrwa odświeżenie / wyrzucenie z gry) — trafia do raportu Ulepszarki
  const logErr = (msg) => { try { const l = store.get('errlog', []); l.unshift({ t: new Date().toISOString(), msg: String(msg).slice(0, 300) }); store.set('errlog', l.slice(0, 15)); } catch {} };
  W.addEventListener('error', (e) => logErr((e.message || '') + ' @ ' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
  W.addEventListener('unhandledrejection', (e) => logErr('promise: ' + (e.reason && (e.reason.message || e.reason))));
  const t0 = now();
  while (!game.ready()) {
    if (now() - t0 > 120000) { console.warn('[laddonz] Nie wykryto gry (nowy interfejs) — panel nie startuje.'); return; }
    await sleep(500);
  }
  await sleep(800);
  const h = game.hero();
  config.load(h && h.nick);
  config.data.global.dryRun = false;   // tryb próbny usunięty z panelu
  injectCSS();
  net.install();
  // część obiektów gry powstaje później — ponawiamy podpięcie przez pierwsze 2 minuty
  { let n = 0; const iv = setInterval(() => { net.install(); if (++n > 40) clearInterval(iv); }, 3000); }
  keys.start();
  menus.start();
  battleWatch.start();
  mapWatch.start();
  addons.initAll();
  itemDeco.start();
  ui.start();
  quickbar.start();
  console.log(`%c[laddonz] v${MP.version} gotowy — ${addons.list.length} dodatków. Panel: ${config.data.global.panelKey}`, 'color:#7c5cff;font-weight:bold');
  if (!store.get('welcomed', false)) {
    store.set('welcomed', true);
    toast(`laddonz gotowy — kliknij ikonkę albo naciśnij ${config.data.global.panelKey}`, 'ok', 6000);
  }
})();
