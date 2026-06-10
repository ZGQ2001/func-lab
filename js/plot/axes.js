/* ============================================================
 * plot/axes.js — 2D 坐标系渲染（MATLAB 风格的 boxed axes）
 * 白色绘图框 + 浅灰网格 + 外侧刻度标签 + 零轴加深
 * 依赖：plot/viewport.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const plot = NS.plot;

  const COLORS = {
    figureBg: '#f2f3f5',   // 绘图框外的"图窗"灰
    plotBg:   '#ffffff',
    grid:     '#e3e6ea',
    zeroAxis: '#9aa1a8',
    border:   '#3c4650',
    tickText: '#3c4650'
  };

  /**
   * 绘制坐标系（先于曲线调用）
   * @returns 用于曲线绘制的 rect
   */
  function drawAxes(ctx, vp, W, H, opts) {
    opts = opts || {};
    const rect = vp.rect(W, H);

    /* 图窗背景 */
    ctx.fillStyle = COLORS.figureBg;
    ctx.fillRect(0, 0, W, H);

    /* 绘图框背景 */
    ctx.fillStyle = COLORS.plotBg;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

    const [xmin, xmax] = vp.xRange(rect);
    const [ymin, ymax] = vp.yRange(rect);
    const tx = plot.niceTicks(xmin, xmax, rect.w);
    const ty = plot.niceTicks(ymin, ymax, rect.h);

    /* ---- 网格 ---- */
    if (opts.grid !== false) {
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const v of tx.ticks) {
        const px = Math.round(vp.xToPx(v, rect)) + 0.5;
        ctx.moveTo(px, rect.y);
        ctx.lineTo(px, rect.y + rect.h);
      }
      for (const v of ty.ticks) {
        const py = Math.round(vp.yToPx(v, rect)) + 0.5;
        ctx.moveTo(rect.x, py);
        ctx.lineTo(rect.x + rect.w, py);
      }
      ctx.stroke();
    }

    /* ---- 零轴（x=0 / y=0 在可见范围内时加深） ---- */
    ctx.strokeStyle = COLORS.zeroAxis;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (xmin < 0 && xmax > 0) {
      const px = vp.xToPx(0, rect);
      ctx.moveTo(px, rect.y);
      ctx.lineTo(px, rect.y + rect.h);
    }
    if (ymin < 0 && ymax > 0) {
      const py = vp.yToPx(0, rect);
      ctx.moveTo(rect.x, py);
      ctx.lineTo(rect.x + rect.w, py);
    }
    ctx.stroke();

    /* ---- 边框与刻度短线 ---- */
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);

    ctx.beginPath();
    for (const v of tx.ticks) {
      const px = Math.round(vp.xToPx(v, rect)) + 0.5;
      ctx.moveTo(px, rect.y + rect.h);
      ctx.lineTo(px, rect.y + rect.h - 5);
      ctx.moveTo(px, rect.y);
      ctx.lineTo(px, rect.y + 5);
    }
    for (const v of ty.ticks) {
      const py = Math.round(vp.yToPx(v, rect)) + 0.5;
      ctx.moveTo(rect.x, py);
      ctx.lineTo(rect.x + 5, py);
      ctx.moveTo(rect.x + rect.w, py);
      ctx.lineTo(rect.x + rect.w - 5, py);
    }
    ctx.stroke();

    /* ---- 刻度标签（绘图框外侧，MATLAB 风格） ---- */
    ctx.fillStyle = COLORS.tickText;
    ctx.font = '11.5px "Segoe UI", Arial, sans-serif';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of tx.ticks) {
      ctx.fillText(plot.formatTick(v, tx.step), vp.xToPx(v, rect), rect.y + rect.h + 6);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const v of ty.ticks) {
      ctx.fillText(plot.formatTick(v, ty.step), rect.x - 7, vp.yToPx(v, rect));
    }

    return rect;
  }

  plot.axes = { drawAxes, COLORS };

})(typeof window !== 'undefined' ? window : globalThis);
