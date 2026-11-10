// Mode « FPS » — côté navigateur. Le jeu 3D tourne dans une iframe (index.html?embed=1) ;
// ce fichier fait le lien entre l'iframe et la partie (questions, munitions, classement).
(function () {
  'use strict';

  function createPlayer(ctx) {
    const { socket, root } = ctx;
    const { el } = ctx.ui;
    const frame = el('iframe', {
      src: '/modes/fps/index.html?embed=1', class: 'fps-frame', allow: 'fullscreen; pointer-lock', title: 'Jeu FPS',
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

    return {
      onStart() { kills = 0; send({ t: 'reset' }); },
      reasons: {
        burst: ['Quiz : gagne des munitions', '#fde68a'],
        revive: ['Étourdi ! Réponds pour revenir', '#fca5a5'],
        reload: ['Plus de munitions : recharge', '#93c5fd'],
      },
      onQuizOpen() {
        flushAmmo();
        send({ t: 'pause' });
        try { frame.blur(); window.focus(); } catch (e) { /* rien */ }
      },
      quizHeader: () => el('span', { class: 'pill' }, ctx.ui.icon('burst', { size: 16, color: '#fde047' }), ` ${kills} robots`),
      onQuizResult(res) { if (res.ammo) send({ t: 'ammo', ammo: res.ammo }); },
      onQuizDone(res) {
        if (res.ammo) send({ t: 'ammo', ammo: res.ammo });
        if (res.revive) send({ t: 'revive' });
        send({ t: 'resume' });
        setTimeout(() => { try { frame.focus(); } catch (e) { /* rien */ } }, 50);
      },
      hide() { send({ t: 'pause' }); },
    };
  }

  // Vue du prof : grand classement en direct (chaque élève a sa propre arène)
  function createSpectator(ctx) {
    const { socket, root } = ctx;
    const { el, dot } = ctx.ui;
    const board = el('div', { class: 'fps-board' });
    const feed = el('div', { class: 'feed', style: 'top:12px' });
    root.replaceChildren(el('div', { class: 'fps-spec' },
      el('div', { class: 'fps-spec-title' }, ctx.ui.icon('bolt', { size: 26, color: '#a78bfa' }), 'Robots étourdis'), board), feed);
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

  window.ArcanesModes.register('fps', { css: ['fps.css'], scripts: [], createPlayer, createSpectator });
})();
