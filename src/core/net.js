/* ───────────────────────── net.js ─────────────────────────
 * Wszystko, co panel wysyła do serwera, przechodzi przez TEN plik:
 *   • kolejka z minimalnym odstępem (nie spamujemy serwera),
 *   • „bezpieczniki" (guards) — np. Bratan blokuje ataki na klan,
 *   • tryb próbny (dry run) — loguje zamiast wysyłać,
 *   • blokada akcji niszczących (usuwanie / ulepszanie), dopóki komenda nie zostanie
 *     ZWERYFIKOWANA przez Ciebie podsłuchem w zakładce Diagnostyka,
 *   • podsłuch (sniffer) komend, które wysyła sama gra — do nauczenia panelu prawdziwych komend.
 */

// Szablony komend. {id}, {item}, {ingredients} są podmieniane.
// verified:false + destructive:true => panel ODMÓWI wysłania, dopóki nie podsłuchasz komendy w grze.
const DEFAULT_COMMANDS = {
  attackPlayer: { t: 'fight&a=attack&id={id}', destructive: false, label: 'Atak na gracza', how: 'Zaatakuj ręcznie dowolnego gracza.' },
  fastFight:    { t: 'fight&a=f', destructive: false, label: 'Szybka walka (f)', how: 'W walce kliknij „Szybka walka".' },
  partyInvite:  { t: 'party&a=inv&id={id}', destructive: false, label: 'Zaproszenie do grupy', how: 'Zaproś ręcznie kogoś do grupy.' },
  partyDisband: { t: 'party&a=disband', destructive: false, label: 'Rozwiązanie grupy', how: 'Rozwiąż grupę przyciskiem w oknie grupy.' },
  useItem:      { t: 'moveitem&st=1&id={id}', destructive: false, label: 'Użycie przedmiotu', how: 'Użyj (2× klik) dowolnej mikstury.' },
  eqSet:        { t: '', destructive: false, label: 'Zmiana zestawu', how: 'Przełącz ręcznie zestaw ekwipunku.' },
  otherEq:      { t: '', destructive: false, label: 'Podgląd EQ gracza', how: 'Kliknij u gracza „Pokaż ekwipunek".' },
  destroyItem:  { t: '', destructive: true, label: 'Usunięcie przedmiotu', how: 'Usuń ręcznie JEDEN bezwartościowy przedmiot.' },
  enhance:      { t: '', destructive: true, label: 'Ulepszenie przedmiotu', how: 'Ulepsz ręcznie przedmiot jednym składnikiem.' },
};

