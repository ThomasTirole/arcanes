// Mode « Arène » — côté navigateur (élève + vue spectateur du prof).
// Le rendu canvas est dans render.js ; les questions sont gérées par la page commune.
(function () {
  'use strict';

  const MOVE = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' };

  function feedLine(el, f) {
    return f.a
      ? el('div', null, el('b', { style: `color:${f.ac}` }, f.a), ' 💥 ', el('b', { style: `color:${f.vc}` }, f.v))
      : el('div', null, el('b', { style: `color:${f.vc}` }, f.v), ' est étourdi');
  }

  function pushFeed(feed, line, max) {
    feed.prepend(line);
    while (feed.children.length > max) feed.lastChild.remove();
    setTimeout(() => line.remove(), 5200);
  }

  // ------------------------------------------------------------------ élève
  function createPlayer(ctx) {
    const { socket, root, info, myId } = ctx;
    const { el } = ctx.ui;
    let slot = 0, myAmmo = [0, 0, 0], stuns = 0;
    const keys = { u: false, d: false, l: false, r: false };

    const canvas = el('canvas', { class: 'arena-canvas' });
    const spells = el('div', { class: 'spells' });
    const scoreEl = el('b', null, '0');
    const feed = el('div', { class: 'feed' });
    root.replaceChildren(
      canvas,
      el('div', { class: 'hud-top' }, spells, el('div', { class: 'pill arena-score' }, '💥 ', scoreEl, ' stuns')),
      feed,
      el('div', { class: 'hud-bottom' },
        el('kbd', null, '↑↓←→'), '/', el('kbd', null, 'WASD'), ' bouger  •  ',
        el('kbd', null, '1'), el('kbd', null, '2'), el('kbd', null, '3'), ' sorts  •  ',
        el('kbd', null, 'Espace'), '/clic lancer  •  ', el('kbd', null, 'R'), ' recharger'));

    const renderer = window.ArenaRender.createRenderer(canvas, info);
    const boxes = info.spells.map((s, i) => {
      const box = el('div', { class: 'spell', style: `--sc:${s.color}`, title: s.name },
        el('span', { class: 'key' }, String(i + 1)),
        el('div', { class: 'ico' }, s.icon),
        el('div', { class: 'ammo' }, `0/${s.max}`),
        el('div', { class: 'bar' }, el('i', { style: 'width:0%' })));
      spells.append(box);
      return box;
    });

    function updateHud() {
      info.spells.forEach((s, i) => {
        const box = boxes[i];
        box.classList.toggle('active', i === slot);
        box.classList.toggle('empty', myAmmo[i] <= 0);
        box.querySelector('.ammo').textContent = `${myAmmo[i]}/${s.max}`;
        box.querySelector('.bar i').style.width = `${(myAmmo[i] / s.max) * 100}%`;
      });
      scoreEl.textContent = stuns;
    }

    // ---- réseau
    socket.on('state', s => {
      renderer.pushState(s);
      const me = s.ps.find(p => p.i === myId);
      if (me) myAmmo = me.am;
    });
    socket.on('fx', e => renderer.addFx(e));
    socket.on('feed', f => pushFeed(feed, feedLine(el, f), 5));
    socket.on('you:scored', m => { stuns = m.stuns; ctx.banner(`💥 ${m.victim} étourdi !`, '#fde047'); });
    socket.on('you:stunned', m => ctx.banner(m.by ? `Étourdi par ${m.by} !` : 'Étourdi !', '#f87171'));

    // ---- clavier / souris
    const sendKeys = () => ctx.action('input', { keys });
    function releaseAll() {
      let changed = false;
      for (const k of Object.keys(keys)) if (keys[k]) { keys[k] = false; changed = true; }
      if (changed) sendKeys();
    }

    function cast(aim) {
      // si le sort choisi est vide, on prend automatiquement le suivant qui a des munitions
      if (myAmmo[slot] <= 0) {
        const next = myAmmo.findIndex(a => a > 0);
        if (next >= 0) slot = next;
      }
      ctx.action('cast', { slot, aim });
    }

    window.addEventListener('keydown', e => {
      if (!ctx.isPlaying() || ctx.quizOpen()) return;
      const m = MOVE[e.code];
      if (m) {
        e.preventDefault();
        if (!keys[m]) { keys[m] = true; sendKeys(); }
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); cast(null); return; }
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const i = Number(digit[2]) - 1;
        if (i < info.spells.length) slot = i;
        return;
      }
      if (e.code === 'KeyR') ctx.action('reload', {});
    });
    window.addEventListener('keyup', e => {
      const m = MOVE[e.code];
      if (m && keys[m]) { keys[m] = false; sendKeys(); }
    });
    window.addEventListener('blur', releaseAll);
    canvas.addEventListener('mousedown', e => {
      if (!ctx.isPlaying() || ctx.quizOpen() || e.button !== 0) return;
      e.preventDefault();
      cast(renderer.screenToWorld(e.clientX, e.clientY));
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ---- interface attendue par la page commune
    return {
      setPlayers: list => renderer.setPlayers(list),
      frame() { renderer.draw(myId); updateHud(); },
      hide: releaseAll,
      onStart() { stuns = 0; myAmmo = [0, 0, 0]; },
      onRejoin(res) { if (res.score) stuns = res.score.stuns || 0; },
      reasons: {
        revive: ['Réponds pour revenir dans l\'arène', '#fca5a5'],
        reload: ['Recharge tes sorts', '#93c5fd'],
      },
      onQuizOpen: releaseAll,
      quizHeader: () => el('div', { style: 'display:flex;gap:8px' }, info.spells.map((s, i) =>
        el('span', { class: 'pill', title: s.name }, s.icon, ' ', el('b', null, String(myAmmo[i]))))),
      onQuizResult(res) { if (res.ammo) myAmmo = res.ammo; },
      onQuizDone(res) { if (res.ammo) myAmmo = res.ammo; ctx.banner('Go !', '#fde68a'); },
    };
  }

  // ------------------------------------------------------------------ spectateur (prof)
  function createSpectator(ctx) {
    const { socket, root, info } = ctx;
    const { el } = ctx.ui;
    const canvas = el('canvas', { class: 'arena-spectator' });
    const feed = el('div', { class: 'feed', style: 'top:12px' });
    root.replaceChildren(canvas, feed);
    const renderer = window.ArenaRender.createRenderer(canvas, info);
    socket.on('state', s => renderer.pushState(s));
    socket.on('fx', e => renderer.addFx(e));
    socket.on('feed', f => pushFeed(feed, feedLine(el, f), 6));
    return {
      setPlayers: list => renderer.setPlayers(list),
      frame: () => renderer.draw(-1),
    };
  }

  window.ArcanesModes.register('arena', {
    css: ['arena.css'],
    scripts: ['render.js'],
    createPlayer,
    createSpectator,
  });
})();
