/*
 * laddonz — DIAGNOSTYKA
 * Wklej całość w konsolę przeglądarki (F12 → zakładka Console) będąc w grze i naciśnij Enter.
 * Przez 60 sekund skrypt tylko PODGLĄDA, co robi gra — niczego nie wysyła i niczego nie zmienia.
 * W tym czasie zrób w grze (po kolei):
 *   1. naciśnij X przy dowolnym graczu (atak),
 *   2. kliknij prawym przyciskiem na gracza na mapie,
 *   3. najedź myszką na gracza na mapie (chwilę przytrzymaj),
 *   4. zaproś kogoś do grupy ręcznie,
 *   5. podejrzyj czyjś ekwipunek (jeśli gra ma taką opcję w menu gracza),
 *   6. kliknij w okno czatu.
 * Po 60 s pobierze się plik laddonz-diagnostyka.txt — wyślij go w rozmowie.
 */
(() => {
  const SEC = 60;
  const E = window.Engine;
  const R = { czas: new Date().toISOString(), swiat: location.host.split('.')[0], wersjaPrzegladarki: navigator.userAgent };
  const fns = (o) => {
    const s = new Set();
    try { for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) Object.getOwnPropertyNames(p).forEach((n) => { try { if (typeof o[n] === 'function') s.add(n); } catch {} }); } catch {}
    return [...s].sort();
  };
  const keys = (o) => { try { return o ? Object.keys(o).sort() : null; } catch { return null; } };
  const short = (v) => { try { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; } catch { return String(v); } };

  R.engine = E ? keys(E) : 'BRAK window.Engine';
  R._g = { typ: typeof window._g, kod: String(window._g && window._g.__mpOrig || window._g).slice(0, 500) };
  R.communication = E && E.communication ? fns(E.communication) : null;
  R.interfaceMenuTip = E && E.interface ? fns(E.interface).filter((n) => /menu|popup|tip|alert|message|ask|chat/i.test(n)) : null;
  R.heroD = E && E.hero && E.hero.d ? Object.fromEntries(Object.entries(E.hero.d).filter(([k]) => /^(id|lvl|prof|clan|relation|x|y|nick)$/.test(k)).map(([k, v]) => [k, short(v)])) : null;
  R.othersFns = E && E.others ? fns(E.others) : null;
  R.globalne = ['message', 'mAlert', 'askAlert', '_t', 'CFG', 'g', 'hero', 'Engine'].map((n) => [n, typeof window[n]]);
  try { R.cfgSciezki = window.CFG ? Object.fromEntries(Object.entries(window.CFG).filter(([k, v]) => typeof v === 'string' && /path|url|cdn/i.test(k + v))) : null; } catch {}

  // inni gracze: struktura i wartości relacji
  try {
    const o = E.others;
    const src = typeof o.check === 'function' ? o.check() : typeof o.getDrawableList === 'function' ? o.getDrawableList() : (o.list || o.d || {});
    const arr = Array.isArray(src) ? src : Object.values(src || {});
    R.inniLiczba = arr.length;
    const first = arr[0];
    if (first) {
      R.innyKlucze = keys(first);
      R.innyD = first.d ? Object.fromEntries(Object.entries(first.d).map(([k, v]) => [k, typeof v === 'object' ? short(v) : v])) : null;
      R.innyPrototyp = fns(first);
    }
    R.relacje = arr.map((x) => { const d = x.d || x; return { nick: d.nick, relation: d.relation, clan: short(d.clan), fr: d.fr, rel: d.rel, friend: d.friend, emo: d.emo, attr: d.attr }; });
  } catch (e) { R.inniBlad = String(e); }

  // przedmioty
  try {
    const it = E.items;
    R.itemsFns = fns(it);
    const all = typeof it.fetchLocationItems === 'function' ? it.fetchLocationItems('g') : Object.values(it.items || {});
    const eq = (all || []).find((i) => Number(i.st) > 0) || (all || [])[0];
    if (eq) { R.przedmiotKlucze = keys(eq); R.przedmiotStat = short(eq.stat); R.przedmiotCached = keys(eq._cachedStats); R.przedmiotLoc = eq.loc; R.przedmiotSt = eq.st; }
    const node = document.querySelector('[class*="item-id-"], [data-item-id], .item');
    R.przedmiotDOM = node ? node.outerHTML.slice(0, 300) : 'nie znaleziono elementu przedmiotu';
  } catch (e) { R.przedmiotyBlad = String(e); }
  try { R.party = E.party ? { fns: fns(E.party), klucze: keys(E.party) } : null; } catch {}
  try { R.battle = E.battle ? keys(E.battle) : null; } catch {}

  // klasy elementów DOM, które nas interesują
  const classesLike = (re) => {
    const s = new Set();
    document.querySelectorAll('[class]').forEach((n) => { if (typeof n.className === 'string') n.className.split(/\s+/).forEach((c) => re.test(c) && s.add(c)); });
    return [...s].slice(0, 60);
  };
  R.klasyChat = classesLike(/chat/i);
  R.klasyParty = classesLike(/party|group/i);
  R.klasyTip = classesLike(/tip/i);
  R.klasyMenu = classesLike(/menu|popup|context/i);
  R.klasyKomunikaty = classesLike(/message|alert|info|notif/i);

  // PODGLĄD NA ŻYWO
  R.komendy = []; R.wywolaniaMenu = []; R.prototypGracza = {}; R.noweElementy = {}; R.odpowiedzi = [];
  const restore = [];
  const isTask = (x) => typeof x === 'string' && /^[a-z_0-9]+&/i.test(x);
  const wrap = (obj, name, label, fn) => {
    const orig = obj[name];
    if (typeof orig !== 'function') return;
    obj[name] = function (...a) { try { fn(a, this); } catch {} return orig.apply(this, a); };
    restore.push(() => { obj[name] = orig; });
  };
  wrap(window, '_g', 'window._g', (a) => R.komendy.push({ przez: 'window._g', komenda: short(a[0]), argumenty: a.length }));
  if (E && E.communication) fns(E.communication).forEach((n) => wrap(E.communication, n, n, (a) => {
    if (isTask(a[0])) R.komendy.push({ przez: 'communication.' + n, komenda: short(a[0]) });
    else if (a[0] && typeof a[0] === 'object' && R.odpowiedzi.length < 25 && /parse|success|dispatch/i.test(n)) R.odpowiedzi.push({ przez: n, klucze: keys(a[0]), tekst: short(a[0]).slice(0, 200) });
  }));
  if (E && E.interface) fns(E.interface).filter((n) => /menu|popup|tip/i.test(n)).forEach((n) => wrap(E.interface, n, n, (a) => {
    R.wywolaniaMenu.push({ funkcja: n, argumenty: a.map((x) => Array.isArray(x) ? 'tablica[' + x.length + ']: ' + short(x.map((m) => (Array.isArray(m) ? m[0] : m && (m.text || m.label || m.name || Object.keys(m).join('/'))))) : typeof x) });
  }));
  try {
    const src = E.others.check ? E.others.check() : {};
    const first = Object.values(src)[0];
    const proto = first && Object.getPrototypeOf(first);
    if (proto) Object.getOwnPropertyNames(proto).forEach((n) => {
      const d = Object.getOwnPropertyDescriptor(proto, n);
      if (!d || typeof d.value !== 'function' || n === 'constructor' || /^(draw|update|getOrder|isVisible|render|animate)/i.test(n)) return;
      wrap(proto, n, n, () => { R.prototypGracza[n] = (R.prototypGracza[n] || 0) + 1; });
    });
  } catch {}
  const mo = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || typeof n.className !== 'string' || !n.className) continue;
      const k = n.className.trim().split(/\s+/).slice(0, 3).join('.');
      if (!R.noweElementy[k]) R.noweElementy[k] = { ile: 0, tekst: (n.textContent || '').trim().slice(0, 80) };
      R.noweElementy[k].ile++;
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  console.log('%c[laddonz] Diagnostyka nasłuchuje przez ' + SEC + ' s. Zrób teraz: X na graczu, prawy klik na graczu, najechanie na gracza, zaproszenie do grupy, podgląd EQ, klik w czat.', 'color:#ffb547;font-size:14px;font-weight:bold');
  setTimeout(() => {
    mo.disconnect();
    restore.forEach((f) => f());
    // laddonz, jeśli zainstalowany
    try { const M = window.__MargoPanel; if (M) R.laddonz = { wersja: M.version, transport: M.net.transport && M.net.transport.label, menu: M.menus.hookName, hover: M.menus.hoverHooked, podsluch: M.net.sniff.slice(0, 15) }; } catch {}
    const txt = JSON.stringify(R, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
    a.download = 'laddonz-diagnostyka.txt';
    document.body.appendChild(a); a.click(); a.remove();
    console.log('%c[laddonz] Gotowe — pobrano laddonz-diagnostyka.txt. Wyślij ten plik w rozmowie.', 'color:#3ddc97;font-size:14px;font-weight:bold');
  }, SEC * 1000);
})();
