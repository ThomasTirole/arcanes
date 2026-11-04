// Physique partagée entre le serveur (Node) et le navigateur : collisions cercle / rectangle.
// Le même code calcule les déplacements des deux côtés, pour que la prédiction du
// navigateur tombe juste et que le serveur puisse vérifier ce que le client envoie.
(function (root) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function circleHitsRect(x, y, r, o) {
    const cx = clamp(x, o.x, o.x + o.w);
    const cy = clamp(y, o.y, o.y + o.h);
    const dx = x - cx, dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }

  function resolveCircleRect(p, r, o) {
    const cx = clamp(p.x, o.x, o.x + o.w);
    const cy = clamp(p.y, o.y, o.y + o.h);
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    if (d2 === 0) {
      const left = p.x - o.x, right = o.x + o.w - p.x, top = p.y - o.y, bottom = o.y + o.h - p.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) p.x = o.x - r;
      else if (m === right) p.x = o.x + o.w + r;
      else if (m === top) p.y = o.y - r;
      else p.y = o.y + o.h + r;
      return;
    }
    const d = Math.sqrt(d2);
    p.x += (dx / d) * (r - d);
    p.y += (dy / d) * (r - d);
  }

  /** Garde un cercle hors des obstacles et dans la carte. */
  function settle(p, r, map) {
    for (let k = 0; k < 2; k++) for (const o of map.obstacles) resolveCircleRect(p, r, o);
    p.x = clamp(p.x, r, map.w - r);
    p.y = clamp(p.y, r, map.h - r);
  }

  /** Déplace un joueur selon les touches enfoncées pendant dt secondes. */
  function step(p, keys, speed, dt, r, map) {
    let vx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    let vy = (keys.d ? 1 : 0) - (keys.u ? 1 : 0);
    if (!vx && !vy) return false;
    const d = Math.hypot(vx, vy);
    vx /= d; vy /= d;
    p.dirX = vx; p.dirY = vy;
    // sous-pas pour ne jamais traverser un obstacle fin
    const n = Math.max(1, Math.ceil((speed * dt) / (r * 0.5)));
    for (let i = 0; i < n; i++) {
      p.x += (vx * speed * dt) / n;
      p.y += (vy * speed * dt) / n;
      settle(p, r, map);
    }
    return true;
  }

  /** Un projectile touche-t-il un obstacle ou le bord ? */
  function projBlocked(x, y, r, map) {
    if (x < 0 || y < 0 || x > map.w || y > map.h) return true;
    return map.obstacles.some(o => circleHitsRect(x, y, r, o));
  }

  const api = { clamp, circleHitsRect, resolveCircleRect, settle, step, projBlocked };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArenaPhysics = api;
})(typeof window !== 'undefined' ? window : globalThis);
