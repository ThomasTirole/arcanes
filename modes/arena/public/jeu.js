// Mode « Arène » — côté navigateur (élève + vue spectateur du prof).
// Le joueur local est simulé directement dans le navigateur (aucun délai ressenti) ;
// le serveur vérifie les positions et reste maître des dégâts.
(function () {
  'use strict';

  // WASD pour bouger, flèches pour tirer dans leur direction (façon « Binding of Isaac »)
  const MOVE = { KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r' };
  const AIM = { ArrowUp: 'u', ArrowDown: 'd', ArrowLeft: 'l', ArrowRight: 'r' };
  const SEND_EVERY = 33;     // ms entre deux envois de position (~30 par seconde)

  function feedLine(el, f) {
    return f.a
      ? el('div', null, el('b', { style: `color:${f.ac}` }, f.a), window.Icons.icon('burst', { size: 14, color: '#fde047' }), el('b', { style: `color:${f.vc}` }, f.v))
      : el('div', null, el('b', { style: `color:${f.vc}` }, f.v), ' est étourdi');
  }

  function pushFeed(feed, line, max) {
    feed.prepend(line);
    while (feed.children.length > max) feed.lastChild.remove();
    setTimeout(() => line.remove(), 5200);
  }

  function wireRenderer(socket, renderer) {
    socket.on('state', s => renderer.pushState(s));
    socket.on('dmg', e => renderer.onDamage(e));
    socket.on('proj', e => renderer.onProj(e));
    socket.on('projx', e => renderer.onProjEnd(e));
  }

  // ------------------------------------------------------------------ élève
  function createPlayer(ctx) {
    const { socket, root, info, myId } = ctx;
    const { el } = ctx.ui;
    const Phys = window.ArenaPhysics;
    const R = info.playerR;
    let slot = 0, myAmmo = [0, 0, 0], stuns = 0, shotSeq = 0;
    const lastCastAt = {};
    const keys = { u: false, d: false, l: false, r: false };
    // joueur local prédit
    const me = { x: 0, y: 0, dirX: 1, dirY: 0, aim: null, tp: -1, state: 'l', frozen: false, ready: false };
    let lastSent = 0, sentX = null, sentY = null, lastFrame = performance.now();
    let mouseAim = null, mouseAt = 0;

    const canvas = el('canvas', { class: 'arena-canvas' });
    const spells = el('div', { class: 'spells' });
    const scoreEl = el('b', null, '0');
    const feed = el('div', { class: 'feed' });
    root.replaceChildren(
      canvas,
      el('div', { class: 'hud-top' }, spells, el('div', { class: 'pill arena-score' }, ctx.ui.icon('burst', { size: 18, color: '#fde047' }), scoreEl, ' stuns')),
      feed,
      el('div', { class: 'hud-bottom' },
        el('kbd', null, 'WASD'), ' bouger  •  ', el('kbd', null, '↑↓←→'), ' tirer (maintenir)  •  ',
        el('kbd', null, '1'), el('kbd', null, '2'), el('kbd', null, '3'), ' sorts  •  ',
        el('kbd', null, 'Espace'), '/clic lancer  •  ', el('kbd', null, 'R'), ' recharger'));

    const renderer = window.ArenaRender.createRenderer(canvas, info);
    renderer.setLocal(myId, () => (me.ready && me.state === 'a' ? me : null));
    wireRenderer(socket, renderer);

    const boxes = info.spells.map((s, i) => {
      const box = el('div', { class: 'spell', style: `--sc:${s.color}`, title: s.name },
        el('span', { class: 'key' }, String(i + 1)),
        el('div', { class: 'ico' }, ctx.ui.icon(s.icon, { size: 28, color: s.color })),
        el('div', { class: 'ammo' }, `0/${s.max}`),
        el('div', { class: 'bar' }, el('i', { style: 'width:0%' })),
        el('div', { class: 'cd' }));
      spells.append(box);
      return box;
    });

    function updateHud(now) {
      info.spells.forEach((s, i) => {
        const box = boxes[i];
        box.classList.toggle('active', i === slot);
        box.classList.toggle('empty', myAmmo[i] <= 0);
        box.querySelector('.ammo').textContent = `${myAmmo[i]}/${s.max}`;
        box.querySelector('.bar i').style.width = `${(myAmmo[i] / s.max) * 100}%`;
        const left = Math.max(0, (lastCastAt[i] || 0) + s.cd - now);
        box.querySelector('.cd').style.height = `${(left / s.cd) * 100}%`;
      });
      scoreEl.textContent = stuns;
    }

    // ---- réseau
    socket.on('state', s => {
      const p = s.ps.find(q => q.i === myId);
      if (!p) return;
      me.state = p.s;
      me.frozen = !!p.f;
      if (p.t !== me.tp) {           // réapparition : on reprend la position donnée par le serveur
        me.tp = p.t; me.x = p.x; me.y = p.y; me.ready = true;
        sentX = null;
      } else if (Math.hypot(p.x - me.x, p.y - me.y) > 140) {
        // le serveur a refusé un déplacement (rare) : on se recale en douceur
        me.x += (p.x - me.x) * 0.5; me.y += (p.y - me.y) * 0.5;
      }
    });
    socket.on('ammo', a => { myAmmo = a; });
    socket.on('castfail', m => renderer.onCastFail(m.shot));
    socket.on('fx', e => { if (!(e.t === 'nova' && e.o === myId)) renderer.addFx(e); });
    socket.on('feed', f => pushFeed(feed, feedLine(el, f), 5));
    socket.on('you:scored', m => { stuns = m.stuns; ctx.banner(`${m.victim} étourdi !`, '#fde047'); });
    socket.on('you:stunned', m => ctx.banner(m.by ? `Étourdi par ${m.by} !` : 'Étourdi !', '#f87171'));

    // ---- clavier / souris
    const aimKeys = { u: false, d: false, l: false, r: false };
    function releaseAll() { for (const k of Object.keys(keys)) keys[k] = false; for (const k of Object.keys(aimKeys)) aimKeys[k] = false; }

    // direction donnée par les flèches (diagonales comprises), ou null
    function arrowDir() {
      const x = (aimKeys.r ? 1 : 0) - (aimKeys.l ? 1 : 0), y = (aimKeys.d ? 1 : 0) - (aimKeys.u ? 1 : 0);
      if (!x && !y) return null;
      const d = Math.hypot(x, y);
      return { x: x / d, y: y / d };
    }
    function castArrows() {
      const d = arrowDir();
      if (d) cast({ x: me.x + d.x * 100, y: me.y + d.y * 100 });
    }

    function cast(aimPoint) {
      if (!me.ready || me.state !== 'a' || me.frozen) return;
      // si le sort choisi est vide, on prend automatiquement le suivant qui a des munitions
      if (myAmmo[slot] <= 0) {
        const next = myAmmo.findIndex(a => a > 0);
        if (next < 0) return;
        slot = next;
      }
      const s = info.spells[slot];
      const now = performance.now();
      if (now - (lastCastAt[slot] || 0) < s.cd) return;
      lastCastAt[slot] = now;

      let dx = me.dirX, dy = me.dirY;
      if (aimPoint) {
        const ax = aimPoint.x - me.x, ay = aimPoint.y - me.y, d = Math.hypot(ax, ay);
        if (d > 1) { dx = ax / d; dy = ay / d; }
      }
      const shot = ++shotSeq;
      myAmmo[slot]--;
      // effet immédiat, sans attendre le serveur
      if (s.kind === 'proj') {
        const speed = s.speed;
        renderer.localCast('proj', {
          s: slot, o: myId, sh: shot,
          x: me.x + dx * (R + s.r + 2), y: me.y + dy * (R + s.r + 2), vx: dx * speed, vy: dy * speed,
        });
      } else if (s.kind === 'nova') {
        renderer.localCast('nova', { x: me.x, y: me.y, r: s.r, c: s.color });
      }
      sendPos(true);
      ctx.action('cast', { slot, aim: { x: me.x + dx * 100, y: me.y + dy * 100 }, shot });
    }

    window.addEventListener('keydown', e => {
      if (!ctx.isPlaying() || ctx.quizOpen()) return;
      const m = MOVE[e.code];
      if (m) { e.preventDefault(); keys[m] = true; return; }
      const a = AIM[e.code];
      if (a) {
        e.preventDefault();
        aimKeys[a] = true;
        // le Gel (sort de zone) part une fois par appui ; les projectiles partent en continu (voir simulate)
        if (!e.repeat) castArrows();
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) cast(null); return; }
      const digit = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (digit) {
        const i = Number(digit[2]) - 1;
        if (i < info.spells.length) slot = i;
        return;
      }
      if (e.code === 'KeyR') ctx.action('reload', {});
    });
    window.addEventListener('keyup', e => {
      const m = MOVE[e.code]; if (m) keys[m] = false;
      const a = AIM[e.code]; if (a) aimKeys[a] = false;
    });
    window.addEventListener('blur', releaseAll);
    canvas.addEventListener('mousedown', e => {
      if (!ctx.isPlaying() || ctx.quizOpen() || e.button !== 0) return;
      e.preventDefault();
      cast(renderer.screenToWorld(e.clientX, e.clientY));
    });
    canvas.addEventListener('mousemove', e => {
      mouseAim = renderer.screenToWorld(e.clientX, e.clientY);
      mouseAt = performance.now();
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ---- simulation locale + envoi de la position
    function sendPos(force) {
      const now = performance.now();
      if (!me.ready || me.state !== 'a') return;
      if (!force && now - lastSent < SEND_EVERY) return;
      if (!force && sentX === Math.round(me.x) && sentY === Math.round(me.y)) return;
      lastSent = now;
      sentX = Math.round(me.x); sentY = Math.round(me.y);
      ctx.action('pos', { x: sentX, y: sentY, dx: +me.dirX.toFixed(3), dy: +me.dirY.toFixed(3), tp: me.tp });
    }

    function simulate() {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      if (me.ready && me.state === 'a' && !me.frozen && !ctx.quizOpen()) {
        Phys.step(me, keys, info.speed, dt, R, info.map);
      }
      // orientation du bâton : flèches, sinon souris récente, sinon direction de marche
      const moving = keys.u || keys.d || keys.l || keys.r;
      const ad = arrowDir();
      if (ad) {
        me.aim = Math.atan2(ad.y, ad.x);
        // tir continu tant qu'une flèche est maintenue (projectiles uniquement)
        if (info.spells[slot].kind === 'proj' && !ctx.quizOpen()) castArrows();
      } else {
        me.aim = mouseAim && now - mouseAt < 1500 && !moving ? Math.atan2(mouseAim.y - me.y, mouseAim.x - me.x) : null;
      }
      sendPos(false);
    }

    // ---- interface attendue par la page commune
    return {
      setPlayers: list => renderer.setPlayers(list),
      frame() {
        simulate();
        renderer.draw(myId, { orb: info.spells[slot].color, follow: true });
        updateHud(performance.now());
      },
      hide: releaseAll,
      onStart() { stuns = 0; myAmmo = [0, 0, 0]; me.ready = false; me.tp = -1; },
      onRejoin(res) { if (res.score) stuns = res.score.stuns || 0; },
      reasons: {
        revive: ['Réponds pour revenir dans l\'arène', '#fca5a5'],
        reload: ['Recharge tes sorts', '#93c5fd'],
      },
      onQuizOpen: releaseAll,
      quizHeader: () => el('div', { style: 'display:flex;gap:8px' }, info.spells.map((s, i) =>
        el('span', { class: 'pill', title: s.name }, ctx.ui.icon(s.icon, { size: 18, color: s.color }), el('b', null, String(myAmmo[i]))))),
      // « +6 Éclair » affiché avec les icônes des sorts
      renderReward: res => (res.gained ? el('span', { class: 'reward' }, res.gained.map((g, i) => (g > 0
        ? el('span', { class: 'reward-item' }, `+${g}`, ctx.ui.icon(info.spells[i].icon, { size: 22, color: info.spells[i].color }))
        : null))) : ''),
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
    wireRenderer(socket, renderer);
    socket.on('fx', e => renderer.addFx(e));
    socket.on('feed', f => pushFeed(feed, feedLine(el, f), 6));
    return {
      setPlayers: list => renderer.setPlayers(list),
      frame: () => renderer.draw(-1),
    };
  }

  window.ArcanesModes.register('arena', {
    css: ['arena.css'],
    scripts: ['physics.js', 'render.js'],
    createPlayer,
    createSpectator,
  });
})();
