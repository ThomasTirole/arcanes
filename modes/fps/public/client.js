// Mode « FPS » — côté navigateur. Le jeu 3D tourne dans une iframe (index.html?embed=1) ;
// ce fichier fait le lien entre l'iframe et la partie (questions, munitions, classement).
(function () {
  'use strict';

  function createPlayer(ctx) {
    const { socket, root } = ctx;
    const { el } = ctx.ui;
    const pvp = ctx.info && ctx.info.variant === 'pvp';
    const frame = el('iframe', {
      src: '/modes/fps/index.html?embed=1' + (pvp ? '&mode=pvp' : ''), class: 'fps-frame', allow: 'fullscreen; pointer-lock', title: 'Jeu FPS',
    });
    root.replaceChildren(frame);
    let ready = false, kills = 0, ammoTimer = 0, lastAmmo = null;
    const queue = [];
    const send = msg => {
      if (ready && frame.contentWindow) frame.contentWindow.postMessage({ arcanesFps: true, ...msg }, location.origin);
      else queue.push(msg);
    };

    window.addEventListener('message', ev => {
      if (ev.origin !== location.origin || ev.source !== frame.contentWindow || !ev.data || !ev.data.arcanesFps) return;
      const m = ev.data;
      if (m.t === 'ready') {
        ready = true;
        while (queue.length) send(queue.shift());
      } else if (m.t === 'kill') {
        kills++;
        ctx.action('kill', { head: !!m.head, air: !!m.air, how: String(m.how || '') });
      } else if (m.t === 'down') {
        flushAmmo();
        ctx.action('down', {});
      } else if (m.t === 'empty' || m.t === 'reload') {
        flushAmmo();
        ctx.action(m.t, {});
      } else if (pvp && PVP_ACTIONS.includes(m.t)) {
        const { t, arcanesFps, ...data } = m;
        ctx.action(t, data);
      } else if (m.t === 'ammoLeft') {
        lastAmmo = m.ammo;
        clearTimeout(ammoTimer);
        ammoTimer = setTimeout(flushAmmo, 800);
      }
    });

    function flushAmmo() {
      clearTimeout(ammoTimer);
      if (lastAmmo) { ctx.action('ammo', { ammo: lastAmmo }); lastAmmo = null; }
    }

    socket.on('fps:ammo', a => send({ t: 'ammo', ammo: a }));
    if (pvp) {
      // événements de la partie commune → jeu (seulement quand l'iframe est prête : pas de file d'attente)
      const live = msg => { if (ready && frame.contentWindow) frame.contentWindow.postMessage({ arcanesFps: true, ...msg }, location.origin); };
      socket.on('fps:state', ps => live({ t: 'state', ps }));
      socket.on('fps:shot', m => live({ t: 'shot', ...m }));
      socket.on('fps:rocket', m => live({ t: 'rocket', ...m }));
      socket.on('fps:boom', m => live({ t: 'boom', ...m }));
      socket.on('fps:hit', m => send({ t: 'hit', ...m }));
      socket.on('fps:hitconfirm', m => send({ t: 'hitconfirm', ...m }));
      socket.on('you:scored', m => { kills = m.stuns; send({ t: 'scored', ...m }); });
    }

    return {
      setPlayers(players) {
        if (pvp) send({ t: 'roster', me: ctx.myId, players: players.map(p => ({ id: p.id, name: p.name, color: p.color })) });
      },
      onStart() { kills = 0; send({ t: 'reset' }); },
      reasons: {
        burst: ['Quiz : recharge tes bâtons', '#fde68a'],
        revive: ['Étourdi ! Réponds pour revenir', '#fca5a5'],
        reload: ['Bâtons vides : recharge', '#93c5fd'],
      },
      onQuizOpen() {
        flushAmmo();
        send({ t: 'pause' });
        try { frame.blur(); window.focus(); } catch (e) { /* rien */ }
      },
      quizHeader: () => el('span', { class: 'pill' }, ctx.ui.icon('sword', { size: 16, color: '#f0d79a' }), pvp ? ` ${kills} étourdis` : ` ${kills} brigands`),
      onQuizResult(res) { if (res.ammo) send({ t: 'ammo', ammo: res.ammo }); },
      onQuizDone(res) {
        if (res.ammo) send({ t: 'ammo', ammo: res.ammo });
        if (res.revive) send({ t: 'revive', spawn: res.spawn });
        send({ t: 'resume' });
        setTimeout(() => { try { frame.focus(); } catch (e) { /* rien */ } }, 50);
      },
      hide() { send({ t: 'pause' }); },
    };
  }

  const PVP_ACTIONS = ['pos', 'shoot', 'rocket', 'boom', 'punch', 'guard'];

  // Vue du prof : grand classement en direct (+ carte vue du dessus en PvP)
  function createSpectator(ctx) {
    if (ctx.info && ctx.info.variant === 'pvp') return createPvpSpectator(ctx);
    const { socket, root } = ctx;
    const { el, dot } = ctx.ui;
    const board = el('div', { class: 'fps-board' });
    const feed = el('div', { class: 'feed', style: 'top:12px' });
    root.replaceChildren(el('div', { class: 'fps-spec' },
      el('div', { class: 'fps-spec-title' }, ctx.ui.icon('castle', { size: 26, color: '#e3b04b' }), 'Brigands étourdis'), board), feed);
    socket.on('host:stats', rows => {
      const sorted = [...rows].sort((a, b) => b.kills - a.kills || b.correct - a.correct);
      const max = Math.max(1, ...sorted.map(r => r.kills));
      board.replaceChildren(...sorted.slice(0, 20).map((r, i) => el('div', { class: 'fps-row' },
        el('span', { class: 'fps-rank' }, String(i + 1)), dot(r.color, 16), el('span', { class: 'fps-name' }, r.name),
        el('div', { class: 'fps-bar' }, el('i', { style: `width:${(r.kills / max) * 100}%;background:${r.color}` })),
        el('b', { class: 'fps-num' }, String(r.kills)))));
    });
    socket.on('feed', f => {
      const line = el('div', null, el('b', { style: `color:${f.ac}` }, f.a), ` a étourdi ${f.v}`);
      feed.prepend(line);
      while (feed.children.length > 6) feed.lastChild.remove();
      setTimeout(() => line.remove(), 5000);
    });
    return {};
  }

  // ---------------------------------------------------------------- spectateur PvP
  // Plan de l'arène (mêmes boîtes que game.js, vues du dessus) : x, z, largeur, profondeur, hauteur
  const ARENA = 30;
  const LEVEL = [
    [0, 0, 10, 10, 2.4], [-7.7, -1.5, 5.4, 3, 1.6], [7.7, 1.5, 5.4, 3, 1.6],
    [-14, -14, 2.2, 2.2, 7], [14, -14, 2.2, 2.2, 7], [-14, 14, 2.2, 2.2, 7], [14, 14, 2.2, 2.2, 7],
    [-8, -20, 1.6, 1.6, 1.6], [-6.5, -20, 1.2, 1.2, 1.2], [9, 19, 1.6, 1.6, 1.6], [20, -6, 1.6, 1.6, 1.6],
    [-21, 7, 1.6, 1.6, 1.6], [-20, 8.6, 1.1, 1.1, 1.1], [22, 10, 1.2, 1.2, 1.2],
    [-22, -22, 6, 6, 3.6], [-22, -15.4, 2.4, 7.2, 2], [22, 22, 6, 6, 3.6], [22, 15.4, 2.4, 7.2, 2],
    [0, -16, 8, 0.8, 1.3], [0, 16, 8, 0.8, 1.3], [-16, 0, 0.8, 8, 1.3], [16, 0, 0.8, 8, 1.3],
  ];

  function createPvpSpectator(ctx) {
    const { socket, root } = ctx;
    const { el, dot } = ctx.ui;
    const canvas = el('canvas', { class: 'fps-map' });
    const feed = el('div', { class: 'feed', style: 'top:12px' });
    // le classement en direct est déjà affiché à droite par la page du prof : ici, seulement la carte
    root.replaceChildren(el('div', { class: 'fps-pvp' }, canvas), feed);
    const g = canvas.getContext('2d');
    const players = new Map();          // id → { name, color }
    let snaps = [];                      // deux derniers états pour interpoler
    const fx = [];                       // explosions et tirs à dessiner

    socket.on('fps:state', ps => { snaps.push({ t: performance.now(), ps }); if (snaps.length > 3) snaps.shift(); });
    socket.on('fps:boom', m => fx.push({ kind: 'boom', x: m.p[0], z: m.p[2], t: performance.now() }));
    socket.on('fps:shot', m => {
      const s = snaps[snaps.length - 1];
      const me = s && s.ps.find(p => p.i === m.id);
      if (me && m.e) fx.push({ kind: 'shot', x: me.x, z: me.z, x2: m.e[0], z2: m.e[2], t: performance.now() });
    });
    socket.on('host:stats', rows => { for (const r of rows) players.set(r.id, { name: r.name, color: r.color }); });
    socket.on('feed', f => {
      const line = el('div', null, el('b', { style: `color:${f.ac}` }, f.a), ' a étourdi ', el('b', { style: `color:${f.vc}` }, f.v));
      feed.prepend(line);
      while (feed.children.length > 6) feed.lastChild.remove();
      setTimeout(() => line.remove(), 5000);
    });

    function frame() {
      const box = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const W = Math.round(box.width * dpr), H = Math.round(box.height * dpr);
      if (!W || !H) return;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const size = Math.min(W, H) * 0.94;
      const k = size / (ARENA * 2);
      const ox = W / 2, oz = H / 2;
      const X = x => ox + x * k, Z = z => oz + z * k;
      g.clearRect(0, 0, W, H);
      // sol + enceinte
      g.fillStyle = '#6b5a45'; g.fillRect(X(-ARENA), Z(-ARENA), size, size);
      g.strokeStyle = '#b4492f'; g.lineWidth = 6 * dpr; g.strokeRect(X(-ARENA), Z(-ARENA), size, size);
      for (const [x, z, w, d, h] of LEVEL) {
        g.fillStyle = h > 5 ? '#3d2f24' : h > 2 ? '#8a7258' : '#7a6650';
        g.fillRect(X(x - w / 2), Z(z - d / 2), w * k, d * k);
      }
      const now = performance.now();
      // tirs et explosions
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i], age = (now - f.t) / 1000;
        if (age > 0.6) { fx.splice(i, 1); continue; }
        if (f.kind === 'boom') {
          g.strokeStyle = `rgba(249,115,22,${1 - age / 0.6})`; g.lineWidth = 3 * dpr;
          g.beginPath(); g.arc(X(f.x), Z(f.z), (1 + age * 6) * k, 0, Math.PI * 2); g.stroke();
        } else {
          g.strokeStyle = `rgba(253,230,138,${1 - age / 0.6})`; g.lineWidth = 2 * dpr;
          g.beginPath(); g.moveTo(X(f.x), Z(f.z)); g.lineTo(X(f.x2), Z(f.z2)); g.stroke();
        }
      }
      // joueurs (interpolés entre les deux derniers états)
      const a = snaps[snaps.length - 2], b = snaps[snaps.length - 1];
      if (!b) return;
      const t = Math.min(1, a ? (now - b.t) / Math.max(1, b.t - a.t) : 1);
      const prev = new Map(a ? a.ps.map(p => [p.i, p]) : []);
      g.font = `bold ${13 * dpr}px system-ui, sans-serif`; g.textAlign = 'center';
      for (const p of b.ps) {
        const q = prev.get(p.i) || p;
        const x = q.x + (p.x - q.x) * t, z = q.z + (p.z - q.z) * t;
        const info = players.get(p.i) || { name: '?', color: '#fff' };
        const r = 7 * dpr + Math.max(0, p.y) * 1.2 * dpr;      // plus gros quand il est en l'air
        g.globalAlpha = p.v ? 0.5 : 1;
        g.fillStyle = info.color;
        g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#000'; g.lineWidth = 2 * dpr; g.stroke();
        // direction du regard
        g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(X(x), Z(z));
        g.lineTo(X(x) - Math.sin(p.w) * r * 1.8, Z(z) - Math.cos(p.w) * r * 1.8); g.stroke();
        // vie
        g.fillStyle = '#111'; g.fillRect(X(x) - 14 * dpr, Z(z) + r + 3 * dpr, 28 * dpr, 4 * dpr);
        g.fillStyle = p.h > 50 ? '#22c55e' : p.h > 25 ? '#eab308' : '#ef4444';
        g.fillRect(X(x) - 14 * dpr, Z(z) + r + 3 * dpr, 28 * dpr * (p.h / 100), 4 * dpr);
        g.fillStyle = '#fff'; g.fillText(info.name, X(x), Z(z) - r - 5 * dpr);
        g.globalAlpha = 1;
      }
    }

    return {
      frame,
      setPlayers(list) { for (const p of list) players.set(p.id, { name: p.name, color: p.color }); },
    };
  }

  window.ArcanesModes.register('fps', { css: ['fps.css'], scripts: [], createPlayer, createSpectator });
})();
