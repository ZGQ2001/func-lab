/* ============================================================
 * core/calculus.js — 微积分数值/符号工具
 * Simpson 数值积分、数值微分（符号求导失败时的后备）、
 * 切线数据、泰勒展开（基于符号高阶导数）
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

  /* ---------------- 数值微分（中心差分） ---------------- */

  function numericDiff(f, x) {
    const h = 1e-5 * Math.max(1, Math.abs(x));
    return (f(x + h) - f(x - h)) / (2 * h);
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
  function taylor(ast, x0, order) {
    const { derivative } = core.derivative;
    const { compile } = core.compile;
    const { factorial } = core.runtime;

    const coeffs = [];
    let cur = ast;
    for (let i = 0; i <= order; i++) {
      let val;
      try {
        val = compile(cur)({ x: x0 });
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

  core.calculus = { simpson, numericDiff, tangentAt, taylor };

})(typeof window !== 'undefined' ? window : globalThis);
