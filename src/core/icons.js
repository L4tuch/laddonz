/* ───────────────────────── icons.js ─────────────────────────
 * Własne ikonki SVG (rysowane ręcznie, bez zewnętrznych plików).
 * Każda ikonka: viewBox 0 0 24 24, kolor = currentColor.
 */
const ICON_PATHS = {
  // dodatki
  napad: '<path d="M4 20l7-7"/><path d="M14.5 3.5l6 6-8.5 8.5-6-6z"/><path d="M3 17l4 4"/><path d="M16 6l2 2"/>',
  wakeup: '<path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/><path d="M3 7.5c.6-1.6 1.6-3 3-4"/><path d="M21 7.5c-.6-1.6-1.6-3-3-4"/>',
  wrogowie: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/>',
  pogromca: '<path d="M4 20l7-7M14.5 3.5l6 6-9 9-6-6z"/><path d="M14 4l-2-2M20 10l2 2M3 21l2-2"/>',
  legenda: '<path d="M12 2.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16l-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/><path d="M12 6.5v3M9.8 10.2l1.4 1.2M14.2 10.2l-1.4 1.2"/>',
  motywnik: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.6 1.7-1.6H16a5 5 0 0 0 5-5C21 6.3 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
  bratan: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12.5l2.3 2.3 4.7-5"/>',
  ktotu: '<circle cx="9" cy="8" r="3.3"/><path d="M3 20c.4-3.6 2.8-5.6 6-5.6s5.6 2 6 5.6"/><circle cx="17.5" cy="15.5" r="2.6"/><path d="M19.4 17.4L22 20"/>',
  ktozlapie: '<path d="M7 4h10l-1 6.5a4 4 0 01-8 0z"/><path d="M12 14.5V18"/><path d="M8.5 20.5h7"/><path d="M17 5.5h2.5a2 2 0 010 4H16.6"/><path d="M7 5.5H4.5a2 2 0 000 4h2.9"/>',
  cook: '<path d="M5 11h14v3a7 7 0 01-14 0z"/><path d="M3 11h18"/><path d="M9 7.5c0-1.5 1-1.5 1-3"/><path d="M12.5 7.5c0-1.5 1-1.5 1-3"/><path d="M16 7.5c0-1.5 1-1.5 1-3"/>',
  podpis: '<path d="M4 20h5l10.5-10.5a2.1 2.1 0 00-3-3L6 17v3"/><path d="M14.5 8.5l3 3"/><path d="M13 20h7"/>',
  pokazeq: '<path d="M7 7V5.5A2.5 2.5 0 019.5 3h5A2.5 2.5 0 0117 5.5V7"/><rect x="3.5" y="7" width="17" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="2.4"/><path d="M3.5 12h6.1M14.4 12h6.1"/>',
  jakibon: '<path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.4l-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z"/><path d="M10 11.5h4"/>',
  przypom: '<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><path d="M2.5 9h19V6.5h-19z"/><path d="M12 6.5v14"/><path d="M12 6.5C10.5 3 7 3 7 5s3 1.5 5 1.5z"/><path d="M12 6.5C13.5 3 17 3 17 5s-3 1.5-5 1.5z"/>',
  taxi: '<path d="M4 16v-3.5L6 8h12l2 4.5V16"/><path d="M3 16h18v2.5H3z"/><circle cx="7.5" cy="16" r="1.8"/><circle cx="16.5" cy="16" r="1.8"/><path d="M9.5 5h5v3h-5z"/>',
  autof: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  szybka: '<path d="M8 12.5V5.5a1.5 1.5 0 013 0V11"/><path d="M11 10V4a1.5 1.5 0 013 0v6.5"/><path d="M14 10.5V6a1.5 1.5 0 013 0v7.5c0 4-2.5 7-6 7-2.6 0-4.3-1.3-5.6-3.5L3.7 14a1.5 1.5 0 012.6-1.5l1.7 2.3"/>',
  ulepszarka: '<path d="M3 21l8.5-8.5"/><path d="M13.5 4.5l6 6"/><path d="M11 7l6 6-2 2-6-6z"/><path d="M19 3l.6 1.4L21 5l-1.4.6L19 7l-.6-1.4L17 5l1.4-.6z"/><path d="M5 4l.4 1 1 .4-1 .4L5 7l-.4-1.2-1-.4 1-.4z"/>',
  minichat: '<path d="M4 5h16v10.5H9l-5 4z"/><path d="M14 10.5h3.5M14 10.5v-3.5"/><path d="M8 8.5l2.5 2.5"/>',
  // interfejs
  logo: '<path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9z"/><path d="M10 7.8v8.4h5" stroke-width="2.3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  diag: '<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>',
  log: '<path d="M5 5h14M5 10h14M5 15h9M5 20h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 018 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/>',
  drag: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
};

function icon(name, size = 20) {
  const p = ICON_PATHS[name] || ICON_PATHS.logo;
  const s = el('span', { class: 'mp-ico', style: { width: size + 'px', height: size + 'px' } });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  return s;
}

MP.icon = icon;
