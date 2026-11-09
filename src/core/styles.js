/* ───────────────────────── styles.js ─────────────────────────
 * Wygląd panelu: ciemne, rozmyte „szkło". Kolor akcentu i przezroczystość ustawiasz w zakładce Ogólne.
 * Wszystkie klasy mają prefiks mp- żeby nie gryzły się z grą.
 */
const CSS = `
:root{--mp-accent:#7c5cff;--mp-glass:.55;--mp-fg:#eef0ff;--mp-dim:#a6abc8;--mp-line:rgba(255,255,255,.10);--mp-ok:#3ddc97;--mp-warn:#ffb547;--mp-bad:#ff5d7a}
.mp-glass{background:rgba(16,17,28,var(--mp-glass));-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);color:var(--mp-fg);font:13px/1.45 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
.mp-glass *{box-sizing:border-box}
.mp-ico{display:inline-flex;align-items:center;justify-content:center;flex:none}
.mp-ico svg{display:block}

/* przycisk startowy */
#mp-launcher{position:fixed;z-index:2147483000;width:46px;height:46px;border-radius:15px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;color:#fff;transition:transform .15s}
#mp-launcher:hover{transform:scale(1.07)}
#mp-launcher .mp-ico{color:var(--mp-accent);filter:drop-shadow(0 0 8px var(--mp-accent))}

/* panel */
#mp-panel{position:fixed;z-index:2147483001;width:860px;max-width:96vw;height:580px;max-height:92vh;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;animation:mpIn .18s ease-out}
@keyframes mpIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
.mp-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid var(--mp-line);cursor:move;user-select:none}
.mp-head .mp-title{font-weight:700;font-size:15px;letter-spacing:.2px}
.mp-head .mp-sub{color:var(--mp-dim);font-size:12px}
.mp-head .mp-sp{flex:1}
.mp-tabs{display:flex;gap:4px}
.mp-tab{all:unset;cursor:pointer;display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:10px;color:var(--mp-dim);font-size:12.5px}
.mp-tab:hover{background:rgba(255,255,255,.06);color:var(--mp-fg)}
.mp-tab.on{background:color-mix(in srgb,var(--mp-accent) 28%,transparent);color:#fff}
.mp-x{all:unset;cursor:pointer;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--mp-dim)}
.mp-x:hover{background:rgba(255,93,122,.18);color:#fff}
.mp-body{flex:1;display:flex;min-height:0}
.mp-side{width:250px;border-right:1px solid var(--mp-line);display:flex;flex-direction:column;min-height:0}
.mp-search{margin:10px;display:flex;align-items:center;gap:6px;padding:7px 10px;border-radius:11px;background:rgba(255,255,255,.06);color:var(--mp-dim)}
.mp-search input{all:unset;flex:1;color:var(--mp-fg);font-size:12.5px}
.mp-list{overflow-y:auto;overflow-x:hidden;padding:0 6px 10px 8px;margin:0 2px 8px 0;flex:1;overscroll-behavior:contain}
.mp-row{display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:12px;cursor:pointer;margin-bottom:2px}
.mp-row:hover{background:rgba(255,255,255,.05)}
.mp-row.sel{background:rgba(255,255,255,.09);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.mp-row .nm{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;font-size:12.8px}
.mp-row.off .nm{color:var(--mp-dim);font-weight:500}
.mp-tile{width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 4px 12px rgba(0,0,0,.25)}
.mp-row.off .mp-tile{filter:grayscale(.85) brightness(.75)}
.mp-main{flex:1;overflow-y:auto;overflow-x:hidden;padding:18px 18px 18px 22px;min-width:0;margin:6px 4px 6px 0;overscroll-behavior:contain}
.mp-h{display:flex;align-items:center;gap:14px;margin-bottom:6px}
.mp-h .mp-tile{width:46px;height:46px;border-radius:14px}
.mp-h h2{margin:0;font-size:18px}
.mp-desc{color:var(--mp-dim);margin:2px 0 14px}
.mp-badge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;letter-spacing:.4px;padding:2px 7px;border-radius:999px;text-transform:uppercase}
.mp-badge.auto{background:rgba(255,181,71,.16);color:var(--mp-warn)}
.mp-badge.destr{background:rgba(255,93,122,.16);color:var(--mp-bad)}
.mp-badge.ok{background:rgba(61,220,151,.14);color:var(--mp-ok)}
.mp-badge.lock{background:rgba(255,255,255,.08);color:var(--mp-dim)}
.mp-card{background:rgba(255,255,255,.04);border:1px solid var(--mp-line);border-radius:14px;padding:12px 14px;margin-bottom:12px}
.mp-card h3{margin:0 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--mp-dim)}
.mp-field{display:flex;align-items:center;gap:12px;padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.06)}
.mp-field:last-child{border-bottom:0}
.mp-field .lb{flex:1;min-width:0}
.mp-field .lb small{display:block;color:var(--mp-dim);font-size:11.5px;margin-top:1px}
.mp-field.warn .lb{color:#ffd9a0}
.mp-in{all:unset;box-sizing:border-box;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);border-radius:9px;padding:6px 9px;color:var(--mp-fg);font-size:12.5px;min-width:70px}
.mp-in:focus{border-color:var(--mp-accent)}
select.mp-in{appearance:auto;cursor:pointer}
select.mp-in option{background:#1a1b2b}
textarea.mp-in{width:100%;min-height:90px;font-family:Consolas,monospace;font-size:12px;white-space:pre}
.mp-in.num{width:84px;text-align:right}
.mp-in.txt{width:220px}
.mp-color{width:38px;height:28px;border:0;border-radius:8px;background:none;cursor:pointer;padding:0}
.mp-key{all:unset;cursor:pointer;min-width:84px;text-align:center;padding:6px 10px;border-radius:9px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.14);font-family:Consolas,monospace;font-size:12px}
.mp-key.cap{border-color:var(--mp-accent);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--mp-accent) 30%,transparent)}
.mp-key.empty{color:var(--mp-dim)}
.mp-sw{position:relative;width:38px;height:22px;flex:none;cursor:pointer}
.mp-sw input{opacity:0;width:0;height:0;position:absolute}
.mp-sw span{position:absolute;inset:0;border-radius:999px;background:rgba(255,255,255,.14);transition:.18s}
.mp-sw span:before{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.18s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.mp-sw input:checked+span{background:var(--mp-accent)}
.mp-sw input:checked+span:before{transform:translateX(16px)}
.mp-sw.small{width:32px;height:18px}.mp-sw.small span:before{width:12px;height:12px}.mp-sw.small input:checked+span:before{transform:translateX(14px)}
.mp-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.1);font-size:12.5px;font-weight:600;color:var(--mp-fg)}
.mp-btn:hover{background:rgba(255,255,255,.14)}
.mp-btn.pri{background:var(--mp-accent);border-color:transparent;color:#fff}
.mp-btn.pri:hover{filter:brightness(1.1)}
.mp-btn.bad{background:rgba(255,93,122,.2);border-color:rgba(255,93,122,.4)}
.mp-btn[disabled]{opacity:.45;pointer-events:none}
.mp-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.mp-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.mp-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 4px 3px 9px;border-radius:999px;background:rgba(255,255,255,.08);font-size:12px}
.mp-chip button{all:unset;cursor:pointer;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--mp-dim)}
.mp-chip button:hover{background:rgba(255,93,122,.3);color:#fff}
.mp-note{border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;gap:10px;align-items:flex-start;font-size:12.5px}
.mp-note.warn{background:rgba(255,181,71,.10);border:1px solid rgba(255,181,71,.3);color:#ffe2b3}
.mp-note.bad{background:rgba(255,93,122,.10);border:1px solid rgba(255,93,122,.3);color:#ffd0d9}
.mp-note.info{background:rgba(124,92,255,.10);border:1px solid rgba(124,92,255,.3);color:#ddd5ff}
.mp-table{width:100%;border-collapse:collapse;font-size:12px}
.mp-table th{text-align:left;color:var(--mp-dim);font-weight:600;padding:5px 6px;border-bottom:1px solid var(--mp-line)}
.mp-table td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.05);vertical-align:middle}
.mp-mono{font-family:Consolas,monospace;font-size:11.5px;word-break:break-all}
.mp-dim{color:var(--mp-dim)}
.mp-okc{color:var(--mp-ok)}.mp-badc{color:var(--mp-bad)}.mp-warnc{color:var(--mp-warn)}

/* pływające okna */
.mp-win{position:fixed;z-index:2147482990;border-radius:16px;min-width:260px;display:flex;flex-direction:column;overflow:hidden}
.mp-win .mp-head{padding:9px 10px}
.mp-win .mp-wbody{padding:10px 12px;overflow:auto;max-height:60vh}

/* menu kontekstowe */
#mp-ctx{position:fixed;z-index:2147483100;border-radius:12px;padding:5px;min-width:170px}
.mp-ctx-title{padding:5px 9px;color:var(--mp-dim);font-size:11.5px;border-bottom:1px solid var(--mp-line);margin-bottom:4px}
.mp-ctx-item{all:unset;display:block;width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;cursor:pointer;font-size:12.5px}
.mp-ctx-item:hover{background:color-mix(in srgb,var(--mp-accent) 35%,transparent)}

/* powiadomienia — domyślnie jak komunikaty gry: żółty tekst na dole ekranu; Hey WakeUP! zmienia zmienne */
#mp-toasts{position:fixed;left:50%;bottom:var(--mp-toast-bottom,140px);transform:translateX(-50%);z-index:2147483200;display:flex;flex-direction:column-reverse;gap:2px;align-items:center;pointer-events:none;max-width:70vw}
.mp-toast{padding:var(--mp-toast-pad,1px 8px);border-radius:6px;background:var(--mp-toast-bg,transparent);color:var(--mp-toast-fg,#ffe066);font:var(--mp-toast-weight,700) var(--mp-toast-size,14px)/1.35 var(--mp-toast-font,Arial,"Segoe UI",sans-serif);border:var(--mp-toast-border,0 solid transparent);text-shadow:var(--mp-toast-shadow,0 0 3px #000,1px 1px 1px #000,-1px -1px 1px #000);opacity:0;transform:translateY(6px);transition:.25s;text-align:center}
.mp-toast.in{opacity:1;transform:none}
.mp-toast-warn{color:var(--mp-toast-warn,#ffb547)}.mp-toast-bad{color:var(--mp-toast-bad,#ff6b6b)}.mp-toast-ok{color:var(--mp-toast-ok,var(--mp-toast-fg,#ffe066))}

/* przewijanie i suwaki w stylu panelu */
.mp-glass ::-webkit-scrollbar,.mp-glass::-webkit-scrollbar{width:8px;height:8px}
.mp-glass ::-webkit-scrollbar-track,.mp-glass::-webkit-scrollbar-track{background:transparent;margin:10px 0}
.mp-glass ::-webkit-scrollbar-thumb,.mp-glass::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:8px;border:2px solid transparent;background-clip:padding-box}
.mp-glass ::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--mp-accent) 70%,transparent)}
.mp-glass ::-webkit-scrollbar-corner{background:transparent}
.mp-glass *{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
.mp-range{-webkit-appearance:none;appearance:none;width:150px;height:22px;background:transparent;cursor:pointer;margin:0 6px;padding:0}
.mp-range::-webkit-slider-runnable-track{height:5px;border-radius:999px;background:linear-gradient(90deg,var(--mp-accent) var(--p,50%),rgba(255,255,255,.14) var(--p,50%))}
.mp-range::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;margin-top:-5.5px;border-radius:50%;background:#fff;border:3px solid var(--mp-accent);box-shadow:0 2px 6px rgba(0,0,0,.4)}
.mp-range::-moz-range-track{height:5px;border-radius:999px;background:rgba(255,255,255,.14)}
.mp-range::-moz-range-progress{height:5px;border-radius:999px;background:var(--mp-accent)}
.mp-range::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--mp-accent)}

/* okno do wpisywania (Podpisownik itd.) */
.mp-input-big{all:unset;box-sizing:border-box;width:100%;padding:10px 12px;border-radius:11px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.14);color:var(--mp-fg);font-size:14px}
.mp-input-big:focus{border-color:var(--mp-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--mp-accent) 25%,transparent)}
.mp-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.mp-sugg button{all:unset;cursor:pointer;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.07);font-size:12px}
.mp-sugg button:hover{background:color-mix(in srgb,var(--mp-accent) 40%,transparent)}
.mp-itemhead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.mp-itemhead img{width:32px;height:32px;image-rendering:pixelated}

/* nakładki na przedmioty */
.mp-ibadge{position:absolute;pointer-events:none;z-index:5;font:700 9px/1 "Segoe UI",system-ui,sans-serif;padding:2px 3px;border-radius:4px;background:rgba(10,10,18,.82);color:#ffd36b;border:1px solid rgba(255,211,107,.45);text-shadow:0 1px 1px #000;white-space:nowrap}
.mp-ibadge.bon{top:-2px;right:-2px}
.mp-ibadge.sig{bottom:-3px;left:50%;transform:translateX(-50%);max-width:60px;overflow:hidden;text-overflow:ellipsis;color:#bfe3ff;border-color:rgba(120,190,255,.5)}
.mp-ibadge.chance{bottom:-14px;left:50%;transform:translateX(-50%);color:#9dffcf;border-color:rgba(61,220,151,.5);font-size:10px}
.mp-ibadge.queued{top:-2px;left:-2px;color:#fff;background:var(--mp-accent);border-color:transparent}

/* Pokaż EQ */
#mp-eqtip{position:fixed;z-index:2147483150;border-radius:14px;padding:10px;width:290px;pointer-events:none}
.mp-eqgrid{display:grid;grid-template-columns:repeat(6,40px);gap:5px;margin:6px 0}
.mp-eqcell{width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);position:relative;display:flex;align-items:center;justify-content:center}
.mp-eqcell img{max-width:32px;max-height:32px;image-rendering:pixelated}
.mp-eqcell.legendary{border-color:#ff9a3c;box-shadow:inset 0 0 8px rgba(255,154,60,.45)}
.mp-eqcell.heroic{border-color:#3fa2ff}
.mp-eqcell.unique{border-color:#ffd84a}
.mp-eqcell.artefact{border-color:#ff4fd8}
.mp-eqcell .mp-ibadge{font-size:8px}

/* Kto tu jest */
.mp-plist{display:flex;flex-direction:column;gap:3px;min-width:330px}
.mp-prow{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:9px;background:rgba(255,255,255,.03)}
.mp-prow:hover{background:rgba(255,255,255,.08)}
.mp-prow .n{flex:1;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-prow .tag{font-size:10px;padding:1px 6px;border-radius:999px;background:rgba(255,255,255,.08);color:var(--mp-dim)}
.mp-prow .tag.cl{background:rgba(61,220,151,.15);color:var(--mp-ok)}
.mp-prow .tag.fr{background:rgba(63,162,255,.15);color:#8cc8ff}
.mp-prow .tag.al{background:rgba(124,92,255,.18);color:#c9bbff}
.mp-prow .tag.en{background:rgba(255,93,122,.15);color:var(--mp-bad)}
.mp-prow{cursor:pointer}
.mp-prow.open{background:color-mix(in srgb,var(--mp-accent) 22%,transparent)}
.mp-plist.mini{min-width:0}
.mp-plist.mini .mp-prow{padding:3px 6px;gap:6px}
.mp-pcard{margin:-1px 0 4px;padding:8px 9px;border-radius:0 0 10px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-top:0}
.mp-pinfo{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:11.5px;color:var(--mp-dim)}
.mp-pinfo .tag{font-size:10px;padding:1px 6px;border-radius:999px}
.mp-pinfo .tag.cl{background:rgba(61,220,151,.15);color:var(--mp-ok)}.mp-pinfo .tag.fr{background:rgba(63,162,255,.15);color:#8cc8ff}.mp-pinfo .tag.al{background:rgba(124,92,255,.18);color:#c9bbff}.mp-pinfo .tag.en{background:rgba(255,93,122,.15);color:var(--mp-bad)}
.mp-mini{all:unset;cursor:pointer;padding:3px 7px;border-radius:7px;background:rgba(255,255,255,.08);font-size:11px}
.mp-mini:hover{background:var(--mp-accent)}
.mp-filters{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px}
.mp-filters .mp-in{width:100%}
.mp-profs{display:flex;gap:4px;flex-wrap:wrap;grid-column:1/-1}
.mp-pf{all:unset;cursor:pointer;padding:3px 8px;border-radius:7px;background:rgba(255,255,255,.06);font-size:11.5px;color:var(--mp-dim)}
.mp-pf.on{background:color-mix(in srgb,var(--mp-accent) 40%,transparent);color:#fff}

/* potwierdzenia */
.mp-modal-bg{position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}
.mp-modal{border-radius:18px;padding:18px 20px;width:440px;max-width:94vw;max-height:84vh;display:flex;flex-direction:column}
.mp-modal h3{margin:0 0 8px;font-size:16px}
.mp-modal .mp-wbody{overflow:auto;margin:6px 0 12px}
`;

function injectCSS() {
  if (document.getElementById('mp-css')) return;
  const s = el('style', { id: 'mp-css' });
  s.textContent = CSS;
  document.head.appendChild(s);
}

MP.injectCSS = injectCSS;
