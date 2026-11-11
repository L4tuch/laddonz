/* ───────────────────────── styles.js ─────────────────────────
 * Wygląd panelu: ciemne, rozmyte „szkło". Kolor akcentu i przezroczystość ustawiasz w zakładce Ogólne.
 * Wszystkie klasy mają prefiks mp- żeby nie gryzły się z grą.
 */
const CSS = `
:root{--mp-bg:16,17,28;--mp-accent:#7c5cff;--mp-glass:.55;--mp-fg:#eef0ff;--mp-dim:#a6abc8;--mp-line:rgba(255,255,255,.10);--mp-ok:#3ddc97;--mp-warn:#ffb547;--mp-bad:#ff5d7a}
.mp-glass{background:rgba(var(--mp-bg),var(--mp-glass));-webkit-backdrop-filter:blur(18px) saturate(160%);backdrop-filter:blur(18px) saturate(160%);border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);color:var(--mp-fg);font:13px/1.45 "Segoe UI",system-ui,-apple-system,Roboto,sans-serif}
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
.mp-btn.on{border-color:var(--mp-accent);color:#fff;background:color-mix(in srgb,var(--mp-accent) 25%,transparent)}
.mp-btn.pri{background:var(--mp-accent);border-color:transparent;color:#fff}
.mp-btn.pri:hover{filter:brightness(1.1)}
.mp-btn.bad{background:rgba(255,93,122,.2);border-color:rgba(255,93,122,.4)}
.mp-btn[disabled]{opacity:.45;pointer-events:none}
.mp-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.mp-upslot{padding:10px}
#mp-pt{position:fixed;z-index:2147470000;min-width:250px;max-width:340px;border:1px solid;border-radius:6px;font-family:Arimo,Arial,sans-serif;font-size:12.8px;user-select:none;overflow:hidden}
.mp-pt-h{display:flex;align-items:center;gap:8px;padding:6px 8px 5px 10px;border-bottom:1px solid;cursor:move;background:rgba(0,0,0,.18)}
.mp-pt-h b{font-size:1.05em;letter-spacing:.3px;flex:1}
.mp-pt-r{font-size:.85em;opacity:.7}
.mp-pt-x{all:unset;cursor:pointer;width:18px;text-align:center;font-size:16px;line-height:16px;opacity:.7}.mp-pt-x:hover{opacity:1}
.mp-pt-b{padding:4px 8px 8px;max-height:60vh;overflow:auto}
.mp-pt-s{font-size:.8em;text-transform:uppercase;letter-spacing:.8px;margin:6px 0 4px;padding-bottom:2px;border-bottom:1px solid}
.mp-pt-w{margin:4px 0 7px}
.mp-pt-wn{display:flex;align-items:center;gap:8px;font-weight:700;margin-bottom:3px}
.mp-pt-wn > span:first-child{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-pt-hp{width:56px;height:5px;border-radius:3px;background:rgba(0,0,0,.45);overflow:hidden}.mp-pt-hp i{display:block;height:100%;background:linear-gradient(90deg,#c0281e,#ff5a3c)}
.mp-pt-es{display:flex;flex-wrap:wrap;gap:4px}
.mp-pt-e{display:inline-flex;align-items:center;gap:5px;padding:2px 7px 2px 5px;border-radius:10px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 60%,transparent);font-size:.92em}
.mp-pt-dot{width:7px;height:7px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--c)}
.mp-pt-n{color:var(--c)}
.mp-pt-t{opacity:.85;font-variant-numeric:tabular-nums}
.mp-pt-by{opacity:.6;font-size:.88em}
#mp-pt.compact{min-width:0;max-width:260px}#mp-pt.compact .mp-pt-h b{font-size:.92em}#mp-pt.compact .mp-pt-b{padding:2px 6px 5px}#mp-pt.compact .mp-pt-w{margin:2px 0 4px}#mp-pt.compact .mp-pt-wn{margin-bottom:1px;font-size:.92em}#mp-pt.compact .mp-pt-e{padding:1px 6px 1px 4px;font-size:.9em}#mp-pt.compact .mp-pt-c{padding:1px 6px;margin:1px 0 2px}
.mp-pt-e.soon{animation:mpPtBlink 1s ease-in-out infinite}
.mp-pt-c{margin:2px 0 4px;padding:3px 7px;border-radius:4px;background:color-mix(in srgb,var(--c) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 70%,transparent);color:var(--c);font-size:.95em}
.mp-pt-c.soon{animation:mpPtBlink .7s ease-in-out infinite;font-weight:700}
.mp-pt-u{font-size:.85em;margin:-1px 0 4px 2px}
.mp-pt-cd{font-size:.82em;opacity:.8;font-weight:400;margin-top:1px}
.mp-pt-none{font-size:.88em;font-style:italic}
@keyframes mpPtBlink{0%,100%{filter:none}50%{filter:brightness(1.6);box-shadow:inset 0 0 0 1px var(--c),0 0 10px var(--c)}}
.mp-beta{display:inline-flex;align-items:center;justify-content:center;height:16px;min-width:16px;padding:0 4px;margin-left:7px;border-radius:5px;background:color-mix(in srgb,var(--mp-accent) 18%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mp-accent) 55%,transparent);color:color-mix(in srgb,var(--mp-accent) 45%,#fff);font:700 9.5px/1 Inter,system-ui,sans-serif;letter-spacing:.4px;vertical-align:middle;text-transform:uppercase}
.mp-row.off .mp-beta{opacity:.7}
.mp-nmb{display:flex!important;align-items:center;min-width:0}.mp-nmt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.mp-nmb .mp-beta{flex-shrink:0;margin-left:6px}
.mp-beta.big{height:19px;padding:0 7px;font-size:10.5px;letter-spacing:.8px;border-radius:6px}
.mp-beta-txt{color:color-mix(in srgb,var(--mp-accent) 40%,#fff);font-weight:600}
.mp-fbtn{position:fixed;z-index:2147470500;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;background:radial-gradient(circle at 35% 30%,#3a3d44,#15161a);color:#8a8f98;box-shadow:0 0 0 2px #2a2d33,0 4px 10px rgba(0,0,0,.6);transition:color .3s,box-shadow .3s}
.mp-fbtn:hover{filter:brightness(1.2)}
#mp-bers{position:fixed;width:16px;height:15px;z-index:2147470300;cursor:pointer;user-select:none;-webkit-user-drag:none}
#mp-bers img{display:block;width:16px;height:15px;image-rendering:pixelated;pointer-events:none;filter:grayscale(1) brightness(1.9) contrast(.85);transition:filter .25s}
#mp-bers.on img{filter:drop-shadow(0 0 2px rgba(178,70,255,.9));animation:mpBersSk 1.6s ease-in-out infinite}
#mp-bers:hover img{transform:scale(1.15)}
@keyframes mpBersSk{0%,100%{transform:translateY(0);filter:drop-shadow(0 0 1px rgba(178,70,255,.6))}50%{transform:translateY(-1.5px);filter:drop-shadow(0 0 4px rgba(190,90,255,1)) brightness(1.15)}}
.mp-fbtn.mp-bers.on{color:#fff;background:radial-gradient(circle at 35% 30%,#ff7a3c,#8a1a00);box-shadow:0 0 0 2px #ffb070,0 0 16px 4px rgba(255,90,30,.75);animation:mpBers 1.2s ease-in-out infinite}
@keyframes mpBers{0%,100%{box-shadow:0 0 0 2px #ffb070,0 0 10px 2px rgba(255,90,30,.6)}50%{box-shadow:0 0 0 2px #ffd0a0,0 0 22px 7px rgba(255,90,30,.95)}}
.mp-fbtn.mp-free.on{color:#fff;background:radial-gradient(circle at 35% 30%,#4fe0b8,#0d6b52);box-shadow:0 0 0 2px #9fffe0,0 0 16px 4px rgba(40,220,170,.7);animation:mpFree 1.6s ease-in-out infinite}
@keyframes mpFree{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
#mp-qc{position:fixed;z-index:2147470400;display:flex;align-items:center;gap:4px;height:42px;padding:0 2px;background:none}
.mp-qc-av{width:26px;height:40px;flex:none;background-size:400% 400%;background-position:0 0;background-repeat:no-repeat;cursor:pointer;image-rendering:pixelated;transition:filter .12s;filter:drop-shadow(0 1px 1px rgba(0,0,0,.6))}.mp-qc-av.me{cursor:default}
.mp-qc-av:hover{filter:drop-shadow(0 0 3px rgba(255,211,77,.9)) brightness(1.1)}
.mp-qc-dots i{display:block;width:3px;height:3px;border-radius:50%;background:#e8e8e8;box-shadow:0 0 2px #000,0 0 1px #000}.mp-qc-dots:hover i,.mp-qc-dots.other i{background:#ffd34d}
.mp-qc-tip{position:fixed;z-index:2147470600;padding:4px 8px;border-radius:4px;background:rgba(12,12,14,.94);box-shadow:0 0 0 1px rgba(255,255,255,.18),0 3px 8px rgba(0,0,0,.6);color:#eee;font:12px Arimo,Arial,sans-serif;white-space:nowrap;pointer-events:none;text-align:center}.mp-qc-tip b{color:#ffd34d}.mp-qc-tip div{opacity:.75;font-size:11px}
.mp-qc-dots{flex:none;min-width:10px;height:30px;align-self:center;display:flex;flex-direction:column;gap:3px;align-items:center;justify-content:center;padding:0 2px;color:#e8e8e8;text-shadow:0 0 3px #000,0 0 2px #000;font:700 13px Arial;letter-spacing:1px;cursor:pointer;border-radius:5px}.mp-qc-dots:hover{background:rgba(255,255,255,.08);color:#ffd34d}
.mp-qc-pop{position:fixed;z-index:2147470600;width:104px;padding:5px;border-radius:6px;background:rgba(22,22,24,.96);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 0 0 1px #000,0 6px 16px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:4px}
.mp-qc-wb{height:24px;display:flex;align-items:center;justify-content:center;border-radius:3px;cursor:pointer;color:#f2f2f2;font:700 12px Arimo,Arial,sans-serif;text-shadow:0 1px 1px #000;background:linear-gradient(180deg,#36532c,#1f3519);box-shadow:inset 0 0 0 1px #7d9a68,inset 0 1px 0 rgba(255,255,255,.12)}.mp-qc-wb:hover{filter:brightness(1.18)}.mp-qc-wb.on{box-shadow:inset 0 0 0 1px #ffd34d,inset 0 1px 0 rgba(255,255,255,.12)}.mp-qc-wb.out{color:#ff4646}
#mp-lu{position:fixed;z-index:2147470300;width:430px;max-width:calc(100vw - 16px);border-radius:8px;background:rgba(18,18,20,.86);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14),0 0 0 1px rgba(0,0,0,.7),0 8px 22px rgba(0,0,0,.55);color:#e8e8e8;font:12px Arimo,Arial,sans-serif;user-select:none}
.mp-lu-h{position:relative;display:flex;align-items:center;height:24px;padding:0 6px}
.mp-lu-hb{display:flex;gap:4px;z-index:1}.mp-lu-hi{width:16px;height:16px;display:flex;align-items:center;justify-content:center;border-radius:50%;font-size:11px;color:#bbb;background:rgba(255,255,255,.08);cursor:pointer}.mp-lu-hi:hover{color:#fff;background:rgba(255,255,255,.18)}
.mp-lu-tt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;cursor:move}
.mp-lu-x{margin-left:auto;z-index:1;font-size:17px;line-height:1;color:#ccc;cursor:pointer}.mp-lu-x:hover{color:#fff}
.mp-lu-fl{display:flex;gap:3px;padding:0 6px 4px}.mp-lu-fl > *{flex:1 1 0;min-width:0}.mp-lu-fl > select:nth-child(3){flex-grow:1.35}
.mp-lu-in{height:22px;box-sizing:border-box;padding:0 6px;border:1px solid rgba(255,255,255,.16);border-radius:3px;background:rgba(0,0,0,.55);color:#eee;font:12px Arimo,Arial,sans-serif;outline:none}
.mp-lu-in:focus{border-color:rgba(255,211,77,.6)}input.mp-lu-in[type=number]{flex:0 0 auto;text-align:right;-moz-appearance:textfield}input.mp-lu-in::-webkit-inner-spin-button{display:none}
select.mp-lu-in{padding:0 2px;cursor:pointer}select.mp-lu-in option{background:#1b1b1f}
.mp-lu-list{max-height:300px;overflow-y:auto;padding:0 6px 6px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}
.mp-lu-row{display:flex;align-items:center;gap:8px;min-height:48px;margin-top:4px;padding:3px 8px 3px 4px;border-radius:4px;background:rgba(48,48,52,.82);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.mp-lu-row.zero{opacity:.62}
.mp-lu-ic{width:40px;height:40px;flex:none;background-size:contain;background-position:center bottom;background-repeat:no-repeat;image-rendering:pixelated}
.mp-lu-ic.none{display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.07);color:#888;font-weight:700;font-size:15px}
.mp-lu-mid{flex:1;min-width:0}.mp-lu-nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mp-lu-dr{display:flex;gap:6px;margin-top:3px;font-weight:700}.mp-lu-lb{color:#ddd;width:62px}.mp-lu-c{flex:1}.mp-lu-c.u{color:#ffe14a}.mp-lu-c.h{color:#38b8ff}.mp-lu-c.l{color:#ff9d2e}
.mp-lu-k{flex:none;color:#aaa;font-size:14px;min-width:34px;text-align:right}
.mp-lu-empty{padding:14px;text-align:center;opacity:.6}
.mp-lg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.mp-lg-card{position:relative;cursor:pointer;border-radius:12px;padding:8px 8px 10px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.2);display:flex;flex-direction:column;gap:4px}
.mp-lg-card:hover{border-color:rgba(255,255,255,.3)}.mp-lg-card.on{border-color:var(--c);box-shadow:0 0 0 1px var(--c),0 0 18px color-mix(in srgb,var(--c) 35%,transparent)}
.mp-lg-art{height:70px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:#fff;background:radial-gradient(ellipse at 50% 120%,var(--b),var(--a) 70%);overflow:hidden;position:relative}
.mp-lg-art .mp-lg-ico{filter:drop-shadow(0 0 8px var(--c));color:var(--c);z-index:1}
.mp-lg-art.thor::before{content:'';position:absolute;inset:0;background:linear-gradient(115deg,transparent 46%,rgba(200,225,255,.55) 48%,transparent 50%);animation:mpLgBolt 2.4s infinite}
.mp-lg-art.kasyno::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 20% 30%,#ffd34d 0 3px,transparent 4px),radial-gradient(circle at 70% 20%,#ffd34d 0 3px,transparent 4px),radial-gradient(circle at 45% 75%,#ffd34d 0 2.5px,transparent 3.5px),radial-gradient(circle at 85% 65%,#ffd34d 0 3px,transparent 4px);animation:mpLgFall 2.2s linear infinite}
.mp-lg-art.disco::before{content:'';position:absolute;inset:-40%;background:conic-gradient(from 0deg,rgba(255,43,214,.35),transparent 12%,rgba(0,229,255,.35) 25%,transparent 37%,rgba(255,230,0,.3) 50%,transparent 62%,rgba(124,255,79,.3) 75%,transparent 87%);animation:mpLgSpin 4s linear infinite}
.mp-lg-art.smoke::before{content:'';position:absolute;inset:0;background:radial-gradient(circle at 30% 70%,rgba(255,255,255,.12),transparent 40%),radial-gradient(circle at 70% 40%,rgba(255,255,255,.1),transparent 45%);animation:mpLgSmoke 3s ease-in-out infinite alternate}
@keyframes mpLgBolt{0%,80%,100%{opacity:0}82%,86%{opacity:1}84%{opacity:.3}}
@keyframes mpLgFall{from{transform:translateY(-70px)}to{transform:translateY(70px)}}
@keyframes mpLgSpin{to{transform:rotate(1turn)}}
@keyframes mpLgSmoke{from{transform:translateY(8px) scale(1)}to{transform:translateY(-8px) scale(1.25)}}
.mp-lg-name{font-weight:700;font-size:13px}
.mp-lg-desc{font-size:11.5px;opacity:.7;line-height:1.35;flex:1}
.mp-lg-test{align-self:flex-start;padding:4px 12px!important;margin-top:4px}
.mp-lg-row{display:flex;align-items:center;gap:10px;margin:6px 0}
.mp-lg-row .mp-range{flex:1}
@property --mpa{syntax:'<angle>';inherits:false;initial-value:0deg}
.mp-lg-hl{position:absolute;inset:0;border-radius:4px;pointer-events:none;z-index:6;--lgc:#8fc4ff}
.mp-lg-hl::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:2px;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:mpLgRing 2.2s linear infinite}
.mp-lg-hl::after{content:'';position:absolute;inset:2px;border-radius:3px;overflow:hidden}
@keyframes mpLgRing{to{--mpa:360deg}}
.mp-lg-hl.m-ring{animation:mpLgIn 1.6s ease-in-out infinite}
.mp-lg-hl.m-glow{animation:mpLgOut 1.6s ease-in-out infinite}
.mp-lg-hl.m-pulse{animation:mpLgBg 1.4s ease-in-out infinite}
.mp-lg-hl.m-pulse::before{display:none}
@keyframes mpLgIn{0%,100%{box-shadow:inset 0 0 6px color-mix(in srgb,var(--lgc) 55%,transparent)}50%{box-shadow:inset 0 0 14px var(--lgc)}}
@keyframes mpLgOut{0%,100%{box-shadow:inset 0 0 6px color-mix(in srgb,var(--lgc) 55%,transparent),0 0 3px 0 var(--lgc)}50%{box-shadow:inset 0 0 14px var(--lgc),0 0 7px 1px var(--lgc)}}
@keyframes mpLgBg{0%,100%{background:color-mix(in srgb,var(--lgc) 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--lgc) 60%,transparent)}50%{background:color-mix(in srgb,var(--lgc) 28%,transparent);box-shadow:inset 0 0 0 1px var(--lgc),inset 0 0 12px var(--lgc)}}
.mp-lg-hl.thor{--lgc:#6fb2ff}.mp-lg-hl.thor::before{background:conic-gradient(from var(--mpa),transparent 0 18%,#4f9dff 26%,#fff 30%,#4f9dff 34%,transparent 42% 68%,#4f9dff 76%,#fff 80%,#4f9dff 84%,transparent 92%);animation-duration:.9s}
.mp-lg-hl.thor::after{background:radial-gradient(circle,rgba(200,230,255,.55),transparent 70%);opacity:0;animation:mpLgThorFl 2.3s steps(1) infinite}
@keyframes mpLgThorFl{0%,100%{opacity:0}31%{opacity:1}33%{opacity:0}35%{opacity:.7}37%{opacity:0}78%{opacity:.9}80%{opacity:0}}
.mp-lg-hl.smoke{--lgc:#ff2a1a}.mp-lg-hl.smoke::before{background:conic-gradient(from var(--mpa),#050505,#ff2a1a 12%,#050505 25%,#2a0505 38%,#ff4a2a 50%,#050505 62%,#8a1208 75%,#050505 88%);animation-duration:3.4s}
.mp-lg-hl.kasyno{--lgc:#ffc83a}.mp-lg-hl.kasyno::before{background:conic-gradient(from var(--mpa),#8a5a05,#ffd34d,#fff6c4 12%,#ffd34d 20%,#b8860b 35%,#ffd34d 55%,#fff6c4 62%,#ffd34d 70%,#8a5a05);animation-duration:1.8s}
.mp-lg-hl.kasyno::after{background:linear-gradient(115deg,transparent 35%,rgba(255,250,220,.6) 50%,transparent 65%) -150% 0/250% 100% no-repeat;animation:mpLgSweep 1.6s ease-in-out infinite}
@keyframes mpLgSweep{0%{background-position:-150% 0}60%,100%{background-position:250% 0}}
.mp-lg-hl.disco{--lgc:#ff4fd8}.mp-lg-hl.disco::before{background:conic-gradient(from var(--mpa),#ff2bd6,#ffe600,#7cff4f,#00e5ff,#a35bff,#ff2bd6);animation-duration:1.2s}
.mp-lg-hl.wlasny::before{background:conic-gradient(from var(--mpa),transparent,var(--lgc) 20%,#fff 25%,var(--lgc) 30%,transparent 50%,var(--lgc) 70%,#fff 75%,var(--lgc) 80%,transparent)}
.c-window.mp-lg-win{animation:mpLgWin 1.4s ease-in-out infinite}
.c-window.mp-lg-win.r-thor{animation:mpLgWinThor 2.3s infinite}
.c-window.mp-lg-win.r-disco{animation:mpLgWinDisco 2.2s linear infinite}
.c-window.mp-lg-win.r-smoke{animation:mpLgWinSmoke 3s ease-in-out infinite}
@keyframes mpLgWinDisco{0%{filter:drop-shadow(0 0 10px #ff2bd6)}25%{filter:drop-shadow(0 0 10px #00e5ff)}50%{filter:drop-shadow(0 0 10px #ffe600)}75%{filter:drop-shadow(0 0 10px #7cff4f)}100%{filter:drop-shadow(0 0 10px #ff2bd6)}}
@keyframes mpLgWinSmoke{0%,100%{filter:drop-shadow(0 0 6px #000) drop-shadow(0 0 8px rgba(255,42,26,.6))}50%{filter:drop-shadow(0 0 12px #000) drop-shadow(0 0 16px #ff2a1a)}}
@keyframes mpLgWin{0%,100%{filter:drop-shadow(0 0 6px var(--lgc))}50%{filter:drop-shadow(0 0 18px var(--lgc))}}
@keyframes mpLgWinThor{0%,100%{filter:drop-shadow(0 0 7px #4f9dff)}31%{filter:drop-shadow(0 0 22px #cfe8ff)}34%{filter:drop-shadow(0 0 5px #4f9dff)}37%{filter:drop-shadow(0 0 16px #9fd0ff)}}
.mp-lg-fake{position:fixed!important;left:50%!important;top:46%!important;transform:translate(-50%,-50%);z-index:900!important;pointer-events:none!important}
.mp-lg-fake:not(.mp-lg-fake-tpl){box-sizing:border-box;min-width:300px;border-style:solid;border-width:32px 20px;display:block!important}
.c-window.mp-lg-fake:not(.mp-lg-fake-tpl) > .content{position:relative!important;inset:auto!important;padding:4px 0 8px;background-color:rgb(24,16,12)}
.mp-lg-fake:not(.mp-lg-fake-tpl) .header-label-positioner{position:absolute;left:0;right:0;top:-28px;display:flex;justify-content:center}
.mp-lg-fake:not(.mp-lg-fake-tpl) .header-label{position:relative;padding:4px 26px;min-width:60px;text-align:center;color:#e6d6bf}
.mp-lg-fake:not(.mp-lg-fake-tpl) .close-button-corner-decor{position:absolute;right:-20px;top:-32px;width:51px;height:52px}
.mp-lg-fake-b{display:flex;gap:6px;justify-content:center;padding:6px}
.mp-lg-fake-card{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 6px 6px;border:1px solid #6b2a1a;background:#3a1a10;width:64px;box-sizing:border-box}
.mp-lg-fake-slot{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background-color:#281d15;box-shadow:inset 0 0 0 1px #000}
.mp-lg-fake-item{width:32px;height:32px;border-radius:2px;background:radial-gradient(circle at 40% 35%,color-mix(in srgb,var(--rc) 70%,#fff),color-mix(in srgb,var(--rc) 55%,#000));box-shadow:inset 0 0 0 2px var(--rc)}
.mp-lg-fake-want{font-size:11.5px;color:#e6d6bf}
.mp-lg-fake-btns{display:flex;gap:4px}.mp-lg-fake-btns .button{min-width:22px;height:22px;line-height:22px;text-align:center;padding:0!important;font-size:12px}
.mp-lg-fake-f{position:absolute!important;left:-20px;right:-20px;bottom:-32px;height:32px;display:flex!important;align-items:center;justify-content:space-between;gap:10px;padding:0 26px;box-sizing:border-box;color:#e6d6bf;font-size:12.8px}
.mp-lg-fake-f .interface-element-bottom-bar-background-stretch{position:absolute;inset:0;z-index:-1;border-style:solid;border-width:0 20px}
.mp-lg-fake-f .button{padding:0 12px;height:24px;line-height:24px}
.mp-lg-glow{--lgg:#ff4a2a;animation:mpLgGlow 1.4s ease-in-out infinite!important;border-radius:3px}
@keyframes mpLgGlow{0%,100%{box-shadow:0 0 5px 1px color-mix(in srgb,var(--lgg) 75%,transparent),inset 0 0 8px color-mix(in srgb,var(--lgg) 55%,transparent)}50%{box-shadow:0 0 11px 3px var(--lgg),inset 0 0 14px color-mix(in srgb,var(--lgg) 85%,transparent)}}
.mp-lg-hl.mp-lg-winring{inset:2px;border-radius:10px;z-index:60;filter:drop-shadow(0 0 6px var(--lgc))}
.mp-lg-hl.mp-lg-winring::before{padding:var(--ringw,6px);display:block!important}
/* napis „Łupy" i przycisk zamknięcia zostają nad obwódką */
.c-window:has(> .mp-lg-winring) > .header-label-positioner, .c-window:has(> .mp-lg-winring) > .close-button-corner-decor{z-index:70!important}
.mp-lg-hl.mp-lg-winring::after{display:none}
.mp-lg-fbolt{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.item.mp-lg-fx-fade > :is(canvas.icon,.canvas-icon,img){animation:mpLgFade 3s ease-in-out infinite}
@keyframes mpLgFade{0%,100%{opacity:1;filter:drop-shadow(0 0 4px #ff2a1a)}45%,55%{opacity:.12;filter:blur(2px) drop-shadow(0 0 8px #000)}}
.item.mp-lg-fx-hue > :is(canvas.icon,.canvas-icon,img){animation:mpLgHue 2.2s linear infinite}
@keyframes mpLgHue{0%{filter:drop-shadow(0 0 6px #ff2bd6) brightness(1.15)}25%{filter:drop-shadow(0 0 6px #00e5ff) brightness(1.15)}50%{filter:drop-shadow(0 0 6px #ffe600) brightness(1.15)}75%{filter:drop-shadow(0 0 6px #7cff4f) brightness(1.15)}100%{filter:drop-shadow(0 0 6px #ff2bd6) brightness(1.15)}}
.item.mp-lg-fx-glow > :is(canvas.icon,.canvas-icon,img), .item.mp-lg-fx-pop > :is(canvas.icon,.canvas-icon,img){animation:mpLgItemGlow 1.6s ease-in-out infinite}
@keyframes mpLgItemGlow{0%,100%{filter:drop-shadow(0 0 3px var(--lgg))}50%{filter:drop-shadow(0 0 8px var(--lgg)) brightness(1.12)}}
.item.mp-lg-fx-bolts > :is(canvas.icon,.canvas-icon,img){animation:mpLgItemBolt 2.1s steps(1) infinite}
@keyframes mpLgItemBolt{0%,100%{filter:drop-shadow(0 0 3px #6fb2ff)}20%{filter:drop-shadow(0 0 9px #cfe8ff) brightness(1.4)}23%{filter:drop-shadow(0 0 3px #6fb2ff)}61%{filter:drop-shadow(0 0 8px #cfe8ff) brightness(1.3)}64%{filter:drop-shadow(0 0 3px #6fb2ff)}}
.mp-lg-cap{position:fixed;transform:translate(-50%,8px) scale(.92);opacity:0;transition:opacity .6s,transform .7s cubic-bezier(.2,1.4,.4,1);max-width:min(560px,92vw);z-index:2147483003;pointer-events:none;text-align:center;padding:7px 18px 8px;border-radius:8px;background:linear-gradient(rgba(10,10,14,.82),rgba(4,4,8,.88));box-shadow:0 0 0 1px color-mix(in srgb,var(--lgc) 60%,transparent),0 6px 22px rgba(0,0,0,.6),0 0 18px color-mix(in srgb,var(--lgc) 35%,transparent);color:#f2f2f2;font:13px Arimo,Arial,sans-serif;max-width:min(520px,90vw);white-space:normal}
.mp-lg-cap.on{opacity:1;transform:translate(-50%,0) scale(1)}
.mp-lg-cap-f{font:900 15px Cinzel,Georgia,serif;letter-spacing:.6px;color:var(--lgc);text-shadow:0 0 10px var(--lgc);margin-bottom:2px}
.mp-lg-cap-n b{color:#ff9a3c;text-shadow:0 0 8px rgba(255,120,30,.8)}
.mp-lg-cap.kasyno .mp-lg-cap-f{font:16px Bungee,Impact,sans-serif;color:#ffd34d;text-shadow:0 2px 0 #6b4503,0 0 12px #ffc83a}
.mp-lg-cap.disco .mp-lg-cap-f{font:16px Monoton,Impact,sans-serif;animation:mpLgCapHue 2s linear infinite}
@keyframes mpLgCapHue{0%{color:#ff2bd6;text-shadow:0 0 10px #ff2bd6}33%{color:#00e5ff;text-shadow:0 0 10px #00e5ff}66%{color:#ffe600;text-shadow:0 0 10px #ffe600}100%{color:#ff2bd6;text-shadow:0 0 10px #ff2bd6}}
.mp-lg-cap.thor .mp-lg-cap-f{animation:mpLgCapThor 2.3s steps(1) infinite}
@keyframes mpLgCapThor{0%,100%{text-shadow:0 0 10px #6fb2ff}31%{text-shadow:0 0 18px #fff,0 0 30px #6fb2ff}34%{text-shadow:0 0 10px #6fb2ff}}
.mp-lg-cap.smoke{background:linear-gradient(rgba(14,6,6,.85),rgba(2,2,2,.9))}.mp-lg-cap.smoke .mp-lg-cap-f{color:#e9ecef;text-shadow:0 0 12px #ff2a1a}
.mp-lg-pop{position:fixed;z-index:2147483002;pointer-events:none;perspective:300px}
.mp-mt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.mp-mt-card{cursor:pointer;border-radius:10px;padding:6px;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.18)}
.mp-mt-card:hover{border-color:rgba(255,255,255,.3)}.mp-mt-card.on{border-color:var(--mp-accent);box-shadow:0 0 0 1px var(--mp-accent)}
.mp-mt-stage{height:84px;border-radius:7px;display:flex;align-items:center;justify-content:center;background-color:#141312}
.mp-mt-stage.domyslny{background:linear-gradient(160deg,#4a3826,#2e2216)}
.mp-mt-win{width:84%;border-radius:4px;display:flex;flex-direction:column;gap:3px;padding:5px 7px;box-sizing:border-box;font:10px/1.2 Arial,sans-serif}
.mp-mt-win i{font-style:normal;font-weight:700;font-size:11px}.mp-mt-win em{font-style:normal;align-self:flex-start;padding:1px 8px;font-size:9.5px;border-radius:2px}
.mp-mt-win.domyslny{background:#2b2116;border:3px solid #8a6a3a;color:#e8d3a3}.mp-mt-win.domyslny i{color:#e8c47a}.mp-mt-win.domyslny em{background:linear-gradient(#335e2a,#264a1f);border:1px solid #4f7e40;color:#fff}

.mp-mt-name{text-align:center;font-size:11.5px;margin-top:5px}.mp-mt-desc{text-align:center;font-size:10.5px;opacity:.6;margin-top:2px}
.mp-mt-own{display:flex;flex-direction:column;gap:6px;margin-bottom:8px}.mp-mt-row{display:flex;align-items:center;gap:6px}
.mp-setq{outline:2px solid var(--mp-accent)!important;outline-offset:1px;border-radius:3px;box-shadow:0 0 8px var(--mp-accent)!important}
.mp-rar{display:inline-block;font-size:10.5px;padding:0 6px;border-radius:6px;margin-left:4px;background:rgba(255,255,255,.1)}
.mp-rar.unique{background:#c9a21a33;color:#ffd75e}.mp-rar.heroic{background:#2f7bff33;color:#7fb2ff}.mp-rar.legendary{background:#ff7a1a33;color:#ffa45e}.mp-rar.upgraded{background:#c94cff33;color:#e19bff}.mp-rar.common{color:#ddd}
.mp-upbar{height:4px;border-radius:3px;background:rgba(255,255,255,.08);margin-top:5px;overflow:hidden}.mp-upbar i{display:block;height:100%;background:var(--mp-accent)}
.mp-uphead{display:flex;align-items:center;gap:10px}
.mp-updrop{width:44px;height:44px;flex:none;border-radius:9px;border:1.5px dashed rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--mp-accent);background:rgba(255,255,255,.04);transition:.15s}
.mp-updrop:hover{border-color:var(--mp-accent);background:rgba(255,255,255,.09)}
.mp-updrop.has{border-style:solid;border-color:rgba(255,255,255,.18)}
.mp-updrop img{max-width:36px;max-height:36px;image-rendering:pixelated}
.mp-uplab{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:10px 0 5px}
.mp-upchip{all:unset;cursor:pointer;font-size:12px;padding:3px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.18);color:inherit;opacity:.75}
.mp-upchip:hover{opacity:1}
.mp-upchip.taken{opacity:.3;text-decoration:line-through;cursor:not-allowed}
.mp-upchip.on{background:var(--mp-accent);border-color:var(--mp-accent);color:#fff;opacity:1}
.mp-up-picking [class*="item-id-"]{cursor:crosshair!important;outline:1px dashed var(--mp-accent)}
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

/* motywy */
.mp-themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:4px}
.mp-theme{cursor:pointer;border-radius:12px;padding:8px;border:1px solid rgba(255,255,255,.1);display:flex;flex-direction:column;gap:6px}
.mp-theme:hover{border-color:rgba(255,255,255,.3)}
.mp-theme.on{box-shadow:0 0 0 2px var(--t-accent);border-color:transparent}
.mp-theme .sw{height:26px;border-radius:8px;display:flex;align-items:center;justify-content:flex-end;padding:0 6px}
.mp-theme .sw i{width:12px;height:12px;border-radius:50%;background:var(--t-accent);box-shadow:0 0 8px var(--t-accent)}
.mp-theme .nm{font-size:12px;font-weight:600}

/* Hey WakeUP! — podglądy stylów */
.mp-wk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.mp-wk-prev{cursor:pointer;border-radius:12px;border:1px solid rgba(255,255,255,.1);overflow:hidden;background:rgba(0,0,0,.2)}
.mp-wk-prev:hover{border-color:rgba(255,255,255,.3)}
.mp-wk-prev.on{border-color:var(--mp-accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--mp-accent) 45%,transparent)}
.mp-wk-stage{height:62px;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(45deg,#4a3f52 0 10px,#43394b 10px 20px);overflow:hidden;padding:0 4px}
.mp-wk-msg{white-space:nowrap;transform:scale(.62);transform-origin:center}
.mp-wk-msg.gra{color:#ffe500;font:700 24px/1.3 Arial,sans-serif;text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000}
.mp-wk-name{padding:5px 8px;font-size:12px;font-weight:600;text-align:center}

.mp-target{position:fixed;z-index:2147482995;display:flex;align-items:center;gap:7px;padding:5px 11px;border-radius:999px;cursor:pointer;font-size:12.5px;border:1px solid rgba(255,70,90,.6)!important;box-shadow:0 0 14px rgba(255,70,90,.35)!important;color:#fff}
.mp-target .mp-ico{color:#ff6b7f}

/* pasek skrótów — minimalistyczny */
#mp-qbar{position:fixed;z-index:2147482998;display:flex;flex-direction:column;align-items:center;gap:1px;padding:4px 3px;border-radius:12px;width:30px;background:rgba(10,11,18,.38)!important;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.07)!important;box-shadow:none!important;opacity:.75;transition:opacity .15s}
#mp-qbar:hover{opacity:1}
.mp-qhandle{width:100%;display:flex;justify-content:center;color:rgba(255,255,255,.3);cursor:move;padding:0 0 2px}
.mp-qhandle:hover{color:#fff}
.mp-qtile{position:relative;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:7px;cursor:pointer;color:rgba(255,255,255,.88);transition:background .12s,color .12s}
.mp-qtile:hover{background:rgba(255,255,255,.12);color:#fff}
.mp-qtile.off{color:rgba(255,255,255,.28)}
.mp-qtile.sel{background:color-mix(in srgb,var(--mp-accent) 35%,transparent);color:#fff}
.mp-qdot{position:absolute;left:-2px;top:50%;width:3px;height:12px;margin-top:-6px;border-radius:2px;background:var(--mp-accent)}
.mp-qtile:hover::after{content:attr(data-name);position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);white-space:nowrap;padding:3px 8px;border-radius:7px;background:rgba(10,11,18,.9);border:1px solid rgba(255,255,255,.1);font:500 11.5px/1.3 "Segoe UI",system-ui,sans-serif;color:#fff;pointer-events:none}
.mp-qmore{margin-top:2px;border-top:1px solid rgba(255,255,255,.08);border-radius:0;color:rgba(255,255,255,.5)}
#mp-qpop{position:fixed;z-index:2147482999;width:360px;max-height:78vh;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;animation:mpIn .14s ease-out}
#mp-qpop .mp-head{cursor:default;padding:9px 10px;gap:8px}
.mp-qbody{overflow-y:auto;overflow-x:hidden;padding:10px 12px 12px;margin:0 3px 4px 0;overscroll-behavior:contain}
.mp-qbody .mp-card{padding:9px 11px}
.mp-qbody .mp-field{gap:8px}
.mp-qbody .mp-in.txt{width:150px}
.mp-qbody select.mp-in{max-width:175px}
.mp-qbody .mp-field .lb{min-width:0}

/* pływające okna */
.mp-win{position:fixed;z-index:2147482990;border-radius:16px;min-width:260px;display:flex;flex-direction:column;overflow:hidden}
.mp-win .mp-head{padding:9px 10px}
.mp-win .mp-wbody{padding:10px 12px;overflow:auto;max-height:60vh}

/* menu kontekstowe */
/* menu w stylu menu gry: ciemne tło, tytuł, zielone przyciski */
#mp-ctx{position:fixed;z-index:2147483100;min-width:180px;padding:4px;background:#2b2b2b;border:2px solid #5d5d5d;border-radius:4px;box-shadow:0 0 0 1px #000,0 6px 18px rgba(0,0,0,.6);font:12px/1.3 Arial,sans-serif;color:#eee;display:flex;flex-direction:column;gap:2px}
.mp-ctx-title{padding:6px 10px 7px;text-align:center;font-weight:700;font-size:12.5px;color:#fff;background:linear-gradient(#3a3a3a,#2a2a2a);border-bottom:1px solid #555;margin:-4px -4px 3px}
.mp-ctx-item{all:unset;display:block;box-sizing:border-box;text-align:center;padding:5px 12px;cursor:pointer;color:#fff;font:12px Arial,sans-serif;background:linear-gradient(#335e2a,#264a1f);border:1px solid #4f7e40;border-radius:2px;text-shadow:0 1px 1px #000}
.mp-ctx-item:hover{background:linear-gradient(#447a38,#2f5d27);border-color:#79b263}

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
.mp-ibadge.chance.zero{color:#ff8b8b;border-color:rgba(255,93,122,.5)}
.mp-ibadge.chance{bottom:-14px;left:50%;transform:translateX(-50%);color:#9dffcf;border-color:rgba(61,220,151,.5);font-size:10px}
.mp-ibadge.queued{top:-3px;left:-3px;color:#fff;background:var(--mp-accent);border-color:rgba(0,0,0,.5);padding:1px;border-radius:50%;line-height:0}
.mp-ibadge.queued .mp-ico{display:block}

/* Pokaż EQ */
#mp-eqtip{position:fixed;z-index:2147483150;border-radius:14px;padding:10px;width:290px;pointer-events:none}
/* styl jak dymek gry: ciemne tło, szara ramka, wyśrodkowany nagłówek */
#mp-eqtip.gamey{background:rgba(12,12,12,.93)!important;-webkit-backdrop-filter:none;backdrop-filter:none;border:2px solid #5d5d5d!important;border-radius:3px;box-shadow:0 0 0 1px #000,0 4px 14px rgba(0,0,0,.6)!important;padding:6px 8px;font:12px/1.35 Arial,sans-serif;color:#e8e8e8;width:auto;min-width:200px}
#mp-eqtip.gamey .mp-eqhead{display:none}
.mp-eq-on .tip-wrapper:not(.mp-glass){clip-path:inset(0 0 100% 0)!important;background:transparent!important;border-color:transparent!important;box-shadow:none!important}
.mp-eq-on .tip-wrapper:not(.mp-glass) *{visibility:hidden!important}
#mp-eqtip .mp-clone{text-align:center;position:static!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important;transform:none!important;border:0!important;box-shadow:none!important;background:transparent!important;margin:0 0 4px!important;padding:0!important;display:block!important;visibility:visible!important;opacity:1!important;clip-path:none!important;max-width:none!important;width:auto!important;pointer-events:none!important}
#mp-eqtip.gamey{max-width:360px;height:auto!important;max-height:92vh;overflow:hidden}
/* izolacja od stylów gry (gra ma własne klasy o podobnych nazwach) */
#mp-eqtip div{position:static;float:none;height:auto;min-height:0;background-image:none;transform:none}
#mp-eqtip .mp-eqlayout{position:relative!important}
#mp-eqtip .mp-eqlayout .mp-eqcell{position:absolute!important;height:34px!important}
#mp-eqtip .mp-ibadge{position:absolute!important;height:auto!important}
#mp-eqtip .mp-eqoutfit{background-repeat:no-repeat}
#mp-eqtip .mp-clone *{max-width:100%!important;position:static!important}
#mp-eqtip .mp-eqhead2{text-align:center;margin-bottom:4px;line-height:1.35}
#mp-eqtip .mp-eqhead2 .mp-eq-rank{color:#ff9a2e}
#mp-eqtip .mp-eqhead2 .mp-eq-loot{text-align:right;color:#f2c94c;font-size:11px}
#mp-eqtip .mp-eqhead2 .mp-eq-nick{border:1px solid #444;padding:1px 8px;font-weight:700}
#mp-eqtip .mp-eqhead2 .mp-eq-clan{color:#d9c27a;margin-top:2px}
#mp-eqtip .mp-eqbody{display:flex;align-items:center;justify-content:center;gap:10px;border-top:1px solid #3c3c3c;padding-top:6px}
#mp-eqtip .mp-eqoutfit{flex:none;background-repeat:no-repeat;image-rendering:pixelated}
#mp-eqtip .mp-eqmain{min-width:120px;display:flex;justify-content:center}
#mp-eqtip .mp-eqload{padding:18px 6px;text-align:center}
#mp-eqtip .mp-eqbons{margin-top:4px;display:flex;flex-wrap:wrap;gap:4px;justify-content:center}
#mp-eqtip.gamey .mp-eqgrid{grid-template-columns:repeat(6,36px);gap:3px;margin:2px 0 4px;justify-content:center}
#mp-eqtip.gamey .mp-eqcell{width:36px;height:36px;border-radius:2px;background:rgba(255,255,255,.04);border:1px solid #3c3c3c}
#mp-eqtip.gamey .mp-eqcell.legendary{border-color:#ff8a1c}
#mp-eqtip.gamey .mp-eqcell.heroic{border-color:#3fa2ff}
#mp-eqtip.gamey .mp-eqcell.unique{border-color:#e6c84a}
#mp-eqtip .mp-eqlayout{position:relative;margin:4px auto 6px}
#mp-eqtip .mp-eqlayout .mp-eqcell{position:absolute;width:34px;height:34px}
#mp-eqtip .mp-eqcell.mp-eqslot{background:rgba(255,255,255,.025)!important;border:1px dashed rgba(255,255,255,.07)!important;box-shadow:none!important}
#mp-eqtip.gamey .mp-eqsum{text-align:center;border-top:1px solid #3c3c3c;padding-top:3px}
#mp-eqtip.gamey .mp-chip{background:transparent;border:1px solid #444;border-radius:3px;font-size:11px}
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

/* ═══════════ L4Tools 1.1 — wygląd w stylu okien gry ═══════════ */
:root{--mp-fg:#e9e9e9;--mp-dim:#a9a9a9;--mp-line:rgba(255,255,255,.14)}
.mp-glass{background:rgba(var(--mp-bg),var(--mp-glass))!important;-webkit-backdrop-filter:blur(3px)!important;backdrop-filter:blur(3px)!important;border:1px solid rgba(255,255,255,.32)!important;box-shadow:0 0 0 1px rgba(0,0,0,.85),inset 0 0 0 1px rgba(0,0,0,.6),0 12px 34px rgba(0,0,0,.6)!important;border-radius:8px!important;font-family:Arimo,Arial,sans-serif!important}
/* okno panelu */
#mp-panel.l4-win{width:720px;height:470px;max-width:96vw;max-height:90vh;border-radius:8px!important}
.l4-head{position:relative;display:flex;align-items:center;height:28px;padding:0 6px;cursor:move;user-select:none;border-bottom:1px solid rgba(255,255,255,.12);background:linear-gradient(rgba(255,255,255,.05),rgba(0,0,0,.15))}
.l4-head-l{display:flex;gap:4px;z-index:1}
.l4-mini{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;font:900 9px Georgia,serif;color:#f4e3a8;background:radial-gradient(circle at 35% 30%,#4f7c38,#22391a);box-shadow:0 0 0 1px #9cbc78,0 0 0 2px #0c1408;text-shadow:0 1px 0 #000}
.l4-title{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 12.5px Arimo,Arial,sans-serif;letter-spacing:.6px;color:#eee;pointer-events:none}
.l4-x{all:unset;margin-left:auto;z-index:1;cursor:pointer;width:22px;height:22px;display:flex;align-items:center;justify-content:center;color:#cfcfcf;border-radius:4px}.l4-x:hover{color:#fff;background:rgba(255,80,80,.25)}
.l4-body{flex:1;display:flex;min-height:0;gap:8px;padding:8px}
.l4-nav{width:136px;flex:none;display:flex;flex-direction:column;gap:6px;overflow:hidden}
.l4-gap{height:4px}
.l4-navb{all:unset;cursor:pointer;display:flex;align-items:center;gap:9px;height:34px;padding:0 10px;border-radius:6px;font:700 12.5px Arimo,Arial,sans-serif;color:#f2f2f2;background:linear-gradient(rgba(255,255,255,.07),rgba(0,0,0,.18)),rgba(24,24,26,.92);box-shadow:inset 0 0 0 1px rgba(255,255,255,.26),0 0 0 1px rgba(0,0,0,.7)}
.l4-navb:hover{background:linear-gradient(rgba(255,255,255,.13),rgba(0,0,0,.12)),rgba(34,34,36,.95)}
.l4-navb.on{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mp-accent) 80%,#fff),0 0 0 1px rgba(0,0,0,.7),0 0 8px color-mix(in srgb,var(--mp-accent) 35%,transparent);background:linear-gradient(color-mix(in srgb,var(--mp-accent) 22%,transparent),rgba(0,0,0,.2)),rgba(26,26,28,.95)}
.l4-navb .mp-ico{color:#fff}
.l4-ver{margin-top:auto;text-align:center;font-size:10.5px;color:#8a8a8a}
.l4-main{flex:1;min-width:0;overflow-y:auto;overflow-x:hidden;padding:0 6px 4px 0;overscroll-behavior:contain;color:var(--mp-fg);font-size:12.5px}
/* pasek wyszukiwania */
.l4-bar{position:sticky;top:0;z-index:2;display:flex;gap:6px;margin-bottom:6px;background:rgba(var(--mp-bg),.96);padding-bottom:2px}
.l4-search{all:unset;flex:1;height:30px;border-radius:5px;text-align:center;color:#eee;font:13px Arimo,Arial,sans-serif;background:rgba(10,10,10,.75);box-shadow:inset 0 0 0 1px rgba(255,255,255,.24)}
.l4-search::placeholder{color:#9a9a9a}.l4-search:focus{box-shadow:inset 0 0 0 1px var(--mp-accent)}
.l4-sq{all:unset;cursor:pointer;flex:none;width:30px;height:30px;border-radius:5px;display:flex;align-items:center;justify-content:center;color:#eee;font:700 13px Arimo,Arial,sans-serif;background:rgba(10,10,10,.75);box-shadow:inset 0 0 0 1px rgba(255,255,255,.24)}
.l4-sq:hover{background:rgba(40,40,40,.85)}.l4-sq.on{box-shadow:inset 0 0 0 1px var(--mp-accent);color:var(--mp-accent)}
.l4-count{cursor:default}
/* karty dodatków */
.l4-list{display:flex;flex-direction:column;gap:6px}
.l4-card{display:flex;align-items:center;gap:10px;min-height:58px;padding:7px 8px;border-radius:5px;cursor:default;background:linear-gradient(rgba(255,255,255,.035),rgba(0,0,0,.1)),rgba(18,18,20,.85);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
.l4-card:hover{box-shadow:inset 0 0 0 1px rgba(255,255,255,.3)}
.l4-card.on{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mp-accent) 60%,rgba(255,255,255,.2)),inset 3px 0 0 var(--mp-accent)}
.l4-ico{width:36px;height:36px;flex:none;display:flex;align-items:center;justify-content:center;border-radius:4px;color:#fff;background:linear-gradient(#2c2c2e,#121214);box-shadow:inset 0 0 0 1px rgba(255,255,255,.28),0 0 0 1px #000}
.l4-card:not(.on) .l4-ico{color:#9b9b9b}
.l4-txt{flex:1;min-width:0}
.l4-nm{font:700 13px Arimo,Arial,sans-serif;text-transform:uppercase;letter-spacing:.3px;color:#f3f3f3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.l4-card:not(.on) .l4-nm{color:#cfcfcf}
.l4-ds{margin-top:3px;font-size:11.5px;color:#a8a8a8;line-height:1.3;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.l4-gearb{all:unset;cursor:pointer;flex:none;width:28px;height:28px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#bdbdbd;background:rgba(40,40,42,.9);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.l4-gearb:hover{color:#fff;background:rgba(60,60,62,.95)}
.l4-pinb{color:#7a7a7a}.l4-pinb.on{color:#fff;background:linear-gradient(#5b8b3d,#2c4d1a);box-shadow:inset 0 0 0 1px #a3c47f}
.l4-empty{padding:20px;text-align:center;color:#999}
/* nagłówek ustawień dodatku */
.l4-dhead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:6px 8px;margin-bottom:8px;border-radius:5px;background:rgba(14,14,16,.97);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)}
.l4-btn{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border-radius:4px;font:700 11.5px Arimo,Arial,sans-serif;color:#eee;background:rgba(40,40,42,.9);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
.l4-btn.on{color:var(--mp-accent);box-shadow:inset 0 0 0 1px var(--mp-accent)}
.l4-sec{margin:0 0 8px}.l4-sec h2{margin:0 0 2px;font:700 15px Arimo,Arial,sans-serif;color:#f2f2f2;text-transform:uppercase;letter-spacing:.5px}
/* karty ustawień w stylu gry */
.mp-glass .mp-card{background:linear-gradient(rgba(255,255,255,.03),rgba(0,0,0,.08)),rgba(16,16,18,.8)!important;border:0!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);border-radius:5px!important;padding:10px 12px!important;margin-bottom:8px!important}
.mp-glass .mp-card h3{color:#dcdcdc!important;font:700 11.5px Arimo,Arial,sans-serif!important;letter-spacing:.7px!important}
.mp-glass .mp-btn{border-radius:4px!important;background:linear-gradient(rgba(255,255,255,.08),rgba(0,0,0,.15)),rgba(36,36,38,.95)!important;border:0!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.24)!important;font-family:Arimo,Arial,sans-serif!important}
.mp-glass .mp-btn:hover{background:linear-gradient(rgba(255,255,255,.14),rgba(0,0,0,.1)),rgba(46,46,48,.95)!important}
.mp-glass .mp-btn.pri{background:linear-gradient(#5c8f39,#35591f)!important;box-shadow:inset 0 0 0 1px #9cc277,0 0 0 1px #000!important;color:#fff!important}
.mp-glass .mp-in{border-radius:4px!important;background:rgba(6,6,8,.7)!important}
.mp-desc{color:#b4b4b4!important;margin:0 0 10px!important;line-height:1.45}
.l4-cl h3{display:flex;align-items:baseline;gap:8px}.l4-cld{font-weight:400;text-transform:none;letter-spacing:0;color:#8f8f8f;font-size:11px}
.l4-cl.cur{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--mp-accent) 70%,transparent)!important}
.l4-cl ul{margin:0;padding-left:18px}.l4-cl li{margin:3px 0;line-height:1.4;color:#d6d6d6}
.l4-info p{margin:0 0 9px;line-height:1.55;color:#dcdcdc}.l4-info p:last-child{margin:0}
.l4-acc{display:flex;flex-wrap:wrap;gap:6px}
.l4-accb{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:4px;font-size:11.5px;color:#ddd;background:rgba(30,30,32,.9);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}
.l4-accb i{width:10px;height:10px;border-radius:50%;background:var(--c);box-shadow:0 0 6px var(--c)}
.l4-accb.on{box-shadow:inset 0 0 0 1px var(--c);color:#fff}
.l4-lays{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.l4-lay{all:unset;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 5px;border-radius:5px;text-align:center;background:rgba(24,24,26,.9);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}
.l4-lay b{font-size:11.5px;color:#eee}.l4-lay small{font-size:10px;color:#999;line-height:1.25}
.l4-lay.on{box-shadow:inset 0 0 0 1px var(--mp-accent),0 0 8px color-mix(in srgb,var(--mp-accent) 30%,transparent)}
.l4-lay-pic{position:relative;width:64px;height:40px;border-radius:3px;background:#3d5a2a;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2);display:flex;gap:2px;padding:4px;box-sizing:border-box}
.l4-lay-pic::before,.l4-lay-pic::after{content:"";position:absolute;top:0;bottom:0;width:10px;background:#2a2a2c}
.l4-lay-pic::before{left:0}.l4-lay-pic::after{right:0}
.l4-lay-pic i{width:5px;height:5px;border-radius:1px;background:#fff;z-index:1}
.l4-lay-pic.pgp,.l4-lay-pic.lgp{flex-direction:column}
.l4-lay-pic.pgp{align-items:flex-end;padding-right:13px}.l4-lay-pic.lgp{align-items:flex-start;padding-left:13px}
.l4-lay-pic.lgh{padding-left:13px}.l4-lay-pic.ldh{padding-left:13px;align-items:flex-end}
/* kafelek L4 (jak przyciski widżetów gry) */
#mp-launcher.l4-tile{position:fixed;z-index:2147483000;width:42px;height:42px;box-sizing:border-box;border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;touch-action:none;transition:filter .12s;background:linear-gradient(#b8332b,#8a1f19 48%,#6e1612 52%,#82201a);box-shadow:inset 0 0 0 1px #e9a07a,inset 0 0 0 2px #3d0905,inset 0 3px 0 2px rgba(255,255,255,.16),0 0 0 1px #140302,0 2px 4px rgba(0,0,0,.6)}
#mp-launcher.l4-tile.in-row{z-index:5}
#mp-launcher.l4-tile.edit{cursor:grab}
#mp-launcher.l4-tile:hover{transform:none;filter:brightness(1.15)}
#mp-launcher.l4-tile.drag{z-index:2147483600;opacity:.85;cursor:grabbing;filter:drop-shadow(0 4px 10px rgba(0,0,0,.7))}
.l4-tile-t{font:900 19px/1 Georgia,"Times New Roman",serif;letter-spacing:-.6px;background:linear-gradient(#fff8d2,#ffd54a 45%,#d08a12);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 1px 0 #000) drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 -1px 0 #000) drop-shadow(0 0 4px rgba(255,200,60,.55));pointer-events:none}
.l4-mini{background:radial-gradient(circle at 35% 30%,#b8332b,#5e110d)!important;box-shadow:0 0 0 1px #e9a07a,0 0 0 2px #140302!important;color:#ffd54a!important}
/* zębatka przy ustawieniach dodatków */
.l4-gears .mp-card > h3{display:flex;align-items:center;gap:6px}
.l4-gears .mp-card > h3::before{content:"";width:12px;height:12px;flex:none;background:currentColor;-webkit-mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>") center/contain no-repeat;mask:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3'/><path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'/></svg>") center/contain no-repeat}
/* pasek skrótów — kafelki jak przyciski gry */
#mp-qbar{position:fixed;z-index:2147482998;display:flex;flex-direction:column;gap:5px;padding:0;background:none!important;border:0!important;box-shadow:none!important;width:auto!important;opacity:1}
#mp-qbar.hz{flex-direction:row}
#mp-qbar .mp-qtile{width:27px;height:27px;border-radius:4px;transition:filter .12s}
#mp-qbar .mp-qtile.on{color:#fff;background:linear-gradient(#5b8b3d,#3a6224 48%,#2c4d1a 52%,#33571f);box-shadow:inset 0 0 0 1px #a3c47f,inset 0 0 0 2px #1f3512,0 0 0 1px #0b0f07,0 2px 4px rgba(0,0,0,.55)}
#mp-qbar .mp-qtile.on .mp-ico{filter:drop-shadow(0 1px 0 rgba(0,0,0,.7))}
#mp-qbar .mp-qtile.off{color:#9a9a9a;background:linear-gradient(#4a4a4c,#2a2a2c 48%,#1e1e20 52%,#262628);box-shadow:inset 0 0 0 1px #8a8a8a,inset 0 0 0 2px #151515,0 0 0 1px #050505,0 2px 4px rgba(0,0,0,.55)}
#mp-qbar .mp-qtile:hover{filter:brightness(1.18)}
#mp-qbar .mp-qtile.sel{outline:2px solid #ffd54a;outline-offset:1px}
#mp-qbar .mp-qmore{background:linear-gradient(#5b8b3d,#2c4d1a);box-shadow:inset 0 0 0 1px #a3c47f,inset 0 0 0 2px #1f3512,0 0 0 1px #0b0f07}
#mp-qbar .mp-qmore span{font:900 12px Georgia,serif;color:#fff3c4;text-shadow:0 1px 0 #000,1px 0 0 #000,-1px 0 0 #000,0 -1px 0 #000}
#mp-qbar .mp-qtile:hover::after{right:auto;left:auto}
#mp-qbar[data-lay="pgp"] .mp-qtile:hover::after{right:calc(100% + 8px);left:auto}
#mp-qbar[data-lay="lgp"] .mp-qtile:hover::after{left:calc(100% + 8px);right:auto}
#mp-qbar.hz .mp-qtile:hover::after{left:50%;right:auto;top:calc(100% + 6px);transform:translateX(-50%)}
#mp-qbar[data-lay="ldh"] .mp-qtile:hover::after{top:auto;bottom:calc(100% + 6px)}
#mp-qpop{border-radius:8px!important}

/* Ulepszarka: ciche pobranie licznika — okno Rzemiosła niewidoczne przez chwilę */
.mp-ul-silent .c-window:has(.left-grouped-list-and-right-description-window){opacity:0!important;pointer-events:none!important}
`;

function injectCSS() {
  if (document.getElementById('mp-css')) return;
  const s = el('style', { id: 'mp-css' });
  s.textContent = CSS;
  document.head.appendChild(s);
}

MP.injectCSS = injectCSS;

