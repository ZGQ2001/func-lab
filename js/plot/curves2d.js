/* ============================================================
 * plot/curves2d.js — 2D 曲线渲染
 * 显式 y=f(x)、参数方程、极坐标、数列（火柴杆图）
 * 每个绘制函数返回采样点缓存（供"单击曲线显示坐标"命中检测）
 * 依赖：plot/viewport.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const plot = NS.plot;

  const LINE_WIDTH = 1.8;

  /** 画一条带断点检测的折线；pts 为 {sx, sy, wx, wy} 或 null（断点） */
  function strokePolyline(ctx, pts, color, width, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || LINE_WIDTH;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    let pen = false;
    for (const p of pts) {
      if (!p) { pen = false; continue; }
      if (pen) ctx.lineTo(p.sx, p.sy);
      else { ctx.moveTo(p.sx, p.sy); pen = true; }
    }
    ctx.stroke();
    ctx.restore();
  }

  /** 屏幕坐标夹到绘图框附近：极端值（如 1e60）会破坏 canvas 路径运算 */
  function clampScreenPt(p, rect) {
    const mx = 20 * rect.w, my = 20 * rect.h;
    p.sx = p.sx < rect.x - mx ? rect.x - mx : p.sx > rect.x + rect.w + mx ? rect.x + rect.w + mx : p.sx;
    p.sy = p.sy < rect.y - my ? rect.y - my : p.sy > rect.y + rect.h + my ? rect.y + rect.h + my : p.sy;
    return p;
  }

  /** 收集非空点用于命中检测（适度抽稀，控制缓存大小） */
  function hitPoints(pts, every) {
    const out = [];
    for (let i = 0; i < pts.length; i += (every || 2)) {
      if (pts[i]) out.push(pts[i]);
    }
    return out;
  }

  /* ---------------- 显式函数 y = f(x) ---------------- */

  /* 自适应细分的最大深度：跳变剧烈处采样密度最多提升 2^6 = 64 倍 */
  const MAX_REFINE_DEPTH = 6;

  function drawExplicit(ctx, vp, rect, f, color, style) {
    const [xmin, xmax] = vp.xRange(rect);
    const [ymin, ymax] = vp.yRange(rect);
    const ySpan = ymax - ymin;
    const n = Math.max(64, Math.ceil(rect.w * 2));   // 基础密度：每像素 2 个采样点
    const dx = (xmax - xmin) / n;

    /* 可见带：超出太多的 y 夹到带边再绘制。x^200 这类函数的 1e60 级别值
       换算成屏幕坐标会超出 canvas 路径运算的精度范围，导致整段折线画不出来 */
    const yLo = ymin - 2 * ySpan;
    const yHi = ymax + 2 * ySpan;

    function evalY(x) {
      let y;
      try { y = f({ x }); } catch (e) { return NaN; }
      return Number.isFinite(y) ? y : NaN;
    }

    const pts = [];
    function pushBreak() { if (pts.length && pts[pts.length - 1]) pts.push(null); }
    function pushPt(x, y) {
      const yc = y < yLo ? yLo : y > yHi ? yHi : y;
      pts.push({ sx: vp.xToPx(x, rect), sy: vp.yToPx(yc, rect), wx: x, wy: y });
    }

    /* 是否需要细分：端点无定义，或跳变明显且该段不是整体落在可见带同一侧之外 */
    function needSplit(y0, y1) {
      if (Number.isNaN(y0) || Number.isNaN(y1)) return true;
      if ((y0 > yHi && y1 > yHi) || (y0 < yLo && y1 < yLo)) return false;
      return Math.abs(y1 - y0) > ySpan / 8;
    }

    /* 输出 (x0, x1] 段：必要时递归加密采样，深度耗尽后判定连线或断开 */
    function segment(x0, y0, x1, y1, depth) {
      if (depth < MAX_REFINE_DEPTH && needSplit(y0, y1)) {
        const xm = 0.5 * (x0 + x1);
        const ym = evalY(xm);
        /* 两端连同中点都无定义，视作整段在定义域外，不再细分 */
        if (!(Number.isNaN(y0) && Number.isNaN(ym) && Number.isNaN(y1))) {
          segment(x0, y0, xm, ym, depth + 1);
          segment(xm, ym, x1, y1, depth + 1);
          return;
        }
      }
      if (Number.isNaN(y1)) { pushBreak(); return; }
      if (Number.isNaN(y0)) {
        pushBreak();
      } else if ((y0 > yHi && y1 < yLo) || (y0 < yLo && y1 > yHi)) {
        /* 垂直渐近线：细分到极限后两端仍分别远在可见带上下两侧（如 tan、1/x）。
           连续的陡峭函数（如 x^200）只会从带内单侧冲出，不触发断开 */
        pushBreak();
      }
      pushPt(x1, y1);
    }

    let xPrev = xmin;
    let yPrev = evalY(xmin);
    if (!Number.isNaN(yPrev)) pushPt(xmin, yPrev);
    for (let i = 1; i <= n; i++) {
      const x = xmin + i * dx;
      const y = evalY(x);
      segment(xPrev, yPrev, x, y, 0);
      xPrev = x; yPrev = y;
    }

    strokePolyline(ctx, pts, color, style && style.width, style && style.dash);
    return hitPoints(pts, 3);
  }

  /* ---------------- 参数方程 x(t), y(t) ---------------- */

  function drawParametric(ctx, vp, rect, fx, fy, t0, t1, color) {
    const n = 1600;
    const dt = (t1 - t0) / n;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = t0 + i * dt;
      let x, y;
      try { x = fx({ t }); y = fy({ t }); } catch (e) { x = NaN; y = NaN; }
      if (!Number.isFinite(x) || !Number.isFinite(y)) { pts.push(null); continue; }
      pts.push(clampScreenPt({ sx: vp.xToPx(x, rect), sy: vp.yToPx(y, rect), wx: x, wy: y }, rect));
    }
    strokePolyline(ctx, pts, color);
    return hitPoints(pts, 4);
  }

  /* ---------------- 极坐标 r = r(θ) ---------------- */

  function drawPolar(ctx, vp, rect, fr, th0, th1, color) {
    const n = 1600;
    const dth = (th1 - th0) / n;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = th0 + i * dth;
      let r;
      const scope = { 'θ': th, theta: th, t: th };
      try { r = fr(scope); } catch (e) { r = NaN; }
      if (!Number.isFinite(r)) { pts.push(null); continue; }   // 如 √cos2θ 的无定义区
      const x = r * Math.cos(th);
      const y = r * Math.sin(th);
      pts.push(clampScreenPt({ sx: vp.xToPx(x, rect), sy: vp.yToPx(y, rect), wx: x, wy: y }, rect));
    }
    strokePolyline(ctx, pts, color);
    return hitPoints(pts, 4);
  }

  /* ---------------- 数列 a(n)（火柴杆图） ---------------- */

  function drawSequence(ctx, vp, rect, fa, n0, n1, color) {
    n0 = Math.ceil(n0);
    n1 = Math.floor(n1);
    if (n1 - n0 > 500) n1 = n0 + 500;   // 防止过密
    const y0px = vp.yToPx(0, rect);
    const hit = [];

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    const dots = [];
    for (let n = n0; n <= n1; n++) {
      let a;
      try { a = fa({ n }); } catch (e) { a = NaN; }
      if (!Number.isFinite(a)) continue;
      const sx = vp.xToPx(n, rect);
      const sy = vp.yToPx(a, rect);
      ctx.moveTo(sx, y0px);
      ctx.lineTo(sx, sy);
      dots.push([sx, sy]);
      hit.push({ sx, sy, wx: n, wy: a });
    }
    ctx.stroke();

    ctx.globalAlpha = 1;
    for (const [sx, sy] of dots) {
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    return hit;
  }

  plot.curves2d = { drawExplicit, drawParametric, drawPolar, drawSequence, strokePolyline };

})(typeof window !== 'undefined' ? window : globalThis);
