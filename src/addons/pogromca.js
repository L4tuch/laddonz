/* ───────── Pogromca Tytanów ─────────
 * Okienko w trakcie walki: jakie efekty działają na Twoją drużynę (albo na Ciebie solo) i na przeciwników,
 * ile tur im zostało, oraz kiedy tytan / kolos / mob uderzy naładowanym atakiem.
 * Pozytywne efekty — kolor „dobry", negatywne — czerwony; kolory dopasowane do Motywnika albo klasyczne.
 *
 * Skąd dane: gra nie opisuje efektów w jednym, znanym miejscu, więc czytamy kilka źródeł naraz:
 *   1) dane wojowników w walce (Engine.battle i pakiety walki „f.w") — szukamy list efektów z czasem trwania,
 *   2) dziennik walki („f.m") — komunikaty o nałożeniu efektu / ładowaniu ataku z liczbą tur.
 * Przycisk „Zbierz dane walki" zapisuje surowe dane z prawdziwej walki, żeby dopasować odczyt do gry.
 */
(() => {
  let cfg, win = null, preview = false, timer = null;
  const PACKETS = [];               // ostatnie pakiety walki (do diagnozy)
  const LOGS = [];                  // ostatnie linie dziennika walki
  let state = { round: 0, w: {}, fromLog: {}, charge: {}, acts: 0, casts: [], domTurn: 0 };
  const fresh = () => ({ round: 0, w: {}, fromLog: {}, charge: {}, acts: 0, casts: [], domTurn: 0 });

  /*
   * Umiejętności ostateczne tytanów i kolosów: [nazwa, pierwsza tura, co ile tur, opis].
   * Źródło: opisy postaci na margohelp.pl i margoworld.pl („Rzucany w X turze, co Y tur").
   */
  const BOSS = {
    'Zabójczy Królik': [['Rozszarpanie wrogów', 4, 12, 'obrażenia + głęboka rana na wszystkich'], ['Ugryzienie w ucho', 8, 12, 'ogłuszenie 1 tura + głęboka rana'], ['Żar tropików', 11, 11, 'ogień i trucizna na wszystkich'], ['Ucieczka i przegrupowanie', 16, 24, 'odrzut wszystkich o 2 rzędy']],
    'Renegat Baulus': [['Obezwładnienie', 1, 14, 'ogłuszenie wszystkich na 1 turę'], ['Manifestacja', 3, 14, 'obrażenia + trucizna na wszystkich'], ['Zamach łańcuchami', 8, 14, 'obrażenia + odrzut o 2 rzędy'], ['Miażdżące uderzenie', 10, 14, 'mocny cios w broniącego']],
    'Piekielny Arcymag': [['Ognisty podmuch', 1, 15, '3 ciosy ognia w losowych graczy'], ['Piekielna burza', 7, 15, 'ogień i błyskawice na wszystkich'], ['Odprawa niewtajemniczonych', 12, 15, 'obrażenia + odrzut o 2 rzędy'], ['Pirokineza', 20, 20, 'ogień na wszystkich']],
    'Versus Zoons': [['Ostre powitanie', 1, 100, 'losowa linia + głęboka rana'], ['Egzekucja', 5, 10, 'mocny cios w broniącego'], ['Grad zatrutych kul', 9, 10, 'obrażenia + trucizna na wszystkich'], ['Głębokie rany', 13, 10, 'obrażenia + głęboka rana na wszystkich']],
    'Łowczyni Wspomnień': [['Wiatrował', 2, 10, 'losowa linia graczy'], ['Sprzeciw mieszkańców lasu', 5, 10, 'obrażenia + głęboka rana na wszystkich'], ['Ukojenie', 8, 10, 'leczy się o 7% życia'], ['Gniew driad', 10, 10, 'obrażenia + trucizna na wszystkich']],
    'Przyzywacz Demonów': [['Wydarcie duszy', 1, 10, 'ogłuszenie celu na 4 tury'], ['Zaklęcie rozpraszające', 4, 10, 'ogłuszenie wszystkich na 1 turę'], ['Osłona otchłani', 7, 10, 'zdejmuje spowolnienia + ogień na wszystkich'], ['Pocałunek śmierci', 10, 10, 'ogień i zimno na wszystkich']],
    'Maddok Magua': [['Bagienny paraliż', 1, 12, 'ogłuszenie 1 tura + głęboka rana na wszystkich'], ['Salwa grzmiących włóczni', 5, 12, 'obrażenia + błyskawice na wszystkich'], ['Manifestacja cierpienia', 7, 12, 'odrzut wszystkich o 2 rzędy'], ['Klątwa króla mokradeł', 10, 12, 'błyskawice w losową linię']],
    'Tezcatlipoca': [['Krwawe wybroczyny', 1, 10, 'rana + ogłuszenie 1 tura na wszystkich'], ['Odzyskanie wigoru', 4, 10, 'zdejmuje spowolnienia, leczy 12%'], ['Deszcz meteorytów', 7, 10, 'ogień i błyskawice na wszystkich'], ['Księżycowe cięcie', 10, 10, 'cios z przebiciem i żywiołami']],
    'Barbatos Smoczy Strażnik': [['Kaleczące skrzydła Barbatosa', 1, 10, 'ogłuszenie linii broniącego na 2 tury'], ['Kamienne zdeptanie', 4, 10, '2 ciosy w broniącego'], ['Deszcz kryształowych odłamków', 7, 10, '2 ciosy ognia we wszystkich'], ['Pradawny ogień Hebrehotha', 10, 10, 'ogień w linię broniącego']],
    'Tanroth': [['Lodowy powiew', 1, 15, 'podwójne zimno na wszystkich'], ['Przebicie włócznią', 5, 15, 'cios z przebiciem i zimnem'], ['Wymrożenie', 8, 15, 'ogłuszenie wszystkich na 1 turę'], ['Lodowa burza', 11, 15, 'obrażenia + ogłuszenie wszystkich']],
    'Amaimon Soploręki': [['Chapnięcie', 3, 15, 'cios w broniącego'], ['Przeszycie do szpiku', 7, 15, 'cios z zimnem w broniącego'], ['Noc Perseidów', 10, 15, 'trucizna + ogłuszenie wszystkich 1 tura'], ['Lodowe Pandemonium', 15, 15, 'obrażenia + zimno w linię broniącego']],
    'Umibozu': [['Zesłanie Funayurei', 2, 36, 'ogłuszenie całej drużyny na 2 tury'], ['Gniewne wody', 4, 12, 'zimno na całą drużynę'], ['Dłoń Ośmiu Trygramów', 7, 12, 'cios + trucizna w broniącego'], ['Czarne wydzieliny', 10, 12, 'zimno, linia + trucizna']],
    'Vashkar': [['Donnerwelle', 1, 10, 'błyskawice na wszystkich'], ['Błyszczący trzepot', 4, 20, 'odrzut o rząd + zdejmuje spowolnienia'], ['Wielostrzał', 6, 10, '4 strzały w losowych graczy'], ['Lśniące Sanktuarium', 8, 10, 'błyskawice i strzały na wszystkich']],
    'Hydrokora Chimeryczna': [['Fuego llameante', 1, 12, 'ogień w linię broniącego'], ['Zanurzenie pazurów', 3, 12, 'cios z przebiciem w linię'], ['Wynaturzenie', 6, 18, 'ogień w losowego gracza'], ['Agresja trzech głów', 9, 12, 'potrójny cios w broniącego']],
    'Lulukav': [['Spaczenie', 1, 10, 'obrażenia + trucizna na wszystkich'], ['Pochłonięcie dusz', 6, 10, 'atak + leczy się o 20%'], ['Lulukavkavkavkav', 9, 10, 'błyskawice, trucizna i rana na wszystkich']],
    'Arachin Podstępny': [['Innovatis', 8, 14, 'zdejmuje swoje spowolnienia']],
    'Reuzen': [['Deszcz zatrutych gałęzi', 1, 10, 'obrażenia + trucizna na wszystkich'], ['Duszące mchy', 5, 10, 'ogłuszenie wszystkich na 2 tury'], ['Trzęsienie ziemi', 8, 10, 'obrażenia na wszystkich']],
  };
  const bossOf = (name) => { const n = String(name || '').toLowerCase(); return Object.keys(BOSS).find((k) => n.includes(k.toLowerCase())); };
  /** Najbliższe umiejętności ostateczne bossa od tury `turn` (włącznie). */
  function nextUlts(boss, turn) {
    return BOSS[boss].map(([n, first, every, d]) => {
      let at = first;
      if (turn > first) at = first + Math.ceil((turn - first) / every) * every;
      return { name: n, at, left: at - turn, desc: d };
    }).sort((a, b) => a.left - b.left);
  }
  /** Bieżąca tura: z danych walki, z okna walki albo z liczby Twoich ruchów — największa wiarygodna wartość. */
  const turnNow = () => Math.max(state.round || 0, state.domTurn || 0, state.acts || 0, 1);

  /* ── klasyfikacja efektów ── */
  const NEG = /osłab|oslab|trucizn|zatru|krwaw|ogłusz|oglusz|zamroż|zamroz|szadź|szadz|spowol|oślep|oslep|podpal|płon|plon|poraż|poraz|klątw|klatw|przebic|obniż|obniz|zmniejsz|redukc|unieruch|paraliż|paraliz|strach|rozbroj|wyzwani|prowok|kruch|rozdarc|zranien|odrętw|odretw|uśpien|uspien|chorob|-\s*\d/i;
  const POS = /wzmoc|aura|furi|tarcz|regener|lecz|przyspiesz|ochron|odporn|zwiększ|zwieksz|błogosł|blogosl|kontratak|unik|odbic|barier|osłon|oslon|inspir|zryw|szał|szal|moc |siła|sila|\+\s*\d/i;
  const kind = (name, hint) => {
    if (hint === true || /^(good|buff|pos|positive|1)$/i.test(String(hint))) return 'pos';
    if (hint === false || /^(bad|debuff|neg|negative|-1|0)$/i.test(String(hint))) return 'neg';
    return NEG.test(name) ? 'neg' : POS.test(name) ? 'pos' : 'neu';
  };

  /* ── odczyt ze struktur gry (heurystyka: obiekty z nazwą i czasem trwania) ── */
  const NAME_K = ['name', 'nazwa', 'n', 'label', 'title', 'txt', 'desc'];
  const DUR_K = ['duration', 'dur', 'turns', 'turn', 'rounds', 'round', 'left', 'rest', 'remain', 'remaining', 'ttl', 'tury', 'tura', 'time', 't', 'count', 'cnt'];
  const pick = (o, ks) => { for (const k of ks) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return undefined; };
  function effectsIn(obj, depth = 0, out = [], seen = new Set()) {
    if (!obj || typeof obj !== 'object' || depth > 3 || seen.has(obj)) return out;
    seen.add(obj);
    const vals = Array.isArray(obj) ? obj : Object.values(obj);
    for (const v of vals) {
      if (!v || typeof v !== 'object') continue;
      const nm = pick(v, NAME_K), du = pick(v, DUR_K);
      if (typeof nm === 'string' && nm.length < 60 && du !== undefined && !isNaN(Number(du))) {
        out.push({ name: nm.replace(/<[^>]+>/g, '').trim(), left: Number(du), k: kind(nm, pick(v, ['good', 'positive', 'buff', 'type', 'kind', 'negative'])) });
      } else effectsIn(v, depth + 1, out, seen);
    }
    return out;
  }
  const CHARGE_K = /charge|special|spec|prepare|load|ultimate|countdown|attack_?in|nextattack|toattack/i;
  function chargeIn(d) {
    for (const [k, v] of Object.entries(d || {})) {
      if (!CHARGE_K.test(k)) continue;
      if (typeof v === 'number' && v >= 0 && v < 30) return { name: 'Naładowany atak', left: v };
      if (v && typeof v === 'object') { const du = pick(v, DUR_K); if (du !== undefined && !isNaN(Number(du))) return { name: String(pick(v, NAME_K) || 'Naładowany atak'), left: Number(du) }; }
    }
    return null;
  }

  /** Nazwa Twojej umiejętności po numerze (z danych gry albo z paska umiejętności w walce). */
  function skillName(id) {
    try {
      const S = E() && E().skills;
      const cand = S && (S.skills || S.list || S.d || S);
      const it = cand && (typeof cand.get === 'function' ? cand.get(id) : cand[id]);
      const n = it && (it.name || (it.d && it.d.name));
      if (n) return String(n);
    } catch {}
    const slot = document.querySelector(`[data-skill-id="${id}"], [data-id="${id}"].skill, .skill-${id}`);
    const t = slot && (slot.getAttribute('tip') || slot.title || slot.textContent || '').replace(/<[^>]+>/g, ' ').trim();
    return t ? t.split(/\s{2,}|\n/)[0].slice(0, 40) : `Umiejętność #${id}`;
  }
  /** Dziennik walki z okna gry (.battle-msg) i numer tury, jeśli okno go pokazuje. */
  const seenMsg = new WeakSet();
  function readDom() {
    const bw = document.querySelector('.battle-controller, .battle-window, .battle');
    if (!bw) return;
    const tm = (bw.textContent || '').match(/tura\s*:?\s*(\d{1,3})/i);
    if (tm) state.domTurn = Math.max(state.domTurn, Number(tm[1]));
    for (const m of bw.querySelectorAll('.battle-msg')) { if (seenMsg.has(m)) continue; seenMsg.add(m); parseLog(m.textContent || ''); }
  }

  /* ── odczyt z dziennika walki ── */
  const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  function parseLog(line) {
    const s = strip(line);
    if (!s) return;
    LOGS.push(s); if (LOGS.length > 80) LOGS.shift();
    const tr = s.match(/^\s*(?:tura|runda)\s*(\d{1,3})\b/i); if (tr) { state.domTurn = Math.max(state.domTurn, Number(tr[1])); return; }
    // „…(2 tury)" / „…na 3 tury" bez czasownika — efekt po nazwie przy ostatnio wspomnianej postaci
    const tt = s.match(/^(.+?)[:\-–]\s*([^()]{2,40}?)\s*\((\d+)\s*tur/i);
    if (tt) { const who = tt[1].trim(); (state.fromLog[who] = state.fromLog[who] || {})[tt[2].trim()] = { left: Number(tt[3]), at: turnNow() }; }
    // „X ładuje / przygotowuje / kumuluje potężny atak … (za) 3 tur(y)"
    let m = s.match(/^(.+?)\s+(?:ładuje|laduje|przygotowuje|kumuluje|szykuje|gromadzi)\b(.*?)(\d+)\s*(?:tur|rund)/i);
    if (m) { state.charge[m[1].trim()] = { name: (m[2].replace(/\b(za|do|się|sie|w ciągu)\b/gi, '').trim() || 'Naładowany atak').slice(0, 40), left: Number(m[3]), at: turnNow() }; return; }
    // „X … efekt Y … (na) 3 tur(y)" / „Y (3 tury)" przy imieniu
    m = s.match(/^(.+?)\s+(?:otrzymuje|zyskuje|dostaje|jest pod wpływem|zostaje objęty|zostaje objęta|ma)\s+(?:efekt\s+)?[„"']?([^„"'(]{2,40}?)[”"']?\s*(?:na|\(|przez)\s*(\d+)\s*(?:tur|rund)/i);
    if (m) { const who = m[1].trim(); (state.fromLog[who] = state.fromLog[who] || {})[m[2].trim()] = { left: Number(m[3]), at: turnNow() }; }
  }

  function onData(d) {
    if (!d || !d.f) return;
    const f = d.f;
    if (f.init || f.init === 0) state = fresh();
    PACKETS.push(JSON.parse(JSON.stringify(f, (k, v) => (typeof v === 'string' && v.length > 300 ? v.slice(0, 300) + '…' : v)))); if (PACKETS.length > 40) PACKETS.shift();
    const rnd = Number(f.round ?? f.r ?? f.turn ?? f.move);
    if (!isNaN(rnd) && rnd > state.round) state.round = rnd;
    if (f.w && typeof f.w === 'object') for (const [id, w] of Object.entries(f.w)) state.w[id] = Object.assign(state.w[id] || {}, w);
    const logs = Array.isArray(f.m) ? f.m : f.m && typeof f.m === 'object' ? Object.values(f.m) : [];
    logs.forEach(parseLog);
    if (win && cfg.enabled && !preview && game.inBattle()) render();
  }

  /** Lista wojowników z efektami — z Engine.battle i z pakietów. */
  function model() {
    const out = {};
    const h = game.hero();
    const b = E() && E().battle;
    let ws = b && (b.warriorsList || b.warriors);
    try { if (typeof ws === 'function') ws = ws.call(b); } catch { ws = null; }
    const arr = Array.isArray(ws) ? ws : Object.values(ws || {});
    const add = (id, d) => {
      if (!d) return;
      const o = out[id] = out[id] || { id, name: '', team: null, hpp: null, eff: [], charge: null };
      o.name = d.name || d.nick || o.name || String(id);
      if (d.team !== undefined) o.team = d.team;
      if (d.hpp !== undefined) o.hpp = Number(d.hpp);
      o.eff = o.eff.concat(effectsIn(d));
      o.charge = o.charge || chargeIn(d);
    };
    for (const w of arr) { const d = (w && (w.d || w)) || {}; add(String(d.id ?? w.id), Object.assign({}, d, w.d ? {} : w)); }
    for (const [id, d] of Object.entries(state.w)) add(String(id), d);
    // z dziennika: dopasowanie po imieniu
    for (const o of Object.values(out)) {
      const L = state.fromLog[o.name];
      if (L) for (const [nm, v] of Object.entries(L)) { const left = v.left - Math.max(0, turnNow() - v.at); if (left > 0 && !o.eff.some((e) => e.name === nm)) o.eff.push({ name: nm, left, k: kind(nm) }); }
      const C = state.charge[o.name];
      if (C && !o.charge) { const left = C.left - Math.max(0, turnNow() - C.at); if (left >= 0) o.charge = { name: C.name, left }; }
      // ten sam efekt z dwóch źródeł — jeden wpis
      const seen = new Set(); o.eff = o.eff.filter((e) => { const k = e.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    // tytan / kolos z bazy: najbliższa umiejętność ostateczna jako „ładowany atak" + lista kolejnych
    const turn = turnNow();
    for (const o of Object.values(out)) {
      const b = bossOf(o.name); if (!b) continue;
      const ul = nextUlts(b, turn);
      o.boss = b; o.ults = ul;
      if (!o.charge || o.charge.left > ul[0].left) o.charge = { name: ul[0].name, left: ul[0].left, desc: ul[0].desc };
    }
    // Twoje umiejętności rzucone na wojowników (np. Wyzwanie, Szadź): ile tur temu
    for (const c of state.casts) {
      const o = c.id != null ? out[String(c.id)] : null;
      if (!o) continue;
      const ago = turn - c.at;
      if (ago > 12) continue;
      const nm = `${c.name} (Ty)`;
      if (!o.eff.some((e) => e.name.toLowerCase().startsWith(c.name.toLowerCase()))) o.eff.push({ name: nm, left: null, ago, k: kind(c.name) === 'neu' ? (Number(o.id) < 0 ? 'neg' : 'pos') : kind(c.name) });
    }
    // drużyny: ta z bohaterem = „my"
    const me = h && out[String(h.id)];
    const myTeam = me ? me.team : null;
    const allies = [], enemies = [];
    for (const o of Object.values(out)) (myTeam !== null && o.team !== null ? (String(o.team) === String(myTeam) ? allies : enemies) : (Number(o.id) > 0 ? allies : enemies)).push(o);
    return { allies, enemies };
  }

  /* ── wygląd: kolory Motywnika albo klasyczne Margonem ── */
  function palette() {
    const t = MP.motywnik && MP.motywnik.current && MP.motywnik.current();
    if (t) return { bg: `linear-gradient(${t.bg2},${t.bg1})`, line: t.line, edge: t.m ? t.m[2] : t.line, text: t.text, dim: t.text2, head: t.head, pos: t.a1, neg: '#ff5a5a', neu: t.text2, chg: '#ffb020', glow: t.glow, chip: t.bg0 };
    return { bg: 'linear-gradient(#2c2016,#1b130c)', line: '#7a5a34', edge: '#4a3420', text: '#f1e3c6', dim: '#c2a97f', head: 'Georgia, serif', pos: '#7fd36a', neg: '#ff6a5a', neu: '#d9c7a3', chg: '#ffb43a', glow: 'rgba(255,190,90,.15)', chip: 'rgba(0,0,0,.35)' };
  }

  function ensureWin() {
    if (win && win.isConnected) return win;
    const pos = store.get('win:pogromca', { x: innerWidth - 330, y: 140 });
    win = el('div', { id: 'mp-pt', style: { left: pos.x + 'px', top: pos.y + 'px' } },
      el('div', { class: 'mp-pt-h' }, el('b', null, 'Pogromca Tytanów'), el('span', { class: 'mp-pt-r' }), el('button', { class: 'mp-pt-x', title: 'Zbierz dane walki (skopiuj i wklej w rozmowie)', onclick: () => collect() }, '⧉'), el('button', { class: 'mp-pt-x', title: 'Ukryj do końca walki', onclick: () => { win.style.display = 'none'; preview = false; } }, '×')),
      el('div', { class: 'mp-pt-b' }));
    document.body.appendChild(win);
    makeDraggable(win, win.querySelector('.mp-pt-h'), (p) => store.set('win:pogromca', p));
    return win;
  }

  function chip(e, P, warnAt) {
    const c = e.k === 'pos' ? P.pos : e.k === 'neg' ? P.neg : P.neu;
    const soon = e.left != null && e.left <= warnAt;
    return el('div', { class: 'mp-pt-e' + (soon ? ' soon' : ''), style: { '--c': c, background: P.chip } },
      el('span', { class: 'mp-pt-dot' }), el('span', { class: 'mp-pt-n' }, e.name), el('span', { class: 'mp-pt-t' }, e.left == null ? (e.ago === 0 ? 'teraz' : `${e.ago} t. temu`) : e.left === 1 ? '1 tura' : e.left > 1 && e.left < 5 ? `${e.left} tury` : `${e.left} tur`));
  }
  function row(o, P) {
    const box = el('div', { class: 'mp-pt-w' },
      el('div', { class: 'mp-pt-wn' }, el('span', null, o.name), o.hpp !== null && !isNaN(o.hpp) ? el('span', { class: 'mp-pt-hp' }, el('i', { style: { width: Math.max(0, Math.min(100, o.hpp)) + '%' } })) : null));
    if (o.charge) {
      const now1 = o.charge.left <= (cfg.warnAt ?? 1);
      box.appendChild(el('div', { class: 'mp-pt-c' + (now1 ? ' soon' : ''), style: { '--c': P.chg }, title: o.charge.desc || '' }, '⚡ ', el('b', null, o.charge.name), ' — ', o.charge.left <= 0 ? 'w TEJ turze' : `za ${o.charge.left} ${o.charge.left === 1 ? 'turę' : o.charge.left < 5 ? 'tury' : 'tur'}`, o.charge.desc ? el('div', { class: 'mp-pt-cd' }, o.charge.desc) : null));
    }
    if (o.ults && o.ults.length > 1) box.appendChild(el('div', { class: 'mp-pt-u', style: { color: P.dim } }, 'Dalej: ', o.ults.slice(1, 3).map((u, i) => el('span', null, i ? ' · ' : '', el('b', { style: { color: P.text } }, u.name), ` za ${u.left} t.`))));
    const eff = o.eff.slice().sort((a, b) => (a.left ?? 99) - (b.left ?? 99));
    if (eff.length) box.appendChild(el('div', { class: 'mp-pt-es' }, eff.map((e) => chip(e, P, cfg.warnAt ?? 1))));
    else if (!o.charge) box.appendChild(el('div', { class: 'mp-pt-none', style: { color: P.dim } }, 'brak efektów'));
    return box;
  }

  function render(data) {
    const w = ensureWin(), P = palette();
    Object.assign(w.style, { background: P.bg, borderColor: P.line, color: P.text, boxShadow: `0 0 0 1px ${P.edge}, 0 10px 28px rgba(0,0,0,.6), 0 0 18px ${P.glow}`, fontSize: (cfg.scale || 100) * 0.128 + 'px' });
    w.querySelector('.mp-pt-h b').style.fontFamily = P.head;
    w.querySelector('.mp-pt-h').style.borderColor = P.line;
    const { allies, enemies } = data || model();
    w.querySelector('.mp-pt-r').textContent = preview ? 'podgląd' : `tura ${turnNow()}`;
    const B = w.querySelector('.mp-pt-b'); B.textContent = '';
    const solo = allies.length <= 1;
    const sec = (title, list) => { if (!list.length) return; B.appendChild(el('div', { class: 'mp-pt-s', style: { color: P.dim, borderColor: P.line } }, title)); list.forEach((o) => B.appendChild(row(o, P))); };
    if (cfg.showAllies !== false) sec(solo ? 'Ty' : 'Twoja drużyna', allies);
    if (cfg.showEnemies !== false) sec('Przeciwnicy', enemies);
    if (!B.children.length) B.appendChild(el('div', { class: 'mp-pt-none', style: { color: P.dim } }, 'Brak danych o efektach w tej walce.'));
    w.style.display = '';
  }

  function sample() {
    return {
      allies: [
        { id: 1, name: 'Habiachi', hpp: 82, eff: [{ name: 'Aura ochrony', left: 3, k: 'pos' }, { name: 'Furia', left: 1, k: 'pos' }, { name: 'Trucizna', left: 2, k: 'neg' }] },
        { id: 2, name: 'Nakuemease', hpp: 57, eff: [{ name: 'Szadź', left: 1, k: 'neg' }] },
      ],
      enemies: [
        { id: -1, name: 'Piekielny Arcymag', hpp: 64, charge: { name: 'Piekielna burza', left: 2, desc: 'ogień i błyskawice na wszystkich' }, ults: [{ name: 'Piekielna burza', left: 2 }, { name: 'Odprawa niewtajemniczonych', left: 7 }, { name: 'Ognisty podmuch', left: 10 }], eff: [{ name: 'Wyzwanie (Ty)', left: null, ago: 1, k: 'neg' }, { name: 'Osłabienie', left: 4, k: 'neg' }, { name: 'Wzmocnienie', left: 1, k: 'pos' }] },
        { id: -2, name: 'Sługa tytana', hpp: 30, charge: { name: 'Naładowany atak', left: 1 }, eff: [] },
      ],
    };
  }

  function tick() {
    if (!cfg.enabled) return;
    if (preview) return;
    if (game.inBattle()) { readDom(); if (cfg.onlyBoss && !Object.values(model()).flat().some((o) => o.boss)) { if (win) win.style.display = 'none'; return; } render(); }
    else if (win && win.style.display !== 'none') { win.style.display = 'none'; }
  }

  function collect() {
    const b = E() && E().battle;
    const shape = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 2) return typeof o; const r = {}; for (const k of Object.keys(o).slice(0, 60)) { const v = o[k]; r[k] = typeof v === 'function' ? 'fn' : v && typeof v === 'object' ? shape(v, d + 1) : v; } return r; };
    let ws = b && (b.warriorsList || b.warriors); try { if (typeof ws === 'function') ws = ws.call(b); } catch {}
    const arr = Array.isArray(ws) ? ws : Object.values(ws || {});
    const txt = JSON.stringify({ wersja: MP.version, wWalce: game.inBattle(), battleKeys: b ? Object.keys(b).slice(0, 120) : null, wojownicy: arr.slice(0, 6).map((w) => shape(w)), pakiety: PACKETS.slice(-25), dziennik: LOGS.slice(-40), tura: turnNow(), stan: { round: state.round, domTurn: state.domTurn, acts: state.acts, casts: state.casts }, komendy: (net.recent || []).slice(0, 25), skills: (() => { try { const S = E().skills; return S ? Object.keys(S).slice(0, 40) : null; } catch { return null; } })(), okno: (document.querySelector('.battle-controller, .battle-window') || {}).outerHTML?.slice(0, 4000) });
    const fallback = () => { const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } }); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); };
    try { navigator.clipboard.writeText(txt).catch(fallback); } catch { fallback(); }
    toast(`Pogromca Tytanów: skopiowano dane walki (${PACKETS.length} pakietów) — wklej je w rozmowie`, 'ok', 5000);
  }

  defineAddon({
    id: 'pogromca', beta: true, name: 'Pogromca Tytanów', icon: 'pogromca', color: ['#ff6a3d', '#7a1fff'],
    desc: 'W walce pokazuje okienko z efektami na Twojej drużynie (albo na Tobie solo) i na przeciwnikach: nazwa efektu i za ile tur zniknie. Przy tytanach, kolosach i mobach — kto ładuje atak i za ile uderzy. Pomaga trafić z szadzią, furią, aurą czy wyzwaniem. Pozytywne efekty mają kolor stylu, negatywne — czerwony.',
    defaults: { enabled: false, showAllies: true, showEnemies: true, warnAt: 1, scale: 100 },
    settings: [
      { key: 'showAllies', type: 'bool', label: 'Pokazuj moją drużynę' },
      { key: 'showEnemies', type: 'bool', label: 'Pokazuj przeciwników' },
      { key: 'warnAt', type: 'number', label: 'Wyróżnij, gdy zostało tur', min: 0, max: 5, hint: 'Efekt lub atak, który kończy się za tyle tur (lub mniej), miga.' },
      { key: 'scale', type: 'range', label: 'Wielkość okienka (%)', min: 80, max: 140, step: 5 },
      { key: 'onlyBoss', type: 'bool', label: 'Tylko w walkach z tytanami i kolosami' },
    ],
    render(box) {
      box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Podgląd i dane'),
        el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Okienko pokazuje się samo na czas walki i można je przesuwać. „Podgląd" pokazuje przykładowe efekty poza walką.'),
        el('div', { class: 'mp-btns' },
          el('button', { class: 'mp-btn pri', onclick: () => { preview = true; render(sample()); } }, 'Podgląd'),
          el('button', { class: 'mp-btn', onclick: () => { preview = false; if (win) win.style.display = 'none'; } }, 'Ukryj'),
          el('button', { class: 'mp-btn', onclick: collect }, 'Zbierz dane walki')),
        MP.note('info', 'Po pierwszej walce z efektami (najlepiej z tytanem lub kolosem) kliknij <b>Zbierz dane walki</b> jeszcze w trakcie walki i wklej wynik w rozmowie — dopasuję odczyt dokładnie do tego, jak gra przesyła efekty.')));
    },
    init(c) {
      cfg = c;
      bus.on('data', onData);
      bus.on('battle:start', () => { state = fresh(); preview = false; });
      // Twoje ruchy w walce = kolejne tury (zapas, gdy gra nie podaje numeru tury)
      bus.on('cmd', (t) => {
        const m = String(t || '').match(/^fight&a=(attack|spell|move|skip|wait|turn|use)(?:&s=(\d+))?(?:.*?&id=(-?\d+))?/);
        if (!m || !game.inBattle()) return;
        state.acts++;
        if (m[1] === 'spell' && m[2]) state.casts.push({ s: Number(m[2]), id: m[3] ? Number(m[3]) : null, at: turnNow(), name: skillName(Number(m[2])) });
        if (win && cfg.enabled && !preview) setTimeout(render, 50);
      });
      bus.on('battle:end', () => { if (win && !preview) win.style.display = 'none'; });
      timer = setInterval(tick, 500);
      MP.pogromca = { render, sample, collect, state: () => state, preview: () => { preview = true; render(sample()); } };
    },
    onToggle(on) { if (!on && win) win.style.display = 'none'; },
  });
})();
