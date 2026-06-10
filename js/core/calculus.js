/* ============================================================
 * core/calculus.js — 微积分数值/符号工具
 * Simpson 数值积分、黎曼和、数值微分（符号求导失败时的后备）、
 * 切线数据、泰勒展开（基于符号高阶导数）、
 * RK4 常微分方程积分曲线、扫描求根（零点/极值/拐点检测）
 * 依赖：core/runtime.js, core/parser.js, core/compile.js, core/derivative.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const core = NS.core;
  const fmt = NS.util.fmtNum;

  /* ---------------- Simpson 复合数值积分 ---------------- */

  /**
   * @param {(x:number)=>number} f
   * @returns {{ value:number, ok:boolean, nanCount:number }}
   */
  function simpson(f, a, b, n) {
    n = n || 2000;
    if (n % 2) n++;
    if (a === b) return { value: 0, ok: true, nanCount: 0 };
    const h = (b - a) / n;
    let sum = 0, nanCount = 0;
    for (let i = 0; i <= n; i++) {
      let y = f(a + i * h);
      if (!Number.isFinite(y)) { nanCount++; y = 0; }   // 跳过无定义/发散点
      const w = (i === 0 || i === n) ? 1 : (i % 2 ? 4 : 2);
      sum += w * y;
    }
    return { value: sum * h / 3, ok: nanCount === 0, nanCount };
  }

  /* ---------------- 黎曼和（定积分定义的可视化） ----------------
   * method: 'left' | 'mid' | 'right'
   * 返回矩形列表（世界坐标）供绘制，矩形高度取样点函数值
   */
  function riemann(f, a, b, n, method) {
    n = Math.max(1, Math.round(n || 20));
    const h = (b - a) / n;
    const off = method === 'left' ? 0 : method === 'right' ? 1 : 0.5;
    let sum = 0, nanCount = 0;
    const rects = [];
    for (let i = 0; i < n; i++) {
      const x0 = a + i * h;
      let y;
      try { y = f(x0 + off * h); } catch (e) { y = NaN; }
      if (!Number.isFinite(y)) { nanCount++; continue; }
      sum += y * h;
      rects.push({ x0, x1: x0 + h, y });
    }
    return { value: sum, rects, nanCount, n, method: method || 'mid' };
  }

  /* ---------------- 数值微分（中心差分） ---------------- */

  function numericDiff(f, x) {
    const h = 1e-5 * Math.max(1, Math.abs(x));
    return (f(x + h) - f(x - h)) / (2 * h);
  }

  /* ---------------- 常微分方程 y′ = f(x, y)：RK4 积分曲线 ----------------
   * 从初值 (x0, y0) 向两侧积分到 [xmin, xmax] 边界；
   * y 超出守护带（yLo/yHi）或出现非有限值时停止
   */
  function odeCurve(fxy, x0, y0, xmin, xmax, opts) {
    opts = opts || {};
    const maxSteps = opts.maxSteps || 4000;
    const yLo = opts.yLo !== undefined ? opts.yLo : -1e6;
    const yHi = opts.yHi !== undefined ? opts.yHi : 1e6;
    const span = Math.max(1e-12, xmax - xmin);
    const h0 = span / (opts.density || 600);

    function integrate(dir) {
      const pts = [];
      let x = x0, y = y0;
      const h = dir * h0;
      for (let i = 0; i < maxSteps; i++) {
        if (dir > 0 ? x >= xmax : x <= xmin) break;
        const k1 = fxy(x, y);
        const k2 = fxy(x + h / 2, y + h * k1 / 2);
        const k3 = fxy(x + h / 2, y + h * k2 / 2);
        const k4 = fxy(x + h, y + h * k3);
        const dy = (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
        if (!Number.isFinite(dy)) break;
        x += h;
        y += dy;
        if (!Number.isFinite(y) || y < yLo || y > yHi) break;
        pts.push({ x, y });
      }
      return pts;
    }

    const ok = Number.isFinite(fxy(x0, y0)) && Number.isFinite(y0);
    return { ok, fwd: ok ? integrate(1) : [], bwd: ok ? integrate(-1) : [] };
  }

  /* ---------------- 扫描求根 ----------------
   * 等距采样找符号变化，再二分精化；用于零点/极值（g = f′）/拐点（g = f″）
   * 返回升序根列表（相邻重复自动去除，上限 80 个）
   */
  function findRoots(g, a, b, samples) {
    samples = samples || 600;
    const roots = [];
    const minGap = (b - a) / samples * 0.5;

    function pushRoot(r) {
      if (roots.length >= 80) return;
      if (roots.length && Math.abs(r - roots[roots.length - 1]) < minGap) return;
      roots.push(r);
    }

    let xPrev = a, yPrev = safeEval(g, a);
    for (let i = 1; i <= samples; i++) {
      const x = a + (b - a) * i / samples;
      const y = safeEval(g, x);
      if (yPrev === 0) pushRoot(xPrev);
      if (Number.isFinite(yPrev) && Number.isFinite(y) && yPrev * y < 0) {
        let lo = xPrev, hi = x, ylo = yPrev;
        for (let k = 0; k < 60; k++) {
          const m = (lo + hi) / 2;
          const ym = safeEval(g, m);
          if (!Number.isFinite(ym)) break;
          if (ym === 0) { lo = hi = m; break; }
          if (ylo * ym < 0) hi = m;
          else { lo = m; ylo = ym; }
        }
        pushRoot((lo + hi) / 2);
      }
      xPrev = x;
      yPrev = y;
    }
    if (yPrev === 0) pushRoot(xPrev);
    return roots;
  }

  function safeEval(g, x) {
    try {
      const v = g(x);
      return typeof v === 'number' ? v : NaN;
    } catch (e) {
      return NaN;
    }
  }

  /* ---------------- 切线 / 法线 ----------------
   * 输入：f 求值函数、d1（导函数求值，可为 null → 数值求导）、x0
   * 输出：切点、斜率、切线方程文本
   */
  function tangentAt(f, d1, x0) {
    const y0 = f(x0);
    if (!Number.isFinite(y0)) return { ok: false, reason: `f(${fmt(x0)}) 无定义` };
    let k = d1 ? d1(x0) : numericDiff(f, x0);
    if (!Number.isFinite(k)) {
      k = numericDiff(f, x0);
      if (!Number.isFinite(k)) return { ok: false, reason: `f 在 x₀ = ${fmt(x0)} 处不可导` };
    }
    const sgn = x0 >= 0 ? '−' : '+';
    const ySgn = y0 >= 0 ? '+' : '−';
    const eq = `y = ${fmt(k, 5)}·(x ${sgn} ${fmt(Math.abs(x0), 5)}) ${ySgn} ${fmt(Math.abs(y0), 5)}`;
    return { ok: true, x0, y0, k, eq };
  }

  /* ---------------- 泰勒展开 ----------------
   * 反复符号求导求 f⁽ⁱ⁾(x0)，系数 cᵢ = f⁽ⁱ⁾(x0)/i!
   * 返回多项式求值函数与显示文本
   */
  function taylor(ast, x0, order, extraScope) {
    const { derivative } = core.derivative;
    const { compile } = core.compile;
    const { factorial } = core.runtime;

    /* extraScope：自由参数的当前取值（参数滑块），随 x 一起代入 */
    const scope = Object.assign({}, extraScope || {});
    scope.x = x0;

    const coeffs = [];
    let cur = ast;
    for (let i = 0; i <= order; i++) {
      let val;
      try {
        val = compile(cur)(scope);
      } catch (e) {
        return { ok: false, reason: '求导结果无法求值' };
      }
      if (!Number.isFinite(val)) {
        return { ok: false, reason: `f 的 ${i} 阶导数在 x₀ = ${fmt(x0)} 处无定义，无法展开` };
      }
      coeffs.push(val / factorial(i));
      if (i < order) {
        try {
          cur = derivative(cur, 'x');
        } catch (e) {
          if (e instanceof core.derivative.NotDifferentiableError) {
            return { ok: false, reason: e.message + '，无法泰勒展开' };
          }
          throw e;
        }
      }
    }

    /* 多项式求值（关于 (x − x0) 的 Horner 格式） */
    const polyFn = x => {
      const u = x - x0;
      let acc = 0;
      for (let i = coeffs.length - 1; i >= 0; i--) acc = acc * u + coeffs[i];
      return acc;
    };

    /* 展示文本：P₅(x) = x − 0.16667·x³ + … */
    const baseStr = x0 === 0 ? 'x' : `(x ${x0 > 0 ? '−' : '+'} ${fmt(Math.abs(x0), 5)})`;
    const terms = [];
    for (let i = 0; i < coeffs.length; i++) {
      const c = coeffs[i];
      if (Math.abs(c) < 1e-12) continue;
      const mag = fmt(Math.abs(c), 5);
      let body;
      if (i === 0) body = mag;
      else {
        const xs = i === 1 ? baseStr : `${baseStr}^${i}`;
        body = (Math.abs(Math.abs(c) - 1) < 1e-12) ? xs : `${mag}·${xs}`;
      }
      terms.push((terms.length === 0 ? (c < 0 ? '−' : '') : (c < 0 ? ' − ' : ' + ')) + body);
    }
    const polyStr = `P${order}(x) = ` + (terms.length ? terms.join('') : '0');

    return { ok: true, coeffs, fn: polyFn, text: polyStr };
  }

  core.calculus = { simpson, riemann, numericDiff, tangentAt, taylor, odeCurve, findRoots };

})(typeof window !== 'undefined' ? window : globalThis);
