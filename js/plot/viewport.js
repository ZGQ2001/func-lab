/* ============================================================
 * plot/viewport.js — 2D 视口
 * 世界坐标 ↔ 屏幕坐标变换、缩放/平移、刻度计算（1-2-5 序列）
 * 依赖：core/runtime.js（fmtNum）
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const plot = NS.plot = NS.plot || {};

  /* 绘图框（axes box）在画布内的留白，MATLAB 风格的外侧刻度标签需要空间 */
  const MARGIN = { l: 58, r: 16, t: 14, b: 34 };

  class Viewport2D {
    constructor() {
      this.cx = 0;          // 视图中心（世界坐标）
      this.cy = 0;
      this.ppuX = 70;       // 每单位像素数（px per unit）
      this.ppuY = 70;
      this.equal = true;    // 等比例：ppuY 锁定为 ppuX
    }

    reset() {
      this.cx = 0; this.cy = 0;
      this.ppuX = 70; this.ppuY = 70;
    }

    /** 绘图框矩形（CSS 像素） */
    rect(W, H) {
      return {
        x: MARGIN.l, y: MARGIN.t,
        w: Math.max(40, W - MARGIN.l - MARGIN.r),
        h: Math.max(40, H - MARGIN.t - MARGIN.b)
      };
    }

    syncEqual() { if (this.equal) this.ppuY = this.ppuX; }

    /* ---- 坐标变换（rect 为当前绘图框） ---- */
    xToPx(x, rect) { return rect.x + rect.w / 2 + (x - this.cx) * this.ppuX; }
    yToPx(y, rect) { return rect.y + rect.h / 2 - (y - this.cy) * this.ppuY; }
    pxToX(px, rect) { return this.cx + (px - rect.x - rect.w / 2) / this.ppuX; }
    pxToY(py, rect) { return this.cy - (py - rect.y - rect.h / 2) / this.ppuY; }

    xRange(rect) {
      const half = rect.w / 2 / this.ppuX;
      return [this.cx - half, this.cx + half];
    }
    yRange(rect) {
      const half = rect.h / 2 / this.ppuY;
      return [this.cy - half, this.cy + half];
    }

    /** 以屏幕点 (px,py) 为锚点缩放；axis: 'both' | 'x' | 'y' */
    zoomAt(px, py, factor, axis, rect) {
      const wx = this.pxToX(px, rect);
      const wy = this.pxToY(py, rect);
      if (axis !== 'y') this.ppuX = clampPpu(this.ppuX * factor);
      if (axis !== 'x') this.ppuY = clampPpu(this.ppuY * factor);
      if (this.equal && axis === 'both') this.ppuY = this.ppuX;
      /* 保持鼠标下的世界点不动 */
      this.cx = wx - (px - rect.x - rect.w / 2) / this.ppuX;
      this.cy = wy + (py - rect.y - rect.h / 2) / this.ppuY;
    }

    panPx(dx, dy) {
      this.cx -= dx / this.ppuX;
      this.cy += dy / this.ppuY;
    }
  }

  function clampPpu(v) { return Math.min(1e7, Math.max(1e-6, v)); }

  /* ---------------- 刻度（nice ticks，1-2-5 序列） ---------------- */

  /**
   * @param {number} min  可见范围下限
   * @param {number} max  可见范围上限
   * @param {number} px   该方向的像素长度
   * @returns {{ ticks:number[], step:number }}
   */
  function niceTicks(min, max, px) {
    const targetCount = Math.max(2, px / 80);
    const rawStep = (max - min) / targetCount;
    const k = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const m = rawStep / k;
    const step = (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * k;
    const ticks = [];
    const start = Math.ceil(min / step) * step;
    for (let v = start; v <= max + step * 1e-9; v += step) {
      ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    }
    return { ticks, step };
  }

  /** 刻度标签格式化：按步长决定小数位，过大过小用科学计数 */
  function formatTick(v, step) {
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e6 || step < 1e-4) return v.toExponential(2).replace('e', 'e');
    const decimals = step >= 1 ? 0 : Math.min(6, -Math.floor(Math.log10(step)));
    return v.toFixed(decimals);
  }

  plot.Viewport2D = Viewport2D;
  plot.niceTicks = niceTicks;
  plot.formatTick = formatTick;
  plot.MARGIN = MARGIN;

})(typeof window !== 'undefined' ? window : globalThis);
