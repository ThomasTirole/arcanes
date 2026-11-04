// Rendu de l'arène sur canvas — partagé entre l'élève et la vue spectateur du prof.
(function () {
  'use strict';

  function createRenderer(canvas, info) {
    const ctx = canvas.getContext('2d');
    const { map, spells, playerR, maxHp } = info;
    let meta = new Map();      // id -> { name, color }
    let state = null;          // dernier état reçu
    const disp = new Map();    // id -> position affichée (interpolée)
    const fx = [];
    let scale = 1, offX = 0, offY = 0, lastFrame = performance.now();

    // décor généré une fois (petites touffes d'herbe / cailloux)
    const deco = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 140; i++) deco.push({ x: rnd() * map.w, y: rnd() * map.h, r: 2 + rnd() * 4, a: 0.05 + rnd() * 0.08 });

    function setPlayers(list) {
      meta = new Map(list.map(p => [p.id, p]));
    }

    function pushState(s) {
      state = s;
      for (const p of s.ps) {
        const d = disp.get(p.i);
        if (!d || p.s !== 'a' && p.s !== 's' || Math.hypot(d.x - p.x, d.y - p.y) > 160) {
          disp.set(p.i, { x: p.x, y: p.y });
        }
      }
    }

    function addFx(e) { fx.push({ ...e, born: performance.now() }); }

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      scale = Math.min(w / map.w, h / map.h) * dpr;
      offX = (canvas.width - map.w * scale) / 2;
      offY = (canvas.height - map.h * scale) / 2;
    }

    function screenToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      return {
        x: ((clientX - rect.left) * dpr - offX) / scale,
        y: ((clientY - rect.top) * dpr - offY) / scale,
      };
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawFloor() {
      const g = ctx.createRadialGradient(map.w / 2, map.h / 2, 100, map.w / 2, map.h / 2, map.w * 0.7);
      g.addColorStop(0, '#2f4a3a');
      g.addColorStop(1, '#1d3027');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, map.w, map.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= map.w; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, map.h); ctx.stroke(); }
      for (let y = 0; y <= map.h; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(map.w, y); ctx.stroke(); }
      for (const d of deco) {
        ctx.fillStyle = `rgba(190,255,200,${d.a})`;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill();
      }
      // cercle central
      ctx.strokeStyle = 'rgba(200,180,255,0.12)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(map.w / 2, map.h / 2, 260, 0, Math.PI * 2); ctx.stroke();
      // bordure
      ctx.strokeStyle = '#a78bfa';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, map.w - 6, map.h - 6);
    }

    function drawObstacles() {
      for (const o of map.obstacles) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        roundRect(o.x + 6, o.y + 8, o.w, o.h, 12); ctx.fill();
        ctx.fillStyle = '#5b5f73';
        roundRect(o.x, o.y, o.w, o.h, 12); ctx.fill();
        ctx.fillStyle = '#737891';
        roundRect(o.x + 4, o.y + 4, o.w - 8, o.h * 0.45, 9); ctx.fill();
      }
    }

    function drawPlayer(p, d, isMe, now) {
      const m = meta.get(p.i) || { name: '?', color: '#999' };
      const stunned = p.s === 's';
      ctx.save();
      if (p.v && Math.floor(now / 120) % 2 === 0) ctx.globalAlpha = 0.45;

      // ombre
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(d.x, d.y + playerR * 0.8, playerR, playerR * 0.4, 0, 0, Math.PI * 2); ctx.fill();

      if (isMe) {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(d.x, d.y, playerR + 8, 0, Math.PI * 2); ctx.stroke();
      }

      // corps
      ctx.fillStyle = stunned ? '#6b7280' : m.color;
      ctx.beginPath(); ctx.arc(d.x, d.y, playerR, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // direction (petite baguette)
      const a = p.d / 100;
      if (!stunned) {
        ctx.strokeStyle = '#fde68a';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(d.x + Math.cos(a) * (playerR - 4), d.y + Math.sin(a) * (playerR - 4));
        ctx.lineTo(d.x + Math.cos(a) * (playerR + 10), d.y + Math.sin(a) * (playerR + 10));
        ctx.stroke();
        // yeux
        ctx.fillStyle = '#111';
        const ex = Math.cos(a), ey = Math.sin(a), px = -ey, py = ex;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(d.x + ex * 7 + px * 6 * s, d.y + ey * 7 + py * 6 * s, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (p.f) {
        ctx.fillStyle = 'rgba(103,232,249,0.45)';
        ctx.beginPath(); ctx.arc(d.x, d.y, playerR + 4, 0, Math.PI * 2); ctx.fill();
      }
      if (stunned) {
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        const t = now / 200;
        for (let k = 0; k < 3; k++) {
          const ang = t + (k * Math.PI * 2) / 3;
          ctx.fillText('⭐', d.x + Math.cos(ang) * 22, d.y - 26 + Math.sin(ang) * 6);
        }
      }
      ctx.restore();

      // pseudo + vie
      ctx.font = `600 ${isMe ? 20 : 18}px Fredoka, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(m.name, d.x, d.y - playerR - 18);
      ctx.fillStyle = '#fff';
      ctx.fillText(m.name, d.x, d.y - playerR - 18);
      const bw = 44, bh = 6, bx = d.x - bw / 2, by = d.y - playerR - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const ratio = Math.max(0, p.h / maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(bx, by, bw * ratio, bh);
    }

    function drawProjectiles() {
      if (!state) return;
      for (const [x, y, k] of state.pr) {
        const s = spells[k];
        ctx.save();
        ctx.shadowColor = s.color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(x, y, s.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(x, y, s.r * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    function drawFx(now) {
      for (let i = fx.length - 1; i >= 0; i--) {
        const e = fx[i];
        const age = now - e.born;
        const life = e.t === 'stun' ? 900 : e.t === 'hit' ? 250 : 450;
        if (age > life) { fx.splice(i, 1); continue; }
        const k = age / life;
        ctx.save();
        ctx.globalAlpha = 1 - k;
        if (e.t === 'nova' || e.t === 'boom') {
          ctx.fillStyle = e.c;
          ctx.globalAlpha = (1 - k) * 0.35;
          ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.3 + 0.7 * k), 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1 - k;
          ctx.strokeStyle = e.c;
          ctx.lineWidth = 5;
          ctx.stroke();
        } else if (e.t === 'hit') {
          ctx.strokeStyle = e.c;
          ctx.lineWidth = 3;
          for (let j = 0; j < 6; j++) {
            const a = (j / 6) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(a) * 6, e.y + Math.sin(a) * 6);
            ctx.lineTo(e.x + Math.cos(a) * (10 + 14 * k), e.y + Math.sin(a) * (10 + 14 * k));
            ctx.stroke();
          }
        } else if (e.t === 'stun') {
          ctx.font = 'bold 30px Fredoka, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.lineWidth = 5;
          ctx.strokeStyle = '#000';
          ctx.strokeText('STUN !', e.x, e.y - 40 - 30 * k);
          ctx.fillStyle = '#fde047';
          ctx.fillText('STUN !', e.x, e.y - 40 - 30 * k);
        }
        ctx.restore();
      }
    }

    function draw(myId) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;
      resize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0f0b1e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, offX, offY);

      drawFloor();
      drawObstacles();
      if (state) {
        const k = Math.min(1, dt * 14);
        const visible = state.ps.filter(p => p.s === 'a' || p.s === 's');
        // le joueur local est dessiné en dernier (au-dessus)
        visible.sort((a, b) => (a.i === myId) - (b.i === myId) || a.y - b.y);
        for (const p of visible) {
          const d = disp.get(p.i) || { x: p.x, y: p.y };
          d.x += (p.x - d.x) * k;
          d.y += (p.y - d.y) * k;
          disp.set(p.i, d);
          drawPlayer(p, d, p.i === myId, now);
        }
      }
      drawProjectiles();
      drawFx(now);
    }

    return { setPlayers, pushState, addFx, draw, screenToWorld, getState: () => state };
  }

  window.ArenaRender = { createRenderer };
})();
