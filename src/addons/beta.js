/* ───────── Dodatki BETA ─────────
 * Medyk, Quick Change, Podręczny Berserk, Licznik Ubić, Powiadomienia o Elicie, Śmieciara, Darmowy Odbiór, Zapisz zestaw UM.
 * Wszystkie oznaczone jako BETA (znaczek „B" w panelu) — działają, ale wymagają sprawdzenia na prawdziwej grze.
 *
 * Tam, gdzie nie znamy dokładnej komendy serwera, dodatek UCZY SIĘ jej od gracza: wykonujesz daną czynność raz ręcznie
 * w grze, dodatek zapamiętuje komendę, którą wysłała gra, i potem używa dokładnie tej samej.
 */
(() => {
  /* ═════════ wspólne ═════════ */
  const hero = () => { try { return E().hero.d; } catch { return null; } };
  const hpNow = () => { const d = hero(); const s = d && d.warrior_stats; return s ? { hp: Number(s.hp) || 0, max: Number(s.maxhp) || 1 } : null; };
  const isDead = () => { try { return !!E().dead; } catch { return false; } };
  const worldName = () => String(location.hostname || '').split('.')[0];

  /** Komendy gry z tej samej drogi co gra (bez blokad). */
  function send(task, body) {
    try { if (body) return W._g(task, false, body); return net.rawSend(task); } catch (e) { console.warn('[L4Tools]', e); }
  }
  /** Wiadomość na czat (kanał: CLAN, GROUP, LOCAL…) — ta sama komenda, której używa czat gry. */
  function chat(channel, text) {
    const t = String(text || '').trim().slice(0, 200);
    if (!t) return;
    try { W._g(`chat&channel=${channel}`, false, { c: t }); } catch (e) { console.warn('[L4Tools] czat', e); }
  }
  const fill = (tpl, map) => String(tpl || '').replace(/\{([^}]+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));

  /* ── nauka komend: zapamiętujemy komendę, którą gra wysłała przy Twojej ręcznej czynności ── */
  const learners = [];
  bus.on('cmd', (t) => { for (const l of learners.slice()) { try { if (l.test(t)) { learners.splice(learners.indexOf(l), 1); l.done(t); } } catch {} } });
  function learn(test, ms = 120000) {
    return new Promise((res) => {
      const l = { test, done: res };
      learners.push(l);
      setTimeout(() => { const i = learners.indexOf(l); if (i >= 0) { learners.splice(i, 1); res(null); } }, ms);
    });
  }

  /* ── dźwięki: wbudowany sygnał albo Twój plik (IndexedDB) ── */
  const sdb = {
    db: null,
    open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { const q = indexedDB.open('l4tools-snd', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => { this.db = q.result; res(this.db); }; q.onerror = () => rej(q.error); }); },
    async op(m, fn) { const db = await this.open(); return new Promise((res, rej) => { const tx = db.transaction('s', m); const r = fn(tx.objectStore('s')); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); },
    get(k) { return this.op('readonly', (s) => s.get(k)); },
    put(k, v) { return this.op('readwrite', (s) => s.put(v, k)); },
    del(k) { return this.op('readwrite', (s) => s.delete(k)); },
  };
  let AC = null;
  function chime(kind, vol) {
    try {
      AC = AC || new (W.AudioContext || W.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      const t0 = AC.currentTime + 0.02, g = AC.createGain(); g.gain.value = vol; g.connect(AC.destination);
      const notes = kind === 'alarm' ? [[880, 0], [660, 0.18], [880, 0.36], [660, 0.54]] : [[784, 0], [1046.5, 0.12], [1318.5, 0.24]];
      notes.forEach(([f, d]) => {
        const o = AC.createOscillator(), e = AC.createGain(); o.type = kind === 'alarm' ? 'square' : 'triangle'; o.frequency.value = f;
        e.gain.setValueAtTime(0.0001, t0 + d); e.gain.exponentialRampToValueAtTime(kind === 'alarm' ? 0.18 : 0.35, t0 + d + 0.01); e.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.32);
        o.connect(e).connect(g); o.start(t0 + d); o.stop(t0 + d + 0.35);
      });
    } catch {}
  }
  async function playSound(key, kind, vol = 0.7, mode = 'default') {
    if (mode === 'none') return;
    if (mode === 'own') {
      const r = await sdb.get(key).catch(() => null);
      if (r && r.data) { try { const a = new Audio(URL.createObjectURL(new Blob([r.data], { type: r.type || 'audio/mpeg' }))); a.volume = vol; await a.play(); return; } catch {} }
    }
    chime(kind, vol);
  }
  /** Ustawienia dźwięku (wbudowany / własny / brak + głośność + test) jako pole w panelu. */
  function soundField(key, kind) {
    return {
      key: '_snd', type: 'custom', render: (obj, save) => {
        const box = el('div', { class: 'mp-field', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } }, el('div', { class: 'lb' }, 'Dźwięk'));
        const draw = async () => {
          box.querySelectorAll('.mp-btns, .mp-dim').forEach((n) => n.remove());
          const own = await sdb.get(key).catch(() => null);
          const mode = obj.sound || 'default';
          box.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-upchip' + (mode === 'default' ? ' on' : ''), onclick: () => { obj.sound = 'default'; save(); draw(); } }, 'Domyślny'),
            el('button', { class: 'mp-upchip' + (mode === 'own' ? ' on' : ''), onclick: () => { if (!own) return toast('Najpierw wgraj plik', 'warn'); obj.sound = 'own'; save(); draw(); } }, own ? `Własny: ${own.name}` : 'Własny (brak pliku)'),
            el('button', { class: 'mp-upchip' + (mode === 'none' ? ' on' : ''), onclick: () => { obj.sound = 'none'; save(); draw(); } }, 'Bez dźwięku')));
          box.appendChild(el('div', { class: 'mp-btns' },
            el('button', { class: 'mp-btn', onclick: () => playSound(key, kind, obj.volume ?? 0.7, obj.sound || 'default') }, 'Odsłuchaj'),
            el('button', { class: 'mp-btn', onclick: () => {
              const inp = el('input', { type: 'file', accept: 'audio/*', style: { display: 'none' } });
              inp.onchange = async () => { const f = inp.files[0]; inp.remove(); if (!f) return; if (f.size > 8e6) return toast('Plik za duży (max 8 MB)', 'warn'); await sdb.put(key, { name: f.name, type: f.type, data: await f.arrayBuffer() }); obj.sound = 'own'; save(); draw(); };
              document.body.appendChild(inp); inp.click();
            } }, own ? 'Zmień plik' : 'Wgraj własny plik'),
            own ? el('button', { class: 'mp-btn bad', onclick: async () => { await sdb.del(key).catch(() => {}); obj.sound = 'default'; save(); draw(); } }, 'Usuń plik') : null));
        };
        draw();
        return box;
      },
    };
  }
  MP.betaSound = { playSound, soundField, chat, fill };

  /** Pływający przycisk (przeciągany, pozycja zapamiętana). */
  function floatBtn(id, pos, html, title, onClick) {
    let b = document.getElementById(id);
    if (b) return b;
    const p = store.get('pos:' + id, pos);
    b = el('div', { id, class: 'mp-fbtn', title, html, style: { left: p.x + 'px', top: p.y + 'px' } });
    document.body.appendChild(b);
    const moved = makeDraggable(b, b, (np) => store.set('pos:' + id, np));
    b.addEventListener('click', (e) => { if (moved()) return; onClick(e); });
    return b;
  }

  /* ═════════ MEDYK — leczenie po walce ═════════ */
  (() => {
    let cfg, busy = false;
    const healOf = (st, max) => (st.leczy != null ? parseInt(st.leczy, 10) : st.perheal != null ? Math.round((parseInt(st.perheal, 10) / 100) * max) : st.fullheal != null ? parseInt(st.fullheal, 10) : 0);
    const kindOf = (st) => (st.fullheal != null ? 'full' : st.perheal != null ? 'perc' : st.leczy != null ? 'normal' : null);
    function potions() {
      return game.heroItems().filter((it) => kindOf(it.stats || {}) && !(it.stats.timelimit && false));
    }
    /** Wybór mikstury: priorytet z listy (jeśli ustawiony), inaczej najmniejsze „przeleczenie" (jak w AutoHeal). */
    function pick(list, toFull, max) {
      const pr = (cfg.priority || []).filter(Boolean);
      if (pr.length) {
        for (const name of pr) { const c = list.filter((i) => i.name === name); if (c.length) return c.sort((a, b) => (Number(a.stats.amount) || 1) - (Number(b.stats.amount) || 1))[0]; }
        return null;
      }
      return list.slice().sort((a, b) => {
        const h1 = healOf(a.stats, max), h2 = healOf(b.stats, max);
        if (h1 > toFull && h2 > toFull) return h1 - h2;
        if (h1 > toFull) return 1;
        if (h2 > toFull) return -1;
        return h2 - h1;
      })[0];
    }
    async function heal(reason) {
      if (!cfg.enabled || busy || game.inBattle() || isDead()) return;
      const s = hpNow(); if (!s) return;
      if ((s.hp / s.max) * 100 >= cfg.minHp) return;
      busy = true;
      try {
        let toMin = Math.max((cfg.minHp / 100) * s.max - s.hp, 0), toFull = Math.max(s.max - s.hp, 0), n = 0;
        while (toMin > 0 && n++ < 12 && !game.inBattle()) {
          const list = potions().filter((it) => {
            const k = kindOf(it.stats);
            if ((cfg.priority || []).length) return true;
            return (k === 'normal' && cfg.useNormal) || (k === 'perc' && cfg.usePerc) || (k === 'full' && cfg.useFull);
          });
          const it = pick(list, toFull, s.max);
          if (!it) { if (n === 1 && cfg.warnEmpty) toast('Medyk: brak mikstur do leczenia', 'warn'); break; }
          send(`moveitem&st=1&id=${it.id}`);
          const h = healOf(it.stats, s.max);
          toMin = Math.max(toMin - h, 0); toFull = Math.max(toFull - h, 0);
          await sleep(cfg.delay || 350);
        }
      } finally { busy = false; }
    }
    defineAddon({
      id: 'medyk', beta: true, name: 'Medyk', icon: 'medyk', color: ['#2ecc71', '#16a085'],
      desc: 'Leczy od razu po walce, gdy życie spadnie poniżej ustawionego %. Wybierasz, jakich mikstur używać i w jakiej kolejności — bez listy sam dobiera miksturę tak, żeby nie marnować leczenia.',
      defaults: { minHp: 80, useNormal: true, usePerc: true, useFull: false, priority: [], delay: 350, warnEmpty: true, idle: false },
      settings: [
        { key: 'minHp', type: 'range', label: 'Lecz poniżej % życia', min: 10, max: 100, step: 1 },
        { key: 'useNormal', type: 'bool', label: 'Mikstury zwykłe (leczą X punktów)' },
        { key: 'usePerc', type: 'bool', label: 'Mikstury procentowe' },
        { key: 'useFull', type: 'bool', label: 'Mikstury pełnego leczenia' },
        { key: 'idle', type: 'bool', label: 'Lecz też poza walką, gdy życie spadnie (np. po pułapce)' },
        { key: 'warnEmpty', type: 'bool', label: 'Komunikat, gdy skończą się mikstury' },
      ],
      render(box, c, rerender) {
        // kolejność mikstur (priorytet)
        const names = [...new Set(potions().map((p) => p.name))];
        const pr = c.priority = (c.priority || []).filter(Boolean);
        const card = el('div', { class: 'mp-card' }, el('h3', null, 'Kolejność mikstur (priorytet)'),
          el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, pr.length ? 'Medyk używa tylko mikstur z listy, w tej kolejności.' : 'Lista pusta — Medyk sam dobiera miksturę (najmniej zmarnowanego leczenia). Kliknij miksturę, żeby dodać ją do listy.'));
        pr.forEach((n, i) => card.appendChild(el('div', { class: 'mp-lg-row' }, el('b', { style: { width: '22px' } }, `${i + 1}.`), el('span', { style: { flex: 1 } }, n),
          el('button', { class: 'mp-btn', disabled: i === 0, onclick: () => { [pr[i - 1], pr[i]] = [pr[i], pr[i - 1]]; config.save(); rerender(); } }, '▲'),
          el('button', { class: 'mp-btn', disabled: i === pr.length - 1, onclick: () => { [pr[i + 1], pr[i]] = [pr[i], pr[i + 1]]; config.save(); rerender(); } }, '▼'),
          el('button', { class: 'mp-btn bad', onclick: () => { pr.splice(i, 1); config.save(); rerender(); } }, '×'))));
        const rest = names.filter((n) => !pr.includes(n));
        if (rest.length) card.appendChild(el('div', { class: 'mp-btns', style: { marginTop: '6px' } }, rest.map((n) => el('button', { class: 'mp-upchip', onclick: () => { pr.push(n); config.save(); rerender(); } }, '+ ' + n))));
        else if (!names.length) card.appendChild(el('div', { class: 'mp-dim' }, 'Nie widzę mikstur leczących w torbach.'));
        card.appendChild(el('div', { class: 'mp-btns', style: { marginTop: '8px' } }, el('button', { class: 'mp-btn pri', onclick: () => heal('ręcznie') }, 'Ulecz teraz')));
        box.appendChild(card);
      },
      init(c) {
        cfg = c;
        bus.on('battle:end', () => setTimeout(() => heal('po walce'), 700));
        setInterval(() => { if (cfg.enabled && cfg.idle) heal('poza walką'); }, 4000);
        MP.medyk = { heal, potions: () => potions().map((p) => ({ id: p.id, name: p.name, heal: healOf(p.stats, (hpNow() || {}).max || 1) })) };
      },
    });
  })();

  /* ═════════ QUICK CHANGE — szybka zmiana postaci / świata ═════════ */
  (() => {
    let cfg, bar = null, chars = [];
    const ICON_BASE = 'https://micc.garmory-cdn.cloud/obrazki/postacie';
    function norm(c) {
      if (Array.isArray(c)) { const [id, nick, world, lvl, prof, gender, icon] = c; return { id: Number(id), nick, world, lvl, prof, icon }; }
      if (!c || typeof c !== 'object') return null;
      return { id: Number(c.id ?? c.charId), nick: c.nick ?? c.name, world: String(c.world ?? c.server ?? '').toLowerCase(), lvl: c.lvl ?? c.level, prof: c.prof, icon: c.icon ?? c.img };
    }
    async function loadChars() {
      const d = hero(); const acc = d && (d.account || d.acc);
      let list = [];
      try { const m = JSON.parse(localStorage.getItem('Margonem') || 'null'); const cl = m && m.charlist && m.charlist[String(acc)]; if (cl) list = (Array.isArray(cl) ? cl : Object.values(cl)).map(norm).filter(Boolean); } catch {}
      if (!list.length) {
        try {
          const hs3 = typeof W.getCookie === 'function' ? W.getCookie('hs3') : (document.cookie.match(/(?:^|; )hs3=([^;]+)/) || [])[1];
          const r = await fetch(`https://public-api.margonem.pl/account/charlist?hs3=${hs3}`, { credentials: 'include' });
          const j = await r.json(); list = (Array.isArray(j) ? j : Object.values(j || {})).map(norm).filter(Boolean);
        } catch (e) { console.warn('[L4Tools] Quick Change: lista postaci', e); }
      }
      if (list.length) store.set('qc:chars', list); else list = store.get('qc:chars', []);
      chars = list;
      return list;
    }
    /** Przelogowanie: gra wybiera postać po ciasteczku mchar_id, potem wczytujemy świat postaci. */
    function switchTo(c) {
      if (!c) return;
      if (game.inBattle()) return toast('Quick Change: poczekaj do końca walki', 'warn');
      toast(`Quick Change: przelogowanie na ${c.nick} (${c.world})…`);
      try { document.cookie = `mchar_id=${c.id}; domain=.margonem.pl; path=/`; } catch {}
      setTimeout(() => { location.href = `https://${c.world || worldName()}.margonem.pl/`; }, 300);
    }
    function avatar(c) {
      const icon = String(c.icon || '');
      const url = /^https?:/.test(icon) ? icon : ICON_BASE + (icon.startsWith('/') ? '' : '/') + icon;
      return el('div', { class: 'mp-qc-av', title: `${c.nick} — ${c.lvl ?? '?'}${c.prof || ''}\nŚwiat: ${c.world}`, style: { backgroundImage: `url("${url}")` }, onclick: () => switchTo(c) });
    }
    function worldsMenu(anchor) {
      const me = hero(), w = worldName();
      const others = chars.filter((c) => c.world !== w);
      const byWorld = {}; others.forEach((c) => (byWorld[c.world] = byWorld[c.world] || []).push(c));
      const pop = el('div', { class: 'mp-qc-pop' }, el('div', { class: 'mp-qc-h' }, 'Inne światy'),
        Object.keys(byWorld).length ? Object.entries(byWorld).map(([wn, list]) => el('div', { class: 'mp-qc-w' }, el('b', null, wn), el('div', { class: 'mp-qc-row' }, list.map(avatar)))) : el('div', { class: 'mp-dim' }, 'Brak postaci na innych światach.'));
      const r = anchor.getBoundingClientRect();
      Object.assign(pop.style, { left: Math.min(innerWidth - 260, r.left) + 'px', top: r.bottom + 6 + 'px' });
      document.body.appendChild(pop);
      setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
    }
    async function draw() {
      if (!cfg.enabled) { if (bar) bar.remove(); bar = null; return; }
      await loadChars();
      const me = hero(), w = worldName();
      const here = chars.filter((c) => c.world === w && (!me || c.id !== Number(me.id)));
      const pos = store.get('pos:qc', { x: 280, y: 6 });
      if (!bar) { bar = el('div', { id: 'mp-qc', style: { left: pos.x + 'px', top: pos.y + 'px' } }); document.body.appendChild(bar); makeDraggable(bar, bar, (p) => store.set('pos:qc', p)); }
      bar.textContent = '';
      here.slice(0, cfg.max || 8).forEach((c) => bar.appendChild(avatar(c)));
      const dots = el('div', { class: 'mp-qc-dots', title: 'Zmień świat', onclick: () => worldsMenu(dots) }, '⋯');
      bar.appendChild(dots);
      if (!here.length) bar.insertBefore(el('span', { class: 'mp-dim', style: { padding: '0 6px', fontSize: '11px' } }, chars.length ? 'brak innych postaci na tym świecie' : 'nie mam listy postaci'), dots);
    }
    defineAddon({
      id: 'quickchange', beta: true, name: 'Quick Change', icon: 'quickchange', color: ['#5b8cff', '#8e5bff'],
      desc: 'Miniaturki Twoich postaci z tego świata — najedź, żeby zobaczyć nick, poziom i świat; kliknij, żeby się przelogować. Trzy kropki pokazują postacie z innych światów (szybka zmiana świata). Pasek można przesuwać.',
      defaults: { max: 8 },
      settings: [{ key: 'max', type: 'number', label: 'Ile miniaturek pokazywać', min: 1, max: 15 }],
      render(box) {
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Postacie na koncie'),
          el('div', { class: 'mp-dim' }, chars.length ? chars.map((c) => `${c.nick} (${c.lvl ?? '?'}${c.prof || ''}, ${c.world})`).join(' · ') : 'Lista wczyta się po włączeniu dodatku.'),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } }, el('button', { class: 'mp-btn', onclick: () => draw() }, 'Odśwież listę'))));
      },
      init(c) { cfg = c; MP.quickchange = { chars: () => chars, draw }; },
      onToggle(on) { if (on) setTimeout(draw, 1500); else if (bar) { bar.remove(); bar = null; } },
    });
  })();

  /* ═════════ PODRĘCZNY BERSERK ═════════ */
  (() => {
    let cfg, btn = null;
    const isBers = (t) => /bers/i.test(t);
    function state() {
      // stan z gry, jeśli gdzieś go widać; inaczej ostatni znany
      try {
        for (const o of [E().hero && E().hero.d, E().settings, E().interface && E().interface.settings]) {
          if (!o || typeof o !== 'object') continue;
          for (const k of Object.keys(o)) if (/bers/i.test(k) && (typeof o[k] === 'number' || typeof o[k] === 'boolean' || /^[01]$/.test(String(o[k])))) return !!Number(o[k]);
        }
      } catch {}
      return !!cfg.on;
    }
    function paint() {
      if (!btn) return;
      const on = state();
      btn.classList.toggle('on', on);
      btn.title = `Berserk: ${on ? 'WŁĄCZONY' : 'wyłączony'} — kliknij, żeby ${on ? 'wyłączyć' : 'włączyć'}${cfg.cmd ? '' : '\n(najpierw przełącz raz berserk w ustawieniach gry — dodatek nauczy się komendy)'}`;
    }
    async function toggle() {
      const on = !state();
      if (!cfg.cmd) {
        toast('Podręczny Berserk: przełącz raz berserk w ustawieniach gry (Konfiguracja) — zapamiętam, jak to robi gra', 'info', 7000);
        const t = await learn(isBers);
        if (t) { cfg.cmd = t; config.save(); toast('Podręczny Berserk: gotowe — przycisk działa'); }
        return;
      }
      // ta sama komenda co w grze, z wartością 1/0 zamiast zapamiętanej
      const t = /=(?:0|1|true|false)(?=&|$)/i.test(cfg.cmd) ? cfg.cmd.replace(/(bers[a-z_]*=)(?:0|1|true|false)/i, `$1${on ? 1 : 0}`).replace(/(&(?:value|v|state|s|on)=)(?:0|1|true|false)/i, `$1${on ? 1 : 0}`) : cfg.cmd;
      send(t);
      cfg.on = on; config.save(); paint();
      toast(`Berserk ${on ? 'włączony' : 'wyłączony'}`);
    }
    function ensure() {
      if (!cfg.enabled) { if (btn) btn.remove(); btn = null; return; }
      btn = floatBtn('mp-bers', { x: innerWidth - 300, y: 70 }, '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5 14 2h3v3l-4.5 4.5"/></svg>', 'Berserk', toggle);
      btn.classList.add('mp-bers');
      paint();
    }
    defineAddon({
      id: 'berserk', beta: true, name: 'Podręczny Berserk', icon: 'berserk', color: ['#ff4b2b', '#ff9f1a'],
      desc: 'Przycisk na ekranie do włączania i wyłączania berserka (automatycznej agresji wobec potworów) zgodnie z ustawieniami gry. Świeci = włączony, szary = wyłączony. Przycisk można przesuwać.',
      defaults: { cmd: '', on: false },
      settings: [],
      render(box, c, rerender) {
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Komenda berserka'),
          el('div', { class: 'mp-dim' }, c.cmd ? `Zapamiętana: ${c.cmd}` : 'Jeszcze nie zapamiętana — kliknij przycisk na ekranie albo „Naucz”, a potem przełącz berserk w ustawieniach gry.'),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } },
            el('button', { class: 'mp-btn', onclick: async () => { toast('Przełącz teraz berserk w ustawieniach gry…', 'info', 6000); const t = await learn(isBers); if (t) { c.cmd = t; config.save(); toast('Zapamiętano'); rerender(); } else toast('Nie wychwyciłem komendy — spróbuj jeszcze raz', 'warn'); } }, 'Naucz'),
            c.cmd ? el('button', { class: 'mp-btn bad', onclick: () => { c.cmd = ''; config.save(); rerender(); } }, 'Zapomnij') : null)));
      },
      init(c) {
        cfg = c;
        bus.on('cmd', (t) => { if (isBers(t)) { const m = t.match(/=(0|1|true|false)(?=&|$)/i); if (m) { cfg.on = /^(1|true)$/i.test(m[1]); config.save(); paint(); } if (!cfg.cmd) { cfg.cmd = t; config.save(); } } });
        setInterval(paint, 3000);
      },
      onToggle(on) { if (on) ensure(); else if (btn) { btn.remove(); btn = null; } },
    });
  })();

  /* ═════════ LICZNIK UBIĆ ═════════ */
  (() => {
    let cfg, warriors = {}, inFight = false, lootIds = new Map(), win = null;
    // typ potwora wg wagi (wt) — tak jak rozpoznaje go gra / lootlog
    const typeOf = (w) => {
      const wt = Number(w.wt) || 0, ty = Number(w.type);
      if (ty === 0 && wt > 29 && wt < 80) return 'e3';
      if (wt > 99) return 'tytan';
      if (wt > 89) return 'kolos';
      if (wt > 79) return 'heros';
      if (wt > 29) return 'e3';
      if (wt > 19) return 'e2';
      if (wt > 9) return 'elita';
      return 'zwykly';
    };
    const KILL = [['zwykly', 'Zwykłe'], ['elita', 'Elity'], ['e2', 'Elity II'], ['e3', 'Elity III'], ['heros', 'Herosi'], ['kolos', 'Kolosy'], ['tytan', 'Tytani']];
    const LOOT = [['common', 'Zwykłe'], ['unique', 'Unikaty'], ['upgraded', 'Ulepszone'], ['heroic', 'Heroiczne'], ['legendary', 'Legendarne']];
    const blank = () => ({ kills: {}, names: {}, loot: {}, caught: {}, since: now() });
    const stat = () => (cfg.stats = cfg.stats || blank());
    const sess = { kills: {}, names: {}, loot: {}, caught: {}, since: now() };
    const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
    const rarityOf = (it) => { const m = String(it.stat || '').match(/rarity=(\w+)/); return m ? m[1] : 'common'; };
    function onData(d) {
      if (!cfg.enabled || !d) return;
      const f = d.f;
      if (f) {
        if (f.init == 1) { warriors = {}; inFight = true; }
        if (f.w) for (const [id, w] of Object.entries(f.w)) warriors[id] = Object.assign(warriors[id] || {}, w);
        if (f.endBattle == 1 && inFight) {
          inFight = false;
          for (const [id, w] of Object.entries(warriors)) {
            if (!String(id).startsWith('-')) continue;
            const hp = w.hpp != null ? Number(w.hpp) : w.hp && w.hp.hpp != null ? Number(w.hp.hpp) : null;
            if (hp === null || hp > 0) continue;
            const t = typeOf(w);
            for (const s of [stat(), sess]) { inc(s.kills, t); if (t !== 'zwykly') inc(s.names, `${w.name} (${w.lvl})`); }
          }
          config.save(); render();
        }
      }
      // łup z walki: przedmioty z loc „l" (okno łupów); złapany = później trafia do Twojej torby (loc „g")
      if (d.item && typeof d.item === 'object') {
        const me = hero(); const meId = me && String(me.id);
        for (const [key, it] of Object.entries(d.item)) {
          if (!it || typeof it !== 'object') continue;
          const id = String(it.hid || it.id || key);
          if (it.loc === 'l' && d.loot && !lootIds.has(id)) {
            const r = rarityOf(it); lootIds.set(id, r);
            for (const s of [stat(), sess]) inc(s.loot, r);
          } else if (lootIds.has(id) && it.loc === 'g' && (!meId || String(it.own) === meId)) {
            const r = lootIds.get(id); lootIds.delete(id);
            for (const s of [stat(), sess]) inc(s.caught, r);
          }
        }
        if (lootIds.size > 300) lootIds = new Map([...lootIds].slice(-150));
        config.save(); render();
      }
    }
    function table(s) {
      const k = el('div', { class: 'mp-lu-t' }, KILL.filter(([key]) => s.kills[key] || key !== 'zwykly' || true).map(([key, lb]) => el('div', null, el('span', null, lb), el('b', null, String(s.kills[key] || 0)))));
      const l = el('div', { class: 'mp-lu-t' }, LOOT.map(([key, lb]) => el('div', null, el('span', null, lb), el('b', null, `${s.loot[key] || 0}`, el('small', null, ` (złapane ${s.caught[key] || 0})`)))));
      return [el('div', { class: 'mp-lu-s' }, 'Ubite potwory'), k, el('div', { class: 'mp-lu-s' }, 'Łupy'), l];
    }
    function render() {
      if (!cfg.enabled || !cfg.window) { if (win) win.style.display = 'none'; return; }
      if (!win) {
        const p = store.get('pos:lu', { x: 20, y: 160 });
        win = el('div', { id: 'mp-lu', style: { left: p.x + 'px', top: p.y + 'px' } }, el('div', { class: 'mp-lu-h' }, 'Licznik Ubić', el('span', { class: 'mp-lu-m' })), el('div', { class: 'mp-lu-b' }));
        document.body.appendChild(win); makeDraggable(win, win.querySelector('.mp-lu-h'), (q) => store.set('pos:lu', q));
        win.querySelector('.mp-lu-m').onclick = () => { cfg.showTotal = !cfg.showTotal; config.save(); render(); };
      }
      win.style.display = '';
      const s = cfg.showTotal ? stat() : sess;
      win.querySelector('.mp-lu-m').textContent = cfg.showTotal ? 'ogółem ⇄' : 'ta sesja ⇄';
      const b = win.querySelector('.mp-lu-b'); b.textContent = ''; table(s).forEach((n) => b.appendChild(n));
    }
    defineAddon({
      id: 'licznik', beta: true, name: 'Licznik Ubić', icon: 'licznik', color: ['#e74c3c', '#8e44ad'],
      desc: 'Liczy ubite potwory: zwykłe, elity, elity II i III, herosów, kolosy i tytanów. Liczy też łupy — ile wypadło unikatów, heroików i legend, a w nawiasie ile z nich złapałeś. Statystyki tej sesji i ogółem.',
      defaults: { window: true, showTotal: false, stats: null },
      settings: [{ key: 'window', type: 'bool', label: 'Pokazuj okienko licznika na ekranie' }],
      render(box, c, rerender) {
        const s = stat();
        const card = el('div', { class: 'mp-card' }, el('h3', null, `Ogółem (od ${new Date(s.since).toLocaleDateString()})`), ...table(s));
        const top = Object.entries(s.names).sort((a, b) => b[1] - a[1]).slice(0, 15);
        if (top.length) card.appendChild(el('div', { class: 'mp-dim', style: { marginTop: '8px' } }, 'Najczęściej ubijane (bez zwykłych): ' + top.map(([n, v]) => `${n} ×${v}`).join(', ')));
        card.appendChild(el('div', { class: 'mp-btns', style: { marginTop: '8px' } },
          el('button', { class: 'mp-btn bad', onclick: () => { cfg.stats = blank(); config.save(); render(); rerender(); } }, 'Wyzeruj ogółem'),
          el('button', { class: 'mp-btn', onclick: () => { Object.assign(sess, blank()); render(); rerender(); } }, 'Wyzeruj sesję')));
        box.appendChild(card);
      },
      init(c) { cfg = c; bus.on('data', onData); MP.licznik = { stats: () => ({ ogolem: stat(), sesja: sess }) }; },
      onChange() { render(); },
      onToggle(on) { render(); if (!on && win) win.style.display = 'none'; },
    });
  })();

  /* ═════════ POWIADOMIENIA O ELICIE (E2) ═════════ */
  (() => {
    let cfg;
    const tpls = new Map();              // tpl id → szablon potwora (nazwa, poziom, wt)
    const told = new Map();              // npc id → kiedy zgłoszony
    function onData(d) {
      if (!d) return;
      const T = d.npc_tpls; if (T) (Array.isArray(T) ? T : Object.values(T)).forEach((t) => t && t.id != null && tpls.set(Number(t.id), t));
      if (!cfg.enabled || !d.npcs) return;
      const list = Array.isArray(d.npcs) ? d.npcs : Object.entries(d.npcs).map(([id, n]) => Object.assign({ id: Number(id) }, n));
      for (const n of list) {
        if (!n || n.del) continue;
        const t = tpls.get(Number(n.tpl)) || n;
        const wt = Number(t.wt ?? t.warrior_type ?? n.wt);
        if (!(wt > 19 && wt < 30)) continue;
        const id = Number(n.id);
        if (told.has(id) && now() - told.get(id) < 10 * 60000) continue;
        told.set(id, now());
        const m = game.mapInfo();
        const vars = { 'Nazwa Potwora': t.nick || t.name || 'Elita II', 'Poziom': t.lvl ?? t.level ?? '', 'Mapa': m.name, 'X': n.x ?? '', 'Y': n.y ?? '' };
        const text = fill(cfg.text, vars);
        toast(`Elita II: ${vars['Nazwa Potwora']} (${m.name})`, 'warn', 6000);
        if (cfg.clan) chat('CLAN', text);
        playSound('elita', 'chime', cfg.volume ?? 0.7, cfg.sound || 'default');
      }
    }
    defineAddon({
      id: 'elity', beta: true, name: 'Powiadomienia o Elicie', icon: 'elity', color: ['#f1c40f', '#e67e22'],
      desc: 'Gdy na mapie pojawi się elita II (e2), pokazuje komunikat, gra dźwięk i — jeśli chcesz — wysyła wiadomość na czat klanu. Treść wiadomości wpisujesz sam.',
      defaults: { clan: true, text: '{Nazwa Potwora} — {Mapa} ({X},{Y})', sound: 'default', volume: 0.7 },
      settings: [
        { key: 'clan', type: 'bool', label: 'Wysyłaj wiadomość na czat klanu' },
        { key: 'text', type: 'text', label: 'Treść wiadomości', hint: 'Zmienne: {Nazwa Potwora} {Poziom} {Mapa} {X} {Y}' },
        { key: 'volume', type: 'range', label: 'Głośność', min: 0, max: 1, step: 0.05 },
        soundField('elita', 'chime'),
      ],
      init(c) { cfg = c; bus.on('data', onData); bus.on('map:change', () => told.clear()); },
    });
  })();

  /* ═════════ ŚMIECIARA — usuwanie przeterminowanych przedmiotów ═════════ */
  (() => {
    let cfg;
    function expired() {
      const t = Date.now() / 1000;
      return game.heroItems().filter((it) => { const e = Number(it.stats && (it.stats.expires || it.stats.expire)); return e > 0 && e < t; });
    }
    async function clean(manual) {
      if (!cfg.enabled || game.inBattle()) return;
      const list = expired();
      if (!list.length) { if (manual) toast('Śmieciara: brak przeterminowanych przedmiotów'); return; }
      if (!cfg.cmd) { if (manual) toast('Śmieciara: najpierw naucz mnie usuwania (przycisk „Naucz” w panelu)', 'warn', 6000); return; }
      if (manual) {
        const ok = await confirmBox({ title: 'Usunąć przeterminowane przedmioty?', items: list.map((i) => i.name), okText: `Usuń (${list.length})`, danger: true });
        if (!ok) return;
      }
      for (const it of list) { send(cfg.cmd.replace(/\{id\}/g, it.id)); await sleep(450); }
      toast(`Śmieciara: usunięto ${list.length} przeterminowanych przedmiotów`);
    }
    defineAddon({
      id: 'smieciara', beta: true, name: 'Śmieciara', icon: 'smieciara', color: ['#7f8c8d', '#2c3e50'], risk: 'destructive',
      desc: 'Usuwa z toreb przedmioty, którym skończyła się ważność i których nie da się już użyć. Usuwa wyłącznie przeterminowane przedmioty.',
      defaults: { cmd: '', auto: false },
      settings: [{ key: 'auto', type: 'bool', label: 'Usuwaj automatycznie (bez pytania), gdy coś się przeterminuje' }],
      render(box, c, rerender) {
        const list = expired();
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Przeterminowane teraz'),
          el('div', { class: 'mp-dim' }, list.length ? list.map((i) => i.name).join(', ') : 'Brak.'),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } }, el('button', { class: 'mp-btn pri', onclick: () => clean(true) }, 'Usuń przeterminowane'))));
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Komenda usuwania'),
          el('div', { class: 'mp-dim' }, c.cmd ? `Zapamiętana: ${c.cmd}` : 'Jeszcze nie zapamiętana. Kliknij „Naucz”, a potem usuń ręcznie w grze jeden niepotrzebny przedmiot (z potwierdzeniem) — zapamiętam, jak gra to robi.'),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } },
            el('button', { class: 'mp-btn', onclick: async () => {
              const ids = new Set(game.heroItems().map((i) => String(i.id)));
              toast('Usuń teraz ręcznie jeden niepotrzebny przedmiot…', 'info', 8000);
              const t = await learn((x) => { const m = String(x).match(/(\d{6,})/); return m && ids.has(m[1]) && !/st=1(&|$)/.test(x) && /del|destroy|remove|moveitem|trash|throw/i.test(x); });
              if (t) { c.cmd = t.replace(/(\d{6,})/, '{id}'); config.save(); toast('Śmieciara: zapamiętano'); rerender(); } else toast('Nie wychwyciłem komendy', 'warn');
            } }, 'Naucz'),
            c.cmd ? el('button', { class: 'mp-btn bad', onclick: () => { c.cmd = ''; config.save(); rerender(); } }, 'Zapomnij') : null)));
      },
      init(c) { cfg = c; setInterval(() => { if (cfg.enabled && cfg.auto) clean(false); }, 60000); MP.smieciara = { expired: () => expired().map((i) => i.name) }; },
    });
  })();

  /* ═════════ DARMOWY ODBIÓR — darmowe przedmioty z aktualności ═════════ */
  (() => {
    let cfg, btn = null;
    const newsWin = () => $$('.c-window, .news-window, [class*="news"]').find((w) => isVisible(w) && /aktualno|news|nowo/i.test((w.querySelector('.header-label, .header-label .text') || w).textContent || ''));
    const freeButtons = (w) => $$('.button, button', w).filter((b) => isVisible(b) && /^(odbierz|zabierz|weź|odbierz za darmo)/i.test((b.textContent || '').trim()) && !/cl|zł|sł|\d+\s*(sł|zł)/i.test(b.textContent.replace(/odbierz/i, '')));
    function newsWidget() { return $$('.widget-button, [class*="widget-news"], [class*="news"]').find((n) => isVisible(n) && /news|aktual/i.test(String(n.className) + ' ' + (n.getAttribute('tip') || ''))); }
    async function claimAll() {
      let w = newsWin();
      if (!w) { const wd = newsWidget(); if (wd) { wd.click(); await sleep(900); w = newsWin(); } }
      if (!w) return toast('Darmowy Odbiór: otwórz Aktualności — nie mogę ich znaleźć', 'warn', 6000);
      const bs = freeButtons(w);
      if (!bs.length) return toast('Darmowy Odbiór: brak darmowych przedmiotów do odebrania');
      for (const b of bs) { b.click(); await sleep(600); }
      toast(`Darmowy Odbiór: odebrano ${bs.length}`);
      check();
    }
    function check() {
      if (!cfg.enabled) { if (btn) btn.style.display = 'none'; return; }
      const w = newsWin(), wd = newsWidget();
      const has = (w && freeButtons(w).length) || (wd && wd.querySelector('.red-notification, .interface-element-red-notification, [class*="notification"]'));
      btn = btn || floatBtn('mp-free', { x: innerWidth - 360, y: 70 }, '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1 0 2 3 1 6 1zm0 0c2-4 6-4 6-1 0 2-3 1-6 1z"/></svg>', 'Darmowy Odbiór — kliknij, żeby odebrać wszystkie darmowe przedmioty z aktualności', claimAll);
      btn.classList.add('mp-free');
      btn.style.display = has || cfg.always ? '' : 'none';
      btn.classList.toggle('on', !!has);
    }
    defineAddon({
      id: 'odbior', beta: true, name: 'Darmowy Odbiór', icon: 'odbior', color: ['#1abc9c', '#f1c40f'],
      desc: 'Gdy w Aktualnościach są darmowe przedmioty do odebrania, pokazuje ikonkę prezentu — kliknięcie odbiera wszystkie naraz. Nie kupuje niczego płatnego.',
      defaults: { always: false },
      settings: [{ key: 'always', type: 'bool', label: 'Pokazuj ikonkę zawsze (także gdy nic nie wykryto)' }],
      init(c) { cfg = c; setInterval(check, 3000); },
      onToggle() { check(); },
    });
  })();

  /* ═════════ ZAPISZ ZESTAW UM — zestawy umiejętności z MargoWorld ═════════ */
  (() => {
    let cfg;
    function parseLink(url) {
      try {
        const u = new URL(url.trim());
        const params = {}; u.searchParams.forEach((v, k) => (params[k] = v));
        const hash = u.hash.replace(/^#/, '');
        return { url: u.href, host: u.hostname, path: u.pathname, params, hash };
      } catch { return null; }
    }
    defineAddon({
      id: 'zestawum', beta: true, name: 'Zapisz zestaw UM', icon: 'zestawum', color: ['#9b59b6', '#3498db'],
      desc: 'Zapisuje zestawy umiejętności z kalkulatora MargoWorld (link) i pozwala je wczytać w grze. Wersja BETA: na razie zapisuje i porządkuje zestawy, a rozdawanie punktów w grze uczy się z Twojego ręcznego rozdania.',
      defaults: { sets: [], cmd: '' },
      settings: [],
      render(box, c, rerender) {
        const inp = el('input', { class: 'mp-in', placeholder: 'Wklej link do zestawu z margoworld.pl', style: { flex: 1 } });
        const nm = el('input', { class: 'mp-in', placeholder: 'Nazwa zestawu', style: { width: '160px' } });
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Dodaj zestaw'),
          el('div', { class: 'mp-lg-row' }, inp), el('div', { class: 'mp-lg-row' }, nm,
            el('button', { class: 'mp-btn pri', onclick: () => { const p = parseLink(inp.value); if (!p || !/margoworld/i.test(p.host)) return toast('To nie jest link z margoworld.pl', 'warn'); c.sets.push({ name: nm.value.trim() || `Zestaw ${c.sets.length + 1}`, link: p, t: now() }); config.save(); rerender(); } }, 'Zapisz'))));
        const list = el('div', { class: 'mp-card' }, el('h3', null, 'Zapisane zestawy'));
        if (!c.sets.length) list.appendChild(el('div', { class: 'mp-dim' }, 'Brak zapisanych zestawów.'));
        c.sets.forEach((s, i) => list.appendChild(el('div', { class: 'mp-lg-row' }, el('b', { style: { flex: 1 } }, s.name),
          el('button', { class: 'mp-btn', onclick: () => window.open(s.link.url, '_blank') }, 'Otwórz'),
          el('button', { class: 'mp-btn', onclick: () => { const t = JSON.stringify(s.link, null, 1); navigator.clipboard && navigator.clipboard.writeText(t); toast('Skopiowano dane zestawu'); } }, 'Kopiuj dane'),
          el('button', { class: 'mp-btn bad', onclick: () => { c.sets.splice(i, 1); config.save(); rerender(); } }, '×'))));
        box.appendChild(list);
      },
      init(c) { cfg = c; bus.on('cmd', (t) => { if (/skill/i.test(t) && /&(a|action)=/.test(t)) { cfg.lastSkillCmds = (cfg.lastSkillCmds || []).concat(t).slice(-20); config.save(); } }); MP.zestawum = { debug: () => ({ zestawy: cfg.sets, komendyUmiejetnosci: cfg.lastSkillCmds || [] }) }; },
    });
  })();
})();
