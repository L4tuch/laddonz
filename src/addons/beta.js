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
  /** Życie bohatera: najpierw statystyki walki z gry, potem zwykłe pola, na końcu procent. */
  const hpNow = () => {
    const d = hero(); if (!d) return null;
    const ws = d.warrior_stats || {};
    const hp = Number(ws.hp ?? d.hp), max = Number(ws.maxhp ?? d.maxhp);
    if (max > 0 && !isNaN(hp)) return { hp, max };
    const pct = Number(ws.hpp ?? d.hpp);
    if (pct >= 0) return { hp: pct, max: 100 };
    return null;
  };
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
    const statusText = () => { const s = hpNow(); return `Życie teraz: ${s ? `${s.hp}/${s.max} (${Math.round((s.hp / s.max) * 100)}%)` : 'nie odczytano'} · ostatnio: ${last.why}`; };
    function potions() {
      return game.heroItems().filter((it) => kindOf(it.stats || {}) && !(it.stats.timelimit && false));
    }
    const KINDS = { normal: 'Zwykłe (leczą X punktów)', perc: 'Procentowe (leczą % życia)', full: 'Pełnego leczenia' };
    const USE = { normal: 'useNormal', perc: 'usePerc', full: 'useFull' };
    const order = () => { const o = (cfg.order || []).filter((k) => KINDS[k]); for (const k of Object.keys(KINDS)) if (!o.includes(k)) o.push(k); return (cfg.order = o); };
    /** Najmniej zmarnowanego leczenia wśród podanych mikstur. */
    const leastWaste = (list, toFull, max) => list.slice().sort((a, b) => {
      const h1 = healOf(a.stats, max), h2 = healOf(b.stats, max);
      if (h1 > toFull && h2 > toFull) return h1 - h2;
      if (h1 > toFull) return 1;
      if (h2 > toFull) return -1;
      return h2 - h1;
    })[0];
    /** Wybór mikstury: rodzaje w ustawionej kolejności — gdy pierwszego brak, bierze następny; wewnątrz rodzaju najmniej marnuje. */
    function pick(list, toFull, max) {
      for (const k of order()) {
        if (!cfg[USE[k]]) continue;
        const c = list.filter((i) => kindOf(i.stats) === k);
        if (c.length) return leastWaste(c, toFull, max);
      }
      return null;
    }
    let fighting = false, last = { t: 0, why: 'jeszcze nie leczył' };
    const hist = [];
    const note = (why) => { last = { t: now(), why }; hist.unshift(new Date().toISOString().slice(11, 19) + ' ' + why); hist.length = Math.min(hist.length, 12); return why; };
    /** Leczenie. Zwraca powód, gdy nic nie zrobił (widać w panelu i w raporcie). */
    async function heal(reason, manual) {
      if (!cfg.enabled && !manual) return note('dodatek wyłączony');
      if (busy) return note('już leczy');
      if (fighting) return note('trwa walka');
      if (isDead()) return note('postać nie żyje');
      let s = hpNow();
      if (!s) return note('nie mogę odczytać życia postaci');
      if ((s.hp / s.max) * 100 >= cfg.minHp) return note(`życie ${Math.round((s.hp / s.max) * 100)}% — powyżej progu ${cfg.minHp}%`);
      busy = true;
      let used = 0;
      try {
        for (let n = 0; n < 15 && !fighting; n++) {
          s = hpNow() || s;
          if ((s.hp / s.max) * 100 >= cfg.minHp) break;
          const toFull = Math.max(s.max - s.hp, 0);
          const it = pick(potions(), toFull, s.max);
          if (!it) { if (!used && (cfg.warnEmpty || manual)) toast('Medyk: brak mikstur do leczenia', 'warn'); note(used ? `użył ${used} mikstur, skończyły się` : 'brak pasujących mikstur'); break; }
          const before = s.hp;
          send(`moveitem&st=1&id=${it.id}`);
          used++;
          // czekamy, aż gra zaktualizuje życie (maks. ~1,5 s), zamiast zgadywać ile wyleczyło
          for (let w = 0; w < 10; w++) { await sleep(150); const x = hpNow(); if (x && x.hp !== before) break; }
          await sleep(Math.max(0, (cfg.delay || 350) - 150));
        }
        if (used) note(`${reason}: użył ${used} ${used === 1 ? 'mikstury' : 'mikstur'}`);
      } finally { busy = false; }
      return last.why;
    }
    /** Po walce próbujemy kilka razy — gra przysyła nowe życie z opóźnieniem, a okno walki bywa jeszcze otwarte. */
    async function afterBattle() {
      for (let i = 0; i < 8 && !fighting; i++) {
        await sleep(i ? 900 : 500);
        const s = hpNow();
        if (s && (s.hp / s.max) * 100 >= cfg.minHp) return;
        if (!busy) await heal('po walce');
      }
    }
    defineAddon({
      id: 'medyk', beta: true, name: 'Medyk', icon: 'medyk', color: ['#2ecc71', '#16a085'],
      desc: 'Leczy od razu po walce, gdy życie spadnie poniżej ustawionego %. Wybierasz rodzaje mikstur (zwykłe, procentowe, pełnego leczenia) i ich kolejność — gdy pierwszego rodzaju brak, bierze następny, a w obrębie rodzaju dobiera miksturę tak, żeby nie marnować leczenia.',
      defaults: { minHp: 80, useNormal: true, usePerc: true, useFull: false, order: ['normal', 'perc', 'full'], delay: 350, warnEmpty: true, idle: false },
      settings: [
        { key: 'minHp', type: 'range', label: 'Lecz poniżej % życia', min: 10, max: 100, step: 1 },
        { key: 'useNormal', type: 'bool', label: 'Mikstury zwykłe (leczą X punktów)' },
        { key: 'usePerc', type: 'bool', label: 'Mikstury procentowe' },
        { key: 'useFull', type: 'bool', label: 'Mikstury pełnego leczenia' },
        { key: 'idle', type: 'bool', label: 'Lecz też poza walką, gdy życie spadnie (np. po pułapce)' },
        { key: 'warnEmpty', type: 'bool', label: 'Komunikat, gdy skończą się mikstury' },
      ],
      render(box, c, rerender) {
        // kolejność rodzajów mikstur (priorytet)
        const o = order(), all = potions();
        const card = el('div', { class: 'mp-card' }, el('h3', null, 'Kolejność mikstur (priorytet)'),
          el('div', { class: 'mp-dim', style: { marginBottom: '6px' } }, 'Medyk najpierw używa rodzaju z góry listy. Gdy go zabraknie, bierze następny. Wyłączonych rodzajów (przełączniki wyżej) nie używa wcale.'));
        o.forEach((k, i) => {
          const n = all.filter((p) => kindOf(p.stats) === k).reduce((a, p) => a + (Number(p.stats.amount) || 1), 0);
          card.appendChild(el('div', { class: 'mp-lg-row', style: { opacity: c[USE[k]] ? 1 : 0.45 } }, el('b', { style: { width: '22px' } }, `${i + 1}.`),
            el('span', { style: { flex: 1 } }, KINDS[k], el('span', { class: 'mp-dim', style: { marginLeft: '6px' } }, c[USE[k]] ? `w torbach: ${n}` : 'wyłączone')),
            el('button', { class: 'mp-btn', disabled: i === 0, onclick: () => { [o[i - 1], o[i]] = [o[i], o[i - 1]]; config.save(); rerender(); } }, '▲'),
            el('button', { class: 'mp-btn', disabled: i === o.length - 1, onclick: () => { [o[i + 1], o[i]] = [o[i], o[i + 1]]; config.save(); rerender(); } }, '▼')));
        });
        if (!all.length) card.appendChild(el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, 'Nie widzę mikstur leczących w torbach.'));
        const st = el('div', { class: 'mp-dim', style: { marginTop: '6px' } }, statusText());
        card.appendChild(el('div', { class: 'mp-btns', style: { marginTop: '8px' } }, el('button', { class: 'mp-btn pri', onclick: async () => { const why = await heal('ręcznie', true); st.textContent = statusText(); if (why && !/użył/.test(why)) toast('Medyk: ' + why, 'info', 4000); } }, 'Ulecz teraz')));
        card.appendChild(st);
        box.appendChild(card);
      },
      init(c) {
        cfg = c;
        bus.on('battle:start', () => { fighting = true; });
        bus.on('battle:end', () => { fighting = false; if (cfg.enabled) afterBattle(); });
        // zapas: koniec walki z danych serwera (gdyby gra nie zamknęła okna walki)
        bus.on('data', (d) => { const f = d && d.f; if (!f) return; if (f.init == 1) fighting = true; if (f.endBattle == 1 && fighting) { fighting = false; if (cfg.enabled) afterBattle(); } });
        setInterval(() => { if (cfg.enabled && cfg.idle && !fighting && !busy) heal('poza walką'); }, 4000);
        MP.medyk = { heal, debug: () => ({ historia: hist, zycie: hpNow(), prog: cfg.minHp, walka: fighting, ostatnio: last.why, kiedy: last.t ? new Date(last.t).toISOString().slice(11, 19) : null, mikstury: potions().map((p) => ({ id: p.id, nazwa: p.name, leczy: healOf(p.stats, (hpNow() || {}).max || 1), rodzaj: kindOf(p.stats) })) }) };
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
    /** Stałe miejsce: tuż po prawej od tarczy HUD-a na górze (jak w grze), bez przesuwania. */
    function place() {
      if (!bar) return;
      const hud = $$('.hud-container').find(isVisible);
      if (hud) {
        const r = hud.getBoundingClientRect();
        bar.style.left = Math.round(r.right + 10) + 'px';
        bar.style.top = Math.round(r.top + (r.height - bar.offsetHeight) / 2) + 'px';
      } else { bar.style.left = Math.round(innerWidth / 2 + 190) + 'px'; bar.style.top = '8px'; }
    }
    async function draw() {
      if (!cfg.enabled) { if (bar) bar.remove(); bar = null; return; }
      await loadChars();
      const me = hero(), w = worldName();
      const here = chars.filter((c) => c.world === w && (!me || c.id !== Number(me.id)));
      if (!bar) { bar = el('div', { id: 'mp-qc' }); document.body.appendChild(bar); }
      bar.textContent = '';
      here.slice(0, cfg.max || 8).forEach((c) => bar.appendChild(avatar(c)));
      const dots = el('div', { class: 'mp-qc-dots', title: 'Postacie na innych światach' }, '---');
      dots.onclick = () => worldsMenu(dots);
      bar.appendChild(dots);
      place();
    }
    defineAddon({
      id: 'quickchange', beta: true, name: 'Quick Change', icon: 'quickchange', color: ['#5b8cff', '#8e5bff'],
      desc: 'Miniaturki Twoich postaci z tego świata obok tarczy na górze ekranu — najedź, żeby zobaczyć nick, poziom i świat; kliknij, żeby się przelogować. „---” pokazuje postacie z innych światów (szybka zmiana świata). Gdy nie masz innych postaci, ramka zostaje pusta.',
      defaults: { max: 8 },
      settings: [{ key: 'max', type: 'number', label: 'Ile miniaturek pokazywać', min: 1, max: 15 }],
      render(box) {
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Postacie na koncie'),
          el('div', { class: 'mp-dim' }, chars.length ? chars.map((c) => `${c.nick} (${c.lvl ?? '?'}${c.prof || ''}, ${c.world})`).join(' · ') : 'Lista wczyta się po włączeniu dodatku.'),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } }, el('button', { class: 'mp-btn', onclick: () => draw() }, 'Odśwież listę'))));
      },
      init(c) { cfg = c; setInterval(place, 1000); addEventListener('resize', () => setTimeout(place, 50)); MP.quickchange = { chars: () => chars, draw, debug: () => ({ postacie: chars.map((x) => `${x.nick} ${x.lvl ?? '?'}${x.prof || ''} ${x.world} ikona:${x.icon || '-'}`), hud: !!$$('.hud-container').find(isVisible) }) }; },
      onToggle(on) { if (on) setTimeout(draw, 1500); else if (bar) { bar.remove(); bar = null; } },
    });
  })();

  /* ═════════ PODRĘCZNY BERSERK ═════════ */
  (() => {
    let cfg, btn = null;
    // z Twojego raportu: przełączenie berserka w ustawieniach gry wysyła settings&action=update&id=34&v=1 / v=0
    const DEF_ID = 34;
    const SET_RE = /^settings&action=update&id=(\d+)&v=(\d+)/;
    const setId = () => Number(cfg.setId) || DEF_ID;
    const isBers = (t) => { const m = String(t).match(SET_RE); return !!m && Number(m[1]) === setId(); };
    /** Klasy przedmiotów, które leżą w miejscu tarczy: tarcze, pomocnicze (orby/księgi), strzały. */
    const SHIELD_CL = [14, 5, 21];
    function shieldNode() {
      const eq = game.equipped();
      const it = eq.find((i) => SHIELD_CL.includes(i.cl));
      const pick = (id) => $$(`.item-id-${id}`).find((n) => isVisible(n) && !n.closest('.loot-wnd, .bag, [class*="bag-"], .tip-wrapper'));
      if (it) { const n = pick(it.id); if (n) return n.closest('.eq-slot, [class*="slot"]') || n; }
      // brak tarczy: puste miejsce na tarczę w ekwipunku
      return $$('.eq-slot, [class*="eq-item-slot"], [class*="equipment"] [class*="slot"]').find((n) => isVisible(n) && /shield|tarcz|st-?4\b|slot-?4\b/i.test(n.className + ' ' + (n.getAttribute('data-st') || '') + ' ' + (n.getAttribute('tip') || ''))) || null;
    }
    function place() {
      if (!btn) return;
      const n = shieldNode();
      if (n) {
        // pod miejscem na tarczę gra ma srebrną ikonkę tarczy — stawiamy się zaraz pod nią
        const r = n.getBoundingClientRect(), sz = btn.offsetWidth || 20;
        let below = null;
        btn.style.visibility = 'hidden';
        try {
          const probe = document.elementFromPoint(r.left + r.width / 2, r.bottom + Math.min(r.height * 0.5, 14));
          if (probe && probe !== document.body) { const q = probe.getBoundingClientRect(); if (q.height < 60 && q.width < 60 && q.top >= r.bottom - 2) below = q; }
        } catch {}
        btn.style.visibility = '';
        // tuż na prawo od srebrnej tarczy, na jej wysokości
        const ref = below || { right: r.right, top: r.bottom + 4, height: r.height * 0.75 };
        btn.style.left = Math.round(ref.right + 3) + 'px'; btn.style.top = Math.round(ref.top + (ref.height - sz) / 2) + 'px';
        btn.classList.remove('mp-bers-free');
      } else {
        const hud = $$('.hud-container').find(isVisible);
        if (hud) { const r = hud.getBoundingClientRect(); btn.style.left = Math.round(r.left - 34) + 'px'; btn.style.top = Math.round(r.top + r.height / 2 - 12) + 'px'; }
        btn.classList.add('mp-bers-free');
      }
    }
    function paint() {
      if (!btn) return;
      const on = !!cfg.on;
      btn.classList.toggle('on', on);
      btn.title = `Berserk: ${on ? 'WŁĄCZONY' : 'wyłączony'} — kliknij, żeby ${on ? 'wyłączyć' : 'włączyć'}`;
    }
    function toggle() {
      if (game.inBattle()) return toast('Berserk: poczekaj do końca walki', 'warn');
      const on = !cfg.on;
      send(`settings&action=update&id=${setId()}&v=${on ? 1 : 0}`);
      cfg.on = on; config.save(); paint();
      toast(`Berserk ${on ? 'włączony' : 'wyłączony'}`);
    }
    function ensure() {
      if (!cfg.enabled) { if (btn) btn.remove(); btn = null; return; }
      if (!btn) {
        btn = el('div', { id: 'mp-bers', html: '<svg viewBox="0 0 20 20" width="20" height="20"><path class="sk" d="M3.2 2.2c.4 2 1.2 3.1 2.3 3.6A6.6 6.6 0 0 1 10 4.2c1.7 0 3.3.6 4.5 1.6 1.1-.5 1.9-1.6 2.3-3.6 1.3 1.7 1.5 3.7.6 5.4.5.9.8 1.9.8 3 0 2.1-1 3.8-2.6 4.8v1.9c0 .7-.5 1.2-1.2 1.2H5.6c-.7 0-1.2-.5-1.2-1.2v-1.9A5.6 5.6 0 0 1 1.8 10.6c0-1.1.3-2.1.8-3-.9-1.7-.7-3.7.6-5.4z"/><path class="ey" d="M5.6 9.2c.9-.6 2.5-.4 3 .6.3.8-.3 2-1.4 2.1-1.2.1-2.1-.7-2.1-1.6 0-.4.2-.8.5-1.1zm8.8 0c-.9-.6-2.5-.4-3 .6-.3.8.3 2 1.4 2.1 1.2.1 2.1-.7 2.1-1.6 0-.4-.2-.8-.5-1.1zM10 12.4l.9 1.7H9.1z"/><path class="ey" d="M7 15.6h1.1v1.9H7zm2.45 0h1.1v1.9h-1.1zm2.45 0H13v1.9h-1.1z"/></svg>' });
        btn.addEventListener('click', toggle);
        document.body.appendChild(btn);
      }
      paint(); place();
    }
    defineAddon({
      id: 'berserk', beta: true, name: 'Podręczny Berserk', icon: 'berserk', color: ['#ff4b2b', '#ff9f1a'],
      desc: 'Czaszka obok srebrnej tarczy w Twoim ekwipunku — kliknięcie włącza albo wyłącza berserka (automatyczną agresję wobec potworów) tą samą komendą co ustawienia gry. Fioletowa = włączony, szara = wyłączony.',
      defaults: { on: false, setId: DEF_ID },
      settings: [],
      render(box, c, rerender) {
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Stan'),
          el('div', { class: 'mp-dim' }, `Berserk: ${c.on ? 'włączony' : 'wyłączony'} · ustawienie gry nr ${setId()}. Gdy przełączysz berserka w ustawieniach gry, ikonka sama się zaktualizuje.`),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } },
            el('button', { class: 'mp-btn pri', onclick: () => { toggle(); rerender(); } }, c.on ? 'Wyłącz berserka' : 'Włącz berserka'),
            el('button', { class: 'mp-btn', onclick: async () => { toast('Przełącz teraz berserka w ustawieniach gry…', 'info', 6000); const t = await learn((x) => SET_RE.test(x)); if (t) { const m = t.match(SET_RE); c.setId = Number(m[1]); c.on = m[2] === '1'; config.save(); toast(`Zapamiętano (ustawienie nr ${c.setId})`); paint(); rerender(); } else toast('Nie wychwyciłem przełączenia', 'warn'); } }, 'Naucz od nowa'))));
      },
      init(c) {
        cfg = c;
        bus.on('cmd', (t) => { const m = String(t).match(SET_RE); if (m && Number(m[1]) === setId()) { cfg.on = m[2] === '1'; config.save(); paint(); } });
        setInterval(() => { if (cfg.enabled) { if (!btn) ensure(); place(); } }, 1000);
        addEventListener('resize', () => setTimeout(place, 50));
        MP.berserk = { debug: () => ({ wlaczony: !!cfg.on, ustawienie: setId(), tarcza: (() => { const n = shieldNode(); return n ? String(n.className).slice(0, 80) : null; })(), zalozone: game.equipped().map((i) => `${i.name} cl${i.cl} st${i.st}`) }) };
      },
      onToggle(on) { if (on) ensure(); else if (btn) { btn.remove(); btn = null; } },
    });
  })();

  /* ═════════ LICZNIK UBIĆ ═════════
   * Lista potworów (elity II wpisane z góry z margohelp.pl, inne dopisują się same po ubiciu) z liczbą ubić
   * i łupami: żółte = unikaty, niebieskie = heroiki, pomarańczowe = legendy; w nawiasie — ile z nich złapałeś Ty.
   */
  (() => {
    let cfg, warriors = {}, inFight = false, win = null, lastFight = null;
    const lootIds = new Map();          // id przedmiotu z okna łupów → { r, key }
    const DB = { e2: "Mushita|23|p;Kotołak Tropiciel|27|;Shae Phu|30|m;Zorg Jednooki Baron|33|h;Władca Rzek|37|m;Gobbos|40|b;Tyrtajos|42|w;Szczęt alias Gładki|47|w;Tollok Shimger|47|w;Razuglag Oklash|51|m;Agar|51|w;Foverk Turrim|57|b;Owadzia Matka|58|t;Vari Kruger|66|m;Furruk Kozug|66|m;Jotun|70|w;Tollok Atamatu|73|h;Tollok Utumutu|73|h;Lisz|75|m;Grabarz świątynny|80|w;Podły zbrojmistrz|82|w;Wielka Stopa|82|m;Choukker|84|w;Nadzorczyni krasnoludów|88|w;Morthen|89|w;Żelazoręki Ohydziarz|92|p;Leśne Widmo|92|t;Goplana|93|p;Gnom Figlid|96|m;Centaur Zyfryd|99|h;Kambion|101|b;Jertek Moxos|105|w;Miłośnik łowców|108|w;Miłośnik rycerzy|108|w;Miłośnik magii|108|w;Łowca Czaszek|112|m;Ozirus Władca Hieroglifów|115|m;Morski Potwór|118|t;Krab pustelnik|124|b;Borgoros Garamir III|124|w;Stworzyciel|125|b;Poskramiacz hydr|128|m;Pogromczyni Mantikor|128|h;Pogromca gryfów|128|w;Ifryt|128|m;Młody Jack Truciciel|131|w;Henry Kaprawe Oko|131|w;Helga Opiekunka Rumu|131|t;Eol|135|h;Grubber Ochlaj|136|w;Mistrz Worundriel|139|w;Wójt Fistuła|144|b;Teściowa Rumcajsa|145|m;Berserker Amuno|148|w;Fodug Zolash|150|m;Goons Asterus|154|h;Adariel|155|m;Burkog Lorulk|160|w;Sheba Orcza Szamanka|160|m;Duch władcy klanów|165|p;Bragarth myśliwy dusz|170|h;Fursharag pożeracz umysłów|170|m;Ziuggrael strażnik królowej|170|w;Królowa Śniegu|175|m;Lusgrathera królowa pramatka|175|m;Chryzoprenia|177|p;Wrzosera|177|w;Cantedewia|177|t;Ogr Stalowy Pazur|183|w;Torunia Ankelwald|186|p;Pięknotka Mięsożerna|189|h;Breheret żelazny łeb|192|w;Cerasus|193|h;Mysiur myświórowy król|197|m;Sadolia Nadzorczyni Hurys|200|b;Bergermona Krwawa Hrabina|204|h;Sataniel skrytobójca|204|h;Annaniel Wysysacz Marzeń|204|m;Gothardus kolekcjoner głów|204|w;Zufulus smakosz serc|205|m;Czempion Furboli|210|w;Arachniregina Colosseus|214|b;Rycerz z za małym mieczem|214|w;Aldiphrin Ilythirahel|218|m;Marlloth Malignitas|220|b;Arytodam olbrzymi|226|w;Mocny Maddoks|231|m;Fangaj|235|h;Luna|237|p;Noumenia|237|b;Dendroculus|240|w;Silvanasus|241|m;Tolypeutes|245|w;Cuaitl Citlalin|250|w;Yaotl|258|h;Quetzalcoatl|260|m;Wabicielka|260|b;Pogardliwa Sybilla|263|m;Chopesz|267|b;Fovos|270|m;Neferkar Set|274|w;Chaegd Agnrakh|280|w;Vaenra Charkhaam|280|m;Terrozaur|280|b;Mazurnik Przybrzeżny|284|w;Nymphemonia|287|h;Zorin|300|b;Furion|300|h;Artenius|300|m", e3: "Tarmus Wuden|43|p;Vonaros|64|m;Wyznawca Ciemnych Mocy|83|b;Szkielet Władcy Żywiołów|114|m;Erktos|300|w", heros: "Domina Ecclesiae|21|b;Mietek Żul|25|w;Mroczny Patryk|35|w;Karmazynowy Mściciel|45|m;Złodziej|51|h;Zły Przewodnik|63|w;Opętany Paladyn|74|p;Piekielny Kościej|85|w;Koziec Mąciciel Ścieżek|94|m;Kochanka Nocy|102|m;Książę Kasim|116|b;Święty Braciszek|123|b;Złoty Roger|135|t;Baca bez Łowiec|144|h;Czarująca Atalia|157|m;Obłąkany Łowca Orków|165|w;Lichwiarz Grauhaz|177|w;Viviana Nandin|184|h;Przeraza|194|m;Demonis Pan Nicości|205|m;Mulher Ma|214|b;Vapor Veneno|231|w;Dęborożec|244|w;Tepeyollotl|258|b;Widmo Triady|265|m;Negthotep Czarny Kapłan|271|h;Młody Smok|282|m", kolos: "Mamlambo|36|b;Regulus Mętnooki|63|w;Amaimon Soploręki|83|b;Umibozu|114|b;Vashkar|144|h;Hydrokora Chimeryczna|167|w;Lulukav|190|m;Arachin Podstępny|213|b;Reuzen|244|w;Wernoradzki Drakolisz|279|m", tytan: "Dziewicza Orlica|51|;Zabójczy Królik|70|;Renegat Baulus|101|;Piekielny Arcymag|131|;Versus Zoons|154|;Łowczyni Wspomnień|177|;Przyzywacz Demonów|204|;Maddok Magua|231|;Tezcatlipoca|258|;Barbatos Smoczy Strażnik|285|;Tanroth|300|" };
    const NPC_IMG = 'https://micc.garmory-cdn.cloud/obrazki/npc/';
    // grafiki elit II z margohelp.pl (ścieżki względem obrazki/npc/e2/)
    const ICONS = new Map("Mushita|st-puma;Kotołak Tropiciel|../e1/kotolak_lowca;Shae Phu|demonszef;Zorg Jednooki Baron|zbir-e2-zorg;Władca Rzek|gobmag2;Gobbos|gobsamurai;Tyrtajos|dzik;Szczęt alias Gładki|zbir-szczet;Tollok Shimger|tollok_shimger;Razuglag Oklash|razuglag;Agar|glut_agar;Foverk Turrim|kobold07;Owadzia Matka|zadlak-e2-owadzia-matka;Vari Kruger|gnoll11;Furruk Kozug|gnoll12;Jotun|kam_olbrzym-b;Tollok Atamatu|tollok_jask_atamatu;Tollok Utumutu|tollok_jask_utumatu;Lisz|lisz_demilisze;Grabarz świątynny|nieu_mnich_grabarz;Podły zbrojmistrz|magaz_zbrojmistrz;Wielka Stopa|wlochacze_wielka_stopa;Choukker|dlawiciel5;Nadzorczyni krasnoludów|nadzorczyni_krasnoludow;Morthen|krasnolud_boss;Żelazoręki Ohydziarz|ugrape2;Leśne Widmo|lesne_widmo;Goplana|goplana;Gnom Figlid|gnom_figlid;Centaur Zyfryd|cent-zyfryd;Kambion|kambion;Jertek Moxos|moloch-jertek;Miłośnik łowców|blotniaki_milosnik_lowcow;Miłośnik rycerzy|blotniaki_milosnik_rycerzy;Miłośnik magii|blotniaki_milosnik_magii;Łowca Czaszek|alghul-czaszka-1a;Ozirus Władca Hieroglifów|mumia-ozirus;Morski Potwór|osmiornica-1b;Krab pustelnik|krab_big3;Borgoros Garamir III|ingotia_minotaur-7a;Stworzyciel|stworzyciel;Poskramiacz hydr|zagajnik02;Pogromczyni Mantikor|zagajnik03;Pogromca gryfów|zagajnik01;Ifryt|magradit_ifryt;Młody Jack Truciciel|pirat01;Henry Kaprawe Oko|../e1/pirat5b;Helga Opiekunka Rumu|pirat-2b;Eol|piaskowy_potwor-6a;Grubber Ochlaj|grubber-ochlaj;Mistrz Worundriel|worundriel02;Wójt Fistuła|goral-e2-wojt-fistula;Teściowa Rumcajsa|goral-e2-tesciowa-rumcajsa;Berserker Amuno|amuno;Fodug Zolash|fodug_zolash;Goons Asterus|goons_asterus-1a;Adariel|tri_adariel;Burkog Lorulk|orkczd;Sheba Orcza Szamanka|r_orc_sheba;Duch władcy klanów|duch_wladcy_kl;Bragarth myśliwy dusz|praork_low_elita;Fursharag pożeracz umysłów|praork_mag_elita;Ziuggrael strażnik królowej|praork_woj_elita;Królowa Śniegu|krolowa-sniegu;Lusgrathera królowa pramatka|prakrolowa;Chryzoprenia|chryzoprenia;Wrzosera|wrzosera-1b;Cantedewia|cantedewia-1a;Ogr Stalowy Pazur|ogr_drapak;Torunia Ankelwald|thuz-patr1;Pięknotka Mięsożerna|zmutowana-roslinka;Breheret żelazny łeb|draki-breheret-1b;Cerasus|cerasus-1a;Mysiur myświórowy król|krolszczur;Sadolia Nadzorczyni Hurys|sekta-sadolia;Bergermona Krwawa Hrabina|sekta-bergermona;Sataniel skrytobójca|sekta-sataniel;Annaniel Wysysacz Marzeń|sekta-annaniel;Gothardus kolekcjoner głów|sekta-gothardus;Zufulus smakosz serc|sekta-zufulus;Czempion Furboli|forbol03;Arachniregina Colosseus|regina-e2;Rycerz z za małym mieczem|pajeczy16;Aldiphrin Ilythirahel|drow-aldiphrin;Marlloth Malignitas|drider-marlloth;Arytodam olbrzymi|arytodam_olbrzymi-1b;Mocny Maddoks|mocny_maddoks-1a;Fangaj|grzyb-humanoid-1b;Luna|elgary_luna-1b;Noumenia|elgary_noumenia-1a;Dendroculus|dendroculus;Silvanasus|silvanasus;Tolypeutes|bolita;Cuaitl Citlalin|maho-cuaitl;Yaotl|mahoplowca;Quetzalcoatl|quetzalcoatl-1a;Pogardliwa Sybilla|tri2_witch_e2;Chopesz|chopesh2;Fovos|fovos-1;Neferkar Set|neferkar_set-1a;Chaegd Agnrakh|bar_smokoszef;Vaenra Charkhaam|bar_smoczyca;Terrozaur|terrorzaur_pus;Mazurnik Przybrzeżny|mazurnik_przybrzezny-1a;Nymphemonia|nymphemonia;Zorin|wl-mrozu01;Furion|wl-mrozu02;Artenius|wl-mrozu03;Tanroth|../tyt/ice_king".split(';').map((r) => { const [n, f] = r.split('|'); return [n.toLowerCase(), NPC_IMG + ('e2/' + f).replace(/^e2\/\.\.\//, '') + '.gif']; }));
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
    const TYPES = [['all', 'Wszystkie'], ['elita', 'Elity'], ['e2', 'Elity II'], ['e3', 'Elity III'], ['heros', 'Herosi'], ['kolos', 'Kolosy'], ['tytan', 'Tytani']];
    const TAG = { elita: 'E1', e2: 'E2', e3: 'E3', heros: 'HER', kolos: 'KOL', tytan: 'TYT' };
    const RANK = { zwykly: 0, elita: 1, e2: 2, e3: 3, heros: 4, kolos: 5, tytan: 6 };
    const PROF = { wojownik: 'w', paladyn: 'p', mag: 'm', 'łowca': 'h', tropiciel: 't', 'tancerz ostrzy': 'b' };
    const R3 = { unique: 'u', upgraded: 'u', heroic: 'h', legendary: 'l' };
    const mobs = () => (cfg.mobs = cfg.mobs || {});
    const keyOf = (n) => String(n || '').trim().toLowerCase();
    function seed() {
      const m = mobs();
      for (const [t, list] of Object.entries(DB)) for (const row of list.split(';')) {
        const [n, lvl, prof] = row.split('|'); const k = keyOf(n);
        if (!m[k]) m[k] = { n, lvl: Number(lvl) || 0, prof: prof || '', t, k: 0, d: {}, m: {} };
        if (!m[k].icon && ICONS.has(k)) m[k].icon = ICONS.get(k);
      }
    }
    const iconUrl = (ic) => { ic = String(ic || ''); if (!ic) return ''; if (/^https?:/.test(ic)) return ic; ic = ic.replace(/^\/+/, '').replace(/^obrazki\//, ''); return (/^npc\//.test(ic) ? 'https://micc.garmory-cdn.cloud/obrazki/' : NPC_IMG) + ic; };
    const icons = new Map();            // nazwa → ikona (z danych mapy, gdy potwór stoi na mapie)
    function mobFor(w) {
      const k = keyOf(w.name || w.nick); if (!k) return null;
      const m = mobs(); const t = typeOf(w);
      const o = m[k] = m[k] || { n: w.name || w.nick, t, k: 0, d: {}, m: {} };
      if (w.lvl) o.lvl = Number(w.lvl);
      if (w.prof) o.prof = String(w.prof).length === 1 ? w.prof : (PROF[String(w.prof).toLowerCase()] || '');
      if (RANK[t] > (RANK[o.t] || 0)) o.t = t;
      const ic = w.icon || icons.get(k); if (ICONS.has(k)) o.icon = ICONS.get(k); else if (ic) o.icon = iconUrl(ic);
      return o;
    }
    const totals = () => (cfg.totals = cfg.totals || { kills: {}, loot: {}, caught: {}, since: now() });
    const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
    const rarityOf = (it) => { const m = String(it.stat || '').match(/rarity=(\w+)/); return m ? m[1] : (it.stats && it.stats.rarity) || 'common'; };
    function onData(d) {
      if (!d) return;
      const T = d.npc_tpls; if (T) (Array.isArray(T) ? T : Object.values(T)).forEach((t) => { if (t && t.icon && (t.nick || t.name)) icons.set(keyOf(t.nick || t.name), t.icon); });
      if (!cfg.enabled) return;
      let dirty = false;
      const f = d.f;
      if (f) {
        if (f.init == 1) { warriors = {}; inFight = true; }
        if (f.w) for (const [id, w] of Object.entries(f.w)) warriors[id] = Object.assign(warriors[id] || {}, w);
        if (f.endBattle == 1 && inFight) {
          inFight = false; lastFight = null;
          for (const [id, w] of Object.entries(warriors)) {
            if (!String(id).startsWith('-')) continue;
            const hp = w.hpp != null ? Number(w.hpp) : w.hp && w.hp.hpp != null ? Number(w.hp.hpp) : null;
            if (hp === null || hp > 0) continue;
            const t = typeOf(w);
            inc(totals().kills, t); dirty = true;
            if (t === 'zwykly') continue;
            const o = mobFor(w); if (!o) continue;
            o.k++; o.last = now();
            if (!lastFight || RANK[t] > RANK[lastFight.t]) lastFight = { key: keyOf(o.n), t, at: now() };
          }
        }
      }
      // łupy z walki (okno łupów, loc „l") przypisujemy najsilniejszemu ubitemu potworowi z tej walki
      if (d.item && typeof d.item === 'object') {
        const me = hero(); const meId = me && String(me.id);
        for (const [key, it] of Object.entries(d.item)) {
          if (!it || typeof it !== 'object') continue;
          const id = String(it.hid || it.id || key);
          if (it.loc === 'l' && d.loot && !lootIds.has(id)) {
            const r = rarityOf(it); const fk = lastFight && now() - lastFight.at < 30000 ? lastFight.key : null;
            lootIds.set(id, { r, key: fk }); inc(totals().loot, r); dirty = true;
            const o = fk && mobs()[fk]; if (o && R3[r]) inc(o.d, R3[r]);
          } else if (lootIds.has(id) && it.loc === 'g' && (!meId || String(it.own) === meId)) {
            const { r, key: fk } = lootIds.get(id); lootIds.delete(id); inc(totals().caught, r); dirty = true;
            const o = fk && mobs()[fk]; if (o && R3[r]) inc(o.m, R3[r]);
          }
        }
        if (lootIds.size > 300) [...lootIds.keys()].slice(0, 150).forEach((k) => lootIds.delete(k));
      }
      if (dirty) { config.save(); if (win && win.style.display !== 'none') drawList(); }
    }

    /* ── okno ── */
    const F = () => (cfg.f = cfg.f || Object.assign({ q: '', min: 1, max: 300, type: 'all', show: 'all', sort: 'kills', dir: 'desc' }, store.get('lu:filters', {})));
    const saveF = () => { store.set('lu:filters', cfg.f); config.save(); };
    function rows() {
      const f = F(), q = f.q.trim().toLowerCase();
      let list = Object.values(mobs()).filter((o) => (f.type === 'all' || o.t === f.type)
        && (!q || o.n.toLowerCase().includes(q))
        && (!o.lvl || (o.lvl >= (Number(f.min) || 1) && o.lvl <= (Number(f.max) || 1e4)))
        && o.k > 0
        && (f.show === 'all' || (f.show === 'loot' ? (o.d.u || o.d.h || o.d.l) : !(o.d.u || o.d.h || o.d.l))));
      const by = { kills: (o) => o.k, lvl: (o) => o.lvl || 0, name: (o) => o.n.toLowerCase(), loot: (o) => (o.d.u || 0) + (o.d.h || 0) * 10 + (o.d.l || 0) * 100 }[f.sort] || ((o) => o.k);
      list.sort((a, b) => { const x = by(a), y = by(b); const c = x < y ? -1 : x > y ? 1 : 0; return c ? (f.dir === 'asc' ? c : -c) : (a.lvl || 0) - (b.lvl || 0) || a.n.localeCompare(b.n); });
      return list;
    }
    const cnt = (o, r, cls) => el('span', { class: 'mp-lu-c ' + cls }, `${o.d[r] || 0} (${o.m[r] || 0})`);
    function drawList() {
      if (!win) return;
      const box = win.querySelector('.mp-lu-list'); const st = box.scrollTop; box.textContent = '';
      const list = rows();
      if (!list.length) box.appendChild(el('div', { class: 'mp-lu-empty' }, Object.values(mobs()).some((o) => o.k) ? 'Brak ubitych potworów dla tych filtrów.' : 'Jeszcze nic nie ubiłeś — potwory pojawią się tu po pierwszym ubiciu.'));
      for (const o of list) {
        const ic = o.icon ? el('div', { class: 'mp-lu-ic', style: { backgroundImage: `url("${o.icon}")` } }) : el('div', { class: 'mp-lu-ic none' }, (o.n[0] || '?').toUpperCase());
        box.appendChild(el('div', { class: 'mp-lu-row' + (o.k ? '' : ' zero') }, ic,
          el('div', { class: 'mp-lu-mid' },
            el('div', { class: 'mp-lu-nm' }, `[${TAG[o.t] || '?'}] ${o.n}${o.lvl ? ` (${o.lvl}${o.prof || ''})` : ''}`),
            el('div', { class: 'mp-lu-dr' }, el('span', { class: 'mp-lu-lb' }, 'Zdobycze:'), cnt(o, 'u', 'u'), cnt(o, 'h', 'h'), cnt(o, 'l', 'l'))),
          el('div', { class: 'mp-lu-k', title: 'Ubitych' }, `[${o.k}]`)));
      }
      box.scrollTop = st;
    }
    function sel(key, opts) {
      const f = F();
      const s = el('select', { class: 'mp-lu-in' }, opts.map(([v, t]) => el('option', { value: v }, t)));
      s.value = f[key]; s.onchange = () => { f[key] = s.value; saveF(); drawList(); };
      return s;
    }
    function inp(key, ph, w, num) {
      const f = F();
      const i = el('input', { class: 'mp-lu-in', placeholder: ph, type: num ? 'number' : 'text', style: { width: w } });
      i.value = f[key]; i.oninput = () => { f[key] = num ? Number(i.value) || '' : i.value; saveF(); drawList(); };
      i.addEventListener('keydown', (e) => e.stopPropagation());
      return i;
    }
    function open(show = true) {
      if (!cfg.enabled) return;
      if (!win) {
        const p = store.get('pos:lu2', { x: Math.round(innerWidth / 2 - 200), y: 120 });
        const head = el('div', { class: 'mp-lu-h' },
          el('div', { class: 'mp-lu-hb' },
            el('span', { class: 'mp-lu-hi', title: 'Ustawienia', onclick: () => ui.open('licznik') }, '⚙'),
            el('span', { class: 'mp-lu-hi', title: 'Wyczyść filtry', onclick: () => { cfg.f = null; store.set('lu:filters', {}); config.save(); win.remove(); win = null; open(); } }, '↻')),
          el('div', { class: 'mp-lu-tt' }, 'Licznik ubić'),
          el('span', { class: 'mp-lu-x', title: 'Zamknij', onclick: () => open(false) }, '×'));
        win = el('div', { id: 'mp-lu', style: { left: p.x + 'px', top: p.y + 'px' } }, head,
          el('div', { class: 'mp-lu-fl' }, inp('q', 'Nazwa potworka', 'auto'), inp('min', '1', '46px', true), inp('max', '300', '52px', true)),
          el('div', { class: 'mp-lu-fl' }, sel('type', TYPES), sel('show', [['all', 'Wszystkie'], ['loot', 'Z łupem'], ['noloot', 'Bez łupu']]),
            sel('sort', [['kills', 'Sortuj wg zabić'], ['lvl', 'Sortuj wg poziomu'], ['name', 'Sortuj wg nazwy'], ['loot', 'Sortuj wg łupów']]), sel('dir', [['desc', 'Malejąco'], ['asc', 'Rosnąco']])),
          el('div', { class: 'mp-lu-list' }));
        document.body.appendChild(win);
        makeDraggable(win, win.querySelector('.mp-lu-tt'), (q) => store.set('pos:lu2', q));
      }
      win.style.display = show ? '' : 'none';
      cfg.open = !!show; config.save();
      if (show) drawList();
    }
    const toggleWin = () => open(!(win && win.style.display !== 'none'));
    defineAddon({
      id: 'licznik', beta: true, name: 'Licznik Ubić', icon: 'licznik', color: ['#e74c3c', '#8e44ad'],
      desc: 'Okno z listą potworów, które już ubiłeś (z grafikami): nazwa, rodzaj, poziom, ile razy ubity i co z niego wypadło — żółte unikaty, niebieskie heroiki, pomarańczowe legendy, a w nawiasie ile z nich złapałeś Ty. Szukanie po nazwie, zakres poziomów, filtr rodzaju i sortowanie. Okno otwierasz klawiszem, przyciskiem poniżej albo ikonką na pasku skrótów.',
      defaults: { key: '', open: false, mobs: null, totals: null, f: null },
      settings: [{ key: 'key', type: 'key', label: 'Klawisz: otwórz/zamknij okno licznika' }],
      quick: () => toggleWin(),
      render(box, c, rerender) {
        const t = totals();
        const killed = Object.values(mobs()).filter((o) => o.k);
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, `Ogółem (od ${new Date(t.since).toLocaleDateString()})`),
          el('div', { class: 'mp-dim' }, TYPES.slice(1).map(([k, lb]) => `${lb}: ${t.kills[k] || 0}`).join(' · ') + ` · Zwykłe: ${t.kills.zwykly || 0}`),
          el('div', { class: 'mp-dim', style: { marginTop: '4px' } }, `Łupy — unikaty: ${(t.loot.unique || 0) + (t.loot.upgraded || 0)} (${(t.caught.unique || 0) + (t.caught.upgraded || 0)}), heroiki: ${t.loot.heroic || 0} (${t.caught.heroic || 0}), legendy: ${t.loot.legendary || 0} (${t.caught.legendary || 0})`),
          el('div', { class: 'mp-dim', style: { marginTop: '4px' } }, `Na liście: ${Object.keys(mobs()).length} potworów, ubitych przynajmniej raz: ${killed.length}`),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } },
            el('button', { class: 'mp-btn pri', onclick: () => toggleWin() }, 'Otwórz / zamknij okno'),
            el('button', { class: 'mp-btn bad', onclick: async () => { if (!(await confirmBox({ title: 'Wyzerować licznik?', items: ['Ubicia i łupy wszystkich potworów'], okText: 'Wyzeruj', danger: true }))) return; cfg.mobs = null; cfg.totals = null; seed(); config.save(); drawList(); rerender(); } }, 'Wyzeruj wszystko'))));
      },
      init(c) {
        cfg = c;
        // przeniesienie starych liczników (wersja 1.0.0)
        if (cfg.stats && cfg.stats.names) { seed(); for (const [nm, v] of Object.entries(cfg.stats.names)) { const mm = nm.match(/^(.*) \((\d+)\)$/); const n = mm ? mm[1] : nm; const k = keyOf(n); const o = mobs()[k] = mobs()[k] || { n, t: 'elita', k: 0, d: {}, m: {} }; o.k += Number(v) || 0; if (mm) o.lvl = Number(mm[2]); } }
        if (cfg.stats && !cfg.totals) { cfg.totals = { kills: cfg.stats.kills || {}, loot: cfg.stats.loot || {}, caught: cfg.stats.caught || {}, since: cfg.stats.since || now() }; delete cfg.stats; }
        if (cfg.f && !store.get('lu:filters', null)) cfg.f.type = 'all';   // wcześniej domyślnie było „Elity II”
        seed();
        bus.on('data', onData);
        keys.bind({ label: 'Licznik Ubić: okno', get: () => cfg.key || '', fn: toggleWin, when: () => cfg.enabled });
        if (cfg.enabled && cfg.open) setTimeout(() => open(true), 1500);
        MP.licznik = { open: toggleWin, mobs: () => mobs() };
      },
      onToggle(on) { if (!on && win) { win.remove(); win = null; } },
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

  /* ═════════ ZAPISZ ZESTAW UM — rozdanie umiejętności z kodu kalkulatora ═════════
   * Wklejasz kod z kalkulatora, np. {"level":50,"prof":"w","skills":[{"234":10,"263":10,"271":6},{},…],"mastery":{…}}
   * i dodatek uczy postać tych umiejętności (id umiejętności → poziom).
   */
  (() => {
    let cfg;
    const SKILL_RE = /skill/i;
    const log = [];                     // ostatnie komendy gry dotyczące umiejętności (do raportu)
    function parse(txt) {
      let j; try { j = JSON.parse(String(txt || '').trim()); } catch { return { err: 'To nie jest poprawny kod zestawu (JSON).' }; }
      if (!j || !Array.isArray(j.skills)) return { err: 'W kodzie brakuje listy „skills".' };
      const sets = j.skills.map((o) => Object.entries(o || {}).map(([id, lv]) => ({ id: Number(id), lvl: Number(lv) || 0 })).filter((x) => x.id > 0 && x.lvl > 0));
      if (!sets.some((x) => x.length)) return { err: 'Kod nie zawiera żadnych umiejętności.' };
      return { level: Number(j.level) || 0, prof: String(j.prof || ''), sets, raw: j };
    }
    /** Nazwy i obecne poziomy umiejętności z gry (jeśli gra je trzyma w pamięci). */
    function gameSkills() {
      const out = {};
      const visit = (o, depth) => {
        if (!o || typeof o !== 'object' || depth > 3) return;
        for (const [k, v] of Object.entries(o)) {
          if (v && typeof v === 'object' && /^\d+$/.test(k) && (v.name || v.lvl != null || v.level != null || v.curLvl != null)) {
            out[k] = { name: v.name || out[k] && out[k].name, lvl: Number(v.lvl ?? v.level ?? v.curLvl ?? v.currentLvl) || 0 };
          } else if (v && typeof v === 'object' && !(v instanceof Node) && depth < 3 && /skill|list|data|d$/i.test(k)) visit(v, depth + 1);
        }
      };
      try { visit(E().skills, 0); } catch {}
      return out;
    }
    const nameOf = (id, gs) => (gs[id] && gs[id].name) || `Umiejętność #${id}`;
    /** Z nauczonej komendy robimy wzór: {id} = umiejętność, {lvl} = poziom docelowy (jeśli gra go podaje). */
    function makeTpl(t) {
      let tpl = t, hasId = false, hasLvl = false;
      tpl = tpl.replace(/([&?](?:id|skill|skill_?id|sid|skillid)=)(\d+)/i, (m, a) => { hasId = true; return a + '{id}'; });
      tpl = tpl.replace(/([&?](?:lvl|level|lv|points|pts|v|val|value)=)(\d+)/i, (m, a) => { hasLvl = true; return a + '{lvl}'; });
      return hasId ? { tpl, perPoint: !hasLvl } : null;
    }
    async function apply(set, label) {
      if (game.inBattle()) return toast('Poczekaj do końca walki', 'warn');
      const h = game.hero() || {};
      if (set.prof && h.prof && set.prof !== h.prof) return toast(`Ten zestaw jest dla innej profesji (${set.prof}), a Twoja postać to ${h.prof}`, 'warn', 6000);
      if (set.level && h.lvl && h.lvl < set.level) { if (!(await confirmBox({ title: `Zestaw jest na poziom ${set.level}, a masz ${h.lvl}`, items: ['Może zabraknąć punktów umiejętności — gra przyjmie tyle, ile się da.'], okText: 'Ucz mimo to' }))) return; }
      if (!cfg.tpl) { toast('Najpierw naucz mnie komendy — przycisk „Naucz komendy” w panelu Zapisz zestaw UM', 'warn', 7000); return; }
      const gs = gameSkills();
      const plan = set.list.map((x) => ({ ...x, cur: gs[x.id] ? gs[x.id].lvl : 0 })).filter((x) => x.lvl > x.cur);
      if (!plan.length) return toast('Postać ma już wszystkie te umiejętności');
      const ok = await confirmBox({ title: `Nauczyć postać: ${label}?`, items: plan.map((x) => `${nameOf(x.id, gs)}: ${x.cur} → ${x.lvl}`).concat(cfg.perPoint && !Object.keys(gs).length ? ['Uwaga: nie widzę obecnych poziomów — jeśli masz już rozdane punkty, najpierw zresetuj umiejętności.'] : []), okText: 'Naucz' });
      if (!ok) return;
      let n = 0;
      for (const x of plan) {
        if (game.inBattle()) break;
        if (cfg.perPoint) for (let k = x.cur; k < x.lvl; k++) { send(cfg.tpl.replace(/\{id\}/g, x.id).replace(/\{lvl\}/g, k + 1)); n++; await sleep(260); }
        else { send(cfg.tpl.replace(/\{id\}/g, x.id).replace(/\{lvl\}/g, x.lvl)); n++; await sleep(350); }
      }
      toast(`Zapisz zestaw UM: wysłano ${n} ${cfg.perPoint ? 'punktów' : 'umiejętności'} — sprawdź okno umiejętności`, 'info', 6000);
    }
    defineAddon({
      id: 'zestawum', beta: true, name: 'Zapisz zestaw UM', icon: 'zestawum', color: ['#9b59b6', '#3498db'],
      desc: 'Wklejasz kod zestawu umiejętności z kalkulatora (np. {"level":50,"prof":"w","skills":[{"234":10,"263":10,"271":6},…]}) i jednym kliknięciem uczysz postać tych umiejętności na podanych poziomach. Zestawy możesz zapisać pod nazwą i wczytywać później.',
      defaults: { sets: [], tpl: '', perPoint: true, raw: '' },
      settings: [],
      render(box, c, rerender) {
        c.sets = (c.sets || []).filter((x) => Array.isArray(x.list));   // stare zapisy z linkami (1.0.0) są bezużyteczne
        const gs = gameSkills();
        const ta = el('textarea', { class: 'mp-in', rows: 3, placeholder: 'Wklej kod zestawu, np. {"level":50,"prof":"w","skills":[{"234":10,"263":10,"271":6},{},{},{},{},{},{}]}', style: { width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '11px', resize: 'vertical', wordBreak: 'break-all', whiteSpace: 'pre-wrap' } });
        ta.addEventListener('keydown', (e) => e.stopPropagation());
        const nm = el('input', { class: 'mp-in', placeholder: 'Nazwa (opcjonalnie)', style: { flex: 1 } });
        nm.addEventListener('keydown', (e) => e.stopPropagation());
        const prev = el('div', { class: 'mp-dim', style: { marginTop: '6px' } });
        const read = () => {
          const p = parse(ta.value);
          if (p.err) { prev.textContent = ta.value.trim() ? p.err : ''; return null; }
          const idx = p.sets.findIndex((x) => x.length);
          const list = p.sets[idx];
          prev.textContent = `Profesja: ${p.prof || '?'} · poziom: ${p.level || '?'} · ${list.map((x) => `${nameOf(x.id, gs)} ${x.lvl}`).join(', ')}`;
          return { prof: p.prof, level: p.level, list, raw: ta.value.trim() };
        };
        ta.oninput = read;
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Kod zestawu'), ta, prev,
          el('div', { class: 'mp-lg-row', style: { marginTop: '6px' } }, nm,
            el('button', { class: 'mp-btn pri', onclick: () => { const s = read(); if (!s) return toast('Wklej poprawny kod zestawu', 'warn'); apply(s, nm.value.trim() || 'wklejony zestaw'); } }, 'Naucz postać'),
            el('button', { class: 'mp-btn', onclick: () => { const s = read(); if (!s) return toast('Wklej poprawny kod zestawu', 'warn'); c.sets.push({ ...s, name: nm.value.trim() || `Zestaw ${c.sets.length + 1} (${s.prof}${s.level})` }); config.save(); rerender(); } }, 'Zapisz'))));
        const list = el('div', { class: 'mp-card' }, el('h3', null, 'Zapisane zestawy'));
        if (!c.sets.length) list.appendChild(el('div', { class: 'mp-dim' }, 'Brak zapisanych zestawów.'));
        c.sets.forEach((s, i) => list.appendChild(el('div', { class: 'mp-lg-row' },
          el('div', { style: { flex: 1, minWidth: 0 } }, el('b', null, s.name), el('div', { class: 'mp-dim', style: { fontSize: '11px' } }, s.list.map((x) => `${nameOf(x.id, gs)} ${x.lvl}`).join(', '))),
          el('button', { class: 'mp-btn pri', onclick: () => apply(s, s.name) }, 'Naucz'),
          el('button', { class: 'mp-btn', title: 'Skopiuj kod zestawu', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(s.raw); toast('Skopiowano kod'); } }, 'Kod'),
          el('button', { class: 'mp-btn bad', onclick: () => { c.sets.splice(i, 1); config.save(); rerender(); } }, '×'))));
        box.appendChild(list);
        box.appendChild(el('div', { class: 'mp-card' }, el('h3', null, 'Komenda nauki umiejętności'),
          el('div', { class: 'mp-dim' }, c.tpl ? `Zapamiętana: ${c.tpl} (${c.perPoint ? 'po jednym punkcie' : 'od razu na poziom'})` : 'Jeszcze nie zapamiętana. Kliknij „Naucz komendy”, otwórz w grze okno umiejętności i dodaj ręcznie JEDEN punkt dowolnej umiejętności (zatwierdź, jeśli gra pyta) — zapamiętam, jak gra to robi.'),
          el('div', { class: 'mp-btns', style: { marginTop: '8px' } },
            el('button', { class: 'mp-btn', onclick: async () => {
              toast('Dodaj teraz ręcznie jeden punkt umiejętności…', 'info', 8000);
              const t = await learn((x) => SKILL_RE.test(x.split('&')[0]) && /\d/.test(x));
              if (!t) return toast('Nie wychwyciłem komendy — spróbuj jeszcze raz', 'warn');
              const m = makeTpl(t); c.raw = t;
              if (!m) { config.save(); toast('Wychwyciłem komendę, ale nie umiem jej jeszcze użyć — wyślij mi raport', 'warn', 7000); return rerender(); }
              c.tpl = m.tpl; c.perPoint = m.perPoint; config.save(); toast('Zapisz zestaw UM: zapamiętano'); rerender();
            } }, 'Naucz komendy'),
            c.tpl ? el('button', { class: 'mp-btn bad', onclick: () => { c.tpl = ''; config.save(); rerender(); } }, 'Zapomnij') : null)));
      },
      init(c) {
        cfg = c;
        bus.on('cmd', (t) => { if (SKILL_RE.test(String(t).split('&')[0])) { log.unshift(String(t).slice(0, 200)); log.length = Math.min(log.length, 20); } });
        MP.zestawum = { debug: () => ({ wzor: cfg.tpl, surowa: cfg.raw, komendyUmiejetnosci: log, umiejetnosciZGry: Object.keys(gameSkills()).length, engineSkills: (() => { try { return Object.keys(E().skills || {}).slice(0, 40); } catch { return null; } })() }) };
      },
    });
  })();
})();
