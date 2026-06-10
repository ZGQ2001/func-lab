/* ============================================================
 * tests/core.test.js — 数学核心层单元测试
 * 运行方式：
 *   ① node tests/core.test.js          （命令行）
 *   ② 浏览器打开 tests/run-tests.html  （网页）
 * 覆盖：解析/求值、隐式乘法、符号求导、Simpson 积分、
 *      泰勒展开、切线、刻度工具
 * ============================================================ */
(function () {
  'use strict';
  const isNode = typeof window === 'undefined';
  if (isNode) {
    require('../js/core/runtime.js');
    require('../js/core/parser.js');
    require('../js/core/compile.js');
    require('../js/core/derivative.js');
    require('../js/core/calculus.js');
    require('../js/plot/viewport.js');   // 纯数学，无 DOM 依赖
  }
  const NS = (isNode ? globalThis : window).FuncLab;
  const { parse, astToString, collectVars } = NS.core.parser;
  const { compile } = NS.core.compile;
  const { derivative, NotDifferentiableError } = NS.core.derivative;
  const { simpson, riemann, taylor, tangentAt, odeCurve, findRoots } = NS.core.calculus;

  const results = [];
  let passed = 0;

  function check(name, fn) {
    try {
      fn();
      passed++;
      results.push(['PASS', name]);
    } catch (e) {
      results.push(['FAIL', name + '  →  ' + e.message]);
    }
  }
  function assertNear(actual, expected, eps, what) {
    eps = eps === undefined ? 1e-9 : eps;
    if (!(Math.abs(actual - expected) <= eps)) {
      throw new Error(`${what || ''} 期望 ${expected}，实际 ${actual}`);
    }
  }
  function assertThrows(fn, what) {
    try { fn(); } catch (e) { return e; }
    throw new Error(`${what || ''} 应当抛出错误但没有`);
  }

  const evalX = (src, x) => compile(parse(src, ['x']))({ x });

  /* ---------------- 解析与求值 ---------------- */

  check('四则运算优先级 2+3*4 = 14', () => assertNear(evalX('2+3*4', 0), 14));
  check('乘方右结合 2^3^2 = 512', () => assertNear(evalX('2^3^2', 0), 512));
  check('负号与乘方 -x^2 |x=3 = -9', () => assertNear(evalX('-x^2', 3), -9));
  check('乘方负指数 x^-2 |x=2 = 0.25', () => assertNear(evalX('x^-2', 2), 0.25));
  check('隐式乘法 2x |x=5 = 10', () => assertNear(evalX('2x', 5), 10));
  check('隐式乘法 3sin(x) |x=π/2 = 3', () => assertNear(evalX('3sin(x)', Math.PI / 2), 3));
  check('隐式乘法 (x+1)(x-1) |x=3 = 8', () => assertNear(evalX('(x+1)(x-1)', 3), 8));
  check('连写拆分 xy |x=2,y=3 = 6', () => {
    const f = compile(parse('xy', ['x', 'y']));
    assertNear(f({ x: 2, y: 3 }), 6);
  });
  check('连写拆分 xsin(x) |x=π/2 = π/2', () => assertNear(evalX('xsin(x)', Math.PI / 2), Math.PI / 2));
  check('常量 e^x |x=1 = e', () => assertNear(evalX('e^x', 1), Math.E));
  check('常量连写 2pi = 2π', () => assertNear(evalX('2pi', 0), 2 * Math.PI));
  check('科学计数 2e3 = 2000', () => assertNear(evalX('2e3', 0), 2000));
  check('2e 解析为 2·e', () => assertNear(evalX('2e', 0), 2 * Math.E));
  check('x^2y 解析为 (x^2)·y', () => {
    const f = compile(parse('x^2y', ['x', 'y']));
    assertNear(f({ x: 3, y: 2 }), 18);
  });
  check('阶乘 5! = 120', () => assertNear(evalX('5!', 0), 120));
  check('阶乘非整数 0.5! = Γ(1.5) = √π/2', () =>
    assertNear(evalX('0.5!', 0), Math.sqrt(Math.PI) / 2, 1e-9));
  check('lg(100) = 2', () => assertNear(evalX('lg(100)', 0), 2));
  check('mod(7,3) = 1', () => assertNear(evalX('mod(7,3)', 0), 1));
  check('floor(2.7) = 2', () => assertNear(evalX('floor(2.7)', 0), 2));
  check('** 等价于 ^', () => assertNear(evalX('2**4', 0), 16));
  check('Unicode θ 变量', () => {
    const f = compile(parse('θ^2 + θ', ['θ', 'theta', 't']));
    assertNear(f({ 'θ': 2, theta: 2, t: 2 }), 6);
  });
  check('中文逗号 max(1，5) = 5', () => assertNear(evalX('max(1，5)', 0), 5));

  /* ---------------- 解析错误 ---------------- */

  check('括号不闭合应报错', () => assertThrows(() => parse('sin(x', ['x'])));
  check('未知符号应报错', () => assertThrows(() => parse('foo(x)', ['x'])));
  check('连续运算符应报错', () => assertThrows(() => parse('x+*2', ['x'])));
  check('参数个数错误应报错', () => assertThrows(() => parse('sin(1,2)', ['x'])));
  check('表达式中出现 = 应报错', () => assertThrows(() => parse('x=1', ['x'])));

  /* ---------------- 符号求导 ---------------- */

  const dEval = (src, x) => {
    const d = derivative(parse(src, ['x']), 'x');
    return compile(d)({ x });
  };

  check("(x^3)' |x=2 = 12", () => assertNear(dEval('x^3', 2), 12));
  check("(sin x)' |x=0 = 1", () => assertNear(dEval('sin(x)', 0), 1));
  check("(e^(2x))' |x=0 = 2", () => assertNear(dEval('e^(2x)', 0), 2));
  check("(ln x)' |x=2 = 0.5", () => assertNear(dEval('ln(x)', 2), 0.5));
  check("(x^x)' |x=1 = 1（一般幂指函数）", () => assertNear(dEval('x^x', 1), 1));
  check("(tan x)' |x=0 = 1", () => assertNear(dEval('tan(x)', 0), 1));
  check("(arctan x)' |x=1 = 0.5", () => assertNear(dEval('arctan(x)', 1), 0.5));
  check("(x²+3x)' |x=1 = 5", () => assertNear(dEval('x^2+3x', 1), 5));
  check("(sqrt x)' |x=4 = 0.25", () => assertNear(dEval('sqrt(x)', 4), 0.25));
  check('二阶导 (sin x)″ |x=π/2 = -1', () => {
    const d1 = derivative(parse('sin(x)', ['x']), 'x');
    const d2 = derivative(d1, 'x');
    assertNear(compile(d2)({ x: Math.PI / 2 }), -1);
  });
  check('gamma 不支持符号求导（应抛专用错误）', () => {
    const e = assertThrows(() => derivative(parse('gamma(x)', ['x']), 'x'));
    if (!(e instanceof NotDifferentiableError)) throw new Error('错误类型不对');
  });
  check('化简：常量折叠 d(3x)/dx 显示为 3', () => {
    const d = derivative(parse('3x', ['x']), 'x');
    if (astToString(d) !== '3') throw new Error('得到 ' + astToString(d));
  });

  /* ---------------- 数值积分 / 泰勒 / 切线 ---------------- */

  check('Simpson ∫₀^π sin = 2', () => {
    const f = compile(parse('sin(x)', ['x']));
    assertNear(simpson(x => f({ x }), 0, Math.PI).value, 2, 1e-8);
  });
  check('Simpson ∫₀¹ x² = 1/3', () => {
    const f = compile(parse('x^2', ['x']));
    assertNear(simpson(x => f({ x }), 0, 1).value, 1 / 3, 1e-10);
  });
  check('泰勒 sin 5 阶系数 c₃ = -1/6', () => {
    const t = taylor(parse('sin(x)', ['x']), 0, 5);
    if (!t.ok) throw new Error(t.reason);
    assertNear(t.coeffs[3], -1 / 6, 1e-10);
    assertNear(t.coeffs[5], 1 / 120, 1e-10);
  });
  check('泰勒多项式逼近 sin(0.5)', () => {
    const t = taylor(parse('sin(x)', ['x']), 0, 7);
    assertNear(t.fn(0.5), Math.sin(0.5), 1e-6);
  });
  check('泰勒 ln(x) 在 x₀=0 处应失败（无定义）', () => {
    const t = taylor(parse('ln(x)', ['x']), 0, 3);
    if (t.ok) throw new Error('不应成功');
  });
  check('切线 x² 在 x₀=3：k=6, y₀=9', () => {
    const f = compile(parse('x^2', ['x']));
    const r = tangentAt(x => f({ x }), null, 3);
    if (!r.ok) throw new Error(r.reason);
    assertNear(r.k, 6, 1e-5);
    assertNear(r.y0, 9);
  });

  /* ---------------- 宽松解析（参数滑块） ---------------- */

  check('宽松解析 a*sin(b*x)：自由参数可求值', () => {
    const ast = parse('a*sin(b*x)', ['x'], { lenient: true });
    const f = compile(ast);
    assertNear(f({ x: Math.PI / 2, a: 2, b: 1 }), 2);
  });
  check('collectVars 收集 x 与自由参数 a、b', () => {
    const vars = collectVars(parse('a*sin(b*x)', ['x'], { lenient: true }));
    if (!vars.has('a') || !vars.has('b') || !vars.has('x')) {
      throw new Error('实际收集到 ' + [...vars].join(','));
    }
  });
  check('宽松解析连写 ax → a·x', () => {
    const f = compile(parse('ax', ['x'], { lenient: true }));
    assertNear(f({ a: 3, x: 4 }), 12);
  });
  check('宽松解析 a(x+1) → a·(x+1)', () => {
    const f = compile(parse('a(x+1)', ['x'], { lenient: true }));
    assertNear(f({ a: 2, x: 4 }), 10);
  });
  check('宽松下 sinx 仍报错（不拆成 s·i·n·x）', () =>
    assertThrows(() => parse('sinx', ['x'], { lenient: true })));
  check('严格模式未知符号仍报错', () => assertThrows(() => parse('a*x', ['x'])));
  check('宽松下已知连写 pix 仍优先解析为 π·x', () => {
    const f = compile(parse('pix', ['x'], { lenient: true }));
    assertNear(f({ x: 2 }), 2 * Math.PI);
  });

  /* ---------------- 黎曼和 ---------------- */

  check('黎曼和 中点法 n=10 ∫₀¹x² = 0.3325', () => {
    const f = compile(parse('x^2', ['x']));
    const r = riemann(x => f({ x }), 0, 1, 10, 'mid');
    assertNear(r.value, 0.3325, 1e-12);
    if (r.rects.length !== 10) throw new Error('矩形数 ' + r.rects.length);
  });
  check('黎曼和 递增函数：左和 < 积分 < 右和', () => {
    const f = compile(parse('x^2', ['x']));
    const L = riemann(x => f({ x }), 0, 1, 50, 'left').value;
    const R = riemann(x => f({ x }), 0, 1, 50, 'right').value;
    if (!(L < 1 / 3 && 1 / 3 < R)) throw new Error(`L=${L}, R=${R}`);
  });

  /* ---------------- RK4 积分曲线 ---------------- */

  check("RK4 y′=y, y(0)=1：正向 y ≈ e^x", () => {
    const sol = odeCurve((x, y) => y, 0, 1, -1, 1, { density: 400 });
    if (!sol.ok || !sol.fwd.length) throw new Error('积分失败');
    const last = sol.fwd[sol.fwd.length - 1];
    assertNear(last.y, Math.exp(last.x), 1e-6);
  });
  check("RK4 y′=y：反向积分 y ≈ e^x", () => {
    const sol = odeCurve((x, y) => y, 0, 1, -1, 1, { density: 400 });
    const last = sol.bwd[sol.bwd.length - 1];
    assertNear(last.y, Math.exp(last.x), 1e-6);
  });
  check('RK4 初值处斜率无定义 → ok=false', () => {
    const sol = odeCurve((x, y) => NaN, 0, 1, -1, 1);
    if (sol.ok) throw new Error('不应成功');
  });

  /* ---------------- 扫描求根 ---------------- */

  check('findRoots sin 在 [-7,7] 找到 5 个根', () => {
    const roots = findRoots(Math.sin, -7, 7, 800);
    if (roots.length !== 5) throw new Error('得到 ' + roots.length + ' 个：' + roots.join(','));
    assertNear(roots[2], 0, 1e-6);
    assertNear(roots[3], Math.PI, 1e-6);
  });
  check('findRoots 无根函数返回空', () => {
    const roots = findRoots(x => x * x + 1, -5, 5, 400);
    if (roots.length !== 0) throw new Error('得到 ' + roots.length + ' 个');
  });

  /* ---------------- 泰勒展开的参数作用域 ---------------- */

  check('泰勒展开代入参数 a·sin(x)，c₁ = a = 2', () => {
    const t = taylor(parse('a*sin(x)', ['x'], { lenient: true }), 0, 5, { a: 2 });
    if (!t.ok) throw new Error(t.reason);
    assertNear(t.coeffs[1], 2, 1e-10);
    assertNear(t.coeffs[3], -2 / 6, 1e-10);
  });

  /* ---------------- 刻度工具 ---------------- */

  check('niceTicks 步长属于 1-2-5 序列', () => {
    const { step } = NS.plot.niceTicks(-5, 5, 800);
    const k = step / Math.pow(10, Math.floor(Math.log10(step)));
    if (![1, 2, 5, 10].some(v => Math.abs(k - v) < 1e-9)) {
      throw new Error('step = ' + step);
    }
  });
  check('formatTick 无浮点尾巴', () => {
    const s = NS.plot.formatTick(0.30000000000000004, 0.1);
    if (s !== '0.3') throw new Error('得到 ' + s);
  });

  /* ---------------- 汇总 ---------------- */

  const total = results.length;
  const summary = `FuncLab 核心测试：${passed}/${total} 通过` + (passed === total ? ' ✔' : '，存在失败 ✘');

  if (isNode) {
    for (const [st, name] of results) {
      if (st === 'FAIL') console.error('  FAIL  ' + name);
    }
    console.log(summary);
    process.exitCode = passed === total ? 0 : 1;
  } else {
    const pre = document.getElementById('out');
    pre.textContent = results.map(([st, name]) => ` ${st === 'PASS' ? '✔' : '✘'} ${name}`).join('\n')
      + '\n\n' + summary;
    pre.style.color = passed === total ? '#1a6b1a' : '#c62828';
    console.log(summary);
    window.__TEST_SUMMARY__ = { passed, total };
  }
})();