const net = {
  origG: null,
  guards: [],
  queue: [],
  busy: false,
  lastSent: 0,
  log: [],            // ostatnie akcje panelu
  sniff: [],          // ostatnie komendy wysłane przez GRĘ
  sniffing: true,
  stats: { gameCalls: 0, ourCalls: 0, blocked: 0, responses: 0 },
  _ours: false,

  cmd(name) {
    const base = DEFAULT_COMMANDS[name] || { t: '', destructive: true };
    const over = (config.data.commands || {})[name] || {};
    return Object.assign({ verified: false }, base, over);
  },

  setCmd(name, template, verified = true) {
    config.data.commands[name] = { t: template, verified };
    config.save();
    bus.emit('commands:changed');
  },

  build(name, params = {}) {
    const c = this.cmd(name);
    if (!c.t) return { error: `Komenda „${c.label || name}" nie jest jeszcze ustawiona. Wejdź w Diagnostyka → Podsłuch i ${c.how?.toLowerCase() || 'wykonaj akcję ręcznie'}` };
    if (c.destructive && !c.verified) return { error: `Komenda „${c.label}" jest zablokowana do czasu weryfikacji (Diagnostyka).` };
    let t = c.t;
    for (const [k, v] of Object.entries(params)) t = t.split(`{${k}}`).join(encodeURIComponent(String(v)).replace(/%2C/g, ','));
    if (/\{\w+\}/.test(t)) return { error: `Brak parametru w komendzie: ${t}` };
    return { task: t, cmd: c };
  },

  /** Zarejestruj bezpiecznik: fn(task) => null | { block:true, reason } */
  addGuard(fn) { this.guards.push(fn); },

  checkGuards(task) {
    for (const g of this.guards) {
      try {
        const r = g(task);
        if (r && r.block) return r;
      } catch (e) { console.warn('[laddonz] guard error', e); }
    }
    return null;
  },

  pushLog(entry) {
    this.log.unshift(Object.assign({ t: now() }, entry));
    if (this.log.length > 200) this.log.length = 200;
    bus.emit('log');
  },

  /** Owinięcie window._g — instalowane raz. */
  install() {
    if (this.origG || typeof W._g !== 'function') return !!this.origG;
    const orig = W._g;
    this.origG = orig;
    const self = this;
    const wrapped = function (task, ...rest) {
      const t = typeof task === 'string' ? task : '';
      if (!self._ours) {
        self.stats.gameCalls++;
        if (self.sniffing && t) {
          self.sniff.unshift({ t: now(), task: t });
          if (self.sniff.length > 40) self.sniff.length = 40;
          bus.emit('sniff');
        }
      }
      const g = t && self.checkGuards(t);
      if (g) {
        self.stats.blocked++;
        self.pushLog({ kind: 'block', task: t, msg: g.reason, src: g.src || 'bezpiecznik' });
        toast(g.reason, 'warn');
        return;
      }
      return orig.call(this, task, ...rest);
    };
    for (const k of Object.keys(orig)) { try { wrapped[k] = orig[k]; } catch {} }
    W._g = wrapped;
    this.hookResponses();
    return true;
  },

  /**
   * Wyślij komendę przez kolejkę.
   * opts: { src: 'Napad', onResponse(data), urgent: bool }
   */
  send(name, params = {}, opts = {}) {
    const b = this.build(name, params);
    if (b.error) {
      this.pushLog({ kind: 'error', task: name, msg: b.error, src: opts.src });
      toast(b.error, 'warn');
      return Promise.resolve({ ok: false, error: b.error });
    }
    return this.sendRaw(b.task, opts);
  },

  sendRaw(task, opts = {}) {
    return new Promise((resolve) => {
      const job = { task, opts, resolve };
      if (opts.urgent) this.queue.unshift(job); else this.queue.push(job);
      this.pump();
    });
  },

  clearQueue(src) {
    this.queue = this.queue.filter((j) => { if (!src || j.opts.src === src) { j.resolve({ ok: false, error: 'anulowano' }); return false; } return true; });
  },

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      while (this.queue.length) {
        const gap = Math.max(150, Number(config.data.global.minInterval) || 300);
        const wait = this.lastSent + gap - now();
        if (wait > 0) await sleep(wait);
        const job = this.queue.shift();
        if (!job) break;
        this.lastSent = now();
        const { task, opts } = job;

        if (!this.origG && !this.install()) {
          this.pushLog({ kind: 'error', task, msg: 'Brak funkcji _g gry', src: opts.src });
          job.resolve({ ok: false, error: 'no _g' });
          continue;
        }
        const g = this.checkGuards(task);
        if (g) {
          this.stats.blocked++;
          this.pushLog({ kind: 'block', task, msg: g.reason, src: g.src || opts.src });
          toast(g.reason, 'warn');
          job.resolve({ ok: false, blocked: true, error: g.reason });
          continue;
        }
        if (config.data.global.dryRun) {
          this.pushLog({ kind: 'dry', task, msg: 'Tryb próbny — nie wysłano', src: opts.src });
          job.resolve({ ok: true, dry: true });
          continue;
        }
        this.stats.ourCalls++;
        this.pushLog({ kind: 'send', task, src: opts.src });
        let done = false;
        const finish = (data) => { if (done) return; done = true; try { opts.onResponse && opts.onResponse(data || {}); } catch {} job.resolve({ ok: true, data }); };
        try {
          this._ours = true;
          this.origG.call(W, task, (data) => finish(data));
        } catch (e) {
          this.pushLog({ kind: 'error', task, msg: String(e), src: opts.src });
          done = true;
          job.resolve({ ok: false, error: String(e) });
        } finally { this._ours = false; }
        // jeśli gra nie wywoła callbacka, po 1.5 s uznajemy żądanie za wysłane
        setTimeout(() => finish(this._lastData), 1500);
      }
    } finally { this.busy = false; }
  },

  _lastData: null,

  /** Podsłuch odpowiedzi serwera — kilka strategii, bo nie wiemy która metoda istnieje w danej wersji NI. */
  hookResponses() {
    const c = E() && E().communication;
    const self = this;
    const tryWrap = (obj, name) => {
      if (!obj || typeof obj[name] !== 'function' || obj[name].__mp) return false;
      const orig = obj[name];
      obj[name] = function (...args) {
        const data = args.find((a) => a && typeof a === 'object');
        if (data) self.onData(data);
        return orig.apply(this, args);
      };
      obj[name].__mp = true;
      self.respHook = name;
      return true;
    };
    if (c) {
      if (tryWrap(c, 'parseJSON')) return;
      if (tryWrap(c, 'successData')) return;
      if (tryWrap(c, 'dispatchData')) return;
    }
    this.respHook = null;
  },
  respHook: null,

  onData(data) {
    this.stats.responses++;
    this._lastData = data;
    try {
      if (data.party && data.party.members) game._partyCache = Object.keys(data.party.members).map(Number);
      if (data.f) {
        if (data.f.init || data.f.init === 0) battleWatch.set(true);
        if (data.f.endBattle || data.f.close || data.f.battleEnd) battleWatch.set(false);
      }
    } catch {}
    bus.emit('data', data);
  },
};

