// Rendu de l'arène sur canvas — partagé entre l'élève et la vue spectateur du prof.
// - décor pré-dessiné une fois (dalles de pierre, blocs, runes)
// - mages dessinés en vectoriel (robe, chapeau, bâton) avec animation de marche
// - autres joueurs interpolés (affichés ~110 ms dans le passé, donc parfaitement fluides)
// - projectiles animés localement à 60 images/s avec traînées lumineuses
// - particules, onde de choc, chiffres de dégâts, flash d'impact, secousses d'écran
(function () {
  'use strict';

  const INTERP_DELAY = 110;      // ms de retard volontaire pour lisser les autres joueurs
  const TAU = Math.PI * 2;

  function hexToRgb(hex) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, f) {
    const [r, g, b] = hexToRgb(hex);
    const m = v => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  const lerp = (a, b, t) => a + (b - a) * t;
  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    return a + d * t;
  }

  function createRenderer(canvas, info) {
    const ctx = canvas.getContext('2d');
    const { map, spells, playerR, maxHp } = info;
    const Phys = window.ArenaPhysics;

    let meta = new Map();          // id -> { name, color }
    const snaps = [];              // [{ at, ps: Map(id -> p) }]
    let local = null;              // fonction qui renvoie le joueur local prédit
    let localId = -1;
    const view = new Map();        // id -> état affiché (hp lissé, phase de marche, flash…)
    const projs = [];              // projectiles animés localement
    const parts = [];              // particules
    const texts = [];              // chiffres de dégâts
    const rings = [];              // ondes de choc
    let shakeAmp = 0, hurtFlash = 0;
    let scale = 1, offX = 0, offY = 0, lastFrame = performance.now();
    const cam = { x: map.w / 2, y: map.h / 2, init: false };
    const VIEW_W = 1000, VIEW_H = 640;   // zone visible autour du joueur (en unités de carte)

    // ------------------------------------------------------------ décor pré-rendu
    const bg = document.createElement('canvas');
    bg.width = map.w; bg.height = map.h;
    (function paintBackground() {
      const g = bg.getContext('2d');
      let seed = 1337;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      // dalles de pierre
      const T = 50;
      for (let y = 0; y < map.h; y += T) {
        for (let x = 0; x < map.w; x += T) {
          const v = 38 + rnd() * 14;
          g.fillStyle = `rgb(${v - 4},${v + 6},${v + 2})`;
          g.fillRect(x, y, T, T);
          g.fillStyle = 'rgba(255,255,255,0.05)';
          g.fillRect(x + 2, y + 2, T - 4, 3);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(x, y + T - 2, T, 2);
          g.fillRect(x + T - 2, y, 2, T);
          if (rnd() < 0.18) { // fissure
            g.strokeStyle = 'rgba(0,0,0,0.25)';
            g.lineWidth = 1.5;
            g.beginPath();
            let cx = x + rnd() * T, cy = y + rnd() * T;
            g.moveTo(cx, cy);
            for (let k = 0; k < 3; k++) { cx += (rnd() - 0.5) * 22; cy += (rnd() - 0.5) * 22; g.lineTo(cx, cy); }
            g.stroke();
          }
        }
      }
      // mousse
      for (let i = 0; i < 70; i++) {
        const x = rnd() * map.w, y = rnd() * map.h, r = 10 + rnd() * 40;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(90,150,70,0.22)');
        grd.addColorStop(1, 'rgba(90,150,70,0)');
        g.fillStyle = grd;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      // cercle de runes central
      const cx = map.w / 2, cy = map.h / 2;
      g.strokeStyle = 'rgba(196,181,253,0.22)';
      g.lineWidth = 6;
      g.beginPath(); g.arc(cx, cy, 250, 0, TAU); g.stroke();
      g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy, 226, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(196,181,253,0.22)';
      g.font = 'bold 22px serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗ';
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * TAU;
        g.save();
        g.translate(cx + Math.cos(a) * 238, cy + Math.sin(a) * 238);
        g.rotate(a + Math.PI / 2);
        g.fillText(runes[i], 0, 0);
        g.restore();
      }
      // vignette
      const vg = g.createRadialGradient(cx, cy, map.h * 0.35, cx, cy, map.w * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = vg;
      g.fillRect(0, 0, map.w, map.h);
      // blocs de pierre (vue 3/4 : dessus clair, face avant sombre)
      for (const o of map.obstacles) {
        const H = Math.min(26, o.h * 0.45);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath(); g.ellipse(o.x + o.w / 2 + 6, o.y + o.h + 4, o.w / 2 + 8, 12, 0, 0, TAU); g.fill();
        g.fillStyle = '#4a4e63';
        rr(g, o.x, o.y + H * 0.3, o.w, o.h, 10); g.fill();
        g.fillStyle = '#6b7090';
        rr(g, o.x, o.y, o.w, o.h - H, 10); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.12)';
        rr(g, o.x + 5, o.y + 4, o.w - 10, 6, 3); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 2;
        for (let k = 1; k < Math.floor(o.w / 40) + 1; k++) {
          const bx = o.x + (o.w / (Math.floor(o.w / 40) + 1)) * k;
          g.beginPath(); g.moveTo(bx, o.y + o.h - H + 2); g.lineTo(bx, o.y + o.h + H * 0.3 - 3); g.stroke();
        }
      }
      // bordure
      g.strokeStyle = '#a78bfa';
      g.lineWidth = 8;
      g.strokeRect(4, 4, map.w - 8, map.h - 8);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 2;
      g.strokeRect(9, 9, map.w - 18, map.h - 18);
    })();

    function rr(g, x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    // torches aux quatre coins (lueur animée)
    const torches = [[30, 30], [map.w - 30, 30], [30, map.h - 30], [map.w - 30, map.h - 30]];

    // ------------------------------------------------------------ état réseau
    function setPlayers(list) { meta = new Map(list.map(p => [p.id, p])); }
    function setLocal(id, getter) { localId = id; local = getter; }

    function pushState(s) {
      const ps = new Map(s.ps.map(p => [p.i, p]));
      snaps.push({ at: performance.now(), ps });
      while (snaps.length > 30) snaps.shift();
    }

    // position interpolée d'un joueur distant
    function sampled(id, renderAt) {
      let a = null, b = null;
      for (let k = snaps.length - 1; k >= 0; k--) {
        if (snaps[k].at <= renderAt) { a = snaps[k]; b = snaps[k + 1] || null; break; }
      }
      if (!a) a = snaps[0];
      const pa = a && a.ps.get(id);
      if (!pa) return null;
      const pb = b && b.ps.get(id);
      if (!pb || pb.t !== pa.t || pb.s !== pa.s) return { ...pa, dx: pa.x, dy: pa.y, da: pa.d / 100 };
      const t = Math.max(0, Math.min(1, (renderAt - a.at) / (b.at - a.at)));
      return { ...pa, dx: lerp(pa.x, pb.x, t), dy: lerp(pa.y, pb.y, t), da: lerpAngle(pa.d / 100, pb.d / 100, t) };
    }

    function latest(id) {
      const s = snaps[snaps.length - 1];
      return s ? s.ps.get(id) : null;
    }

    function playerPos(id) {
      if (id === localId && local) { const me = local(); if (me) return { x: me.x, y: me.y }; }
      const v = view.get(id);
      return v ? { x: v.x, y: v.y } : null;
    }

    // ------------------------------------------------------------ particules
    function burst(x, y, color, n, speed, life, size, opts = {}) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = speed * (0.3 + Math.random() * 0.7);
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 0),
          life: life * (0.6 + Math.random() * 0.4), max: life, size: size * (0.5 + Math.random() * 0.8),
          color, drag: opts.drag ?? 3, grav: opts.grav || 0, type: opts.type || 'spark',
          rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10,
        });
      }
    }

    function shake(a) { shakeAmp = Math.max(shakeAmp, a); }

    // ------------------------------------------------------------ projectiles
    function spawnProj(e, isLocal) {
      const s = spells[e.s];
      const p = {
        id: e.id || null, shot: e.sh || 0, owner: e.o, spell: e.s,
        x: e.x, y: e.y, vx: e.vx, vy: e.vy, r: s.r, color: s.color, splash: s.splash,
        born: performance.now(), trail: [], dead: false, local: !!isLocal,
      };
      projs.push(p);
      // éclair de lancement
      burst(e.x, e.y, s.color, 6, 140, 0.25, 3);
      return p;
    }

    function onProj(e) {
      if (e.o === localId) {
        const mine = projs.find(p => p.local && p.shot === e.sh && !p.id);
        if (mine) { mine.id = e.id; return; }
      }
      spawnProj(e, false);
    }

    function onProjEnd(e) {
      const p = projs.find(q => q.id === e.id);
      if (p && !p.dead) impact(p, e.x, e.y);
      if (p) p.dead = true;
    }

    function onCastFail(shot) {
      const p = projs.find(q => q.local && q.shot === shot);
      if (p) p.dead = true;
    }

    function impact(p, x, y) {
      p.dead = true;
      if (p.splash) {
        burst(x, y, p.color, 26, 320, 0.6, 5, { drag: 2.5 });
        burst(x, y, '#fde68a', 10, 200, 0.4, 3);
        burst(x, y, '#555', 10, 60, 0.9, 10, { type: 'smoke', drag: 1, up: 30 });
        rings.push({ x, y, r: p.splash, color: p.color, born: performance.now(), life: 380 });
        shakeNear(x, y, 9);
      } else {
        burst(x, y, p.color, 12, 220, 0.35, 3);
      }
    }

    function shakeNear(x, y, amp) {
      const me = local && local();
      if (!me) { shake(amp * 0.5); return; }
      const d = Math.hypot(me.x - x, me.y - y);
      if (d < 500) shake(amp * (1 - d / 500));
    }

    // ------------------------------------------------------------ évènements de jeu
    function addFx(e) {
      const now = performance.now();
      if (e.t === 'nova') {
        rings.push({ x: e.x, y: e.y, r: e.r, color: e.c, born: now, life: 450, fill: true });
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * TAU;
          parts.push({
            x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20, vx: Math.cos(a) * e.r * 2.2, vy: Math.sin(a) * e.r * 2.2,
            life: 0.45, max: 0.45, size: 7, color: '#e0f2fe', drag: 4, grav: 0, type: 'shard', rot: a, vr: 0,
          });
        }
        shakeNear(e.x, e.y, 5);
      } else if (e.t === 'stun') {
        burst(e.x, e.y, '#fde047', 18, 260, 0.7, 4, { up: 60 });
        texts.push({ x: e.x, y: e.y - 30, text: 'STUN !', color: '#fde047', born: now, life: 1100, big: true });
        shakeNear(e.x, e.y, 6);
      } else if (e.t === 'boom') {
        // explosion déjà jouée par la fin du projectile ; on complète au cas où elle n'était pas visible
        if (!projs.some(p => p.splash && Math.hypot(p.x - e.x, p.y - e.y) < 60)) {
          rings.push({ x: e.x, y: e.y, r: e.r, color: e.c, born: now, life: 380 });
        }
      }
    }

    function onDamage(e) {
      const now = performance.now();
      const v = view.get(e.v);
      if (v) v.flash = now + 120;
      texts.push({ x: e.x + (Math.random() - 0.5) * 16, y: e.y - playerR - 10, text: `-${e.n}`, color: e.v === localId ? '#f87171' : '#fff', born: now, life: 800 });
      burst(e.x, e.y, '#fff', 5, 120, 0.25, 2.5);
      if (e.v === localId) { hurtFlash = 1; shake(7); }
    }

    // effet immédiat quand le joueur local lance un sort (sans attendre le serveur)
    function localCast(kind, data) {
      if (kind === 'proj') return spawnProj(data, true);
      if (kind === 'nova') addFx({ t: 'nova', x: data.x, y: data.y, r: data.r, c: data.c, o: -2 });
      return null;
    }

    // ------------------------------------------------------------ dessin
    // follow = position à suivre (joueur local) ; sinon toute la carte est affichée
    function resize(follow, dt) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const fit = Math.min(canvas.width / map.w, canvas.height / map.h);
      if (!follow) {
        scale = fit;
        offX = (canvas.width - map.w * scale) / 2;
        offY = (canvas.height - map.h * scale) / 2;
        return;
      }
      scale = Math.max(fit, Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H));
      const vw = canvas.width / scale, vh = canvas.height / scale;
      const k = cam.init ? Math.min(1, dt * 8) : 1;
      cam.init = true;
      cam.x += (follow.x - cam.x) * k;
      cam.y += (follow.y - cam.y) * k;
      const cx = vw >= map.w ? map.w / 2 : Math.max(vw / 2, Math.min(map.w - vw / 2, cam.x));
      const cy = vh >= map.h ? map.h / 2 : Math.max(vh / 2, Math.min(map.h - vh / 2, cam.y));
      offX = canvas.width / 2 - cx * scale;
      offY = canvas.height / 2 - cy * scale;
    }

    // mini-carte (quand la caméra suit le joueur)
    function drawMinimap(myId) {
      const dpr = window.devicePixelRatio || 1;
      const mw = 170 * dpr, mh = mw * (map.h / map.w);
      const x0 = canvas.width - mw - 12 * dpr, y0 = canvas.height - mh - 12 * dpr;
      const k = mw / map.w;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = 'rgba(12,8,26,0.75)';
      ctx.strokeStyle = 'rgba(167,139,250,0.8)';
      ctx.lineWidth = 2 * dpr;
      ctx.fillRect(x0, y0, mw, mh);
      ctx.strokeRect(x0, y0, mw, mh);
      ctx.fillStyle = 'rgba(148,153,184,0.6)';
      for (const o of map.obstacles) ctx.fillRect(x0 + o.x * k, y0 + o.y * k, o.w * k, o.h * k);
      // zone visible
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1 * dpr;
      ctx.strokeRect(x0 + (-offX / scale) * k, y0 + (-offY / scale) * k, (canvas.width / scale) * k, (canvas.height / scale) * k);
      for (const [id, v] of view) {
        if (!v.visible) continue;
        const m = meta.get(id) || { color: '#999' };
        ctx.fillStyle = v.state === 's' ? '#6b7280' : m.color;
        ctx.beginPath(); ctx.arc(x0 + v.x * k, y0 + v.y * k, (id === myId ? 4.5 : 3) * dpr, 0, TAU); ctx.fill();
        if (id === myId) { ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 2 * dpr; ctx.stroke(); }
      }
    }

    function screenToWorld(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      return { x: ((clientX - rect.left) * dpr - offX) / scale, y: ((clientY - rect.top) * dpr - offY) / scale };
    }

    function drawWizard(x, y, color, angle, phase, moving, o) {
      const R = playerR;
      const bob = moving ? Math.sin(phase) * 2.2 : Math.sin(phase * 0.35) * 0.8;
      const face = Math.cos(angle) >= 0 ? 1 : -1;
      const ax = Math.cos(angle), ay = Math.sin(angle);
      ctx.save();
      if (o.ghost) ctx.globalAlpha *= 0.45;

      // ombre
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(x, y + R * 0.95, R * 0.95, R * 0.38, 0, 0, TAU); ctx.fill();

      if (o.isMe) { // anneau du joueur local
        ctx.strokeStyle = 'rgba(253,230,138,0.7)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 5]);
        ctx.lineDashOffset = -phase * 3;
        ctx.beginPath(); ctx.ellipse(x, y + R * 0.95, R * 1.35, R * 0.55, 0, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }

      const by = y + bob;
      const body = o.stunned ? '#6b7280' : color;
      const behindStaff = ay < -0.2;
      const drawStaff = () => {
        const hx = x + ax * R * 0.55, hy = by + 2 + ay * R * 0.35;
        const tx = hx + ax * R * 1.15, ty = hy + ay * R * 1.15 - 6;
        ctx.strokeStyle = '#7c4a1e'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx - ax * 8, hy - ay * 8 + 6); ctx.lineTo(tx, ty); ctx.stroke();
        const orb = o.orb || '#fde68a';
        const pulse = 5 + Math.sin(phase * 0.8) * 1;
        const grd = ctx.createRadialGradient(tx, ty, 0, tx, ty, pulse * 3);
        grd.addColorStop(0, rgba(orb, 0.9));
        grd.addColorStop(1, rgba(orb, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(tx, ty, pulse * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(tx, ty, pulse * 0.6, 0, TAU); ctx.fill();
      };
      if (behindStaff && !o.stunned) drawStaff();

      // robe (trapèze arrondi)
      const sway = moving ? Math.sin(phase) * 2 : 0;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(x - R * 0.45, by - R * 0.35);
      ctx.quadraticCurveTo(x - R * 0.95 + sway, by + R * 0.55, x - R * 0.85 + sway, by + R * 0.9);
      ctx.quadraticCurveTo(x, by + R * 1.05, x + R * 0.85 + sway, by + R * 0.9);
      ctx.quadraticCurveTo(x + R * 0.95 + sway, by + R * 0.55, x + R * 0.45, by - R * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shade(body, -0.35);
      ctx.beginPath();
      ctx.moveTo(x - R * 0.85 + sway, by + R * 0.9);
      ctx.quadraticCurveTo(x, by + R * 1.05, x + R * 0.85 + sway, by + R * 0.9);
      ctx.quadraticCurveTo(x, by + R * 0.8, x - R * 0.85 + sway, by + R * 0.9);
      ctx.fill();
      // ceinture
      ctx.fillStyle = shade(body, -0.45);
      ctx.fillRect(x - R * 0.6, by + R * 0.12, R * 1.2, 3.5);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(x - 2.5, by + R * 0.1, 5, 5);

      // tête
      ctx.fillStyle = '#f5d0b0';
      ctx.beginPath(); ctx.arc(x, by - R * 0.55, R * 0.5, 0, TAU); ctx.fill();
      // yeux (regardent vers la visée)
      if (!o.stunned) {
        ctx.fillStyle = '#1f1235';
        const ex = ax * 3.5, ey = Math.max(-1, ay * 2.5);
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.arc(x + ex + s * 4.5, by - R * 0.55 + ey, 2.1, 0, TAU); ctx.fill();
        }
      } else {
        ctx.strokeStyle = '#1f1235'; ctx.lineWidth = 1.8;
        for (const s of [-1, 1]) {
          const cx = x + s * 4.5, cy = by - R * 0.55;
          ctx.beginPath(); ctx.moveTo(cx - 2.5, cy - 2.5); ctx.lineTo(cx + 2.5, cy + 2.5);
          ctx.moveTo(cx + 2.5, cy - 2.5); ctx.lineTo(cx - 2.5, cy + 2.5); ctx.stroke();
        }
      }
      // chapeau pointu
      const hatC = shade(body, -0.25);
      ctx.fillStyle = hatC;
      ctx.beginPath(); ctx.ellipse(x, by - R * 0.85, R * 0.85, R * 0.24, 0, 0, TAU); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - R * 0.5, by - R * 0.88);
      ctx.quadraticCurveTo(x - R * 0.15, by - R * 1.6, x - face * R * 0.55 + sway * 0.5, by - R * 2.05);
      ctx.quadraticCurveTo(x + R * 0.2, by - R * 1.5, x + R * 0.5, by - R * 0.88);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fde68a';
      starPath(x - face * R * 0.05, by - R * 1.2, R * 0.24);
      ctx.fill();

      if (!behindStaff && !o.stunned) drawStaff();

      // gel
      if (o.frozen) {
        ctx.fillStyle = 'rgba(165,243,252,0.45)';
        ctx.strokeStyle = 'rgba(224,242,254,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, by - R * 2.1); ctx.lineTo(x + R * 1.1, by - R * 0.5); ctx.lineTo(x + R * 0.9, by + R * 1.05);
        ctx.lineTo(x - R * 0.9, by + R * 1.05); ctx.lineTo(x - R * 1.1, by - R * 0.5); ctx.closePath();
        ctx.fill(); ctx.stroke();
      }
      // flash d'impact
      if (o.flash) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(x, by - R * 0.2, R * 1.1, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      // étoiles d'étourdissement
      if (o.stunned) {
        for (let k = 0; k < 3; k++) {
          const a = phase * 0.7 + (k * TAU) / 3;
          ctx.fillStyle = '#fde047';
          starPath(x + Math.cos(a) * 20, by - R * 1.6 + Math.sin(a) * 6, 6);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function starPath(cx, cy, r) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, rr2 = i % 2 ? r * 0.45 : r;
        ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2);
      }
      ctx.closePath();
    }

    function drawLabel(x, y, name, hp, isMe) {
      const top = y - playerR * 2.25;
      ctx.font = `600 ${isMe ? 17 : 15}px Fredoka, system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(name, x, top - 9);
      ctx.fillStyle = isMe ? '#fde68a' : '#fff';
      ctx.fillText(name, x, top - 9);
      const bw = 46, bh = 6, bx = x - bw / 2, by = top - 5;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      const ratio = Math.max(0, hp / maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
      ctx.fillRect(bx, by, bw * ratio, bh);
    }

    function updateProjs(dt, now) {
      for (const p of projs) {
        if (p.dead) continue;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 9) p.trail.shift();
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (now - p.born > (info.projLife || 1600) + 150) { p.dead = true; continue; }
        if (Phys && Phys.projBlocked(p.x, p.y, p.r, map)) { impact(p, p.x, p.y); continue; }
        // touche visuelle d'un joueur (le serveur confirme les dégâts)
        for (const [id, v] of view) {
          if (id === p.owner || !v.visible || v.state !== 'a') continue;
          const pos = playerPos(id);
          if (pos && Math.hypot(pos.x - p.x, pos.y - p.y) < playerR + p.r) { impact(p, p.x, p.y); break; }
        }
        if (Math.random() < 0.6) {
          parts.push({
            x: p.x, y: p.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
            life: 0.3, max: 0.3, size: p.r * 0.5, color: p.color, drag: 2, grav: 0, type: 'spark', rot: 0, vr: 0,
          });
        }
      }
      for (let i = projs.length - 1; i >= 0; i--) {
        const p = projs[i];
        if (p.dead && (!p.trail.length || (p.fade = (p.fade || 0) + dt) > 0.15)) projs.splice(i, 1);
      }
    }

    function drawProjs() {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of projs) {
        const pts = p.dead ? p.trail : [...p.trail, { x: p.x, y: p.y }];
        for (let k = 1; k < pts.length; k++) {
          const t = k / pts.length;
          ctx.strokeStyle = rgba(p.color, t * 0.6);
          ctx.lineWidth = p.r * 2 * t;
          ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(pts[k - 1].x, pts[k - 1].y); ctx.lineTo(pts[k].x, pts[k].y); ctx.stroke();
        }
        if (p.dead) continue;
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        grd.addColorStop(0, rgba(p.color, 0.95));
        grd.addColorStop(0.4, rgba(p.color, 0.5));
        grd.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.55, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    function drawParticles(dt) {
      ctx.save();
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i];
        q.life -= dt;
        if (q.life <= 0) { parts.splice(i, 1); continue; }
        const k = Math.exp(-q.drag * dt);
        q.vx *= k; q.vy = q.vy * k + q.grav * dt;
        q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
        const t = q.life / q.max;
        if (q.type === 'smoke') {
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = `rgba(60,60,70,${t * 0.35})`;
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1.8 - t), 0, TAU); ctx.fill();
        } else if (q.type === 'shard') {
          ctx.globalCompositeOperation = 'lighter';
          ctx.save();
          ctx.translate(q.x, q.y); ctx.rotate(q.rot);
          ctx.fillStyle = `rgba(207,250,254,${t})`;
          ctx.beginPath(); ctx.moveTo(q.size, 0); ctx.lineTo(0, q.size * 0.35); ctx.lineTo(-q.size, 0); ctx.lineTo(0, -q.size * 0.35); ctx.fill();
          ctx.restore();
        } else {
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = rgba(q.color.startsWith('#') ? q.color : '#ffffff', t);
          ctx.beginPath(); ctx.arc(q.x, q.y, q.size * t + 0.5, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }

    function drawRings(now) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const g = rings[i];
        const t = (now - g.born) / g.life;
        if (t >= 1) { rings.splice(i, 1); continue; }
        const r = g.r * (0.2 + 0.8 * Math.sqrt(t));
        ctx.save();
        if (g.fill) {
          ctx.fillStyle = rgba(g.color, (1 - t) * 0.25);
          ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
        }
        ctx.strokeStyle = rgba(g.color, 1 - t);
        ctx.lineWidth = 8 * (1 - t) + 1;
        ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    function drawTexts(now) {
      ctx.save();
      ctx.textAlign = 'center';
      for (let i = texts.length - 1; i >= 0; i--) {
        const m = texts[i];
        const t = (now - m.born) / m.life;
        if (t >= 1) { texts.splice(i, 1); continue; }
        const y = m.y - t * 40;
        const s = m.big ? 30 : 20;
        ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        ctx.font = `700 ${Math.round(s * (t < 0.12 ? 0.6 + t * 3.3 : 1))}px Fredoka, system-ui, sans-serif`;
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(m.text, m.x, y);
        ctx.fillStyle = m.color;
        ctx.fillText(m.text, m.x, y);
      }
      ctx.restore();
    }

    function drawTorches(now) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y] of torches) {
        const f = 70 + Math.sin(now / 90 + x) * 6 + Math.sin(now / 37 + y) * 4;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, f);
        grd.addColorStop(0, 'rgba(255,170,60,0.55)');
        grd.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(x, y, f, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,230,150,0.95)';
        ctx.beginPath(); ctx.arc(x, y, 5 + Math.sin(now / 60) * 1, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    function draw(myId, opts = {}) {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;
      const meNow = local && local();
      const follow = opts.follow ? (meNow || (view.get(myId) && view.get(myId).visible ? view.get(myId) : null)) : null;
      resize(follow, dt);

      // joueurs à afficher : distants interpolés, local prédit
      const renderAt = now - INTERP_DELAY;
      const seen = new Set();
      const s = snaps[snaps.length - 1];
      if (s) {
        for (const id of s.ps.keys()) {
          seen.add(id);
          const lp = latest(id);
          let v = view.get(id);
          if (!v) { v = { x: lp.x, y: lp.y, a: 0, hp: lp.h, phase: Math.random() * 10, flash: 0 }; view.set(id, v); }
          let x, y, a;
          if (id === localId && local && local()) {
            const me = local();
            x = me.x; y = me.y; a = me.aim != null ? me.aim : Math.atan2(me.dirY, me.dirX);
          } else {
            const sp = sampled(id, renderAt) || { dx: lp.x, dy: lp.y, da: lp.d / 100 };
            x = sp.dx; y = sp.dy; a = sp.da;
          }
          const moved = Math.hypot(x - v.x, y - v.y);
          v.moving = moved > 0.3;
          v.phase += dt * (v.moving ? 14 : 4);
          v.x = x; v.y = y; v.a = a;
          v.hp += (lp.h - v.hp) * Math.min(1, dt * 12);
          v.state = lp.s; v.frozen = lp.f; v.invuln = lp.v;
          v.visible = lp.s === 'a' || lp.s === 's';
          if (v.moving && Math.random() < dt * 8) {
            parts.push({ x: x + (Math.random() - 0.5) * 10, y: y + playerR * 0.9, vx: 0, vy: -10, life: 0.4, max: 0.4, size: 4, color: '#888', drag: 2, grav: 0, type: 'smoke', rot: 0, vr: 0 });
          }
        }
      }
      for (const id of view.keys()) if (!seen.has(id)) view.delete(id);

      updateProjs(dt, now);

      // caméra + secousse
      shakeAmp *= Math.exp(-dt * 9);
      const sx = (Math.random() - 0.5) * shakeAmp * 2, sy = (Math.random() - 0.5) * shakeAmp * 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0b0818';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(scale, 0, 0, scale, offX + sx * scale, offY + sy * scale);

      ctx.drawImage(bg, 0, 0);
      drawTorches(now);
      drawRings(now);

      const list = [...view.entries()].filter(([, v]) => v.visible).sort((a, b) => a[1].y - b[1].y);
      for (const [id, v] of list) {
        const m = meta.get(id) || { name: '?', color: '#999' };
        drawWizard(v.x, v.y, m.color, v.a, v.phase, v.moving, {
          isMe: id === myId, stunned: v.state === 's', frozen: v.frozen,
          ghost: v.invuln && Math.floor(now / 120) % 2 === 0, flash: v.flash > now,
          orb: id === myId && opts.orb ? opts.orb : null,
        });
      }
      drawProjs();
      drawParticles(dt);
      for (const [id, v] of list) {
        const m = meta.get(id) || { name: '?', color: '#999' };
        drawLabel(v.x, v.y, m.name, v.hp, id === myId);
      }
      drawTexts(now);
      if (opts.follow) drawMinimap(myId);

      // voile rouge quand le joueur local est touché
      if (hurtFlash > 0.01) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const w = canvas.width, h = canvas.height;
        const grd = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
        grd.addColorStop(0, 'rgba(220,38,38,0)');
        grd.addColorStop(1, `rgba(220,38,38,${hurtFlash * 0.45})`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        hurtFlash *= Math.exp(-dt * 5);
      }
    }

    return {
      setPlayers, setLocal, pushState, addFx, onDamage, onProj, onProjEnd, onCastFail, localCast,
      draw, screenToWorld, shake, getLatest: latest,
    };
  }

  window.ArenaRender = { createRenderer };
})();
