/* ───────────────────────── ui.js ─────────────────────────
 * Panel L4Tools w stylu okien gry:
 *   Dodatki · Motywy · Ustawienia · Changelog · Informacje
 */

/** Lista zmian — wyświetlana w zakładce Changelog (najnowsze na górze). */
const CHANGELOG = [
  { v: '1.0.2', d: '14.11.2026', items: [
    'Pokaż EQ: w dymku gracza, obok jego EQ, widać też jego postać, tak jak w oknie „Ekwipunek Postaci”.',
  ] },
  { v: '1.0.1', d: '14.11.2026', items: [
    'Pokaż EQ: na mapie zawsze zostaje dymek gracza z gry. Jeśli gra pokazuje w nim EQ, dodatek dopisuje skróty bonusów i podsumowanie legend. Jeśli nie pokazuje, dodatek sam wstawia do dymka EQ w tym samym układzie.',
    'Pokaż EQ: podgląd z listy graczy i Podręcznej mapy wygląda jak dymek gry. Pokazuje poziom ulepszenia przedmiotów i nie znika przy graczach bez EQ w dymku.',
  ] },
  { v: '1.0.0', d: '14.11.2026', items: [
    'Pierwsza wersja L4Tools.',
    'Panel w stylu okien gry: Dodatki, Motywy, Ustawienia, Changelog i Informacje.',
    'Kafelek L4 przy przyciskach gry i pasek skrótów do dodatków.',
    'Dodatki: Slayer, Hey WakeUP!, Bratan, Gracze na mapie+, Kto złapie, Lepsza Grupa, Podpisownik, Pokaż EQ, Jaki To Bon, Fake Taxi, Szybka walka, Szybka Rączka, Ulepszarka, MiniChat, Legendarny Łup i Motywy.',
  ] },
];

const INFO_HTML = [
  '<p><b>L4Tools</b> to zestaw dodatków do Margonem tworzony hobbystycznie, po godzinach.</p>',
  '<p>Aktualizacje, poprawki i nowe dodatki pojawiają się na bieżąco — według sugestii i potrzeb użytkowników, bez ustalonego harmonogramu. Masz pomysł albo coś nie działa? Daj znać.</p>',
  '<p>Pamiętaj, że dodatki <b>nie są w żaden sposób autoryzowane przez Garmory</b> ani administrację gry. Korzystasz z nich <b>na własną odpowiedzialność</b> — jako twórca menedżera nie odpowiadam za ewentualne blokady konta ani inne konsekwencje.</p>',
].join('');

