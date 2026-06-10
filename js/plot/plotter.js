/* ============================================================
 * plot/plotter.js — 渲染调度器
 * 根据应用状态分派 2D / 3D 渲染：坐标系 → 各类曲线 →
 * 分析工具叠加层（切线/导数/积分/泰勒）→ 图例 → 数据提示
 * 依赖：plot/* 全部、core/*（经由 state 传入的已编译函数）
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const plot = NS.plot;
  const fmt = NS.util.fmtNum;

  const TOOL_COLORS = {
    tangent: '#d62728',
    taylor:  '#7E2F8E'
  };

  function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return `rgba(0,114,189,${alpha})`;
    const v = parseInt(m[1], 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
  }

  function truncate(s, n) {
    s = String(s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /** 自动图例文本 */
  function legendLabel(fn) {
    /* 级数的图例始终带当前 N（即使有自定义名称） */
    if (fn.type === 'series') {
      const base = fn.label || ('Σ ' + fn.exprs.u);
      return `${base}（N=${fn.seriesN}）`;
    }
    if (fn.label) return fn.label;
    const ex = fn.exprs;
    switch (fn.type) {
      case 'explicit':   return 'y = ' + ex.f;
      case 'parametric': return `x=${ex.x}, y=${ex.y}`;
      case 'polar':      return 'r = ' + ex.r;
      case 'implicit':   return ex.F.includes('=') ? ex.F : ex.F + ' = 0';
      case 'sequence':   return 'a(n) = ' + ex.a;
      case 'slopefield': return 'y′ = ' + ex.f;
      case 'vectorfield':return `F = (${ex.P}, ${ex.Q})`;
      case 'gradfield':  return '∇f，f = ' + ex.f;
      case 'surface':    return 'z = ' + ex.z;
      case 'curve3d':    return `(${ex.x}, ${ex.y}, ${ex.z})`;
      default: return '';
    }
  }

  /* ---------------- 2D 渲染 ---------------- */

  function render2D(state, ctx, W, H) {
    const vp = state.view2;
    const rect = plot.axes.drawAxes(ctx, vp, W, H, { grid: state.opts.grid });
    const hits = [];
    const legendRows = [];

    /* 曲线绘制在绘图框内裁剪 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();

    const c2 = plot.curves2d;

    for (const fn of state.funcs) {
      if (!fn.visible || !fn.c || !fn.c.ok) continue;
      let pts = null;
      switch (fn.type) {
        case 'explicit':
          pts = c2.drawExplicit(ctx, vp, rect, fn.c.fns.f, fn.color);
          break;
        case 'parametric':
          pts = c2.drawParametric(ctx, vp, rect, fn.c.fns.x, fn.c.fns.y,
                                  fn.c.dom.t0, fn.c.dom.t1, fn.color);
          break;
        case 'polar':
          pts = c2.drawPolar(ctx, vp, rect, fn.c.fns.r,
                             fn.c.dom.th0, fn.c.dom.th1, fn.color);
          break;
        case 'implicit':
          pts = plot.implicit.drawImplicit(ctx, vp, rect, fn.c.fns.F, fn.color);
          break;
        case 'sequence':
          pts = c2.drawSequence(ctx, vp, rect, fn.c.fns.a,
                                fn.c.dom.n0, fn.c.dom.n1, fn.color);
          break;
        case 'series':
          /* 函数项级数画 Sɴ(x) 曲线；常数项级数画部分和火柴杆图 */
          pts = fn.c.hasX
            ? c2.drawExplicit(ctx, vp, rect, fn.c.fns.S, fn.color)
            : c2.drawSequence(ctx, vp, rect, fn.c.fns.S,
                              fn.c.seriesRange.n0, fn.seriesN, fn.color);
          break;
        case 'slopefield':
          plot.fields.drawSlopeField(ctx, vp, rect, fn.c.fns.f, fn.color);
          if (fn.c.dom.px !== null && fn.c.dom.py !== null) {
            pts = plot.fields.drawSolutionCurve(ctx, vp, rect, fn.c.fns.f,
                                                fn.c.dom.px, fn.c.dom.py, fn.color);
          }
          break;
        case 'vectorfield':
          plot.fields.drawVectorField(ctx, vp, rect, fn.c.fns.P, fn.c.fns.Q, fn.color);
          break;
        case 'gradfield':
          plot.fields.drawGradField(ctx, vp, rect, fn.c.fns.f,
                                    fn.c.fns.gp, fn.c.fns.gq, fn.color);
          break;
        default:
          continue;   // 3D 类型在 2D 模式下不绘制
      }
      if (pts) hits.push({ id: fn.id, color: fn.color, label: legendLabel(fn), pts });
      legendRows.push({ color: fn.color, dash: null, label: truncate(legendLabel(fn), 30) });
    }

    drawToolOverlays(state, ctx, vp, rect, legendRows);
    ctx.restore();

    if (state.opts.legend && legendRows.length) drawLegend(ctx, rect, legendRows);
    drawDatatip(state, ctx, vp, rect);

    return { rect, hits };
  }

  /* ---------------- 分析工具叠加层 ---------------- */

  function drawToolOverlays(state, ctx, vp, rect, legendRows) {
    const td = state.toolsData;
    if (!td || !td.target) return;
    const target = state.funcs.find(f => f.id === state.tools.targetId);
    if (!target || !target.visible) return;

    const c2 = plot.curves2d;
    const color = target.color;

    /* 导数曲线 f′ / f″ */
    if (td.d1fn) {
      c2.drawExplicit(ctx, vp, rect, td.d1fn, color, { dash: [7, 4], width: 1.5 });
      legendRows.push({ color, dash: [7, 4], label: "f′" + (td.d1Text ? ' = ' + truncate(td.d1Text, 24) : '') });
    }
    if (td.d2fn) {
      c2.drawExplicit(ctx, vp, rect, td.d2fn, color, { dash: [2.5, 3.5], width: 1.4 });
      legendRows.push({ color, dash: [2.5, 3.5], label: 'f″' });
    }

    /* 泰勒多项式 */
    if (td.taylor && td.taylor.ok) {
      const tf = scope => td.taylor.fn(scope.x);
      c2.drawExplicit(ctx, vp, rect, tf, TOOL_COLORS.taylor, { dash: [9, 5], width: 1.8 });
      legendRows.push({ color: TOOL_COLORS.taylor, dash: [9, 5], label: `泰勒 P${state.tools.taylor.order}(x)` });
      /* 展开点标记 */
      const x0 = state.tools.taylor.x0;
      const y0 = td.taylor.fn(x0);
      if (Number.isFinite(y0)) drawPointMarker(ctx, vp.xToPx(x0, rect), vp.yToPx(y0, rect), TOOL_COLORS.taylor);
    }

    /* 定积分区域 */
    if (td.integral && td.integral.shadeFn) {
      const { a, b } = td.integral;
      const f = td.integral.shadeFn;
      const R = td.integral.riemann;
      ctx.save();
      const y0px = vp.yToPx(0, rect);
      if (R) {
        /* 黎曼和矩形（替代平滑着色，呈现定积分的定义过程） */
        ctx.fillStyle = hexToRgba(color, 0.16);
        ctx.strokeStyle = hexToRgba(color, 0.6);
        ctx.lineWidth = 1;
        for (const r of R.rects) {
          const x0p = vp.xToPx(r.x0, rect);
          const x1p = vp.xToPx(r.x1, rect);
          const ytp = vp.yToPx(r.y, rect);
          const top = Math.min(ytp, y0px);
          const hgt = Math.abs(y0px - ytp);
          ctx.fillRect(x0p, top, x1p - x0p, hgt);
          if (hgt > 1.5 && Math.abs(x1p - x0p) > 2.5) {
            ctx.strokeRect(x0p + 0.5, top + 0.5, x1p - x0p - 1, hgt - 1);
          }
        }
        legendRows.push({ color, dash: [3, 3], label: `黎曼和 n=${R.n}` });
      } else {
        ctx.beginPath();
        const n = 420;
        ctx.moveTo(vp.xToPx(a, rect), y0px);
        for (let i = 0; i <= n; i++) {
          const x = a + (b - a) * i / n;
          let y;
          try { y = f({ x }); } catch (e) { y = 0; }
          if (!Number.isFinite(y)) y = 0;
          ctx.lineTo(vp.xToPx(x, rect), vp.yToPx(y, rect));
        }
        ctx.lineTo(vp.xToPx(b, rect), y0px);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.20);
        ctx.fill();
      }
      /* 积分上下限竖线 */
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = hexToRgba(color, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(vp.xToPx(a, rect), rect.y);
      ctx.lineTo(vp.xToPx(a, rect), rect.y + rect.h);
      ctx.moveTo(vp.xToPx(b, rect), rect.y);
      ctx.lineTo(vp.xToPx(b, rect), rect.y + rect.h);
      ctx.stroke();
      ctx.restore();
    }

    /* 切线 / 法线 */
    if (td.tangent && td.tangent.ok) {
      const { x0, y0, k } = td.tangent;
      const [xmin, xmax] = vp.xRange(rect);
      ctx.save();
      ctx.strokeStyle = TOOL_COLORS.tangent;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(vp.xToPx(xmin, rect), vp.yToPx(y0 + k * (xmin - x0), rect));
      ctx.lineTo(vp.xToPx(xmax, rect), vp.yToPx(y0 + k * (xmax - x0), rect));
      ctx.stroke();
      legendRows.push({ color: TOOL_COLORS.tangent, dash: null, label: `切线 @ x₀=${fmt(x0, 4)}` });

      if (state.tools.tangent.normal) {
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        if (Math.abs(k) < 1e-12) {            // 水平切线 → 竖直法线
          ctx.moveTo(vp.xToPx(x0, rect), rect.y);
          ctx.lineTo(vp.xToPx(x0, rect), rect.y + rect.h);
        } else {
          const kn = -1 / k;
          ctx.moveTo(vp.xToPx(xmin, rect), vp.yToPx(y0 + kn * (xmin - x0), rect));
          ctx.lineTo(vp.xToPx(xmax, rect), vp.yToPx(y0 + kn * (xmax - x0), rect));
        }
        ctx.stroke();
        legendRows.push({ color: TOOL_COLORS.tangent, dash: [5, 5], label: '法线' });
      }
      ctx.restore();
      drawPointMarker(ctx, vp.xToPx(x0, rect), vp.yToPx(y0, rect), TOOL_COLORS.tangent);
    }

    /* 特征点：零点 / 极值点 / 拐点（在当前可见范围内扫描，随平移缩放自动更新） */
    const FT = state.tools.features;
    if (FT && (FT.zeros || FT.extrema || FT.inflections) && td.evalF) {
      td.featureData = computeFeatures(state, vp, rect, td, FT);
      drawFeatureMarkers(ctx, vp, rect, td.featureData);
    } else {
      td.featureData = null;
    }
  }

  /* ---------------- 特征点 ---------------- */

  const FEATURE_COLORS = {
    zero:       '#0072BD',
    maximum:    '#d62728',
    minimum:    '#2ca02c',
    inflection: '#7E2F8E'
  };

  function computeFeatures(state, vp, rect, td, FT) {
    const calc = NS.core.calculus;
    const [xmin, xmax] = vp.xRange(rect);
    const fd = { zeros: [], maxima: [], minima: [], inflections: [] };
    const h = (xmax - xmin) / 2000;

    if (FT.zeros) {
      for (const x of calc.findRoots(td.evalF, xmin, xmax, 700)) {
        fd.zeros.push({ x, y: 0 });
      }
    }
    if (FT.extrema) {
      for (const x of calc.findRoots(td.evalD1, xmin, xmax, 700)) {
        const y = td.evalF(x);
        if (!Number.isFinite(y)) continue;
        /* 分类：先用 f″ 符号，f″≈0 时退化为邻域比较 */
        const d2 = td.evalD2(x);
        let kind = null;
        if (Number.isFinite(d2) && Math.abs(d2) > 1e-9) {
          kind = d2 < 0 ? 'max' : 'min';
        } else {
          const yl = td.evalF(x - h), yr = td.evalF(x + h);
          if (yl < y && yr < y) kind = 'max';
          else if (yl > y && yr > y) kind = 'min';
        }
        if (kind === 'max') fd.maxima.push({ x, y });
        else if (kind === 'min') fd.minima.push({ x, y });
      }
    }
    if (FT.inflections) {
      for (const x of calc.findRoots(td.evalD2, xmin, xmax, 700)) {
        const y = td.evalF(x);
        if (!Number.isFinite(y)) continue;
        /* 确认凹凸性确实改变（排除 f″ 触零不变号的点） */
        const a = td.evalD2(x - 5 * h), b = td.evalD2(x + 5 * h);
        if (Number.isFinite(a) && Number.isFinite(b) && a * b < 0) {
          fd.inflections.push({ x, y });
        }
      }
    }
    return fd;
  }

  function drawFeatureMarkers(ctx, vp, rect, fd) {
    const inView = (sx, sy) =>
      sx >= rect.x - 5 && sx <= rect.x + rect.w + 5 &&
      sy >= rect.y - 5 && sy <= rect.y + rect.h + 5;

    ctx.save();
    /* 零点：空心圆 */
    for (const p of fd.zeros) {
      const sx = vp.xToPx(p.x, rect), sy = vp.yToPx(p.y, rect);
      if (!inView(sx, sy)) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = FEATURE_COLORS.zero;
      ctx.stroke();
    }
    /* 极大 ▲ / 极小 ▼ */
    const tri = (sx, sy, up, color) => {
      const r = 5;
      ctx.beginPath();
      ctx.moveTo(sx, sy + (up ? -r : r));
      ctx.lineTo(sx - r, sy + (up ? r * 0.8 : -r * 0.8));
      ctx.lineTo(sx + r, sy + (up ? r * 0.8 : -r * 0.8));
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    };
    for (const p of fd.maxima) {
      const sx = vp.xToPx(p.x, rect), sy = vp.yToPx(p.y, rect);
      if (inView(sx, sy)) tri(sx, sy, true, FEATURE_COLORS.maximum);
    }
    for (const p of fd.minima) {
      const sx = vp.xToPx(p.x, rect), sy = vp.yToPx(p.y, rect);
      if (inView(sx, sy)) tri(sx, sy, false, FEATURE_COLORS.minimum);
    }
    /* 拐点 ◆ */
    for (const p of fd.inflections) {
      const sx = vp.xToPx(p.x, rect), sy = vp.yToPx(p.y, rect);
      if (!inView(sx, sy)) continue;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 5);
      ctx.lineTo(sx + 5, sy);
      ctx.lineTo(sx, sy + 5);
      ctx.lineTo(sx - 5, sy);
      ctx.closePath();
      ctx.fillStyle = FEATURE_COLORS.inflection;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPointMarker(ctx, sx, sy, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 图例（MATLAB legend 风格） ---------------- */

  function drawLegend(ctx, rect, rows) {
    ctx.save();
    ctx.font = '12px Consolas, "Courier New", monospace';
    let maxW = 0;
    for (const r of rows) maxW = Math.max(maxW, ctx.measureText(r.label).width);
    const lineSample = 26, padX = 10, rowH = 19;
    const w = lineSample + 8 + maxW + padX * 2;
    const h = rows.length * rowH + 10;
    const x = rect.x + rect.w - w - 10;
    const y = rect.y + 10;

    ctx.fillStyle = 'rgba(255,255,255,0.93)';
    ctx.strokeStyle = '#9aa1a8';
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    rows.forEach((r, i) => {
      const cy = y + 5 + i * rowH + rowH / 2;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.setLineDash(r.dash || []);
      ctx.beginPath();
      ctx.moveTo(x + padX, cy);
      ctx.lineTo(x + padX + lineSample, cy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#1d2730';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.label, x + padX + lineSample + 8, cy);
    });
    ctx.restore();
  }

  /* ---------------- 数据提示（单击曲线） ---------------- */

  function drawDatatip(state, ctx, vp, rect) {
    const dt = state.runtime.datatip;
    if (!dt) return;
    const sx = vp.xToPx(dt.wx, rect);
    const sy = vp.yToPx(dt.wy, rect);
    if (sx < rect.x || sx > rect.x + rect.w || sy < rect.y || sy > rect.y + rect.h) return;

    drawPointMarker(ctx, sx, sy, dt.color || '#0072BD');

    const lines = ['x = ' + fmt(dt.wx, 6), 'y = ' + fmt(dt.wy, 6)];
    ctx.save();
    ctx.font = '11.5px Consolas, monospace';
    const w = Math.max(...lines.map(s => ctx.measureText(s).width)) + 16;
    const h = 36;
    let bx = sx + 12, by = sy - h - 10;
    if (bx + w > rect.x + rect.w) bx = sx - w - 12;
    if (by < rect.y) by = sy + 12;

    ctx.fillStyle = '#fffbe6';
    ctx.strokeStyle = '#b8b09a';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, w, h);
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = '#3a3a28';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(lines[0], bx + 8, by + 5);
    ctx.fillText(lines[1], bx + 8, by + 19);
    ctx.restore();
  }

  /* ---------------- 3D 渲染 ---------------- */

  function render3D(state, ctx, W, H) {
    const scene = { surfaces: [], curves: [], grid: state.opts.grid };
    for (const fn of state.funcs) {
      if (!fn.visible || !fn.c || !fn.c.ok) continue;
      if (fn.type === 'surface') {
        scene.surfaces.push({
          f: fn.c.fns.z,
          x0: fn.c.dom.x0, x1: fn.c.dom.x1,
          y0: fn.c.dom.y0, y1: fn.c.dom.y1
        });
      } else if (fn.type === 'curve3d') {
        scene.curves.push({
          fx: fn.c.fns.x, fy: fn.c.fns.y, fz: fn.c.fns.z,
          t0: fn.c.dom.t0, t1: fn.c.dom.t1,
          color: fn.color
        });
      }
    }
    plot.surface3d.render(ctx, W, H, state.view3, scene);
    return { rect: { x: 0, y: 0, w: W, h: H }, hits: [] };
  }

  /* ---------------- 入口 ---------------- */

  function render(state, ctx, W, H) {
    return state.mode === '3d'
      ? render3D(state, ctx, W, H)
      : render2D(state, ctx, W, H);
  }

  plot.plotter = { render, legendLabel };

})(typeof window !== 'undefined' ? window : globalThis);
