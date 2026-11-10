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
    if (now() - t0 > 120000) { console.warn('[L4Tools] Nie wykryto gry (nowy interfejs) — panel nie startuje.'); return; }
    await sleep(500);
  }
  await sleep(800);
  const h = game.hero();
  config.load(h && h.nick);
  config.data.global.dryRun = false;   // tryb próbny usunięty z panelu
  injectCSS();
  // zastrzeżenie — przy pierwszym uruchomieniu (i po każdej zmianie jego treści), dopóki nie zostanie zaakceptowane
  // pokazywane przy pierwszym pobraniu i po KAŻDEJ aktualizacji (nowa wersja = ponowna akceptacja)
  if (store.get('disclaimer:ver', '') !== MP.version) {
    const ok = await confirmBox({
      title: `L4Tools ${MP.version} — ważne informacje przed użyciem`,
      okText: 'Akceptuję', cancelText: 'Nie akceptuję', width: '520px',
      html: [
        '<p style="margin:0 0 8px"><b>L4Tools</b> to nieoficjalny zestaw dodatków do gry Margonem. Nie jest tworzony, wspierany ani zatwierdzony przez Garmory sp. z o.o. ani przez administrację gry.</p>',
        '<p style="margin:0 0 8px">Korzystanie z dodatków, które zmieniają działanie klienta gry lub wykonują czynności bez udziału gracza, może zostać uznane za naruszenie Regulaminu gry i skutkować sankcjami — w tym czasową lub trwałą blokadą konta.</p>',
        '<p style="margin:0 0 8px">Autor L4Tools <b>nie ponosi odpowiedzialności</b> za jakiekolwiek skutki korzystania z dodatków, w szczególności za kary nałożone przez administrację gry, utratę przedmiotów, waluty, postępów lub dostępu do konta. Dodatki udostępniane są w obecnej postaci, bez żadnych gwarancji działania.</p>',
        '<p style="margin:0">Klikając „Akceptuję", potwierdzasz, że zapoznałeś się z powyższym i korzystasz z dodatków <b>na własne ryzyko i odpowiedzialność</b>.</p>',
      ].join(''),
    });
    if (!ok) { toast('L4Tools nie został uruchomiony — warunki nie zostały zaakceptowane. Odśwież grę, aby zobaczyć je ponownie.', 'warn', 7000); return; }
    store.set('disclaimer:v1', true); store.set('disclaimer:ver', MP.version);
  }
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
  console.log(`%c[L4Tools] v${MP.version} gotowy — ${addons.list.length} dodatków. Panel: ${config.data.global.panelKey}`, 'color:#7c5cff;font-weight:bold');
  if (!store.get('welcomed', false)) {
    store.set('welcomed', true);
    toast(`L4Tools gotowy — kliknij ikonkę albo naciśnij ${config.data.global.panelKey}`, 'ok', 6000);
  }
})();