const ui = {
  panel: null,
  tab: 'addons',
  sel: null,          // otwarty dodatek (ustawienia) w zakładce Dodatki
  filter: '',
  show: 'all',        // filtr listy: all | on | off

  TABS: [
    ['addons', 'puzzle', 'Dodatki'], ['motywy', 'motywnik', 'Motywy'], null,
    ['settings', 'gear', 'Ustawienia'], null,
    ['changelog', 'branch', 'Changelog'], ['info', 'info', 'Informacje'],
  ],

  start() {
    this.applyTheme();
    this.fixWheel();
    this.launcher();
    keys.bind({ label: 'Panel: otwórz/zamknij', get: () => config.data.global.panelKey || '', fn: () => this.toggle() });
  },

  /** Gra przechwytuje kółko myszy (zoom mapy), więc w naszych oknach przewijamy ręcznie. */
  fixWheel() {
    window.addEventListener('wheel', (e) => {
      const root = e.target && e.target.closest && e.target.closest('.mp-glass');
      if (!root) return;
      let n = e.target;
      while (n && n !== root.parentNode) {
        if (n.nodeType === 1) {
          const cs = getComputedStyle(n);
          if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) break;
        }
        n = n.parentNode;
      }
      e.stopImmediatePropagation();
      if (n && n !== root.parentNode && n.nodeType === 1) {
        e.preventDefault();
        n.scrollTop += e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      }
    }, { capture: true, passive: false });
  },

  /** Kolory akcentu panelu (przełączniki, zaznaczenia). Tło zawsze ciemne, jak okna gry. */
  THEMES: {
    margo:    { name: 'Zieleń gry', accent: '#6fae3f' },
    zloto:    { name: 'Złoto',      accent: '#d9a93a' },
    fiolet:   { name: 'Fiolet',     accent: '#8b6cff' },
    ocean:    { name: 'Ocean',      accent: '#3fa2ff' },
    rubin:    { name: 'Rubin',      accent: '#e8495f' },
    grafit:   { name: 'Grafit',     accent: '#b9c0cc' },
  },

  applyTheme() {
    const g = config.data.global;
    g.theme = 'margo';   // jeden kolor panelu — zieleń gry
    if (!(g.glass >= 0.6)) g.glass = 0.9;   // nowy wygląd: prawie kryjące tło jak okna gry
    const t = this.THEMES[g.theme];
    g.accent = t.accent;
    const R = document.documentElement.style;
    R.setProperty('--mp-bg', '20,20,22');
    R.setProperty('--mp-accent', t.accent);
    R.setProperty('--mp-glass', String(g.glass ?? 0.9));
  },

  /**
   * Kafelek L4 — jak przyciski widżetów gry: stoi w ich rzędzie (stałe miejsce w siatce),
   * a przeciągnięty przeskakuje na wolne miejsce w dowolnym rzędzie widżetów.
   */
  launcher() {
    const b = el('div', { id: 'mp-launcher', class: 'l4-tile', title: `L4Tools (${config.data.global.panelKey || 'brak skrótu'})` }, el('span', { class: 'l4-tile-t' }, 'L4'));
    this.lb = b;
    document.body.appendChild(b);
    let drag = null;
    const move = (e) => {
      if (!drag || drag.lock) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
      if (!drag.moved) { drag.moved = true; document.body.appendChild(b); b.classList.add('drag'); Object.assign(b.style, { position: 'fixed', width: '', height: '' }); }
      b.style.left = e.clientX - drag.dx + 'px'; b.style.top = e.clientY - drag.dy + 'px';
    };
    const up = (e) => {
      removeEventListener('pointermove', move, true); removeEventListener('pointerup', up, true);
      if (!drag) return;
      const d = drag; drag = null; b.classList.remove('drag');
      if (!d.moved) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) this.toggle(); return; }
      this.dropLauncher(e.clientX, e.clientY);
    };
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      // przesuwanie tylko wtedy, gdy gra pozwala przesuwać swoje przyciski (tryb edycji widżetów — widać puste miejsca)
      if (!this.widgetEdit()) { drag = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false, lock: true }; addEventListener('pointermove', move, true); addEventListener('pointerup', up, true); return; }
      const r = b.getBoundingClientRect();
      drag = { x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
      addEventListener('pointermove', move, true); addEventListener('pointerup', up, true);
    });
    b.addEventListener('mousedown', (e) => e.stopPropagation());
    this.placeLauncher();
    setInterval(() => { if (!drag) this.placeLauncher(); }, 2000);
  },
  /** Tryb edycji widżetów gry (np. otwarta Konfiguracja → Sterowanie): widać puste miejsca na przyciski. */
  widgetEdit() { return [...document.querySelectorAll('.empty-slot-widget, [class*="empty-slot"]')].some((n) => n.offsetWidth > 20 && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden'); },
  /** Rzędy widżetów gry: kontener, rozmiar kafelka, kierunek i zajęte miejsca. */
  widgetRows() {
    const rows = new Map();
    for (const w of document.querySelectorAll('.widget-button')) {
      if (w.id === 'mp-launcher' || !w.offsetParent) continue;
      const p = w.parentElement; if (!p) continue;
      const r = rows.get(p) || { el: p, pos: w.getAttribute('widget-pos') || p.className, items: [] };
      r.items.push({ l: parseFloat(w.style.left) || w.offsetLeft, t: parseFloat(w.style.top) || w.offsetTop, s: w.offsetWidth || 44 });
      rows.set(p, r);
    }
    return [...rows.values()].map((r) => {
      const s = Math.round(r.items[0].s) || 44;
      const lefts = new Set(r.items.map((i) => Math.round(i.l))), tops = new Set(r.items.map((i) => Math.round(i.t)));
      const hz = lefts.size >= tops.size;
      const used = new Set(r.items.map((i) => Math.round((hz ? i.l : i.t) / s)));
      return { el: r.el, pos: r.pos, s, hz, used, max: Math.max(...used), rect: r.el.getBoundingClientRect() };
    });
  },
  freeIdx(row, want) {
    for (let d = 0; d < 40; d++) { for (const i of [want + d, want - d]) if (i >= 0 && !row.used.has(i)) return i; }
    return row.max + 1;
  },
  placeLauncher() {
    const b = this.lb; if (!b) return;
    const g = config.data.global, rows = this.widgetRows();
    if (!rows.length) {   // brak widżetów gry (inny interfejs) — zwykły kafelek w zapamiętanym miejscu
      const p = g.launcher || { x: 16, y: 120 };
      if (b.parentElement !== document.body) document.body.appendChild(b);
      Object.assign(b.style, { position: 'fixed', left: p.x + 'px', top: p.y + 'px', width: '', height: '' });
      b.classList.remove('in-row');
      return;
    }
    const slot = g.l4slot || {};
    let row = rows.find((r) => r.pos === slot.pos) || rows.find((r) => /top-left/.test(r.pos)) || rows[0];
    let idx = Number.isInteger(slot.idx) ? slot.idx : row.max + 1;
    if (row.used.has(idx)) idx = this.freeIdx(row, idx);
    if (b.parentElement !== row.el) row.el.appendChild(b);
    b.classList.add('in-row');
    // przycisk gry zajmuje miejsce 44 px, ale sam kafelek ma 42 px (1 px odstępu z każdej strony)
    const inner = row.s - 2;
    Object.assign(b.style, { position: 'absolute', width: inner + 'px', height: inner + 'px', left: (row.hz ? idx * row.s : (parseFloat(getComputedStyle(row.el).paddingLeft) || 0)) + 1 + 'px', top: (row.hz ? 0 : idx * row.s) + 1 + 'px' });
    b.classList.toggle('edit', this.widgetEdit());
    if (!g.l4slot || g.l4slot.pos !== row.pos || g.l4slot.idx !== idx) { g.l4slot = { pos: row.pos, idx }; config.save(); }
  },
  dropLauncher(x, y) {
    const rows = this.widgetRows(), g = config.data.global;
    let best = null;
    for (const r of rows) {
      const R = r.rect, pad = r.s;
      if (x < R.left - pad || x > R.right + pad * 2 || y < R.top - pad || y > R.bottom + pad * 2) continue;
      const want = Math.max(0, Math.round(((r.hz ? x - R.left : y - R.top) - r.s / 2) / r.s));
      const d = r.hz ? Math.abs(y - (R.top + r.s / 2)) : Math.abs(x - (R.left + r.s / 2));
      if (!best || d < best.d) best = { r, want, d };
    }
    if (best) g.l4slot = { pos: best.r.pos, idx: this.freeIdx(best.r, best.want) };
    else if (!rows.length) { const r = this.lb.getBoundingClientRect(); g.launcher = { x: Math.round(r.left), y: Math.round(r.top) }; }
    else toast('L4: upuść kafelek w rzędzie przycisków gry');
    config.save();
    this.placeLauncher();
  },

  toggle() { if (this.panel) this.close(); else this.open(); },
  close() { this.panel?.remove(); this.panel = null; },

  open(addonId) {
    if (addonId) { this.sel = addonId === 'motywnik' ? null : addonId; this.tab = addonId === 'motywnik' ? 'motywy' : 'addons'; }
    if (this.panel) { this.renderAll(); return; }
    const pos = config.data.global.panelPos;
    this.panel = el('div', { id: 'mp-panel', class: 'mp-glass l4-win', style: pos ? { left: pos.x + 'px', top: pos.y + 'px' } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' } });
    document.body.appendChild(this.panel);
    this.renderAll();
  },

  renderAll() {
    const P = this.panel;
    if (!P) return;
    P.innerHTML = '';
    if (!this.TABS.some((t) => t && t[0] === this.tab)) this.tab = 'addons';
    const head = el('div', { class: 'l4-head' },
      el('div', { class: 'l4-head-l' }, el('span', { class: 'l4-mini' }, 'L4')),
      el('div', { class: 'l4-title' }, 'L4TOOLS'),
      el('button', { class: 'l4-x', title: 'Zamknij', onclick: () => this.close() }, icon('close', 15)));
    makeDraggable(P, head, (p) => { config.data.global.panelPos = p; config.save(); P.style.transform = 'none'; });
    head.addEventListener('mousedown', () => {
      if (P.style.transform && P.style.transform !== 'none') {
        const r = P.getBoundingClientRect(); P.style.transform = 'none'; P.style.left = r.left + 'px'; P.style.top = r.top + 'px';
      }
    }, true);
    const nav = el('div', { class: 'l4-nav' });
    for (const t of this.TABS) {
      if (!t) { nav.appendChild(el('div', { class: 'l4-gap' })); continue; }
      const [id, ic, lb] = t;
      nav.appendChild(el('button', { class: 'l4-navb' + (this.tab === id ? ' on' : ''), onclick: () => { this.tab = id; if (id === 'addons') this.sel = null; this.renderAll(); } }, icon(ic, 16), el('span', null, lb)));
    }
    nav.appendChild(el('div', { class: 'l4-ver' }, `v${MP.version}`));
    this.main = el('div', { class: 'l4-main' });
    P.append(head, el('div', { class: 'l4-body' }, nav, this.main));
    this.renderMain();
  },

  renderMain() {
    if (!this.main) return;
    const st = this.main.scrollTop;
    this.main.innerHTML = '';
    this.main.classList.toggle('l4-gears', (this.tab === 'addons' && !!this.sel) || this.tab === 'motywy');
    if (this.tab === 'addons') { if (this.sel && addons.byId[this.sel]) this.renderDetail(); else this.renderList(); }
    else if (this.tab === 'motywy') this.renderMotywy();
    else if (this.tab === 'settings') this.renderGeneral();
    else if (this.tab === 'changelog') this.renderChangelog();
    else if (this.tab === 'info') this.renderInfo();
    this.main.scrollTop = st;
  },

  /* ───── Dodatki: lista ───── */
  listAddons() { return addons.list.filter((a) => a.id !== 'motywnik'); },
  renderList() {
    const M = this.main;
    const all = this.listAddons();
    const onCount = all.filter((a) => addons.on(a.id)).length;
    const list = el('div', { class: 'l4-list' });
    const draw = () => {
      list.innerHTML = '';
      const f = this.filter.trim().toLowerCase();
      const rows = all.filter((a) => (!f || (a.name + ' ' + a.desc).toLowerCase().includes(f)) && (this.show === 'all' || (this.show === 'on') === addons.on(a.id)));
      if (!rows.length) list.appendChild(el('div', { class: 'l4-empty' }, 'Brak dodatków dla tego wyszukiwania.'));
      for (const a of rows) {
        const on = addons.on(a.id);
        const sw = switchEl(on, (v) => this.toggleAddon(a, v, sw), true);
        list.appendChild(el('div', { class: 'l4-card' + (on ? ' on' : '') },
          el('div', { class: 'l4-ico' }, icon(a.icon, 20)),
          el('div', { class: 'l4-txt' }, el('div', { class: 'l4-nm' }, a.name), el('div', { class: 'l4-ds' }, a.desc)),
          el('button', { class: 'l4-gearb l4-pinb' + (quickbar.isPinned(a.id) ? ' on' : ''), title: quickbar.isPinned(a.id) ? 'W skrótach — kliknij, żeby usunąć' : 'Dodaj do skrótów', onclick: () => { quickbar.togglePin(a.id); draw(); } }, icon('pin', 14)),
          sw,
          el('button', { class: 'l4-gearb', title: 'Ustawienia', onclick: () => { this.sel = a.id; this.renderMain(); } }, icon('gear', 15))));
      }
    };
    const inp = el('input', { class: 'l4-search', placeholder: 'Szukaj dodatku...', value: this.filter, oninput: (e) => { this.filter = e.target.value; draw(); } });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    const LB = { all: 'Wszystkie', on: 'Włączone', off: 'Wyłączone' };
    const fb = el('button', { class: 'l4-sq' + (this.show !== 'all' ? ' on' : ''), title: `Pokaż: ${LB[this.show]} (kliknij, żeby zmienić)`, onclick: () => { this.show = { all: 'on', on: 'off', off: 'all' }[this.show]; toast(`Dodatki: ${LB[this.show].toLowerCase()}`); this.renderMain(); } }, icon('sliders', 16));
    M.appendChild(el('div', { class: 'l4-bar' }, inp, fb, el('div', { class: 'l4-sq l4-count', title: 'Włączone dodatki' }, String(onCount))));
    M.appendChild(list);
    draw();
  },

  async toggleAddon(a, v, sw) {
    const resetSw = () => { if (sw && sw.querySelector) sw.querySelector('input').checked = !v; };
    if (v && a.risk === 'destructive' && !addons.cfg(a.id)._ack) {
      const ok = await confirmBox({
        title: `Włączyć „${a.name}"?`, danger: true, okText: 'Rozumiem, włącz', countdown: 3,
        html: 'Ten dodatek może <b>zużywać przedmioty</b>. Przed każdą operacją zobaczysz listę przedmiotów do potwierdzenia.',
      });
      if (!ok) { resetSw(); return false; }
      addons.cfg(a.id)._ack = true;
    }
    addons.setEnabled(a.id, v);
    if (this.panel && this.tab === 'addons') this.renderMain();
    bus.emit('quickbar');
    return true;
  },

  /* ───── Dodatki: ustawienia jednego dodatku ───── */
  renderDetail() {
    const M = this.main;
    const a = addons.byId[this.sel];
    const cfg = addons.cfg(a.id);
    const sw = switchEl(cfg.enabled, (v) => this.toggleAddon(a, v, sw));
    M.appendChild(el('div', { class: 'l4-dhead' },
      el('button', { class: 'l4-sq', title: 'Wróć do listy', onclick: () => { this.sel = null; this.renderMain(); } }, icon('back', 16)),
      el('div', { class: 'l4-ico' }, icon(a.icon, 20)),
      el('div', { class: 'l4-txt' }, el('div', { class: 'l4-nm' }, a.name), el('div', { class: 'l4-ds' }, cfg.enabled ? 'Włączony' : 'Wyłączony')),
      el('button', { class: 'l4-btn' + (quickbar.isPinned(a.id) ? ' on' : ''), title: quickbar.isPinned(a.id) ? 'Usuń ikonkę z paska skrótów' : 'Dodaj ikonkę na pasek skrótów (także gdy dodatek jest wyłączony)', onclick: () => { quickbar.togglePin(a.id); this.renderMain(); } }, icon('pin', 13), quickbar.isPinned(a.id) ? 'Usuń ze skrótów' : 'Dodaj do skrótów'),
      sw));
    M.appendChild(el('p', { class: 'mp-desc' }, a.desc));
    this.renderAddon(M, a.id, () => this.renderMain(), true);
  },

  /** Ustawienia dodatku (używane też przez okienko skrótów). */
  renderAddon(M = this.main, id = this.sel, rerender = () => this.renderMain(), compact = false) {
    const a = addons.byId[id];
    if (!a) return;
    const cfg = addons.cfg(a.id);
    if (!compact) M.appendChild(el('p', { class: 'mp-desc' }, a.desc));
    if (a.notes) a.notes(cfg).forEach((n) => n && M.appendChild(note(n.type, n.text)));
    let renderBox = null;
    if (a.render && a.renderFirst) { renderBox = el('div'); M.appendChild(renderBox); }
    if (a.settings && a.settings.length) {
      const groups = {};
      for (const s of a.settings.filter((x) => !x.adv && x.group !== 'Zaawansowane')) (groups[s.group || 'Ustawienia'] = groups[s.group || 'Ustawienia'] || []).push(s);
      for (const [g, arr] of Object.entries(groups)) {
        const card = el('div', { class: 'mp-card' }, el('h3', null, g));
        arr.forEach((s) => { if (!s.show || s.show(cfg)) card.appendChild(field(s, cfg, () => { config.save(); a.onChange && a.onChange(s.key, cfg); if (s.rerender) rerender(); })); });
        if (card.children.length > 1) M.appendChild(card);
      }
    }
    if (a.render) {
      const box = renderBox || el('div');
      if (!renderBox) M.appendChild(box);
      try { a.render(box, cfg, rerender); } catch (e) { box.appendChild(note('bad', 'Błąd widoku: ' + e.message)); }
    }
  },

  /* ───── Motywy ───── */
  renderMotywy() {
    const M = this.main;
    M.appendChild(el('div', { class: 'l4-sec' }, el('h2', null, 'Motywy'), el('div', { class: 'mp-dim' }, 'Wygląd całego interfejsu gry. „Domyślny” = klasyczny wygląd. Możesz też wczytać własny styl CSS.')));
    if (addons.byId.motywnik) this.renderAddon(M, 'motywnik', () => this.renderMain(), true);
  },

  /* ───── Changelog ───── */
  renderChangelog() {
    const M = this.main;
    M.appendChild(el('div', { class: 'l4-sec' }, el('h2', null, 'Changelog'), el('div', { class: 'mp-dim' }, 'Lista zmian w kolejnych wersjach.')));
    for (const c of CHANGELOG) {
      M.appendChild(el('div', { class: 'mp-card l4-cl' + (c.v === MP.version ? ' cur' : '') },
        el('h3', null, `Wersja ${c.v}`, el('span', { class: 'l4-cld' }, c.d + (c.v === MP.version ? ' · zainstalowana' : ''))),
        el('ul', null, c.items.map((t) => el('li', null, t)))));
    }
  },

  /* ───── Informacje ───── */
  renderInfo() {
    const M = this.main;
    M.appendChild(el('div', { class: 'l4-sec' }, el('h2', null, 'Informacje')));
    M.appendChild(el('div', { class: 'mp-card l4-info', html: INFO_HTML }));
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Coś nie działa?'),
      el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Skopiuj raport i wklej go w wiadomości do twórcy — są w nim ostatnie ruchy dodatków i odpowiedzi gry (bez haseł i danych konta).'),
      el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => copyReport() }, 'Kopiuj raport'))));
    M.appendChild(el('div', { class: 'mp-dim', style: { fontSize: '11.5px', textAlign: 'center', marginTop: '6px' } }, `L4Tools v${MP.version} · kod otwarty — możesz sprawdzić, co robi każdy dodatek.`));
  },

  /* ───── Ustawienia ───── */
  LAYOUTS: [
    ['pgp', 'Prawo góra pionowo', 'Przy ekwipunku, w pionie (domyślnie)'],
    ['lgp', 'Lewo góra pionowo', 'Przy czacie, u góry, w pionie'],
    ['lgh', 'Lewo góra poziomo', 'Przy czacie, u góry, w poziomie'],
    ['ldh', 'Lewo dół poziomo', 'Przy czacie, na dole, w poziomie'],
  ],
  renderGeneral() {
    const g = config.data.global;
    const M = this.main;
    M.appendChild(el('div', { class: 'l4-sec' }, el('h2', null, 'Ustawienia')));

    // panel
    const pc = el('div', { class: 'mp-card' }, el('h3', null, 'Panel'));
    pc.appendChild(field({ key: 'panelKey', type: 'key', label: 'Skrót otwierający panel' }, g, () => config.save()));
    pc.appendChild(field({ key: 'glass', type: 'range', label: 'Krycie tła okien', min: 0.6, max: 1, step: 0.02, live: () => this.applyTheme() }, g, () => { config.save(); this.applyTheme(); }));
    M.appendChild(pc);

    // pasek skrótów
    const q = (g.quickbar = g.quickbar || { show: true, pinned: [] });
    if (!Array.isArray(q.pinned)) q.pinned = [];
    if (!q.layout) q.layout = 'pgp';
    const qc = el('div', { class: 'mp-card' }, el('h3', null, 'Skróty dodatków'),
      el('div', { class: 'mp-field' }, el('div', { class: 'lb' }, 'Pokazuj skróty', el('small', null, 'Lewy klik na ikonce = szybkie ustawienia, prawy klik = włącz/wyłącz.')), switchEl(q.show !== false, (v) => { q.show = v; config.save(); quickbar.draw(); if (v && !quickbar.enabledList().length) toast('Skróty: włącz jakiś dodatek albo dodaj go do skrótów pinezką', 'info', 5000); })),
      el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } }, el('div', { class: 'lb' }, 'Ułożenie'),
        el('div', { class: 'l4-lays' }, this.LAYOUTS.map(([k, n, d]) => el('button', { class: 'l4-lay' + (q.layout === k ? ' on' : ''), onclick: () => { q.layout = k; config.save(); quickbar.draw(); this.renderMain(); } },
          el('div', { class: 'l4-lay-pic ' + k }, el('i'), el('i'), el('i')), el('b', null, n), el('small', null, d))))),
      el('div', { class: 'mp-dim', style: { margin: '8px 0 4px', fontSize: '11.5px' } }, 'Dodatki w skrótach (kliknij, żeby dodać albo usunąć). Gdy nie wybierzesz żadnego, na pasku są wszystkie włączone dodatki:'),
      el('div', { class: 'mp-chips' }, this.listAddons().map((a) => {
        const b = el('button', { class: 'mp-pf' + (quickbar.isPinned(a.id) ? ' on' : '') }, a.name);
        b.onclick = () => { quickbar.togglePin(a.id); b.classList.toggle('on'); };
        return b;
      })));
    M.appendChild(qc);

    // zapisywanie ustawień: wspólne albo na każdą postać
    const per = g.perCharacter !== false;
    const who = config.charName ? `${config.charName} (${config.worldName()})` : 'tej postaci';
    const saved = config.savedCharacters();
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Zapisywanie ustawień'),
      el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, per
        ? `Każda postać ma własne ustawienia. Teraz edytujesz: ${who}. Nowa postać zaczyna od ustawień wspólnych.`
        : 'Wszystkie postacie korzystają z tych samych ustawień — zmiana na jednej działa na wszystkich.'),
      el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-upchip' + (!per ? ' on' : ''), onclick: () => { config.setPerCharacter(false); toast('Ustawienia wspólne dla wszystkich postaci', 'ok'); this.renderMain(); } }, 'Wspólne dla wszystkich postaci'),
        el('button', { class: 'mp-upchip' + (per ? ' on' : ''), onclick: () => { config.setPerCharacter(true); toast(`Osobne ustawienia — zapisano dla: ${who}`, 'ok'); this.renderMain(); } }, 'Osobne dla każdej postaci')),
      per ? el('div', { class: 'mp-btns', style: { marginTop: '6px' } },
        el('button', { class: 'mp-btn', onclick: async () => {
          if (!(await confirmBox({ title: 'Skopiować na wszystkie postacie?', html: `Ustawienia postaci ${who} zastąpią ustawienia pozostałych postaci i staną się domyślne dla nowych.`, okText: 'Skopiuj' }))) return;
          const n = config.copyToAll(); toast(`Skopiowano na ${n} ${n === 1 ? 'postać' : 'postaci'} i jako domyślne dla nowych`, 'ok');
        } }, 'Skopiuj te ustawienia na wszystkie postacie')) : null,
      per && saved.length ? el('div', { class: 'mp-dim', style: { marginTop: '6px', fontSize: '11.5px' } }, 'Postacie z własnymi ustawieniami: ' + saved.map((c) => `${c.name} (${c.world})`).join(', ')) : null));

    const conf = keys.conflicts();
    if (conf.length) M.appendChild(note('warn', 'Konflikt skrótów: ' + conf.map(([a, b, k]) => `${k}: „${a}" i „${b}"`).join('; ')));

    const ta = el('textarea', { class: 'mp-in', placeholder: 'Wklej tutaj konfigurację do zaimportowania…' });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Kopia ustawień'),
      el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Zapisane w przeglądarce dla: ' + config.key),
      ta,
      el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn', onclick: () => { ta.value = config.export(); ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Skopiowano do schowka', 'ok'); } catch {} } }, 'Eksportuj'),
        el('button', { class: 'mp-btn', onclick: () => { try { config.import(ta.value); toast('Zaimportowano — odśwież grę', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }, 'Importuj'),
        el('button', { class: 'mp-btn bad', onclick: async () => { if (await confirmBox({ title: 'Przywrócić domyślne?', danger: true, html: 'Wszystkie ustawienia zostaną skasowane.' })) { config.reset(); toast('Ustawienia skasowane — odśwież grę', 'ok'); } } }, 'Przywróć domyślne'))));
  },
};

