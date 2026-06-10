/* ============================================================
 * core/runtime.js — 数学运行时
 * 提供：内置函数注册表、常量表、Γ 函数 / 阶乘、数字格式化工具
 * 依赖：无（最底层模块）
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab = root.FuncLab || {};
  const core = NS.core = NS.core || {};

  /* ---- Γ 函数（Lanczos 近似，g = 7），用于阶乘与 gamma() ---- */
  const LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  function gamma(x) {
    if (!isFinite(x)) return NaN;
    if (x < 0.5) {
      // 反射公式 Γ(x)Γ(1−x) = π / sin(πx)
      return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    }
    x -= 1;
    let a = LANCZOS[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
  }

  function factorial(x) {
    if (Number.isInteger(x) && x >= 0 && x <= 170) {
      let r = 1;
      for (let i = 2; i <= x; i++) r *= i;
      return r;
    }
    return gamma(x + 1);
  }

  /* ---- 常量表 ---- */
  const constants = {
    pi: Math.PI,
    'π': Math.PI,
    e: Math.E
  };

  /* ---- 内置函数注册表：name → { arity, fn } ---- */
  const functions = {
    sin:   { arity: 1, fn: Math.sin },
    cos:   { arity: 1, fn: Math.cos },
    tan:   { arity: 1, fn: Math.tan },
    cot:   { arity: 1, fn: x => 1 / Math.tan(x) },
    sec:   { arity: 1, fn: x => 1 / Math.cos(x) },
    csc:   { arity: 1, fn: x => 1 / Math.sin(x) },

    asin:  { arity: 1, fn: Math.asin },
    acos:  { arity: 1, fn: Math.acos },
    atan:  { arity: 1, fn: Math.atan },
    arcsin:{ arity: 1, fn: Math.asin },
    arccos:{ arity: 1, fn: Math.acos },
    arctan:{ arity: 1, fn: Math.atan },
    atan2: { arity: 2, fn: Math.atan2 },

    sinh:  { arity: 1, fn: Math.sinh },
    cosh:  { arity: 1, fn: Math.cosh },
    tanh:  { arity: 1, fn: Math.tanh },
    asinh: { arity: 1, fn: Math.asinh },
    acosh: { arity: 1, fn: Math.acosh },
    atanh: { arity: 1, fn: Math.atanh },

    exp:   { arity: 1, fn: Math.exp },
    ln:    { arity: 1, fn: Math.log },
    log:   { arity: 1, fn: Math.log },     // 与 MATLAB 一致：log = 自然对数
    lg:    { arity: 1, fn: Math.log10 },   // 中文教材习惯：lg = log10
    log10: { arity: 1, fn: Math.log10 },
    log2:  { arity: 1, fn: Math.log2 },

    sqrt:  { arity: 1, fn: Math.sqrt },
    cbrt:  { arity: 1, fn: Math.cbrt },
    abs:   { arity: 1, fn: Math.abs },
    sign:  { arity: 1, fn: Math.sign },
    floor: { arity: 1, fn: Math.floor },
    ceil:  { arity: 1, fn: Math.ceil },
    round: { arity: 1, fn: Math.round },

    min:   { arity: 2, fn: Math.min },
    max:   { arity: 2, fn: Math.max },
    mod:   { arity: 2, fn: (a, b) => a - b * Math.floor(a / b) },

    gamma: { arity: 1, fn: gamma },
    fact:  { arity: 1, fn: factorial }     // 阶乘（x! 解析为 fact(x)）
  };

  /* ---- 数字格式化（界面显示用，避免 0.30000000000000004） ---- */
  function fmtNum(v, sig) {
    sig = sig || 6;
    if (v === null || v === undefined || Number.isNaN(v)) return '无定义';
    if (v === Infinity) return '+∞';
    if (v === -Infinity) return '−∞';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e9 || a < 1e-6) {
      return v.toExponential(Math.max(0, sig - 3)).replace('e', 'e');
    }
    return String(parseFloat(v.toPrecision(sig)));
  }

  core.runtime = { constants, functions, gamma, factorial };
  NS.util = NS.util || {};
  NS.util.fmtNum = fmtNum;

})(typeof window !== 'undefined' ? window : globalThis);