/** Zdarzenia walki: battle:start / battle:end (z danych serwera + zapasowy odczyt stanu co 400 ms). */
const battleWatch = {
  state: false,
  set(v) {
    if (v === this.state) return;
    this.state = v;
    bus.emit(v ? 'battle:start' : 'battle:end');
  },
  start() {
    setInterval(() => { if (game.ready()) this.set(game.inBattle()); }, 400);
  },
};

/** Zdarzenie zmiany mapy. */
const mapWatch = {
  id: null,
  start() {
    setInterval(() => {
      const m = game.mapInfo();
      if (m.id && m.id !== this.id) { const prev = this.id; this.id = m.id; if (prev != null) bus.emit('map:change', m); }
    }, 1000);
  },
};

/** Zamienia podsłuchaną komendę na szablon (id przedmiotów/graczy → {id} itd.). */
function templatize(name, task) {
  const itemIds = new Set(game.heroItems().map((i) => String(i.id)));
  const otherIds = new Set(game.others().map((p) => String(p.id)));
  let t = task;
  if (name === 'fastFight' || name === 'partyDisband') return t;
  if (name === 'eqSet') {
    // ostatnia liczba w komendzie to numer zestawu
    const all = [...t.matchAll(/=(\d+)(?=&|$)/g)];
    if (all.length) { const m = all[all.length - 1]; t = t.slice(0, m.index) + '={id}' + t.slice(m.index + m[0].length); }
    return t;
  }
  if (name === 'enhance') {
    // lista składników „1,2,3" → {ingredients}; pojedynczy id przedmiotu → {item}
    t = t.replace(/=((?:\d+,)+\d+)(?=&|$)/g, '={ingredients}');
    let used = false;
    t = t.replace(/=(\d+)(?=&|$)/g, (m, id) => {
      if (!used && itemIds.has(id)) { used = true; return '={item}'; }
      if (itemIds.has(id)) return '={ingredients}';
      return m;
    });
    return t;
  }
  return t.replace(/=(-?\d+)(?=&|$)/g, (m, id) => (itemIds.has(id) || otherIds.has(id) || /^\d{4,}$/.test(id) ? '={id}' : m));
}

MP.net = net;
MP.battleWatch = battleWatch;
MP.templatize = templatize;
MP.DEFAULT_COMMANDS = DEFAULT_COMMANDS;