/** Wspólny raport dla twórcy (wszystkie dodatki): log, odpowiedzi gry, błędy strony, dane Ulepszarki. */
function copyReport() {
  let r = {};
  try {
    r = {
      wersja: MP.version, czas: new Date().toISOString(),
      wlaczone: addons.list.filter((a) => addons.on(a.id)).map((a) => a.name),
      log: net.log.slice(0, 40).map((x) => ({ t: x.t, k: x.kind, src: x.src, task: x.task, msg: x.msg })),
      komendyGry: (net.recent || []).slice(0, 40),
      bledyStrony: store.get('errlog', []),
      ulepszarka: MP.ulepszarka && MP.ulepszarka.reportData ? MP.ulepszarka.reportData() : null,
      pokazEq: MP.pokazEq && MP.pokazEq.lastDebug || null,
      szybka: MP.szybka ? MP.szybka.debug() : null,
      oknoLupow: MP.legenda && MP.legenda.debug ? MP.legenda.debug() : null,
      klasyUI: (() => { const c = new Map(); document.querySelectorAll('body *').forEach((n) => { if (typeof n.className !== 'string' || n.closest('.mp-glass')) return; n.className.split(/\s+/).forEach((k) => k && !/^mp-|^mt-/.test(k) && c.set(k, (c.get(k) || 0) + 1)); }); return [...c].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k]) => k); })(),
    };
  } catch (e) { r.blad = String(e); }
  const txt = JSON.stringify(r, null, 1);
  const fallback = () => { const t = el('textarea', { style: { position: 'fixed', left: '-9999px' } }); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); };
  try { navigator.clipboard.writeText(txt).catch(fallback); } catch { fallback(); }
  toast('Raport skopiowany — wklej go w rozmowie', 'ok');
}

