/* ============================================================
 * app/state.js — 应用状态管理
 * 类型元数据（TYPE_DEFS）、函数条目的创建/编译、示例加载、
 * localStorage 持久化
 * 依赖：core/*、plot/viewport.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const app = NS.app = NS.app || {};
  const core = NS.core;

  /* MATLAB 默认曲线色序 */
  const PALETTE = ['#0072BD', '#D95319', '#EDB120', '#7E2F8E', '#77AC30', '#4DBEEE', '#A2142F'];

  /* ---------------- 类型元数据 ---------------- */

  const TYPE_DEFS = {
    explicit: {
      name: '显式函数 y = f(x)', chip: 'y=f(x)', mode: '2d', vars: ['x'],
      fields: [{ key: 'f', lbl: 'f(x) =', ph: '例：sin(x)/x' }],
      domainGroups: [],
      defaults: { exprs: { f: 'x^2' }, domain: {} }
    },
    parametric: {
      name: '参数方程 x(t), y(t)', chip: 'x(t),y(t)', mode: '2d', vars: ['t'],
      fields: [
        { key: 'x', lbl: 'x(t) =', ph: '例：t - sin(t)' },
        { key: 'y', lbl: 'y(t) =', ph: '例：1 - cos(t)' }
      ],
      domainGroups: [{ lbl: 't', keys: ['t0', 't1'] }],
      defaults: { exprs: { x: 'cos(t)', y: 'sin(t)' }, domain: { t0: '0', t1: '2pi' } }
    },
    polar: {
      name: '极坐标 r = r(θ)', chip: 'r(θ)', mode: '2d', vars: ['θ', 'theta', 't'],
      fields: [{ key: 'r', lbl: 'r(θ) =', ph: '例：1 + cos(θ)' }],
      domainGroups: [{ lbl: 'θ', keys: ['th0', 'th1'] }],
      defaults: { exprs: { r: '1 + cos(θ)' }, domain: { th0: '0', th1: '2pi' } }
    },
    implicit: {
      name: '隐函数 F(x, y) = 0', chip: 'F(x,y)=0', mode: '2d', vars: ['x', 'y'],
      fields: [{ key: 'F', lbl: 'F(x,y):', ph: '例：x^2 + y^2 = 4' }],
      domainGroups: [],
      defaults: { exprs: { F: 'x^2 + y^2 = 4' }, domain: {} }
    },
    sequence: {
      name: '数列 a(n)', chip: 'a(n)', mode: '2d', vars: ['n'],
      fields: [{ key: 'a', lbl: 'a(n) =', ph: '例：(1 + 1/n)^n' }],
      domainGroups: [{ lbl: 'n', keys: ['n0', 'n1'] }],
      defaults: { exprs: { a: '1/n' }, domain: { n0: '1', n1: '30' } }
    },
    surface: {
      name: '三维曲面 z = f(x, y)', chip: 'z=f(x,y)', mode: '3d', vars: ['x', 'y'],
      fields: [{ key: 'z', lbl: 'z(x,y) =', ph: '例：(x^2 - y^2)/4' }],
      domainGroups: [
        { lbl: 'x', keys: ['x0', 'x1'] },
        { lbl: 'y', keys: ['y0', 'y1'] }
      ],
      defaults: {
        exprs: { z: '(x^2 - y^2)/4' },
        domain: { x0: '-4', x1: '4', y0: '-4', y1: '4' }
      }
    },
    curve3d: {
      name: '空间曲线 (x(t), y(t), z(t))', chip: '(x,y,z)(t)', mode: '3d', vars: ['t'],
      fields: [
        { key: 'x', lbl: 'x(t) =', ph: '例：2cos(t)' },
        { key: 'y', lbl: 'y(t) =', ph: '例：2sin(t)' },
        { key: 'z', lbl: 'z(t) =', ph: '例：t/4' }
      ],
      domainGroups: [{ lbl: 't', keys: ['t0', 't1'] }],
      defaults: {
        exprs: { x: '2cos(t)', y: '2sin(t)', z: 't/4' },
        domain: { t0: '0', t1: '6pi' }
      }
    }
  };

  /* ---------------- 表达式预处理 ----------------
   * 容错：允许用户把 "y ="、"r ="、"z =" 等前缀一起输入
   */
  const PREFIX_RE = {
    explicit:  /^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i,
    polar:     /^\s*(r|ρ|rho)\s*(\(\s*(θ|theta|t)\s*\))?\s*=\s*/i,
    sequence:  /^\s*a\s*(\(\s*n\s*\))?\s*=\s*/i,
    surface:   /^\s*z\s*(\(\s*x\s*,\s*y\s*\))?\s*=\s*/i,
    parametric:/^\s*[xy]\s*(\(\s*t\s*\))?\s*=\s*/i,
    curve3d:   /^\s*[xyz]\s*(\(\s*t\s*\))?\s*=\s*/i
  };

  function stripPrefix(src, type) {
    const re = PREFIX_RE[type];
    return re ? src.replace(re, '') : src;
  }

  /** 常量表达式（域端点、工具输入框）："2pi"、"-3"、"e" 等 */
  function parseConstExpr(src) {
    if (src === undefined || src === null || String(src).trim() === '') {
      throw new Error('不能为空');
    }
    const ast = core.parser.parse(String(src), []);
    const v = core.compile.compile(ast)({});
    if (!Number.isFinite(v)) throw new Error(`"${src}" 不是有效数值`);
    return v;
  }

  /* ---------------- 函数条目 ---------------- */

  let fnSeq = 1;

  function newFunc(type, overrides) {
    overrides = overrides || {};
    const def = TYPE_DEFS[type];
    return {
      id: 'fn' + (fnSeq++),
      type,
      label: overrides.label || null,
      color: overrides.color || PALETTE[0],
      visible: true,
      exprs: Object.assign({}, def.defaults.exprs, overrides.exprs),
      domain: Object.assign({}, def.defaults.domain, overrides.domain),
      c: null
    };
  }

  /** 选下一个未被占用的调色板颜色 */
  function nextColor(state) {
    const used = state.funcs.map(f => f.color);
    for (const c of PALETTE) if (!used.includes(c)) return c;
    return PALETTE[state.funcs.length % PALETTE.length];
  }

  /* ---------------- 编译 ---------------- */

  function recompileFn(fn) {
    const def = TYPE_DEFS[fn.type];
    const c = { ok: false, err: null, fns: {}, asts: {}, dom: {} };
    fn.c = c;
    try {
      /* 表达式字段 */
      for (const field of def.fields) {
        const raw = String(fn.exprs[field.key] || '').trim();
        if (!raw) throw new Error(`${field.lbl} 表达式不能为空`);
        try {
          let ast;
          if (fn.type === 'implicit') {
            ast = parseImplicit(raw, def.vars);
          } else {
            ast = core.parser.parse(stripPrefix(raw, fn.type), def.vars);
          }
          c.asts[field.key] = ast;
          c.fns[field.key] = core.compile.compile(ast);
        } catch (e) {
          throw new Error(`${field.lbl} ${e.message}`);
        }
      }
      /* 范围端点 */
      for (const g of def.domainGroups) {
        for (const k of g.keys) {
          try {
            c.dom[k] = parseConstExpr(fn.domain[k]);
          } catch (e) {
            throw new Error(`${g.lbl} 范围 ${e.message}`);
          }
        }
        const [k0, k1] = g.keys;
        if (!(c.dom[k1] > c.dom[k0])) {
          throw new Error(`${g.lbl} 范围需满足 左端点 < 右端点`);
        }
      }
      c.ok = true;
    } catch (e) {
      c.err = e.message;
    }
    return c;
  }

  /** 隐函数：允许 "F(x,y)" 或 "左边 = 右边" 两种写法 */
  function parseImplicit(raw, vars) {
    const parts = raw.split('=');
    if (parts.length > 2) throw new Error('最多只能有一个等号');
    if (parts.length === 2) {
      const l = core.parser.parse(parts[0], vars);
      const r = core.parser.parse(parts[1], vars);
      return { type: 'bin', op: '-', left: l, right: r };
    }
    return core.parser.parse(raw, vars);
  }

  function recompileAll(state) {
    for (const fn of state.funcs) recompileFn(fn);
  }

  /* ---------------- 默认状态 ---------------- */

  function defaultTools() {
    return {
      targetId: null,
      tangent:  { on: false, x0: '1', normal: false },
      deriv:    { d1: false, d2: false },
      integral: { on: false, a: '0', b: 'pi' },
      taylor:   { on: false, x0: '0', order: 5 }
    };
  }

  function createDefaultState() {
    const state = {
      mode: '2d',
      funcs: [newFunc('explicit', { exprs: { f: 'sin(x)' }, color: PALETTE[0] })],
      view2: new NS.plot.Viewport2D(),
      view3: { az: -37.5, el: 30, zoom: 1 },
      opts: { grid: true, legend: true },
      tools: defaultTools(),
      toolsData: null,
      runtime: { datatip: null, hits: [], rect: null }
    };
    recompileAll(state);
    return state;
  }

  /* ---------------- 示例加载 ---------------- */

  function loadExample(state, ex) {
    state.funcs = ex.items.map((it, i) => newFunc(it.type, {
      exprs: it.exprs,
      domain: it.domain,
      label: it.label || null,
      color: PALETTE[i % PALETTE.length]
    }));
    state.mode = ex.mode || '2d';
    state.runtime.datatip = null;

    /* 视图 */
    if (ex.mode === '3d') {
      state.view3 = Object.assign({ az: -37.5, el: 30, zoom: 1 }, ex.view3);
    } else {
      const vp = state.view2;
      const v = ex.view || {};
      vp.cx = v.cx !== undefined ? v.cx : 0;
      vp.cy = v.cy !== undefined ? v.cy : 0;
      if (v.equal === false) {
        vp.equal = false;
        vp.ppuX = v.ppuX || 70;
        vp.ppuY = v.ppuY || 70;
      } else {
        vp.equal = true;
        vp.ppuX = vp.ppuY = v.ppu || 70;
      }
    }

    /* 工具 */
    state.tools = defaultTools();
    if (ex.tools) {
      for (const k of ['tangent', 'deriv', 'integral', 'taylor']) {
        if (ex.tools[k]) Object.assign(state.tools[k], ex.tools[k]);
      }
    }
    const firstExplicit = state.funcs.find(f => f.type === 'explicit');
    state.tools.targetId = firstExplicit ? firstExplicit.id : null;

    recompileAll(state);
  }

  /* ---------------- 持久化（localStorage） ---------------- */

  const STORE_KEY = 'funclab_state_v1';

  function serialize(state) {
    const vp = state.view2;
    return JSON.stringify({
      mode: state.mode,
      funcs: state.funcs.map(f => ({
        id: f.id, type: f.type, label: f.label, color: f.color,
        visible: f.visible, exprs: f.exprs, domain: f.domain
      })),
      view2: { cx: vp.cx, cy: vp.cy, ppuX: vp.ppuX, ppuY: vp.ppuY, equal: vp.equal },
      view3: state.view3,
      opts: state.opts,
      tools: state.tools
    });
  }

  function saveState(state) {
    try { localStorage.setItem(STORE_KEY, serialize(state)); } catch (e) { /* file:// 下可能不可用，忽略 */ }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.funcs)) return null;

      const state = createDefaultState();
      state.mode = data.mode === '3d' ? '3d' : '2d';
      state.funcs = data.funcs
        .filter(f => TYPE_DEFS[f.type])
        .map(f => {
          const fn = newFunc(f.type, {
            exprs: f.exprs, domain: f.domain, label: f.label, color: f.color
          });
          fn.visible = f.visible !== false;
          return fn;
        });
      if (data.view2) {
        Object.assign(state.view2, {
          cx: +data.view2.cx || 0, cy: +data.view2.cy || 0,
          ppuX: +data.view2.ppuX || 70, ppuY: +data.view2.ppuY || 70,
          equal: data.view2.equal !== false
        });
      }
      if (data.view3) state.view3 = Object.assign(state.view3, data.view3);
      if (data.opts) state.opts = Object.assign(state.opts, data.opts);
      if (data.tools) {
        state.tools = defaultTools();
        state.tools.targetId = data.tools.targetId || null;
        for (const k of ['tangent', 'deriv', 'integral', 'taylor']) {
          if (data.tools[k]) Object.assign(state.tools[k], data.tools[k]);
        }
      }
      /* 旧 id 与计数器对齐，避免新增函数 id 冲突 */
      const maxSeq = state.funcs.reduce((m, f) => {
        const n = parseInt(String(f.id).replace('fn', ''), 10);
        return Number.isFinite(n) ? Math.max(m, n) : m;
      }, 0);
      fnSeq = maxSeq + 1;

      recompileAll(state);
      return state;
    } catch (e) {
      return null;
    }
  }

  app.state = {
    PALETTE, TYPE_DEFS,
    createDefaultState, newFunc, nextColor,
    recompileFn, recompileAll, parseConstExpr,
    loadExample, saveState, loadState
  };

})(typeof window !== 'undefined' ? window : globalThis);
