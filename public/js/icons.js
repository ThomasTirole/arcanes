// Icônes SVG maison (style trait, 24×24) — utilisées partout à la place des emojis.
// UI.icon('bolt') renvoie un élément <svg> ; la couleur suit le texte (currentColor) sauf si on la précise.
(function () {
  'use strict';

  const P = {
    // interface
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.2-2.5 3.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".6" fill="currentColor"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    cross: '<path d="M6 6l12 12M18 6L6 18"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    // jeux
    swords: '<path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6M16 16l4 4M19 21l2-2"/><path d="M9.5 6.5L18 3h3v3l-3.5 8.5"/><path d="M5 14l4 4M7 17l-3 3M3 19l2 2"/>',
    puzzle: '<path d="M10 3h4v3a1.5 1.5 0 1 0 3 0V3h4v7h-3a1.5 1.5 0 1 0 0 3h3v8h-7v-3a1.5 1.5 0 1 0-3 0v3H3v-8h3a1.5 1.5 0 1 0 0-3H3V3h7z"/>',
    gamepad: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r=".8" fill="currentColor"/><circle cx="18" cy="13.5" r=".8" fill="currentColor"/>',
    burst: '<path d="M12 2l1.8 5.5L19 5l-2.5 5.2L22 12l-5.5 1.8L19 19l-5.2-2.5L12 22l-1.8-5.5L5 19l2.5-5.2L2 12l5.5-1.8L5 5l5.2 2.5z"/>',
    // sorts
    sword: '<path d="M14.5 3H21v6.5L9.5 21 3 14.5z" fill="none"/><path d="M13 19l-8-8M6.5 17.5l-3 3M4 15l5 5"/>',
    shield: '<path d="M12 3l8 3v5c0 5-3.4 9-8 10-4.6-1-8-5-8-10V6z"/><path d="M12 7v10M8 11h8"/>',
    castle: '<path d="M3 21V9h3V6h2v3h2V6h4v3h2V6h2v3h3v12z"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>',
    scroll: '<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1h10"/><path d="M7 4a2 2 0 0 0-2 2v11M9 9h5M9 13h5"/>',
    potion: '<path d="M10 3h4M10 3v5L5.5 16a3.5 3.5 0 0 0 3 5h7a3.5 3.5 0 0 0 3-5L14 8V3"/><path d="M7.5 14h9"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    snowflake: '<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5M3.5 10.5L6.4 9 5.6 5.8M18.4 18.2l-.8-3.2 2.9-1.5M20.5 10.5L17.6 9l.8-3.2M5.6 18.2l.8-3.2-2.9-1.5"/>',
    flame: '<path d="M12 22c4 0 7-2.8 7-6.8 0-3.5-2.3-5.6-3.5-8-.5 2-1.8 3-3 3.3.7-3.3-.6-6.5-3.5-8.5.3 3.2-1.3 5.3-3 7.3C4.8 10.8 5 12.5 5 15.2 5 19.2 8 22 12 22z"/><path d="M12 22c-1.7 0-3-1.3-3-3.2 0-2.3 2-3.3 2.5-5 1.6 1.3 3.5 2.7 3.5 5 0 1.9-1.3 3.2-3 3.2z"/>',
  };

  // icônes pleines (remplies) plutôt qu'au trait
  const FILLED = new Set(['bolt', 'flame', 'crown', 'star', 'burst']);

  function icon(name, opts = {}) {
    const size = opts.size || 18;
    const span = document.createElement('span');
    span.className = 'ico-svg' + (opts.class ? ' ' + opts.class : '');
    const filled = FILLED.has(name);
    span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" `
      + `fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${filled ? 1.2 : 2}" `
      + `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.help}</svg>`;
    if (opts.color) span.style.color = opts.color;
    if (opts.title) span.title = opts.title;
    return span;
  }

  window.Icons = { icon, has: n => !!P[n] };
})();