/* ───── elementy formularza ───── */
function switchEl(on, onChange, small) {
  const inp = el('input', { type: 'checkbox' });
  inp.checked = !!on;
  inp.addEventListener('change', () => onChange(inp.checked));
  return el('label', { class: 'mp-sw' + (small ? ' small' : '') }, inp, el('span'));
}

function note(type, text) {
  return el('div', { class: 'mp-note ' + type }, icon(type === 'info' ? 'diag' : 'warn', 16), el('div', { html: text }));
}

function field(s, obj, onSave) {
  const v = obj[s.key];
  const set = (nv) => { obj[s.key] = nv; onSave(); };
  let ctrl;
  switch (s.type) {
    case 'bool':
      ctrl = switchEl(v, async (nv) => {
        if (nv && s.confirm) {
          const ok = await confirmBox({ title: s.label, html: s.confirm, okText: 'Włącz', countdown: s.countdown || 0, danger: !!s.danger });
          if (!ok) { ctrl.querySelector('input').checked = false; return; }
        }
        set(nv);
      });
      break;
    case 'number':
      ctrl = el('input', { class: 'mp-in num', type: 'number', value: v, min: s.min, max: s.max, step: s.step || 1 });
      ctrl.addEventListener('change', () => { let n = Number(ctrl.value); if (s.min != null) n = Math.max(s.min, n); if (s.max != null) n = Math.min(s.max, n); ctrl.value = n; set(n); });
      break;
    case 'range': {
      const out = el('span', { class: 'mp-dim', style: { width: '36px', textAlign: 'right' } }, String(v));
      const r = el('input', { class: 'mp-range', type: 'range', min: s.min, max: s.max, step: s.step || 1, value: v });
      const paint = () => r.style.setProperty('--p', ((r.value - s.min) / (s.max - s.min)) * 100 + '%');
      paint();
      r.addEventListener('input', () => { paint(); out.textContent = r.value; obj[s.key] = Number(r.value); if (s.live) s.live(Number(r.value)); });
      r.addEventListener('change', () => set(Number(r.value)));
      ctrl = el('span', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, r, out);
      break;
    }
    case 'text':
      ctrl = el('input', { class: 'mp-in txt', value: v ?? '', placeholder: s.placeholder || '' });
      ctrl.addEventListener('change', () => set(ctrl.value));
      break;
    case 'textarea':
      ctrl = el('textarea', { class: 'mp-in', placeholder: s.placeholder || '' });
      ctrl.value = v ?? '';
      ctrl.addEventListener('change', () => set(ctrl.value));
      break;
    case 'color':
      ctrl = el('input', { class: 'mp-color', type: 'color', value: v || '#ffffff' });
      ctrl.addEventListener('input', () => { obj[s.key] = ctrl.value; if (s.live) s.live(ctrl.value); });
      ctrl.addEventListener('change', () => set(ctrl.value));
      break;
    case 'select':
      ctrl = el('select', { class: 'mp-in' }, (typeof s.options === 'function' ? s.options() : s.options).map(([val, lb]) => { const o = el('option', { value: val }, lb); if (String(val) === String(v)) o.selected = true; return o; }));
      ctrl.addEventListener('change', () => set(isNaN(Number(ctrl.value)) || ctrl.value === '' ? ctrl.value : Number(ctrl.value)));
      break;
    case 'key': {
      const b = el('button', { class: 'mp-key' + (v ? '' : ' empty') }, v || 'brak');
      b.onclick = async () => {
        b.classList.add('cap'); b.textContent = 'naciśnij…';
        const k = await keys.capture();
        b.classList.remove('cap');
        if (k === null) { b.textContent = obj[s.key] || 'brak'; return; }
        b.textContent = k || 'brak'; b.classList.toggle('empty', !k);
        set(k);
      };
      ctrl = el('span', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, b, el('span', { class: 'mp-dim', style: { fontSize: '11px' } }, 'Del = usuń'));
      break;
    }
    case 'list': {
      const arr = Array.isArray(v) ? v : [];
      const chips = el('div', { class: 'mp-chips' });
      const draw = () => {
        chips.innerHTML = '';
        arr.forEach((x, i) => chips.appendChild(el('span', { class: 'mp-chip' }, x, el('button', { title: 'Usuń', onclick: () => { arr.splice(i, 1); obj[s.key] = arr; onSave(); draw(); } }, '×'))));
        const inp = el('input', { class: 'mp-in', placeholder: s.placeholder || 'dodaj i Enter', style: { width: '140px' } });
        inp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          const val = inp.value.trim(); if (!val) return;
          if (!arr.some((a) => a.toLowerCase() === val.toLowerCase())) arr.push(val);
          obj[s.key] = arr; onSave(); draw();
          chips.querySelector('input')?.focus();
        });
        chips.appendChild(inp);
      };
      draw();
      return el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } }, el('div', { class: 'lb' }, s.label, s.hint ? el('small', null, s.hint) : null), chips);
    }
    case 'custom':
      return s.render(obj, onSave);
    default:
      ctrl = el('span', null, String(v));
  }
  if (s.type === 'textarea') return el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch' } }, el('div', { class: 'lb' }, s.label, s.hint ? el('small', null, s.hint) : null), ctrl);
  return el('div', { class: 'mp-field' + (s.auto ? ' warn' : '') }, el('div', { class: 'lb' }, s.label, s.auto ? ' ' : null, s.auto ? el('span', { class: 'mp-badge auto' }, 'automat') : null, s.hint ? el('small', null, s.hint) : null), ctrl);
}

MP.ui = ui;
MP.field = field;
MP.note = note;
