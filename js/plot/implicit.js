/* ============================================================
 * plot/implicit.js — 隐函数曲线 F(x, y) = 0
 * Marching Squares：对视口栅格采样 F 的符号，按 16 种情形
 * 线性插值求零点连线段
 * 依赖：plot/viewport.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const plot = NS.plot;

  const CELL_PX = 6;   // 栅格尺寸（屏幕像素），越小越精细

  /**
   * @param {(scope:Object)=>number} F  二元函数求值
   * @returns 命中检测点
   */
  function drawImplicit(ctx, vp, rect, F, color) {
    const cols = Math.max(8, Math.ceil(rect.w / CELL_PX));
    const rows = Math.max(8, Math.ceil(rect.h / CELL_PX));
    const [xmin, xmax] = vp.xRange(rect);
    const [ymin, ymax] = vp.yRange(rect);
    const dx = (xmax - xmin) / cols;
    const dy = (ymax - ymin) / rows;

    /* 栅格角点采样 */
    const grid = new Float64Array((cols + 1) * (rows + 1));
    const scope = { x: 0, y: 0 };
    for (let j = 0; j <= rows; j++) {
      scope.y = ymin + j * dy;
      const off = j * (cols + 1);
      for (let i = 0; i <= cols; i++) {
        scope.x = xmin + i * dx;
        let v;
        try { v = F(scope); } catch (e) { v = NaN; }
        grid[off + i] = v;
      }
    }

    /* 线性插值零点位置：v1 → v2 间 */
    const lerpT = (v1, v2) => {
      const d = v1 - v2;
      if (d === 0 || !Number.isFinite(d)) return 0.5;
      return Math.min(1, Math.max(0, v1 / d));
    };

    const segs = [];
    const hit = [];

    for (let j = 0; j < rows; j++) {
      const y0 = ymin + j * dy;
      const y1 = y0 + dy;
      for (let i = 0; i < cols; i++) {
        const x0 = xmin + i * dx;
        const x1 = x0 + dx;

        const v00 = grid[j * (cols + 1) + i];           // 左下
        const v10 = grid[j * (cols + 1) + i + 1];       // 右下
        const v01 = grid[(j + 1) * (cols + 1) + i];     // 左上
        const v11 = grid[(j + 1) * (cols + 1) + i + 1]; // 右上
        if (!Number.isFinite(v00) || !Number.isFinite(v10) ||
            !Number.isFinite(v01) || !Number.isFinite(v11)) continue;

        const mask = (v00 > 0 ? 1 : 0) | (v10 > 0 ? 2 : 0) |
                     (v11 > 0 ? 4 : 0) | (v01 > 0 ? 8 : 0);
        if (mask === 0 || mask === 15) continue;

        /* 四条边上的零点 */
        const eB = () => [x0 + lerpT(v00, v10) * dx, y0];   // 底边
        const eR = () => [x1, y0 + lerpT(v10, v11) * dy];   // 右边
        const eT = () => [x0 + lerpT(v01, v11) * dx, y1];   // 顶边
        const eL = () => [x0, y0 + lerpT(v00, v01) * dy];   // 左边

        switch (mask) {
          case 1:  case 14: segs.push([eL(), eB()]); break;
          case 2:  case 13: segs.push([eB(), eR()]); break;
          case 3:  case 12: segs.push([eL(), eR()]); break;
          case 4:  case 11: segs.push([eT(), eR()]); break;
          case 6:  case 9:  segs.push([eB(), eT()]); break;
          case 7:  case 8:  segs.push([eL(), eT()]); break;
          case 5: case 10: {
            /* 鞍点歧义：用中心值消解 */
            let vc;
            try { vc = F({ x: x0 + dx / 2, y: y0 + dy / 2 }); } catch (e) { vc = 0; }
            const centerPos = vc > 0;
            if ((mask === 5) === centerPos) {
              segs.push([eL(), eB()]);
              segs.push([eT(), eR()]);
            } else {
              segs.push([eL(), eT()]);
              segs.push([eB(), eR()]);
            }
            break;
          }
        }
      }
    }

    /* 绘制所有线段 */
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let s = 0; s < segs.length; s++) {
      const [[ax, ay], [bx, by]] = segs[s];
      ctx.moveTo(vp.xToPx(ax, rect), vp.yToPx(ay, rect));
      ctx.lineTo(vp.xToPx(bx, rect), vp.yToPx(by, rect));
      if (s % 4 === 0) {
        hit.push({
          sx: vp.xToPx(ax, rect), sy: vp.yToPx(ay, rect),
          wx: ax, wy: ay
        });
      }
    }
    ctx.stroke();
    ctx.restore();
    return hit;
  }

  plot.implicit = { drawImplicit };

})(typeof window !== 'undefined' ? window : globalThis);
