/* ============================================================
 * app/main.js — 应用入口
 * 启动流程、Ribbon 工具条、画布交互（缩放/平移/旋转/数据提示）、
 * 示例库与帮助对话框、状态栏、导出 PNG、持久化
 * 依赖：全部 core/plot/app 模块（最后加载）
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const app = NS.app;
  const S = app.state;
  const fmt = NS.util.fmtNum;

  /* ---------------- 启动 ---------------- */

  const state = S.loadState() || S.createDefaultState();

  /* URL 哈希直达示例：index.html#ex=示例名称（便于分享/截图） */
  try {
    const m = /[#&]ex=([^&]+)/.exec(location.hash);
    if (m) {
      const name = decodeURIComponent(m[1]);
      for (const cat of app.EXAMPLES) {
        const ex = cat.items.find(i => i.name === name);
        if (ex) { S.loadExample(state, ex); break; }
      }
    }
  } catch (e) { /* 哈希格式不合法时忽略 */ }

  const canvas = document.getElementById('plot-canvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('plot-wrap');
  const sbCoords = document.getElementById('sb-coords');
  const sbView = document.getElementById('sb-view');

  let cssW = 0, cssH = 0;

  /* ---------------- 渲染管线 ---------------- */

  let rafId = 0;
  function requestRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      render();
    });
  }

  function render() {
    if (cssW < 10 || cssH < 10) return;
    const out = NS.plot.plotter.render(state, ctx, cssW, cssH);
    state.runtime.hits = out.hits;
    state.runtime.rect = out.rect;
    updateStatusView();
    /* 特征点在渲染时按可见范围扫描（state.toolsData.featureData），渲染后回显列表 */
    app.tools.updateResults(state);
  }

  let saveTimer = 0;
  function saveDebounced() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => S.saveState(state), 500);
  }

  /** 任何状态变化后的统一刷新入口 */
  function refresh() {
    app.tools.recompute(state);
    app.tools.updateResults(state);
    requestRender();
    saveDebounced();
  }

  /* ---------------- 画布尺寸（DPR 适配，高分屏清晰） ---------------- */

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    cssW = wrap.clientWidth;
    cssH = wrap.clientHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }
  new ResizeObserver(resizeCanvas).observe(wrap);
  window.addEventListener('resize', resizeCanvas);   // 兜底：个别环境 RO 不触发

  /* ---------------- 模式切换 ---------------- */

  const btn2d = document.getElementById('mode-2d');
  const btn3d = document.getElementById('mode-3d');

  function syncModeButtons() {
    const is3d = state.mode === '3d';
    btn2d.classList.toggle('active', !is3d);
    btn3d.classList.toggle('active', is3d);
    btn2d.setAttribute('aria-selected', String(!is3d));
    btn3d.setAttribute('aria-selected', String(is3d));
    canvas.classList.toggle('mode3d', is3d);
    sbCoords.textContent = is3d ? `方位角 ${fmt(state.view3.az, 4)}°  仰角 ${fmt(state.view3.el, 4)}°`
                                : 'x = —, y = —';
  }

  function setMode(m) {
    state.mode = m;
    state.runtime.datatip = null;
    syncModeButtons();
    app.panel.renderAll();      // 卡片上的"模式提示"标签需要更新
    refresh();
  }

  btn2d.addEventListener('click', () => setMode('2d'));
  btn3d.addEventListener('click', () => setMode('3d'));

  /* ---------------- Ribbon 按钮 ---------------- */

  const btnEqual = document.getElementById('btn-equal');
  const btnGrid = document.getElementById('btn-grid');
  const btnLegend = document.getElementById('btn-legend');

  function syncToggleButtons() {
    btnEqual.setAttribute('aria-pressed', String(state.view2.equal));
    btnGrid.setAttribute('aria-pressed', String(state.opts.grid));
    btnLegend.setAttribute('aria-pressed', String(state.opts.legend));
  }

  document.getElementById('btn-home').addEventListener('click', () => {
    if (state.mode === '3d') {
      state.view3.az = -37.5;
      state.view3.el = 30;
      state.view3.zoom = 1;
    } else {
      state.view2.reset();
      state.view2.syncEqual();
    }
    refresh();
  });

  btnEqual.addEventListener('click', () => {
    const vp = state.view2;
    vp.equal = !vp.equal;
    vp.syncEqual();
    syncToggleButtons();
    refresh();
  });

  btnGrid.addEventListener('click', () => {
    state.opts.grid = !state.opts.grid;
    syncToggleButtons();
    refresh();
  });

  btnLegend.addEventListener('click', () => {
    state.opts.legend = !state.opts.legend;
    syncToggleButtons();
    refresh();
  });

  document.getElementById('btn-export').addEventListener('click', () => {
    canvas.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '');
      a.href = URL.createObjectURL(blob);
      a.download = `funclab_${ts}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    }, 'image/png');
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('确定要清空所有函数并重置视图吗？')) return;
    state.funcs = [];
    state.tools = S.defaultTools();
    state.view2.reset();
    state.view3 = { az: -37.5, el: 30, zoom: 1 };
    state.mode = '2d';
    state.runtime.datatip = null;
    syncModeButtons();
    syncToggleButtons();
    app.panel.renderAll();
    app.tools.syncInputs(state);
    refresh();
  });

  /* ---------------- 对话框 ---------------- */

  function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function closeModal(mask) { mask.classList.add('hidden'); }

  for (const mask of document.querySelectorAll('.modal-mask')) {
    mask.addEventListener('click', e => {
      if (e.target === mask || e.target.hasAttribute('data-close')) closeModal(mask);
    });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      for (const mask of document.querySelectorAll('.modal-mask')) closeModal(mask);
    }
  });

  document.getElementById('btn-help').addEventListener('click', () => openModal('modal-help'));

  /* ----- 示例库 ----- */

  const exCats = document.getElementById('ex-cats');
  const exItems = document.getElementById('ex-items');
  let activeCat = 0;

  function buildExamples() {
    exCats.innerHTML = '';
    app.EXAMPLES.forEach((cat, i) => {
      const btn = document.createElement('button');
      btn.className = 'ex-cat-btn' + (i === activeCat ? ' active' : '');
      btn.textContent = cat.cat;
      btn.addEventListener('click', () => {
        activeCat = i;
        buildExamples();
      });
      exCats.appendChild(btn);
    });
    renderExampleItems();
  }

  function renderExampleItems() {
    exItems.innerHTML = '';
    for (const ex of app.EXAMPLES[activeCat].items) {
      const btn = document.createElement('button');
      btn.className = 'ex-item';
      const name = document.createElement('div');
      name.className = 'ex-name';
      name.textContent = ex.name;
      const desc = document.createElement('div');
      desc.className = 'ex-desc';
      desc.textContent = ex.desc;
      const expr = document.createElement('div');
      expr.className = 'ex-expr';
      expr.textContent = ex.preview;
      btn.append(name, desc, expr);
      btn.addEventListener('click', () => {
        S.loadExample(state, ex);
        closeModal(document.getElementById('modal-examples'));
        syncModeButtons();
        syncToggleButtons();
        app.panel.renderAll();
        app.tools.syncInputs(state);
        refresh();
      });
      exItems.appendChild(btn);
    }
  }

  document.getElementById('btn-examples').addEventListener('click', () => {
    buildExamples();
    openModal('modal-examples');
  });

  /* ---------------- 画布交互 ---------------- */

  let drag = null;

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.offsetX, y: e.offsetY, sx: e.offsetX, sy: e.offsetY, moved: false };
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', e => {
    const px = e.offsetX, py = e.offsetY;

    if (drag) {
      const dx = px - drag.x, dy = py - drag.y;
      drag.x = px; drag.y = py;
      if (Math.abs(px - drag.sx) + Math.abs(py - drag.sy) > 3) drag.moved = true;

      if (state.mode === '3d') {
        state.view3.az -= dx * 0.45;
        state.view3.el = Math.min(89.5, Math.max(-89.5, state.view3.el + dy * 0.45));
        sbCoords.textContent = `方位角 ${fmt(state.view3.az, 4)}°  仰角 ${fmt(state.view3.el, 4)}°`;
      } else {
        state.view2.panPx(dx, dy);
      }
      requestRender();
      saveDebounced();
      return;
    }

    /* 悬停坐标回显（2D） */
    if (state.mode === '2d' && state.runtime.rect) {
      const r = state.runtime.rect;
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
        const wx = state.view2.pxToX(px, r);
        const wy = state.view2.pxToY(py, r);
        sbCoords.textContent = `x = ${fmt(wx, 5)}, y = ${fmt(wy, 5)}`;
      } else {
        sbCoords.textContent = 'x = —, y = —';
      }
    }
  });

  canvas.addEventListener('pointerup', e => {
    canvas.classList.remove('dragging');
    if (!drag) return;
    const wasClick = !drag.moved;
    drag = null;
    if (wasClick && state.mode === '2d') hitTestDatatip(e.offsetX, e.offsetY);
  });

  canvas.addEventListener('pointercancel', () => {
    drag = null;
    canvas.classList.remove('dragging');
  });

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (state.mode === '3d') {
      const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      state.view3.zoom = Math.min(20, Math.max(0.1, state.view3.zoom * f));
    } else {
      const rect = state.runtime.rect || state.view2.rect(cssW, cssH);
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const axis = e.shiftKey ? 'x' : (e.ctrlKey ? 'y' : 'both');
      if (axis !== 'both' && state.view2.equal) {
        state.view2.equal = false;     // 单轴缩放自动退出等比例
        syncToggleButtons();
      }
      state.view2.zoomAt(e.offsetX, e.offsetY, factor, axis, rect);
    }
    requestRender();
    saveDebounced();
  }, { passive: false });

  /** 单击曲线 → 数据提示 */
  function hitTestDatatip(px, py) {
    let best = null, bestD = 13 * 13;
    for (const h of state.runtime.hits) {
      for (const p of h.pts) {
        const d = (p.sx - px) * (p.sx - px) + (p.sy - py) * (p.sy - py);
        if (d < bestD) {
          bestD = d;
          best = { fnId: h.id, wx: p.wx, wy: p.wy, color: h.color };
        }
      }
    }
    state.runtime.datatip = best;
    requestRender();
  }

  /* ---------------- 状态栏 ---------------- */

  function updateStatusView() {
    if (state.mode === '3d') {
      sbView.textContent = `视角 az=${fmt(state.view3.az, 4)}° el=${fmt(state.view3.el, 4)}°  缩放 ×${fmt(state.view3.zoom, 3)}`;
    } else if (state.runtime.rect) {
      const r = state.runtime.rect;
      const [x0, x1] = state.view2.xRange(r);
      const [y0, y1] = state.view2.yRange(r);
      sbView.textContent = `x∈[${fmt(x0, 4)}, ${fmt(x1, 4)}]  y∈[${fmt(y0, 4)}, ${fmt(y1, 4)}]`;
    }
  }

  /* ---------------- 模块装配 ---------------- */

  app.panel.init(state, { refresh, setMode });
  app.tools.init(state, refresh);
  syncModeButtons();
  syncToggleButtons();
  resizeCanvas();
  refresh();

  /* 调试入口（控制台可用 FuncLab.app.current 查看状态） */
  app.current = state;
  app.refresh = refresh;
  app.render = render;
  app.resizeCanvas = resizeCanvas;
  app.setMode = setMode;

})(typeof window !== 'undefined' ? window : globalThis);
