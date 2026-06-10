/* ============================================================
 * app/panel.js — 左侧函数列表面板
 * 函数卡片（类型/表达式/范围/颜色/显隐/删除）与"添加函数"菜单
 * 输入时只局部更新错误提示，避免重建 DOM 打断输入焦点
 * 依赖：app/state.js、app/tools.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const app = NS.app;
  const S = app.state;

  let state = null;
  let refresh = () => {};
  let setMode = () => {};

  const SVG = {
    eyeOpen: '<svg viewBox="0 0 24 24"><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/></svg>',
    eyeClosed: '<svg viewBox="0 0 24 24"><path d="M4.5 5.5l15 13M3 12c1.5-2.2 4.6-5.4 9-5.4 1.6 0 3 .4 4.3 1M21 12c-1.5 2.2-4.6 5.4-9 5.4-1.6 0-3-.4-4.3-1"/></svg>',
    del: '<svg viewBox="0 0 24 24"><path d="M6.5 6.5l11 11m0-11l-11 11"/></svg>'
  };

  /* ---------------- 添加菜单 ---------------- */

  function buildAddMenu() {
    const menu = document.getElementById('add-menu');
    menu.innerHTML = '';
    for (const [type, def] of Object.entries(S.TYPE_DEFS)) {
      const btn = document.createElement('button');
      btn.className = 'add-menu-item';
      btn.innerHTML = `<span class="type-chip">${def.chip}</span><span>${def.name}</span>`;
      btn.addEventListener('click', () => {
        menu.classList.add('hidden');
        addFunction(type);
      });
      menu.appendChild(btn);
    }

    const addBtn = document.getElementById('btn-add-fn');
    addBtn.addEventListener('click', e => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    });
    document.addEventListener('click', e => {
      if (!menu.contains(e.target)) menu.classList.add('hidden');
    });
  }

  function addFunction(type) {
    const fn = S.newFunc(type, { color: S.nextColor(state) });
    S.recompileFn(fn);
    state.funcs.push(fn);
    const defMode = S.TYPE_DEFS[type].mode;
    if (defMode !== state.mode) setMode(defMode);
    renderAll();
    refresh();
  }

  /* ---------------- 函数卡片 ---------------- */

  function renderAll() {
    const list = document.getElementById('fn-list');
    list.innerHTML = '';

    if (!state.funcs.length) {
      const empty = document.createElement('div');
      empty.className = 'fn-empty';
      empty.textContent = '暂无函数。点击右上角「添加」，或打开示例库选择经典图像。';
      list.appendChild(empty);
    } else {
      for (const fn of state.funcs) list.appendChild(buildCard(fn));
    }
    app.tools.syncTargets(state);
  }

  function buildCard(fn) {
    const def = S.TYPE_DEFS[fn.type];
    const card = document.createElement('div');
    card.className = 'fn-card' + (fn.visible ? '' : ' fn-hidden-card');

    /* ----- 头部：色块 / 类型 / 显隐 / 删除 ----- */
    const head = document.createElement('div');
    head.className = 'fn-head';

    const swatch = document.createElement('button');
    swatch.className = 'swatch';
    swatch.style.background = fn.color;
    swatch.title = '更换颜色';
    swatch.setAttribute('aria-label', '更换颜色');
    swatch.addEventListener('click', () => {
      const idx = S.PALETTE.indexOf(fn.color);
      fn.color = S.PALETTE[(idx + 1) % S.PALETTE.length];
      swatch.style.background = fn.color;
      refresh();
    });

    const typeSel = document.createElement('select');
    typeSel.className = 'fn-type-select';
    typeSel.title = '更改绘图类型';
    for (const [t, d] of Object.entries(S.TYPE_DEFS)) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = d.name;
      typeSel.appendChild(opt);
    }
    typeSel.value = fn.type;
    typeSel.addEventListener('change', () => {
      const nd = S.TYPE_DEFS[typeSel.value];
      fn.type = typeSel.value;
      fn.exprs = Object.assign({}, nd.defaults.exprs);
      fn.domain = Object.assign({}, nd.defaults.domain);
      fn.label = null;
      S.recompileFn(fn);
      if (nd.mode !== state.mode) setMode(nd.mode);
      renderAll();
      refresh();
    });

    const eyeBtn = document.createElement('button');
    eyeBtn.className = 'icon-btn';
    eyeBtn.title = fn.visible ? '隐藏曲线' : '显示曲线';
    eyeBtn.innerHTML = fn.visible ? SVG.eyeOpen : SVG.eyeClosed;
    eyeBtn.addEventListener('click', () => {
      fn.visible = !fn.visible;
      eyeBtn.innerHTML = fn.visible ? SVG.eyeOpen : SVG.eyeClosed;
      eyeBtn.title = fn.visible ? '隐藏曲线' : '显示曲线';
      card.classList.toggle('fn-hidden-card', !fn.visible);
      refresh();
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn danger';
    delBtn.title = '删除该函数';
    delBtn.innerHTML = SVG.del;
    delBtn.addEventListener('click', () => {
      state.funcs = state.funcs.filter(f => f.id !== fn.id);
      if (state.runtime.datatip && state.runtime.datatip.fnId === fn.id) {
        state.runtime.datatip = null;
      }
      renderAll();
      refresh();
    });

    head.append(swatch, typeSel, eyeBtn, delBtn);
    card.appendChild(head);

    /* ----- 主体：表达式输入 + 范围输入 ----- */
    const body = document.createElement('div');
    body.className = 'fn-body';

    const errDiv = document.createElement('div');
    errDiv.className = 'fn-error hidden';

    const updateError = () => {
      const err = fn.c && fn.c.err;
      errDiv.classList.toggle('hidden', !err);
      errDiv.textContent = err || '';
    };

    for (const field of def.fields) {
      const row = document.createElement('div');
      row.className = 'expr-row';
      const lbl = document.createElement('span');
      lbl.className = 'expr-lbl';
      lbl.textContent = field.lbl;
      const inp = document.createElement('input');
      inp.className = 'expr-input';
      inp.value = fn.exprs[field.key] || '';
      inp.placeholder = field.ph || '';
      inp.setAttribute('spellcheck', 'false');
      inp.setAttribute('aria-label', field.lbl);
      inp.addEventListener('input', () => {
        fn.exprs[field.key] = inp.value;
        fn.label = null;            // 手动编辑后放弃示例命名
        S.recompileFn(fn);
        updateError();
        app.tools.syncTargets(state);
        refresh();
      });
      row.append(lbl, inp);
      body.appendChild(row);
    }

    for (const g of def.domainGroups) {
      const row = document.createElement('div');
      row.className = 'domain-row';
      const mk = txt => {
        const s = document.createElement('span');
        s.textContent = txt;
        return s;
      };
      const in0 = document.createElement('input');
      const in1 = document.createElement('input');
      for (const [inp, key] of [[in0, g.keys[0]], [in1, g.keys[1]]]) {
        inp.className = 'num-input';
        inp.value = fn.domain[key] !== undefined ? fn.domain[key] : '';
        inp.setAttribute('spellcheck', 'false');
        inp.addEventListener('input', () => {
          fn.domain[key] = inp.value;
          S.recompileFn(fn);
          updateError();
          refresh();
        });
      }
      row.append(mk(g.lbl + ' ∈ ['), in0, mk('，'), in1, mk(']'));
      body.appendChild(row);
    }

    /* 3D 类型在 2D 模式（或反之）下的提示标签 */
    const wrongMode = def.mode !== state.mode;
    if (wrongMode) {
      const tag = document.createElement('div');
      tag.className = 'fn-label-tag';
      tag.textContent = def.mode === '3d'
        ? '※ 该条目在「3D 空间」模式下显示'
        : '※ 该条目在「2D 平面」模式下显示';
      body.appendChild(tag);
    }

    card.appendChild(body);
    card.appendChild(errDiv);
    updateError();
    return card;
  }

  /* ---------------- 初始化 ---------------- */

  function init(_state, opts) {
    state = _state;
    refresh = opts.refresh;
    setMode = opts.setMode;
    buildAddMenu();
    renderAll();
  }

  /** 状态对象被整体替换（加载示例/清空/恢复）后重新绑定 */
  function rebind(_state) {
    state = _state;
    renderAll();
  }

  app.panel = { init, renderAll, rebind };

})(typeof window !== 'undefined' ? window : globalThis);
