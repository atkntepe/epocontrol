// SPDX-License-Identifier: GPL-3.0-or-later
// Presentation only: animates the hero keyboard to mirror the selected effect, colour, brightness and speed.
// Approximations of the firmware effects; it never talks to the device.
(function (g) {
  const hsl = (h, s, l) => `hsl(${(h % 360 + 360) % 360} ${s}% ${l}%)`;
  let keys = [], raf = 0, bounds = null, presses = [];
  function bind(host) {
    keys = Array.from(host.querySelectorAll('.key')).map(el => ({ el, x: parseFloat(el.style.left) + parseFloat(el.style.width) / 2, y: parseFloat(el.style.top) + parseFloat(el.style.height) / 2 }));
    const xs = keys.map(k => k.x), ys = keys.map(k => k.y);
    bounds = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    keys.forEach(k => { k.u = (k.x - bounds.x0) / (bounds.x1 - bounds.x0 || 1); k.v = (k.y - bounds.y0) / (bounds.y1 - bounds.y0 || 1); k.r = Math.random(); });
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function state() {
    const q = id => document.getElementById(id);
    return { type: q('fx').value, bri: +q('bri').value / 4, spd: 0.35 + (+q('spd').value) * 0.45, opt: q('fxopt').value, rainbow: q('rainbow').checked, col: q('col').value };
  }
  function tick(ts) {
    raf = requestAnimationFrame(tick);
    const hero = document.getElementById('hero'); if (!hero || hero.offsetParent === null || !keys.length) return;
    const s = state(), t = ts / 1000 * s.spd, base = s.col;
    const rb = (h) => s.rainbow ? hsl(h, 90, 58) : base;
    for (const k of keys) {
      let c = base, a = 1; const u = k.u, v = k.v;
      switch (s.type) {
        case 'LightOff': a = 0; break;
        case 'LightAlwaysOn': c = rb(u * 300); break;
        case 'LightBreath': a = 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * 2.2)); c = rb(t * 40); break;
        case 'LightNeon': c = hsl(t * 60, 90, 58); break;
        case 'LightWave': { const d = { right: -u, left: u, down: -v, up: v }[s.opt] ?? -u; c = s.rainbow ? hsl((d + t * 0.35) * 360, 90, 58) : base; a = s.rainbow ? 1 : 0.3 + 0.7 * (0.5 + 0.5 * Math.sin((d + t * 0.4) * 9)); break; }
        case 'LightRipple': case 'LightConverage': { const r = Math.hypot(u - 0.5, (v - 0.5) * 0.45); const ph = s.type === 'LightConverage' ? -t : t; a = Math.max(0.06, Math.pow(0.5 + 0.5 * Math.sin((r * 14 - ph * 3)), 3)); c = rb(r * 500 + t * 50); break; }
        case 'LightRaindrop': case 'LightRainDown': case 'LightMeteor': { const col = Math.floor(u * 16), sp = (k.r * 0.3 + 0.7); const head = ((t * 0.6 * sp + col * 0.37) % 1.4); const dy = s.type === 'LightRaindrop' ? Math.abs(Math.sin(t * 1.3 + k.r * 40)) : v - head + 0.3; a = s.type === 'LightRaindrop' ? (dy > 0.92 ? 1 : 0.06) : (dy < 0 || dy > 0.35 ? 0.05 : 1 - dy / 0.35); c = rb(col * 22 + t * 30); break; }
        case 'LightSnake': { const idx = (Math.round(v * 5) % 2 ? 1 - u : u) + Math.round(v * 5); const head = (t * 1.2) % 6; const d = head - idx; a = d >= 0 && d < 1.2 ? 1 - d / 1.2 : 0.05; c = rb(idx * 60); break; }
        case 'LightPressAction': case 'LightPressActionOff': { const on = (Math.sin(k.r * 90 + t * 1.6) > 0.96); a = s.type === 'LightPressAction' ? (on ? 1 : 0.06) : (on ? 0.05 : 1); c = rb(k.r * 360); break; }
        case 'LightSineWave': case 'LightLineWave': { const y = 0.5 + 0.38 * Math.sin(u * 7 + t * 2); a = s.type === 'LightSineWave' ? Math.max(0.05, 1 - Math.abs(v - y) * 4) : Math.max(0.05, 1 - Math.abs(((s.opt === 'left' ? 1 - u : u) - (t * 0.4 % 1.2))) * 6); c = rb(u * 360 + t * 40); break; }
        case 'LightKaleidoscope': case 'LightCircleWave': { const ang = Math.atan2(v - 0.5, (u - 0.5) * 2.2), r = Math.hypot(u - 0.5, (v - 0.5) * 0.45); const dir = (s.opt === 'in' || s.opt === 'anti-clockwise') ? -1 : 1; c = hsl((s.type === 'LightCircleWave' ? ang * 57.3 : r * 900) + dir * t * 90, 90, 58); if (!s.rainbow) { c = base; a = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(ang * 3 + dir * t * 3)); } break; }
        case 'LightLaser': { const x = (t * 0.5) % 1.3 - 0.15; a = Math.max(0.05, 1 - Math.abs(u - x) * 9); c = rb(t * 80); break; }
        case 'LightDazzing': c = hsl(k.r * 360 + t * 120, 90, 58); a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(k.r * 50 + t * 4)); break;
        case 'LightUserPicture': { const pk = (g.EPO_STATE && g.EPO_STATE.pk) || {}; const v2 = pk[k.el.dataset.slot]; if (v2 === undefined) a = 0; else c = '#' + v2.toString(16).padStart(6, '0'); break; }
      }
      const glow = Math.max(0, Math.min(1, a * s.bri));
      k.el.style.setProperty('--led', c); k.el.style.setProperty('--glow', glow.toFixed(3));
    }
  }
  g.EPO_PREVIEW = { bind };
})(window);
