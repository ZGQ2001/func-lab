/* ============================================================
 * plot/fields.js — 场图渲染
 * 方向场（y′ = f(x,y) 短斜线 + RK4 积分曲线）、
 * 向量场 F = (P, Q) 箭头、梯度场 ∇f（箭头 + 等值线）
 * 依赖：plot/viewport.js, plot/curves2d.js, plot/implicit.js, core/calculus.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const plot = NS.plot;

  function rgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return `rgba(0,114,189,${alpha})`;
    const v = parseInt(m[1], 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
  }

  /* ---------------- 方向场 y′ = f(x, y) ----------------
   * 屏幕等距网格上画过该点、斜率为 f(x,y) 的短线段
   */
  function drawSlopeField(ctx, vp, rect, f, color) {
    const spacing = 34;        // 网格间距（px）
    const half = 10;           // 线段半长（px）
    const scope = { x: 0, y: 0 };

    ctx.save();
    ctx.strokeStyle = rgba(color, 0.72);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let sx = rect.x + spacing / 2; sx < rect.x + rect.w; sx += spacing) {
      for (let sy = rect.y + spacing / 2; sy < rect.y + rect.h; sy += spacing) {
        scope.x = vp.pxToX(sx, rect);
        scope.y = vp.pxToY(sy, rect);
        let m;
        try { m = f(scope); } catch (e) { m = NaN; }
        if (Number.isNaN(m)) continue;
        /* 世界方向 (1, m) → 屏幕方向 (ppuX, −m·ppuY)；±∞ 画竖线 */
        let ux, uy;
        if (!Number.isFinite(m)) { ux = 0; uy = 1; }
        else {
          const vx = vp.ppuX, vy = -m * vp.ppuY;
          const len = Math.hypot(vx, vy);
          ux = vx / len;
          uy = vy / len;
        }
        ctx.moveTo(sx - ux * half, sy - uy * half);
        ctx.lineTo(sx + ux * half, sy + uy * half);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 过初值点的积分曲线（RK4） ---------------- */

  function drawSolutionCurve(ctx, vp, rect, f, x0, y0, color) {
    const [xmin, xmax] = vp.xRange(rect);
    const [ymin, ymax] = vp.yRange(rect);
    const ySpan = ymax - ymin;
    const scope = { x: 0, y: 0 };
    const fxy = (x, y) => {
      scope.x = x;
      scope.y = y;
      let v;
      try { v = f(scope); } catch (e) { v = NaN; }
      return v;
    };

    const sol = NS.core.calculus.odeCurve(
      fxy, x0, y0, Math.min(xmin, x0), Math.max(xmax, x0),
      { yLo: ymin - 3 * ySpan, yHi: ymax + 3 * ySpan, density: 700 });
    if (!sol.ok) return null;

    const toPt = p => ({ sx: vp.xToPx(p.x, rect), sy: vp.yToPx(p.y, rect), wx: p.x, wy: p.y });
    const pts = [];
    for (let i = sol.bwd.length - 1; i >= 0; i--) pts.push(toPt(sol.bwd[i]));
    pts.push(toPt({ x: x0, y: y0 }));
    for (let i = 0; i < sol.fwd.length; i++) pts.push(toPt(sol.fwd[i]));
    plot.curves2d.strokePolyline(ctx, pts, color, 2.4);

    /* 初值点标记 */
    const px = vp.xToPx(x0, rect), py = vp.yToPx(y0, rect);
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();

    /* 命中检测点（抽稀） */
    const hit = [];
    for (let i = 0; i < pts.length; i += 6) hit.push(pts[i]);
    return hit;
  }

  /* ---------------- 向量场 F = (P, Q) ----------------
   * 箭头长度/透明度按模长（相对 92 分位）缩放，避免奇点淹没全场
   */
  function drawVectorField(ctx, vp, rect, fp, fq, color) {
    const spacing = 46;
    const scope = { x: 0, y: 0 };
    const items = [];
    for (let sx = rect.x + spacing / 2; sx < rect.x + rect.w; sx += spacing) {
      for (let sy = rect.y + spacing / 2; sy < rect.y + rect.h; sy += spacing) {
        scope.x = vp.pxToX(sx, rect);
        scope.y = vp.pxToY(sy, rect);
        let p, q;
        try { p = fp(scope); q = fq(scope); } catch (e) { p = NaN; q = NaN; }
        if (!Number.isFinite(p) || !Number.isFinite(q)) continue;
        items.push({ sx, sy, p, q, mag: Math.hypot(p, q) });
      }
    }
    if (!items.length) return;

    const mags = items.map(it => it.mag).sort((a, b) => a - b);
    let ref = mags[Math.floor(mags.length * 0.92)];
    if (!(ref > 0)) ref = mags[mags.length - 1];
    if (!(ref > 0)) return;       // 全零场

    const Lmax = spacing * 0.86;
    ctx.save();
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (const it of items) {
      if (it.mag === 0) continue;
      const rel = Math.min(1, it.mag / ref);
      const L = Math.max(4, Lmax * rel);
      const vx = it.p * vp.ppuX, vy = -it.q * vp.ppuY;
      const sl = Math.hypot(vx, vy) || 1;
      const ux = vx / sl, uy = vy / sl;
      const x1 = it.sx - ux * L / 2, y1 = it.sy - uy * L / 2;
      const x2 = it.sx + ux * L / 2, y2 = it.sy + uy * L / 2;
      ctx.strokeStyle = rgba(color, 0.35 + 0.6 * rel);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      /* 箭头头部 */
      const hl = Math.min(7, L * 0.45);
      const ang = Math.atan2(uy, ux);
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang - 0.42), y2 - hl * Math.sin(ang - 0.42));
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang + 0.42), y2 - hl * Math.sin(ang + 0.42));
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------------- 梯度场 ∇f：等值线 + 梯度箭头 ----------------
   * 等值线取视口内 f 值 6%~94% 分位间的 7 条等距水平，
   * 直观呈现"梯度与等值线处处正交、指向函数增长最快方向"
   */
  function drawGradField(ctx, vp, rect, F, gp, gq, color) {
    const [xmin, xmax] = vp.xRange(rect);
    const [ymin, ymax] = vp.yRange(rect);
    const scope = { x: 0, y: 0 };
    const vals = [];
    for (let i = 0; i <= 24; i++) {
      for (let j = 0; j <= 16; j++) {
        scope.x = xmin + (xmax - xmin) * i / 24;
        scope.y = ymin + (ymax - ymin) * j / 16;
        let v;
        try { v = F(scope); } catch (e) { v = NaN; }
        if (Number.isFinite(v)) vals.push(v);
      }
    }
    if (vals.length > 8) {
      vals.sort((a, b) => a - b);
      const lo = vals[Math.floor(vals.length * 0.06)];
      const hi = vals[Math.floor(vals.length * 0.94)];
      if (hi > lo) {
        const K = 7;
        for (let k = 1; k <= K; k++) {
          const c = lo + (hi - lo) * k / (K + 1);
          plot.implicit.drawImplicit(ctx, vp, rect, s => F(s) - c,
            rgba(color, 0.32), { width: 1.1, cellPx: 9 });
        }
      }
    }
    drawVectorField(ctx, vp, rect, gp, gq, color);
  }

  plot.fields = { drawSlopeField, drawSolutionCurve, drawVectorField, drawGradField };

})(typeof window !== 'undefined' ? window : globalThis);
