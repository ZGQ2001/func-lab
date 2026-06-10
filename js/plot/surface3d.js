/* ============================================================
 * plot/surface3d.js — 三维渲染子系统
 * 正交投影 + 画家算法（按深度排序绘制四边形/线段）
 * 曲面 z = f(x,y) 使用 parula 风格色图 + 朗伯光照；
 * 背景墙/网格/刻度复刻 MATLAB surf 的坐标箱
 * 依赖：plot/viewport.js（niceTicks / formatTick）
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const plot = NS.plot;

  const MESH_N = 56;        // 曲面网格密度（每方向单元数）
  const CURVE_N = 900;      // 空间曲线采样数

  /* ---------------- parula 风格色图 ---------------- */
  const PARULA = [
    [0.000,  62,  38, 168], [0.125,  64,  78, 231], [0.250,  38, 120, 245],
    [0.375,  10, 154, 224], [0.500,  27, 183, 182], [0.625,  92, 202, 119],
    [0.750, 175, 203,  56], [0.875, 243, 192,  33], [1.000, 249, 251,  20]
  ];

  function parula(t) {
    if (!Number.isFinite(t)) t = 0.5;
    t = Math.min(1, Math.max(0, t));
    for (let i = 1; i < PARULA.length; i++) {
      if (t <= PARULA[i][0]) {
        const [t0, r0, g0, b0] = PARULA[i - 1];
        const [t1, r1, g1, b1] = PARULA[i];
        const u = (t - t0) / (t1 - t0);
        return [r0 + (r1 - r0) * u, g0 + (g1 - g0) * u, b0 + (b1 - b0) * u];
      }
    }
    return [249, 251, 20];
  }

  /* ---------------- 相机（MATLAB view(az, el) 约定） ---------------- */

  function makeCamera(view3, W, H, ranges) {
    const azr = view3.az * Math.PI / 180;
    const elr = view3.el * Math.PI / 180;
    const ce = Math.cos(elr), se = Math.sin(elr);
    const ca = Math.cos(azr), sa = Math.sin(azr);

    /* 视线 forward、屏幕 right、屏幕 up（世界 up = +z） */
    const fwd   = [-sa * ce, ca * ce, -se];
    const right = [ca, sa, 0];
    const up    = [-sa * se, ca * se, ce];

    const s = Math.min(W, H) / 4.1 * (view3.zoom || 1);
    const cx = W / 2, cy = H / 2 + Math.min(W, H) * 0.02;

    const xc = (ranges.x[0] + ranges.x[1]) / 2, xh = Math.max(1e-12, (ranges.x[1] - ranges.x[0]) / 2);
    const yc = (ranges.y[0] + ranges.y[1]) / 2, yh = Math.max(1e-12, (ranges.y[1] - ranges.y[0]) / 2);
    const zc = (ranges.z[0] + ranges.z[1]) / 2, zh = Math.max(1e-12, (ranges.z[1] - ranges.z[0]) / 2);

    /* 世界坐标 → 归一化立方体 [-1,1]³（与 MATLAB 一样按轴独立拉伸） */
    function norm(x, y, z) {
      return [(x - xc) / xh, (y - yc) / yh, (z - zc) / zh];
    }

    /** 返回 [屏幕x, 屏幕y, 深度]，深度越大越远 */
    function project(x, y, z) {
      const [nx, ny, nz] = norm(x, y, z);
      const px = nx * right[0] + ny * right[1] + nz * right[2];
      const py = nx * up[0] + ny * up[1] + nz * up[2];
      const d  = nx * fwd[0] + ny * fwd[1] + nz * fwd[2];
      return [cx + s * px, cy - s * py, d];
    }

    return { project, norm, fwd, ranges };
  }

  /* ---------------- 场景范围 ---------------- */

  function computeRanges(scene) {
    let xr = null, yr = null, zr = null;
    const merge = (r, lo, hi) => r ? [Math.min(r[0], lo), Math.max(r[1], hi)] : [lo, hi];

    for (const s of scene.surfaces) {
      xr = merge(xr, s.x0, s.x1);
      yr = merge(yr, s.y0, s.y1);
      if (Number.isFinite(s.zmin)) zr = merge(zr, s.zmin, s.zmax);
    }
    for (const c of scene.curves) {
      if (c.bounds) {
        xr = merge(xr, c.bounds.x[0], c.bounds.x[1]);
        yr = merge(yr, c.bounds.y[0], c.bounds.y[1]);
        zr = merge(zr, c.bounds.z[0], c.bounds.z[1]);
      }
    }
    if (!xr) xr = [-5, 5];
    if (!yr) yr = [-5, 5];
    if (!zr) zr = [-5, 5];
    /* 退化范围保护 */
    if (zr[1] - zr[0] < 1e-9) { zr = [zr[0] - 1, zr[1] + 1]; }
    if (xr[1] - xr[0] < 1e-9) { xr = [xr[0] - 1, xr[1] + 1]; }
    if (yr[1] - yr[0] < 1e-9) { yr = [yr[0] - 1, yr[1] + 1]; }
    return { x: xr, y: yr, z: zr };
  }

  /* ---------------- 曲面网格采样 ---------------- */

  function sampleSurface(s) {
    const n = MESH_N;
    const verts = new Float64Array((n + 1) * (n + 1) * 3);
    const dx = (s.x1 - s.x0) / n;
    const dy = (s.y1 - s.y0) / n;
    let zmin = Infinity, zmax = -Infinity;
    const scope = { x: 0, y: 0 };
    for (let j = 0; j <= n; j++) {
      scope.y = s.y0 + j * dy;
      for (let i = 0; i <= n; i++) {
        scope.x = s.x0 + i * dx;
        let z;
        try { z = s.f(scope); } catch (e) { z = NaN; }
        const k = (j * (n + 1) + i) * 3;
        verts[k] = scope.x;
        verts[k + 1] = scope.y;
        verts[k + 2] = z;
        if (Number.isFinite(z)) {
          if (z < zmin) zmin = z;
          if (z > zmax) zmax = z;
        }
      }
    }
    s.zmin = zmin === Infinity ? NaN : zmin;
    s.zmax = zmax === -Infinity ? NaN : zmax;
    s.verts = verts;
    s.n = n;
  }

  /* ---------------- 空间曲线采样 ---------------- */

  function sampleCurve(c) {
    const pts = [];
    let bx = null, by = null, bz = null;
    const merge = (r, v) => r ? [Math.min(r[0], v), Math.max(r[1], v)] : [v, v];
    const dt = (c.t1 - c.t0) / CURVE_N;
    for (let i = 0; i <= CURVE_N; i++) {
      const t = c.t0 + i * dt;
      let x, y, z;
      try { x = c.fx({ t }); y = c.fy({ t }); z = c.fz({ t }); } catch (e) { x = NaN; }
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        pts.push(null);
        continue;
      }
      pts.push([x, y, z]);
      bx = merge(bx, x); by = merge(by, y); bz = merge(bz, z);
    }
    c.pts = pts;
    c.bounds = bx ? { x: bx, y: by, z: bz } : null;
  }

  /* ---------------- 坐标箱（背景墙 + 网格 + 刻度） ---------------- */

  function drawBox(ctx, cam, opts) {
    const { x: xr, y: yr, z: zr } = cam.ranges;
    const fwd = cam.fwd;

    /* 远侧墙的轴向坐标：法向与视线同向的那一侧（更远） */
    const xFar = fwd[0] > 0 ? xr[1] : xr[0];
    const yFar = fwd[1] > 0 ? yr[1] : yr[0];
    const zFar = fwd[2] > 0 ? zr[1] : zr[0];
    const xNear = xFar === xr[0] ? xr[1] : xr[0];
    const yNear = yFar === yr[0] ? yr[1] : yr[0];
    const zNear = zFar === zr[0] ? zr[1] : zr[0];

    const tx = plot.niceTicks(xr[0], xr[1], 360);
    const ty = plot.niceTicks(yr[0], yr[1], 360);
    const tz = plot.niceTicks(zr[0], zr[1], 360);

    const P = cam.project;
    const poly = (pts, fill, stroke) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [sx, sy] = P(p[0], p[1], p[2]);
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    };
    const line = (a, b) => {
      const [ax, ay] = P(a[0], a[1], a[2]);
      const [bx, by] = P(b[0], b[1], b[2]);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    };

    ctx.lineWidth = 1;

    /* 三面远墙（白底 + 边框） */
    const wallFill = '#ffffff', wallEdge = '#b9c0c7';
    poly([[xFar, yr[0], zr[0]], [xFar, yr[1], zr[0]], [xFar, yr[1], zr[1]], [xFar, yr[0], zr[1]]], wallFill, wallEdge);
    poly([[xr[0], yFar, zr[0]], [xr[1], yFar, zr[0]], [xr[1], yFar, zr[1]], [xr[0], yFar, zr[1]]], wallFill, wallEdge);
    poly([[xr[0], yr[0], zFar], [xr[1], yr[0], zFar], [xr[1], yr[1], zFar], [xr[0], yr[1], zFar]], wallFill, wallEdge);

    /* 墙面网格线 */
    if (opts.grid !== false) {
      ctx.strokeStyle = '#dde1e6';
      ctx.beginPath();
      for (const v of ty.ticks) {           // x 远墙：沿 z / 沿 y
        line([xFar, v, zr[0]], [xFar, v, zr[1]]);
      }
      for (const v of tz.ticks) {
        line([xFar, yr[0], v], [xFar, yr[1], v]);
      }
      for (const v of tx.ticks) {           // y 远墙
        line([v, yFar, zr[0]], [v, yFar, zr[1]]);
      }
      for (const v of tz.ticks) {
        line([xr[0], yFar, v], [xr[1], yFar, v]);
      }
      for (const v of tx.ticks) {           // z 远墙（地板/天花板）
        line([v, yr[0], zFar], [v, yr[1], zFar]);
      }
      for (const v of ty.ticks) {
        line([xr[0], v, zFar], [xr[1], v, zFar]);
      }
      ctx.stroke();
    }

    /* ---- 刻度标签 ---- */
    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#3c4650';

    const [bcx, bcy] = P((xr[0] + xr[1]) / 2, (yr[0] + yr[1]) / 2, (zr[0] + zr[1]) / 2);
    const labelOut = (wp, text, dist) => {
      const [sx, sy] = P(wp[0], wp[1], wp[2]);
      let dx = sx - bcx, dy = sy - bcy;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      ctx.textAlign = dx > 0.35 ? 'left' : dx < -0.35 ? 'right' : 'center';
      ctx.textBaseline = dy > 0.35 ? 'top' : dy < -0.35 ? 'bottom' : 'middle';
      ctx.fillText(text, sx + dx * dist, sy + dy * dist);
    };

    /* x 刻度：沿近侧 y 边、底部 z；y 刻度：沿近侧 x 边 */
    for (const v of tx.ticks) labelOut([v, yNear, zFar], plot.formatTick(v, tx.step), 12);
    for (const v of ty.ticks) labelOut([xNear, v, zFar], plot.formatTick(v, ty.step), 12);
    /* z 刻度：放在 x 远、y 近的那条竖边上 */
    for (const v of tz.ticks) labelOut([xFar, yNear, v], plot.formatTick(v, tz.step), 14);

    /* 轴名 */
    ctx.font = 'italic 13px Georgia, "Times New Roman", serif';
    ctx.fillStyle = '#1d2730';
    labelOut([(xr[0] + xr[1]) / 2, yNear, zFar], 'x', 30);
    labelOut([xNear, (yr[0] + yr[1]) / 2, zFar], 'y', 30);
    labelOut([xFar, yNear, (zr[0] + zr[1]) / 2], 'z', 32);
  }

  /* ---------------- 主渲染入口 ---------------- */

  /**
   * @param scene { surfaces:[{f,x0,x1,y0,y1}], curves:[{fx,fy,fz,t0,t1,color}], grid:boolean }
   */
  function render(ctx, W, H, view3, scene) {
    ctx.fillStyle = '#f2f3f5';
    ctx.fillRect(0, 0, W, H);

    for (const s of scene.surfaces) sampleSurface(s);
    for (const c of scene.curves) sampleCurve(c);

    const ranges = computeRanges(scene);
    const cam = makeCamera(view3, W, H, ranges);

    drawBox(ctx, cam, { grid: scene.grid });

    /* ---- 收集可绘制单元（四边形 + 线段），统一按深度排序 ---- */
    const drawables = [];
    const L = normalize3([0.35, -0.30, 0.89]);   // 光照方向

    for (const s of scene.surfaces) {
      if (!s.verts) continue;
      const n = s.n, V = s.verts;
      const zSpan = (s.zmax - s.zmin) || 1;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const k00 = (j * (n + 1) + i) * 3;
          const k10 = k00 + 3;
          const k01 = ((j + 1) * (n + 1) + i) * 3;
          const k11 = k01 + 3;
          const z00 = V[k00 + 2], z10 = V[k10 + 2], z01 = V[k01 + 2], z11 = V[k11 + 2];
          if (!Number.isFinite(z00) || !Number.isFinite(z10) ||
              !Number.isFinite(z01) || !Number.isFinite(z11)) continue;

          const p00 = cam.project(V[k00], V[k00 + 1], z00);
          const p10 = cam.project(V[k10], V[k10 + 1], z10);
          const p11 = cam.project(V[k11], V[k11 + 1], z11);
          const p01 = cam.project(V[k01], V[k01 + 1], z01);
          const depth = (p00[2] + p10[2] + p11[2] + p01[2]) / 4;

          /* 法线（归一化空间内，对角线叉积）→ 朗伯光照系数 */
          const a = cam.norm(V[k11], V[k11 + 1], z11);
          const b = cam.norm(V[k00], V[k00 + 1], z00);
          const c = cam.norm(V[k10], V[k10 + 1], z10);
          const d = cam.norm(V[k01], V[k01 + 1], z01);
          const e1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
          const e2 = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
          let nrm = cross3(e1, e2);
          nrm = normalize3(nrm);
          const lambert = 0.72 + 0.28 * Math.abs(dot3(nrm, L));

          const zAvg = (z00 + z10 + z11 + z01) / 4;
          const [r, g, bl] = parula((zAvg - s.zmin) / zSpan);
          const fill = `rgb(${Math.round(r * lambert)},${Math.round(g * lambert)},${Math.round(bl * lambert)})`;

          drawables.push({
            depth,
            quad: [p00, p10, p11, p01],
            fill
          });
        }
      }
    }

    for (const c of scene.curves) {
      if (!c.pts) continue;
      for (let i = 1; i < c.pts.length; i++) {
        const A = c.pts[i - 1], B = c.pts[i];
        if (!A || !B) continue;
        const pa = cam.project(A[0], A[1], A[2]);
        const pb = cam.project(B[0], B[1], B[2]);
        drawables.push({
          depth: (pa[2] + pb[2]) / 2,
          seg: [pa, pb],
          color: c.color
        });
      }
    }

    drawables.sort((a, b) => b.depth - a.depth);   // 先画远的

    /* ---- 绘制 ---- */
    ctx.lineJoin = 'round';
    for (const dr of drawables) {
      if (dr.quad) {
        const q = dr.quad;
        ctx.beginPath();
        ctx.moveTo(q[0][0], q[0][1]);
        ctx.lineTo(q[1][0], q[1][1]);
        ctx.lineTo(q[2][0], q[2][1]);
        ctx.lineTo(q[3][0], q[3][1]);
        ctx.closePath();
        ctx.fillStyle = dr.fill;
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,30,40,0.28)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(dr.seg[0][0], dr.seg[0][1]);
        ctx.lineTo(dr.seg[1][0], dr.seg[1][1]);
        ctx.strokeStyle = dr.color;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
    }

    /* 空场景提示 */
    if (!scene.surfaces.length && !scene.curves.length) {
      ctx.fillStyle = '#8a939c';
      ctx.font = '13px "Segoe UI", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('在左侧添加「三维曲面 z = f(x,y)」或「空间曲线」开始绘制', W / 2, H / 2);
    }
  }

  /* ---- 向量工具 ---- */
  function cross3(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function normalize3(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  plot.surface3d = { render, parula };

})(typeof window !== 'undefined' ? window : globalThis);
