/* ============================================================
 * app/tools.js — 分析工具（微积分）
 * 切线/法线、导数曲线 f′ f″、定积分、泰勒展开
 * 职责：① recompute —— 把工具配置算成可绘制数据（state.toolsData）
 *      ② 工具面板 UI 的构建与结果回显
 * 依赖：core/*、app/state.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const app = NS.app;
  const core = NS.core;
  const fmt = NS.util.fmtNum;

  let refreshFn = () => {};
  let els = null;   // 面板内部 DOM 引用

  /* ---------------- 计算 ---------------- */

  /** 确保目标函数的符号导数已缓存（recompile 后自动失效重算） */
  function ensureDerivatives(target) {
    const c = target.c;
    if (c.d1ast === undefined) {
      try {
        c.d1ast = core.derivative.derivative(c.asts.f, 'x');
        c.d1fn = core.compile.compile(c.d1ast);
        c.derivErr = null;
      } catch (e) {
        c.d1ast = null;
        c.d1fn = null;
        c.derivErr = e.message;
      }
    }
    if (c.d2ast === undefined) {
      if (c.d1ast) {
        try {
          c.d2ast = core.derivative.derivative(c.d1ast, 'x');
          c.d2fn = core.compile.compile(c.d2ast);
        } catch (e) {
          c.d2ast = null;
          c.d2fn = null;
        }
      } else {
        c.d2ast = null;
        c.d2fn = null;
      }
    }
  }

  /** 把工具配置重算为 state.toolsData（供 plotter 叠加绘制） */
  function recompute(state) {
    const T = state.tools;
    const td = { target: null, errors: {} };
    state.toolsData = td;

    const target = state.funcs.find(f =>
      f.id === T.targetId && f.type === 'explicit' && f.c && f.c.ok);
    if (!target) return;

    td.target = target;
    const f = target.c.fns.f;
    const fx = x => f({ x });
    ensureDerivatives(target);

    /* 数值后备：符号求导失败时仍可画导数曲线/切线 */
    const d1Eval = target.c.d1fn
      ? (x => target.c.d1fn({ x }))
      : (x => core.calculus.numericDiff(fx, x));

    /* 导数曲线 */
    if (T.deriv.d1) {
      td.d1fn = scope => d1Eval(scope.x);
      td.d1Text = target.c.d1ast
        ? core.parser.astToString(target.c.d1ast)
        : null;
      td.d1Numeric = !target.c.d1ast;
    }
    if (T.deriv.d2) {
      td.d2fn = target.c.d2fn
        ? (scope => target.c.d2fn({ x: scope.x }))
        : (scope => core.calculus.numericDiff(d1Eval, scope.x));
    }

    /* 切线 / 法线 */
    if (T.tangent.on) {
      try {
        const x0 = app.state.parseConstExpr(T.tangent.x0);
        td.tangent = core.calculus.tangentAt(fx, d1Eval, x0);
      } catch (e) {
        td.errors.tangent = 'x₀ ' + e.message;
      }
    }

    /* 定积分 */
    if (T.integral.on) {
      try {
        const a = app.state.parseConstExpr(T.integral.a);
        const b = app.state.parseConstExpr(T.integral.b);
        const r = core.calculus.simpson(fx, a, b, 2000);
        td.integral = { a, b, value: r.value, ok: r.ok, nanCount: r.nanCount, shadeFn: f };
      } catch (e) {
        td.errors.integral = '积分限 ' + e.message;
      }
    }

    /* 泰勒展开 */
    if (T.taylor.on) {
      try {
        const x0 = app.state.parseConstExpr(T.taylor.x0);
        td.taylor = core.calculus.taylor(target.c.asts.f, x0, T.taylor.order);
      } catch (e) {
        td.errors.taylor = 'x₀ ' + e.message;
      }
    }
  }

  /* ---------------- UI ---------------- */

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else el.setAttribute(k, v);
      }
    }
    (children || []).forEach(c => el.appendChild(c));
    return el;
  }

  function buildUI(state) {
    const panel = document.getElementById('tools-panel');
    panel.innerHTML = '';
    els = {};

    /* 空状态提示 */
    els.empty = h('div', { class: 'tools-empty hidden', text: '先在上方添加一个「显式函数 y = f(x)」，即可使用切线、积分、泰勒展开等工具。' });
    panel.appendChild(els.empty);

    els.wrap = h('div');
    panel.appendChild(els.wrap);

    /* 目标函数选择 */
    const targetSel = h('select', { title: '选择分析对象' });
    targetSel.addEventListener('change', () => {
      state.tools.targetId = targetSel.value;
      refreshFn();
    });
    els.targetSel = targetSel;
    els.wrap.appendChild(h('div', { class: 'tool-target-row' }, [
      h('span', { text: '对象' }), targetSel
    ]));

    /* ---- 工具组构造器 ---- */
    function group(title, swatchColor, onToggle) {
      const cb = h('input', { type: 'checkbox' });
      const head = h('label', { class: 'tool-group-head' }, [
        cb, h('span', { text: title }),
        h('span', { class: 'tg-swatch', style: `background:${swatchColor}` })
      ]);
      const body = h('div', { class: 'tool-group-body hidden' });
      const result = h('div', { class: 'tool-result hidden' });
      cb.addEventListener('change', () => {
        body.classList.toggle('hidden', !cb.checked);
        onToggle(cb.checked);
        refreshFn();
      });
      const box = h('div', { class: 'tool-group' }, [head, body]);
      body.appendChild(result);   // result 常驻 body 末尾
      els.wrap.appendChild(box);
      return { cb, body, result };
    }

    function exprInput(value, onChange, width) {
      const inp = h('input', { class: 'num-input', value });
      if (width) inp.style.width = width;
      inp.addEventListener('input', () => { onChange(inp.value); refreshFn(); });
      return inp;
    }

    /* ---- 切线与法线 ---- */
    {
      const g = group('切线与法线', '#d62728', on => { state.tools.tangent.on = on; });
      els.tangent = g;

      const x0Input = exprInput(state.tools.tangent.x0, v => {
        state.tools.tangent.x0 = v;
        syncSlider();
      });
      const slider = h('input', { type: 'range', min: '-10', max: '10', step: '0.05', value: '1' });
      slider.addEventListener('input', () => {
        state.tools.tangent.x0 = slider.value;
        x0Input.value = slider.value;
        refreshFn();
      });
      function syncSlider() {
        try {
          const v = app.state.parseConstExpr(state.tools.tangent.x0);
          if (v >= -10 && v <= 10) slider.value = String(v);
        } catch (e) { /* 输入中暂时非法，忽略 */ }
      }
      els.tangentX0 = x0Input;
      els.tangentSlider = slider;

      const normalCb = h('input', { type: 'checkbox' });
      normalCb.checked = state.tools.tangent.normal;
      normalCb.addEventListener('change', () => {
        state.tools.tangent.normal = normalCb.checked;
        refreshFn();
      });
      els.tangentNormal = normalCb;

      g.body.insertBefore(h('div', { class: 'tool-row' }, [
        h('span', { text: '切点 x₀ =' }), x0Input
      ]), g.result);
      g.body.insertBefore(h('div', { class: 'tool-row' }, [slider]), g.result);
      g.body.insertBefore(h('div', { class: 'tool-row' }, [
        h('label', { class: 'inline' }, [normalCb, h('span', { text: '同时绘制法线' })])
      ]), g.result);
    }

    /* ---- 导数曲线 ---- */
    {
      const g = group('导数曲线', '#5b6770', () => { /* 总开关即两个子开关的容器 */ });
      els.deriv = g;
      const d1 = h('input', { type: 'checkbox' });
      const d2 = h('input', { type: 'checkbox' });
      d1.addEventListener('change', () => { state.tools.deriv.d1 = d1.checked; refreshFn(); });
      d2.addEventListener('change', () => { state.tools.deriv.d2 = d2.checked; refreshFn(); });
      els.derivD1 = d1;
      els.derivD2 = d2;
      g.body.insertBefore(h('div', { class: 'tool-row' }, [
        h('label', { class: 'inline' }, [d1, h('span', { text: '一阶导 f′（长虚线）' })]),
        h('label', { class: 'inline' }, [d2, h('span', { text: '二阶导 f″（点线）' })])
      ]), g.result);
      /* 该组的勾选框含义改为"展开设置"，同时启用 d1 */
      g.cb.addEventListener('change', () => {
        if (g.cb.checked && !state.tools.deriv.d1 && !state.tools.deriv.d2) {
          state.tools.deriv.d1 = true;
          d1.checked = true;
          refreshFn();
        }
        if (!g.cb.checked) {
          state.tools.deriv.d1 = state.tools.deriv.d2 = false;
          d1.checked = d2.checked = false;
          refreshFn();
        }
      });
    }

    /* ---- 定积分 ---- */
    {
      const g = group('定积分（区域着色 + Simpson 数值积分）', '#0072BD',
        on => { state.tools.integral.on = on; });
      els.integral = g;
      const a = exprInput(state.tools.integral.a, v => { state.tools.integral.a = v; });
      const b = exprInput(state.tools.integral.b, v => { state.tools.integral.b = v; });
      els.integralA = a;
      els.integralB = b;
      g.body.insertBefore(h('div', { class: 'tool-row' }, [
        h('span', { text: '从 a =' }), a,
        h('span', { text: '到 b =' }), b
      ]), g.result);
    }

    /* ---- 泰勒展开 ---- */
    {
      const g = group('泰勒展开', '#7E2F8E', on => { state.tools.taylor.on = on; });
      els.taylor = g;
      const x0 = exprInput(state.tools.taylor.x0, v => { state.tools.taylor.x0 = v; });
      const order = h('select');
      for (let i = 1; i <= 10; i++) {
        order.appendChild(h('option', { value: String(i), text: i + ' 阶' }));
      }
      order.value = String(state.tools.taylor.order);
      order.addEventListener('change', () => {
        state.tools.taylor.order = parseInt(order.value, 10);
        refreshFn();
      });
      els.taylorX0 = x0;
      els.taylorOrder = order;
      g.body.insertBefore(h('div', { class: 'tool-row' }, [
        h('span', { text: '展开点 x₀ =' }), x0,
        h('span', { text: '阶数' }), order
      ]), g.result);
    }
  }

  /** 重建目标下拉框选项（函数列表变化时调用） */
  function syncTargets(state) {
    if (!els) return;
    const explicits = state.funcs.filter(f => f.type === 'explicit');
    const sel = els.targetSel;

    if (!explicits.length) {
      els.empty.classList.remove('hidden');
      els.wrap.classList.add('hidden');
      state.tools.targetId = null;
      return;
    }
    els.empty.classList.add('hidden');
    els.wrap.classList.remove('hidden');

    if (!explicits.some(f => f.id === state.tools.targetId)) {
      state.tools.targetId = explicits[0].id;
    }
    sel.innerHTML = '';
    for (const f of explicits) {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = (f.label || 'y = ' + f.exprs.f).slice(0, 36);
      sel.appendChild(opt);
    }
    sel.value = state.tools.targetId;
  }

  /** 把 state.tools 的当前值同步到控件（加载示例/恢复状态后调用） */
  function syncInputs(state) {
    if (!els) return;
    const T = state.tools;
    els.tangent.cb.checked = T.tangent.on;
    els.tangent.body.classList.toggle('hidden', !T.tangent.on);
    els.tangentX0.value = T.tangent.x0;
    els.tangentNormal.checked = T.tangent.normal;

    const derivOn = T.deriv.d1 || T.deriv.d2;
    els.deriv.cb.checked = derivOn;
    els.deriv.body.classList.toggle('hidden', !derivOn);
    els.derivD1.checked = T.deriv.d1;
    els.derivD2.checked = T.deriv.d2;

    els.integral.cb.checked = T.integral.on;
    els.integral.body.classList.toggle('hidden', !T.integral.on);
    els.integralA.value = T.integral.a;
    els.integralB.value = T.integral.b;

    els.taylor.cb.checked = T.taylor.on;
    els.taylor.body.classList.toggle('hidden', !T.taylor.on);
    els.taylorX0.value = T.taylor.x0;
    els.taylorOrder.value = String(T.taylor.order);
  }

  /** 结果回显（每次 recompute 后调用） */
  function updateResults(state) {
    if (!els) return;
    const td = state.toolsData || { errors: {} };
    const T = state.tools;

    const show = (g, text) => {
      g.result.classList.toggle('hidden', !text);
      g.result.textContent = text || '';
    };

    /* 切线 */
    if (T.tangent.on) {
      if (td.errors.tangent) show(els.tangent, td.errors.tangent);
      else if (td.tangent && td.tangent.ok) {
        show(els.tangent,
          `f(x₀)  = ${fmt(td.tangent.y0)}\n` +
          `f′(x₀) = ${fmt(td.tangent.k)}\n` +
          `切线: ${td.tangent.eq}`);
      } else if (td.tangent) {
        show(els.tangent, td.tangent.reason);
      } else show(els.tangent, '');
    } else show(els.tangent, '');

    /* 导数 */
    if (T.deriv.d1 || T.deriv.d2) {
      let txt = '';
      if (td.d1Text) txt = `f′(x) = ${td.d1Text}`;
      else if (td.d1Numeric) txt = 'f′ 采用数值微分（该函数暂不支持符号求导）';
      if (T.deriv.d2 && td.target && td.target.c.d2ast) {
        txt += (txt ? '\n' : '') + `f″(x) = ${core.parser.astToString(td.target.c.d2ast)}`;
      }
      show(els.deriv, txt);
    } else show(els.deriv, '');

    /* 积分 */
    if (T.integral.on) {
      if (td.errors.integral) show(els.integral, td.errors.integral);
      else if (td.integral) {
        let txt = `∫[${fmt(td.integral.a, 5)} → ${fmt(td.integral.b, 5)}] f(x) dx ≈ ${fmt(td.integral.value, 8)}`;
        if (!td.integral.ok) txt += `\n注意：区间内有 ${td.integral.nanCount} 个无定义采样点，结果按 0 处理（瑕积分需谨慎）`;
        show(els.integral, txt);
      } else show(els.integral, '');
    } else show(els.integral, '');

    /* 泰勒 */
    if (T.taylor.on) {
      if (td.errors.taylor) show(els.taylor, td.errors.taylor);
      else if (td.taylor) {
        show(els.taylor, td.taylor.ok ? td.taylor.text : td.taylor.reason);
      } else show(els.taylor, '');
    } else show(els.taylor, '');
  }

  function init(state, refresh) {
    refreshFn = refresh;
    buildUI(state);
    syncTargets(state);
    syncInputs(state);
  }

  app.tools = { init, recompute, syncTargets, syncInputs, updateResults };

})(typeof window !== 'undefined' ? window : globalThis);
