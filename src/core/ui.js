/* ───────────────────────── ui.js ─────────────────────────
 * Panel konfiguracyjny: przycisk startowy + okno z zakładkami
 *   Dodatki · Diagnostyka · Log · Ogólne
 */
const ui = {
  panel: null,
  tab: 'addons',
  sel: null,
  filter: '',

  start() {
    this.applyTheme();
    this.fixWheel();
    this.launcher();
    keys.bind({ label: 'Panel: otwórz/zamknij', get: () => config.data.global.panelKey || '', fn: () => this.toggle() });
    bus.on('log', debounce(() => { if (this.panel && this.tab === 'log') this.renderMain(); }, 300));
    bus.on('sniff', debounce(() => { if (this.panel && this.tab === 'diag') this.renderMain(); }, 300));
  },

  /**
   * Gra przechwytuje kółko myszy (zoom mapy), więc w naszych oknach przewijamy ręcznie
   * i nie przepuszczamy zdarzenia do gry.
   */
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

  applyTheme() {
    const g = config.data.global;
    document.documentElement.style.setProperty('--mp-accent', g.accent || '#7c5cff');
    document.documentElement.style.setProperty('--mp-glass', String(g.glass ?? 0.55));
  },

  launcher() {
    const p = config.data.global.launcher || { x: 16, y: 120 };
    const b = el('div', { id: 'mp-launcher', class: 'mp-glass', title: `laddonz (${config.data.global.panelKey || 'brak skrótu'})`, style: { left: p.x + 'px', top: p.y + 'px' } }, icon('logo', 24));
    document.body.appendChild(b);
    const moved = makeDraggable(b, b, (pos) => { config.data.global.launcher = pos; config.save(); });
    b.addEventListener('click', () => { if (!moved()) this.toggle(); });
  },

  toggle() { if (this.panel) this.close(); else this.open(); },
  close() { this.panel?.remove(); this.panel = null; },

  open(addonId) {
    if (addonId) { this.sel = addonId; this.tab = 'addons'; }
    if (this.panel) { this.renderAll(); return; }
    const pos = config.data.global.panelPos;
    this.panel = el('div', { id: 'mp-panel', class: 'mp-glass', style: pos ? { left: pos.x + 'px', top: pos.y + 'px' } : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)' } });
    document.body.appendChild(this.panel);
    this.renderAll();
  },

  renderAll() {
    const P = this.panel;
    P.innerHTML = '';
    const tabs = [['addons', 'grid', 'Dodatki'], ['diag', 'diag', 'Diagnostyka'], ['log', 'log', 'Log'], ['general', 'gear', 'Ogólne']];
    const head = el('div', { class: 'mp-head' },
      el('div', { class: 'mp-tile', style: { background: grad([config.data.global.accent, '#3fa2ff']) } }, icon('logo', 18)),
      el('div', null, el('div', { class: 'mp-title' }, 'laddonz'), el('div', { class: 'mp-sub' }, this.subtitle())),
      el('div', { class: 'mp-sp' }),
      el('div', { class: 'mp-tabs' }, tabs.map(([id, ic, lb]) => el('button', { class: 'mp-tab' + (this.tab === id ? ' on' : ''), onclick: () => { this.tab = id; this.renderAll(); } }, icon(ic, 15), lb))),
      el('button', { class: 'mp-x', title: 'Zamknij', onclick: () => this.close() }, icon('close', 18)));
    makeDraggable(P, head, (p) => { config.data.global.panelPos = p; config.save(); P.style.transform = 'none'; });
    head.addEventListener('mousedown', () => {
      if (P.style.transform && P.style.transform !== 'none') {
        const r = P.getBoundingClientRect(); P.style.transform = 'none'; P.style.left = r.left + 'px'; P.style.top = r.top + 'px';
      }
    }, true);
    const body = el('div', { class: 'mp-body' });
    if (this.tab === 'addons') body.appendChild(this.side());
    this.main = el('div', { class: 'mp-main' });
    body.appendChild(this.main);
    P.append(head, body);
    this.renderMain();
  },

  subtitle() {
    const h = game.hero();
    const g = config.data.global;
    const parts = [`v${MP.version}`, h ? `${h.nick} (${h.lvl})` : 'gra nie wykryta'];
    if (g.dryRun) parts.push('TRYB PRÓBNY');
    return parts.join(' · ');
  },

  side() {
    const list = el('div', { class: 'mp-list' });
    const draw = () => {
      list.innerHTML = '';
      const f = this.filter.toLowerCase();
      for (const a of addons.list) {
        if (f && !(a.name + ' ' + a.desc).toLowerCase().includes(f)) continue;
        const cfg = addons.cfg(a.id);
        const sw = switchEl(cfg.enabled, (v) => this.toggleAddon(a, v, sw), true);
        const row = el('div', { class: 'mp-row' + (this.sel === a.id ? ' sel' : '') + (cfg.enabled ? '' : ' off'), onclick: (e) => { if (e.target.closest('.mp-sw')) return; this.sel = a.id; draw(); this.renderMain(); } },
          el('div', { class: 'mp-tile', style: { background: grad(a.color) } }, icon(a.icon, 18)),
          el('div', { class: 'nm' }, a.name),
          a.risk === 'auto' ? el('span', { class: 'mp-badge auto', title: 'Zawiera automatyzację' }, 'A') : null,
          a.risk === 'destructive' ? el('span', { class: 'mp-badge destr', title: 'Może usuwać/zużywać przedmioty' }, '!') : null,
          sw);
        list.appendChild(row);
      }
    };
    if (!this.sel) this.sel = addons.list[0]?.id;
    draw();
    this._drawSide = draw;
    const inp = el('input', { placeholder: 'Szukaj dodatku…', value: this.filter, oninput: (e) => { this.filter = e.target.value; draw(); } });
    return el('div', { class: 'mp-side' }, el('label', { class: 'mp-search' }, icon('search', 15), inp), list);
  },

  async toggleAddon(a, v, sw) {
    const resetSw = () => { if (sw && sw.querySelector) sw.querySelector('input').checked = !v; };
    if (v && a.risk === 'destructive' && !addons.cfg(a.id)._ack) {
      const ok = await confirmBox({
        title: `Włączyć „${a.name}"?`, danger: true, okText: 'Rozumiem, włącz', countdown: 3,
        html: 'Ten dodatek może <b>usuwać lub zużywać przedmioty</b>. Komendy niszczące są zablokowane, dopóki nie zweryfikujesz ich w zakładce <b>Diagnostyka</b>, a przed każdą operacją zobaczysz listę przedmiotów do potwierdzenia.',
      });
      if (!ok) { resetSw(); return false; }
      addons.cfg(a.id)._ack = true;
    }
    addons.setEnabled(a.id, v);
    if (this.panel) { this._drawSide && this._drawSide(); if (this.sel === a.id && this.tab === 'addons') this.renderMain(); }
    bus.emit('quickbar');
    return true;
  },

  renderMain() {
    if (!this.main) return;
    const st = this.main.scrollTop;
    this.main.innerHTML = '';
    if (this.tab === 'addons') this.renderAddon();
    else if (this.tab === 'diag') this.renderDiag();
    else if (this.tab === 'log') this.renderLog();
    else this.renderGeneral();
    this.main.scrollTop = st;
  },

  /* ───── zakładka: dodatek ───── */
  renderAddon(M = this.main, id = this.sel, rerender = () => this.renderMain(), compact = false) {
    const a = addons.byId[id];
    if (!a) return;
    const cfg = addons.cfg(a.id);
    if (!compact) {
      M.appendChild(el('div', { class: 'mp-h' },
        el('div', { class: 'mp-tile', style: { background: grad(a.color) } }, icon(a.icon, 26)),
        el('div', { style: { flex: 1 } },
          el('h2', null, a.name, ' ',
            a.risk === 'auto' ? el('span', { class: 'mp-badge auto' }, icon('warn', 11), 'automat') : null,
            a.risk === 'destructive' ? el('span', { class: 'mp-badge destr' }, icon('warn', 11), 'usuwa/zużywa') : null),
          el('div', { class: 'mp-dim' }, cfg.enabled ? 'Włączony' : 'Wyłączony')),
        switchEl(cfg.enabled, (v) => this.toggleAddon(a, v, M.querySelector('.mp-h .mp-sw')))));
      M.appendChild(el('p', { class: 'mp-desc' }, a.desc));
    }
    if (a.notes) a.notes(cfg).forEach((n) => n && M.appendChild(note(n.type, n.text)));
    let renderBox = null;
    if (a.render && a.renderFirst) { renderBox = el('div'); M.appendChild(renderBox); }
    if (a.settings && a.settings.length) {
      const groups = {};
      for (const s of a.settings) (groups[s.group || 'Ustawienia'] = groups[s.group || 'Ustawienia'] || []).push(s);
      for (const [g, arr] of Object.entries(groups)) {
        const card = el('div', { class: 'mp-card' }, el('h3', null, g));
        arr.forEach((s) => { if (!s.show || s.show(cfg)) card.appendChild(field(s, cfg, () => { config.save(); a.onChange && a.onChange(s.key, cfg); if (s.rerender) rerender(); })); });
        M.appendChild(card);
      }
    }
    if (a.render) {
      const box = renderBox || el('div');
      if (!renderBox) M.appendChild(box);
      try { a.render(box, cfg, rerender); } catch (e) { box.appendChild(note('bad', 'Błąd widoku: ' + e.message)); }
    }
  },

  /* ───── zakładka: diagnostyka ───── */
  renderDiag() {
    const M = this.main;
    const ok = (b) => el('span', { class: b ? 'mp-okc' : 'mp-badc' }, b ? '✔' : '✘');
    const E0 = W.Engine;
    const checks = [
      ['Obiekt gry Engine', !!E0],
      ['Funkcja wysyłania _g', typeof W._g === 'function'],
      ['Wysyłanie komend (window._g)', !!net.origG],
      ['Komendy gry przechwycone (naciśnij X na graczu)', net.stats.gameCalls > 0],
      ['Bohater (Engine.hero)', !!game.hero()],
      ['Lista graczy (Engine.others)', !!(E0 && E0.others)],
      ['Przedmioty (Engine.items)', game.heroItems().length > 0],
      ['Odpowiedzi serwera (hak: ' + (net.respHook || 'brak') + ')', !!net.respHook],
      ['Menu prawego przycisku (' + (menus.hookName || 'brak funkcji') + ')', menus.hooked],
      ['Najechanie na gracza (prototyp Other)', !!menus.hoverHooked],
      ['Cel menu na graczu (prototyp Other)', menus.otherHooked],
    ];
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Punkty zaczepienia'),
      el('table', { class: 'mp-table' }, el('tbody', null, checks.map(([n, b]) => el('tr', null, el('td', null, n), el('td', { style: { width: '30px' } }, ok(b))))))),
    );
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Statystyki'),
      el('div', { class: 'mp-dim' }, `Komendy gry: ${net.stats.gameCalls} · komendy panelu: ${net.stats.ourCalls} · zablokowane: ${net.stats.blocked} · odpowiedzi: ${net.stats.responses} · graczy na mapie: ${game.others().length} · przedmiotów: ${game.heroItems().length}`)));

    // szablony komend
    M.appendChild(note('info', 'Komendy oznaczone „do ustawienia" panel zna dopiero, gdy podejrzy je w grze. Wykonaj daną akcję RĘCZNIE w grze, a potem w sekcji „Podsłuch" przypisz ją do właściwej komendy. Komendy usuwania i ulepszania pozostają zablokowane, dopóki tego nie zrobisz — tak żeby panel nigdy nie wysłał czegoś, czego nie widziałeś na własne oczy.'));
    const cmdCard = el('div', { class: 'mp-card' }, el('h3', null, 'Komendy'));
    const tb = el('tbody');
    for (const name of Object.keys(DEFAULT_COMMANDS)) {
      const c = net.cmd(name);
      const status = !c.t ? el('span', { class: 'mp-badge lock' }, 'do ustawienia')
        : c.verified ? el('span', { class: 'mp-badge ok' }, 'zweryfikowana')
        : c.destructive ? el('span', { class: 'mp-badge destr' }, 'zablokowana') : el('span', { class: 'mp-badge auto' }, 'domyślna');
      const inp = el('input', { class: 'mp-in mp-mono', style: { width: '100%' }, value: c.t || '', placeholder: '(pusta)' });
      const save = el('button', { class: 'mp-mini', onclick: () => { net.setCmd(name, inp.value.trim(), !!inp.value.trim()); toast('Zapisano komendę: ' + c.label, 'ok'); this.renderMain(); } }, 'Zapisz');
      tb.appendChild(el('tr', null,
        el('td', { style: { width: '150px' } }, el('b', null, c.label), el('div', { class: 'mp-dim', style: { fontSize: '11px' } }, c.how)),
        el('td', null, inp), el('td', { style: { width: '110px' } }, status), el('td', { style: { width: '60px' } }, save)));
    }
    cmdCard.appendChild(el('table', { class: 'mp-table' }, el('thead', null, el('tr', null, el('th', null, 'Akcja'), el('th', null, 'Szablon'), el('th', null, 'Status'), el('th'))), tb));
    M.appendChild(cmdCard);

    // podsłuch
    const sn = el('div', { class: 'mp-card' }, el('h3', null, 'Podsłuch — ostatnie komendy wysłane przez grę'));
    sn.appendChild(el('div', { class: 'mp-field' }, el('div', { class: 'lb' }, 'Nasłuch włączony', el('small', null, 'Zapamiętuje tylko 40 ostatnich komend, nic nigdzie nie wysyła.')),
      switchEl(net.sniffing, (v) => { net.sniffing = v; })));
    if (!net.sniff.length) sn.appendChild(el('div', { class: 'mp-dim', style: { padding: '8px 0' } }, 'Brak — wykonaj jakąś akcję w grze.'));
    const sb = el('tbody');
    net.sniff.slice(0, 25).forEach((s) => {
      const sel = el('select', { class: 'mp-in' }, el('option', { value: '' }, 'Przypisz do…'), Object.keys(DEFAULT_COMMANDS).map((n) => el('option', { value: n }, DEFAULT_COMMANDS[n].label)));
      sel.onchange = async () => {
        const name = sel.value; if (!name) return;
        const tpl = templatize(name, s.task);
        const yes = await confirmBox({ title: 'Przypisać komendę?', okText: 'Zapisz', html: `<div>Akcja: <b>${esc(DEFAULT_COMMANDS[name].label)}</b></div><div style="margin-top:8px">Podsłuchane:</div><div class="mp-mono">${esc(s.task)}</div><div style="margin-top:8px">Szablon (zmienne w nawiasach):</div><div class="mp-mono mp-okc">${esc(tpl)}</div><div class="mp-dim" style="margin-top:8px">Jeśli szablon jest zły, popraw go ręcznie w tabeli „Komendy".</div>` });
        if (yes) { net.setCmd(name, tpl, true); toast('Komenda zweryfikowana', 'ok'); this.renderMain(); } else sel.value = '';
      };
      sb.appendChild(el('tr', null, el('td', { class: 'mp-dim', style: { width: '62px' } }, new Date(s.t).toLocaleTimeString()), el('td', { class: 'mp-mono' }, s.task, el('div', { class: 'mp-dim' }, s.via || '')), el('td', { style: { width: '160px' } }, sel)));
    });
    sn.appendChild(el('table', { class: 'mp-table' }, sb));
    M.appendChild(sn);
  },

  /* ───── zakładka: log ───── */
  renderLog() {
    const M = this.main;
    M.appendChild(note('info', 'Wszystko, co panel wysłał albo zablokował. Jeśli coś działa nie tak, tu zobaczysz dlaczego.'));
    const kinds = { send: ['wysłano', 'mp-okc'], dry: ['próba', 'mp-warnc'], block: ['zablokowano', 'mp-badc'], error: ['błąd', 'mp-badc'], info: ['info', 'mp-dim'] };
    const tb = el('tbody', null, net.log.slice(0, 120).map((l) => el('tr', null,
      el('td', { class: 'mp-dim', style: { width: '62px' } }, new Date(l.t).toLocaleTimeString()),
      el('td', { style: { width: '90px' } }, el('span', { class: kinds[l.kind]?.[1] }, kinds[l.kind]?.[0] || l.kind)),
      el('td', { style: { width: '110px' } }, l.src || ''),
      el('td', { class: 'mp-mono' }, l.task || ''),
      el('td', null, l.msg || ''))));
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Ostatnie akcje'), net.log.length ? el('table', { class: 'mp-table' }, tb) : el('div', { class: 'mp-dim' }, 'Pusto.')));
    M.appendChild(el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => { net.log.length = 0; this.renderMain(); } }, 'Wyczyść log')));
  },

  /* ───── zakładka: ogólne ───── */
  renderGeneral() {
    const g = config.data.global;
    const M = this.main;
    const save = () => { config.save(); this.applyTheme(); };
    const S = [
      { key: 'dryRun', type: 'bool', label: 'Tryb próbny', hint: 'Panel NIC nie wysyła do gry, tylko zapisuje w logu co by zrobił. Idealne na pierwsze uruchomienie.' },
      { key: 'minInterval', type: 'number', label: 'Minimalny odstęp między komendami panelu (ms)', min: 150, max: 5000, hint: 'Dotyczy wszystkich dodatków naraz. Nie schodź poniżej 250 ms.' },
      { key: 'panelKey', type: 'key', label: 'Skrót otwierający panel' },
      { key: 'perCharacter', type: 'bool', label: 'Osobne ustawienia dla każdej postaci', hint: 'Zmiana zadziała po odświeżeniu gry.' },
      { key: 'accent', type: 'color', label: 'Kolor akcentu' },
      { key: 'glass', type: 'range', label: 'Przezroczystość tła', min: 0.2, max: 0.95, step: 0.05 },
      { key: 'menuSelector', type: 'textarea', label: 'Selektor menu prawego przycisku w grze', hint: 'Zapas, gdy opcje (np. „⚔ Napad") nie pojawiają się w menu gracza.' },
    ];
    const card = el('div', { class: 'mp-card' }, el('h3', null, 'Ogólne'));
    S.forEach((s) => card.appendChild(field(s, g, () => { save(); if (s.key === 'dryRun') this.renderAll(); })));
    M.appendChild(card);

    // pasek skrótów
    const q = (g.quickbar = g.quickbar || { show: true, hidden: [], pos: null });
    const qc = el('div', { class: 'mp-card' }, el('h3', null, 'Pasek skrótów (przy ekwipunku)'),
      el('div', { class: 'mp-field' }, el('div', { class: 'lb' }, 'Pokazuj pasek skrótów', el('small', null, 'Lewy klik na ikonce = ustawienia dodatku, prawy klik = włącz/wyłącz.')), switchEl(q.show, (v) => { q.show = v; config.save(); quickbar.draw(); })),
      el('div', { class: 'mp-chips', style: { marginTop: '8px' } }, addons.list.map((a) => {
        const on = !(q.hidden || []).includes(a.id);
        const b = el('button', { class: 'mp-pf' + (on ? ' on' : '') }, a.name);
        b.onclick = () => { q.hidden = q.hidden || []; const i = q.hidden.indexOf(a.id); if (i >= 0) q.hidden.splice(i, 1); else q.hidden.push(a.id); config.save(); b.classList.toggle('on'); quickbar.draw(); };
        return b;
      })),
      el('div', { class: 'mp-btns' }, el('button', { class: 'mp-btn', onclick: () => { q.pos = null; config.save(); quickbar.place(); } }, 'Przywróć położenie paska')));
    M.appendChild(qc);

    const conf = keys.conflicts();
    if (conf.length) M.appendChild(note('warn', 'Konflikt skrótów: ' + conf.map(([a, b, k]) => `${k}: „${a}" i „${b}"`).join('; ')));

    const ta = el('textarea', { class: 'mp-in', placeholder: 'Wklej tutaj konfigurację do zaimportowania…' });
    M.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Kopia ustawień'),
      el('div', { class: 'mp-dim', style: { marginBottom: '8px' } }, 'Zapisane w przeglądarce dla: ' + config.key),
      ta,
      el('div', { class: 'mp-btns' },
        el('button', { class: 'mp-btn', onclick: () => { ta.value = config.export(); ta.select(); try { navigator.clipboard.writeText(ta.value); toast('Skopiowano do schowka', 'ok'); } catch {} } }, 'Eksportuj'),
        el('button', { class: 'mp-btn', onclick: () => { try { config.import(ta.value); toast('Zaimportowano — odśwież grę', 'ok'); } catch (e) { toast(e.message, 'bad'); } } }, 'Importuj'),
        el('button', { class: 'mp-btn bad', onclick: async () => { if (await confirmBox({ title: 'Przywrócić domyślne?', danger: true, html: 'Wszystkie ustawienia tej postaci zostaną skasowane.' })) { config.reset(); toast('Ustawienia skasowane — odśwież grę', 'ok'); } } }, 'Przywróć domyślne'))));
    M.appendChild(el('div', { class: 'mp-dim', style: { fontSize: '11.5px' } }, `laddonz v${MP.version}. Kod otwarty — sprawdź, co robi każdy dodatek, zanim go włączysz.`));
  },
};

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
