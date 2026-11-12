// Petites fonctions partagées entre l'élève, le prof et les modes de jeu.
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);

  // Création d'élément sans innerHTML (les pseudos et questions ne sont jamais interprétés comme du HTML)
  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      e.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function show(id) {
    document.querySelectorAll('body > section').forEach(s => s.classList.toggle('hidden', s.id !== id));
  }

  function dot(color, size) {
    return el('span', { class: 'dot', style: `background:${color}${size ? `;width:${size}px;height:${size}px` : ''}` });
  }

  function pctColor(v) { return v >= 70 ? '#3b6b2a' : v >= 40 ? '#a8741e' : '#8f2314'; }   // sinople, or, gueules

  // Texte court du score principal d'un joueur, ex. « 3 stuns »
  function mainScore(row, columns) {
    const c = columns && columns[0];
    return c ? `${row[c.key]} ${c.label.toLowerCase()}` : '';
  }

  function renderPodium(container, podium, columns) {
    container.replaceChildren();
    for (const i of [1, 0, 2]) { // 2e, 1er, 3e
      const r = podium[i];
      if (!r) continue;
      container.append(el('div', { class: `step p${i + 1}` },
        el('div', { class: 'who' }, dot(r.color), r.name,
          el('span', { class: 'sub' }, `${mainScore(r, columns)} · ${r.accuracy}%`)),
        el('div', { class: 'block' }, String(i + 1))));
    }
  }

  // Tableau des scores triable : colonnes du mode + précision + réponses
  function renderBoard(table, rows, opts = {}) {
    const cols = [
      { key: 'name', label: 'Nom' },
      ...(opts.columns || []).map(c => ({ ...c, num: true })),
      { key: 'accuracy', label: 'Précision', num: true, fmt: v => `${v}%` },
      { key: 'answered', label: 'Réponses', num: true, fmt: (v, r) => `${r.correct}/${v}` },
    ];
    let sortKey = opts.sortKey || (cols[1] && cols[1].key) || 'accuracy';
    let dir = -1;

    function paint() {
      const sorted = [...rows].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        if (typeof va === 'string') return dir * va.localeCompare(vb, 'fr');
        return dir * (va - vb) || b.accuracy - a.accuracy;
      });
      table.replaceChildren(
        el('thead', null, el('tr', null, el('th', null, '#'), cols.map(c =>
          el('th', {
            class: `sortable${c.num ? ' num' : ''}`,
            onclick: () => { if (sortKey === c.key) dir = -dir; else { sortKey = c.key; dir = c.key === 'name' ? 1 : -1; } paint(); },
          }, c.label + (sortKey === c.key ? (dir < 0 ? ' ▼' : ' ▲') : ''))))),
        el('tbody', null, sorted.map((r, i) => el('tr', { class: r.id === opts.meId ? 'me' : '' },
          el('td', null, String(i + 1)),
          cols.map(c => c.key === 'name'
            ? el('td', null, el('span', { class: 'namecell' }, dot(r.color), r.name, opts.bestId === r.id ? window.Icons.icon('crown', { size: 16, color: '#b0832a', title: 'Meilleure précision' }) : ''))
            : el('td', { class: 'num' }, c.fmt ? c.fmt(r[c.key], r) : String(r[c.key])))))));
    }
    paint();
  }

  // Liste des contrôles d'un mode (salle d'attente)
  function renderHelp(container, help) {
    container.replaceChildren();
    if (!help) return;
    container.append(
      el('div', { style: 'font-weight:700;margin-bottom:8px' }, 'Comment jouer'),
      el('div', { class: 'muted' }, help.text || ''),
      el('div', { class: 'row', style: 'margin-top:12px;justify-content:center;gap:24px' },
        (help.controls || []).map(([keys, what]) => el('span', null,
          keys.split(' / ').map((k, i) => [i ? ' / ' : '', el('kbd', null, k)]), ` ${what}`))));
  }

  // Bandeau animé au centre de l'écran
  function banner(host, text, color) {
    const b = el('div', { class: 'banner', style: `color:${color}` }, text);
    host.replaceChildren(b);
    setTimeout(() => b.remove(), 950);
  }

  // ---- chargement d'un mode de jeu (/modes/<id>/client.js) -----------------
  const defs = {};
  window.ArcanesModes = { register(id, def) { defs[id] = def; } };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Impossible de charger ' + src));
      document.head.append(s);
    });
  }

  async function loadMode(id) {
    if (defs[id] && defs[id]._ready) return defs[id];
    if (!defs[id]) await loadScript(`/modes/${id}/client.js`);
    const def = defs[id];
    if (!def) throw new Error(`Le mode « ${id} » ne s'est pas enregistré.`);
    for (const css of def.css || []) {
      document.head.append(el('link', { rel: 'stylesheet', href: `/modes/${id}/${css}` }));
    }
    for (const js of def.scripts || []) await loadScript(`/modes/${id}/${js}`);
    def._ready = true;
    return def;
  }

  const icon = (name, opts) => window.Icons.icon(name, opts);

  // icône d'un mode de jeu (nom d'icône SVG), suivie de son nom
  function modeLabel(mode) {
    return el('span', { class: 'modelabel' }, icon(mode.icon || 'gamepad', { size: 18 }), mode.name);
  }

  // remplace les <span data-icon="…"> statiques des pages HTML
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach(sp => {
      const ic = icon(sp.dataset.icon, { size: Number(sp.dataset.size) || 18 });
      if (sp.getAttribute('style')) ic.setAttribute('style', sp.getAttribute('style'));
      sp.replaceWith(ic);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => hydrateIcons());
  else hydrateIcons();

  window.UI = { $, el, fmtTime, show, dot, pctColor, mainScore, renderPodium, renderBoard, renderHelp, banner, loadMode, icon, modeLabel };
})();
