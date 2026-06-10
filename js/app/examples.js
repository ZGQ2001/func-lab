/* ============================================================
 * app/examples.js — 示例库
 * 高等数学（同济版体系）中常见的经典图像，按章节主题分类。
 * 每个示例：要加载的函数项 + 推荐视图 + 可选的分析工具配置
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const app = NS.app = NS.app || {};

  app.EXAMPLES = [
    {
      cat: '基本初等函数',
      items: [
        {
          name: '幂函数一族',
          desc: 'x²、x³、√x、1/x 的形态对比',
          preview: 'y = x^2, x^3, sqrt(x), 1/x',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 80 },
          items: [
            { type: 'explicit', exprs: { f: 'x^2' } },
            { type: 'explicit', exprs: { f: 'x^3' } },
            { type: 'explicit', exprs: { f: 'sqrt(x)' } },
            { type: 'explicit', exprs: { f: '1/x' } }
          ]
        },
        {
          name: '正弦与余弦',
          desc: '相位相差 π/2 的一对',
          preview: 'y = sin(x), cos(x)',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 70 },
          items: [
            { type: 'explicit', exprs: { f: 'sin(x)' } },
            { type: 'explicit', exprs: { f: 'cos(x)' } }
          ]
        },
        {
          name: '正切函数',
          desc: '周期 π，竖直渐近线自动断开',
          preview: 'y = tan(x)',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 70 },
          items: [{ type: 'explicit', exprs: { f: 'tan(x)' } }]
        },
        {
          name: '指数与对数',
          desc: 'e^x 与 ln(x) 关于 y = x 对称',
          preview: 'y = e^x, ln(x), x',
          mode: '2d',
          view: { cx: 0.8, cy: 0.8, ppu: 75 },
          items: [
            { type: 'explicit', exprs: { f: 'e^x' } },
            { type: 'explicit', exprs: { f: 'ln(x)' } },
            { type: 'explicit', exprs: { f: 'x' }, label: 'y = x（对称轴）' }
          ]
        },
        {
          name: '反三角函数',
          desc: 'arcsin、arccos、arctan',
          preview: 'y = arcsin(x), arccos(x), arctan(x)',
          mode: '2d',
          view: { cx: 0, cy: 0.8, ppu: 110 },
          items: [
            { type: 'explicit', exprs: { f: 'arcsin(x)' } },
            { type: 'explicit', exprs: { f: 'arccos(x)' } },
            { type: 'explicit', exprs: { f: 'arctan(x)' } }
          ]
        },
        {
          name: '取整与绝对值',
          desc: '⌊x⌋ 的阶梯与 |x| 的折角',
          preview: 'y = floor(x), abs(x)',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 70 },
          items: [
            { type: 'explicit', exprs: { f: 'floor(x)' } },
            { type: 'explicit', exprs: { f: 'abs(x)' } }
          ]
        }
      ]
    },

    {
      cat: '经典平面曲线',
      items: [
        {
          name: '摆线',
          desc: '圆沿直线滚动时圆周一点的轨迹',
          preview: 'x = t − sin t, y = 1 − cos t',
          mode: '2d',
          view: { cx: 9.4, cy: 1, ppu: 46 },
          items: [{
            type: 'parametric', label: '摆线（旋轮线）',
            exprs: { x: 't - sin(t)', y: '1 - cos(t)' },
            domain: { t0: '0', t1: '6pi' }
          }]
        },
        {
          name: '星形线',
          desc: 'x^(2/3) + y^(2/3) = 1 的参数形式',
          preview: 'x = cos³t, y = sin³t',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 220 },
          items: [{
            type: 'parametric', label: '星形线',
            exprs: { x: 'cos(t)^3', y: 'sin(t)^3' },
            domain: { t0: '0', t1: '2pi' }
          }]
        },
        {
          name: '心形线（极坐标）',
          desc: 'ρ = a(1 + cos θ)，积分典型曲线',
          preview: 'r = 2(1 + cos θ)',
          mode: '2d',
          view: { cx: 1.4, cy: 0, ppu: 95 },
          items: [{
            type: 'polar', label: '心形线',
            exprs: { r: '2(1 + cos(θ))' },
            domain: { th0: '0', th1: '2pi' }
          }]
        },
        {
          name: '三叶玫瑰线',
          desc: 'ρ = a·sin(3θ)',
          preview: 'r = 2sin(3θ)',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 120 },
          items: [{
            type: 'polar', label: '三叶玫瑰',
            exprs: { r: '2sin(3θ)' },
            domain: { th0: '0', th1: 'pi' }
          }]
        },
        {
          name: '四叶玫瑰线',
          desc: 'ρ = a·cos(2θ)',
          preview: 'r = 2cos(2θ)',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 120 },
          items: [{
            type: 'polar', label: '四叶玫瑰',
            exprs: { r: '2cos(2θ)' },
            domain: { th0: '0', th1: '2pi' }
          }]
        },
        {
          name: '阿基米德螺线',
          desc: 'ρ = aθ，每圈等距',
          preview: 'r = θ/3',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 40 },
          items: [{
            type: 'polar', label: '阿基米德螺线',
            exprs: { r: 'θ/3' },
            domain: { th0: '0', th1: '8pi' }
          }]
        },
        {
          name: '双纽线',
          desc: 'ρ² = a²cos(2θ)，∞ 字形',
          preview: 'r = 2√cos(2θ)',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 160 },
          items: [{
            type: 'polar', label: '双纽线',
            exprs: { r: '2sqrt(cos(2θ))' },
            domain: { th0: '0', th1: '2pi' }
          }]
        },
        {
          name: '笛卡尔叶形线',
          desc: 'x³ + y³ = 3axy，隐函数经典',
          preview: 'x^3 + y^3 = 3xy',
          mode: '2d',
          view: { cx: 0.4, cy: 0.4, ppu: 110 },
          items: [{
            type: 'implicit', label: '笛卡尔叶形线',
            exprs: { F: 'x^3 + y^3 = 3x*y' }
          }]
        }
      ]
    },

    {
      cat: '圆锥曲线与隐函数',
      items: [
        {
          name: '单位圆',
          desc: '开启等比例后才是正圆',
          preview: 'x² + y² = 1',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 180 },
          items: [{ type: 'implicit', exprs: { F: 'x^2 + y^2 = 1' } }]
        },
        {
          name: '椭圆',
          desc: 'a = 3, b = 2',
          preview: 'x²/9 + y²/4 = 1',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 90 },
          items: [{ type: 'implicit', exprs: { F: 'x^2/9 + y^2/4 = 1' } }]
        },
        {
          name: '双曲线',
          desc: '等轴双曲线 a = b = 2',
          preview: 'x²/4 − y²/4 = 1',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 60 },
          items: [
            { type: 'implicit', exprs: { F: 'x^2/4 - y^2/4 = 1' } },
            { type: 'explicit', exprs: { f: 'x' }, label: '渐近线 y = x' },
            { type: 'explicit', exprs: { f: '-x' }, label: '渐近线 y = −x' }
          ]
        },
        {
          name: '抛物线（横向开口）',
          desc: 'y² = 2px 形式',
          preview: 'y² = 4x',
          mode: '2d',
          view: { cx: 2, cy: 0, ppu: 80 },
          items: [{ type: 'implicit', exprs: { F: 'y^2 = 4x' } }]
        },
        {
          name: '心形曲线（隐函数）',
          desc: '著名的"爱心"方程',
          preview: '(x² + y² − 1)³ = x²y³',
          mode: '2d',
          view: { cx: 0, cy: 0.1, ppu: 200 },
          items: [{
            type: 'implicit', label: '爱心曲线',
            exprs: { F: '(x^2 + y^2 - 1)^3 = x^2*y^3' }
          }]
        }
      ]
    },

    {
      cat: '数列与极限',
      items: [
        {
          name: '重要极限 (1+1/n)ⁿ → e',
          desc: '单调有界数列收敛到 e ≈ 2.71828',
          preview: 'a(n) = (1 + 1/n)^n',
          mode: '2d',
          view: { cx: 25, cy: 2.35, ppuX: 19, ppuY: 420, equal: false },
          items: [
            { type: 'sequence', exprs: { a: '(1 + 1/n)^n' }, domain: { n0: '1', n1: '50' } },
            { type: 'explicit', exprs: { f: 'e' }, label: '极限 y = e' }
          ]
        },
        {
          name: 'sin(n)/n → 0',
          desc: '夹逼定理：|sin n / n| ≤ 1/n',
          preview: 'a(n) = sin(n)/n',
          mode: '2d',
          view: { cx: 40, cy: 0.05, ppuX: 12, ppuY: 420, equal: false },
          items: [
            { type: 'sequence', exprs: { a: 'sin(n)/n' }, domain: { n0: '1', n1: '80' } },
            { type: 'explicit', exprs: { f: '1/x' }, label: '上界 1/n' },
            { type: 'explicit', exprs: { f: '-1/x' }, label: '下界 −1/n' }
          ]
        },
        {
          name: 'ⁿ√n → 1',
          desc: 'n 的 n 次方根趋于 1',
          preview: 'a(n) = n^(1/n)',
          mode: '2d',
          view: { cx: 30, cy: 1.22, ppuX: 16, ppuY: 700, equal: false },
          items: [
            { type: 'sequence', exprs: { a: 'n^(1/n)' }, domain: { n0: '1', n1: '60' } },
            { type: 'explicit', exprs: { f: '1' }, label: '极限 y = 1' }
          ]
        }
      ]
    },

    {
      cat: '微积分演示',
      items: [
        {
          name: '切线与法线',
          desc: '三次曲线在 x₀ 处的切线',
          preview: 'f(x) = x³ − 3x，x₀ = 1.2',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 75 },
          items: [{ type: 'explicit', exprs: { f: 'x^3 - 3x' } }],
          tools: { tangent: { on: true, x0: '1.2', normal: true } }
        },
        {
          name: '导数曲线 f′ 与 f″',
          desc: '观察 f′ 的零点对应 f 的极值点',
          preview: 'f(x) = x³/3 − x',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 90 },
          items: [{ type: 'explicit', exprs: { f: 'x^3/3 - x' } }],
          tools: { deriv: { d1: true, d2: true } }
        },
        {
          name: '定积分的几何意义',
          desc: '∫₀^π sin x dx = 2（着色区域）',
          preview: 'f(x) = sin(x), [0, π]',
          mode: '2d',
          view: { cx: 1.6, cy: 0.4, ppu: 110 },
          items: [{ type: 'explicit', exprs: { f: 'sin(x)' } }],
          tools: { integral: { on: true, a: '0', b: 'pi' } }
        },
        {
          name: '泰勒展开逼近 sin x',
          desc: 'P₅(x) = x − x³/6 + x⁵/120',
          preview: 'sin(x) 在 x₀ = 0 处 5 阶展开',
          mode: '2d',
          view: { cx: 0, cy: 0, ppu: 65 },
          items: [{ type: 'explicit', exprs: { f: 'sin(x)' } }],
          tools: { taylor: { on: true, x0: '0', order: 5 } }
        },
        {
          name: '泰勒展开逼近 ln(1+x)',
          desc: '收敛域有限的例子（|x| < 1）',
          preview: 'ln(1+x) 在 x₀ = 0 处 4 阶展开',
          mode: '2d',
          view: { cx: 0.5, cy: 0, ppu: 120 },
          items: [{ type: 'explicit', exprs: { f: 'ln(1 + x)' } }],
          tools: { taylor: { on: true, x0: '0', order: 4 } }
        }
      ]
    },

    {
      cat: '三维曲面与空间曲线',
      items: [
        {
          name: '旋转抛物面',
          desc: 'z = (x² + y²)/4，开口向上',
          preview: 'z = (x^2 + y^2)/4',
          mode: '3d',
          items: [{
            type: 'surface', exprs: { z: '(x^2 + y^2)/4' },
            domain: { x0: '-4', x1: '4', y0: '-4', y1: '4' }
          }]
        },
        {
          name: '马鞍面（双曲抛物面）',
          desc: 'z = (x² − y²)/4，鞍点在原点',
          preview: 'z = (x^2 - y^2)/4',
          mode: '3d',
          items: [{
            type: 'surface', exprs: { z: '(x^2 - y^2)/4' },
            domain: { x0: '-4', x1: '4', y0: '-4', y1: '4' }
          }]
        },
        {
          name: '半球面',
          desc: 'x² + y² + z² = 16 的上半部分',
          preview: 'z = sqrt(16 - x^2 - y^2)',
          mode: '3d',
          items: [{
            type: 'surface', exprs: { z: 'sqrt(16 - x^2 - y^2)' },
            domain: { x0: '-4', x1: '4', y0: '-4', y1: '4' }
          }]
        },
        {
          name: '圆锥面',
          desc: 'z = √(x² + y²)',
          preview: 'z = sqrt(x^2 + y^2)',
          mode: '3d',
          items: [{
            type: 'surface', exprs: { z: 'sqrt(x^2 + y^2)' },
            domain: { x0: '-4', x1: '4', y0: '-4', y1: '4' }
          }]
        },
        {
          name: '波纹曲面',
          desc: 'z = sin√(x² + y²)，同心圆波纹',
          preview: 'z = sin(sqrt(x^2 + y^2))',
          mode: '3d',
          items: [{
            type: 'surface', exprs: { z: 'sin(sqrt(x^2 + y^2))' },
            domain: { x0: '-8', x1: '8', y0: '-8', y1: '8' }
          }]
        },
        {
          name: '高斯曲面（钟形）',
          desc: 'z = 3e^(−(x²+y²)/4)',
          preview: 'z = 3e^(-(x^2+y^2)/4)',
          mode: '3d',
          items: [{
            type: 'surface', exprs: { z: '3e^(-(x^2 + y^2)/4)' },
            domain: { x0: '-5', x1: '5', y0: '-5', y1: '5' }
          }]
        },
        {
          name: '圆柱螺旋线',
          desc: '高数空间曲线的标准例子',
          preview: '(2cos t, 2sin t, t/4)',
          mode: '3d',
          items: [{
            type: 'curve3d', label: '圆柱螺旋线',
            exprs: { x: '2cos(t)', y: '2sin(t)', z: 't/4' },
            domain: { t0: '0', t1: '8pi' }
          }]
        },
        {
          name: '圆锥螺旋线',
          desc: '半径随 t 线性增大的螺线',
          preview: '(0.15t·cos t, 0.15t·sin t, t/4)',
          mode: '3d',
          items: [{
            type: 'curve3d', label: '圆锥螺旋线',
            exprs: { x: '0.15t*cos(t)', y: '0.15t*sin(t)', z: 't/4' },
            domain: { t0: '0', t1: '8pi' }
          }]
        },
        {
          name: '马鞍面 + 螺旋线',
          desc: '曲面与空间曲线同场景展示',
          preview: 'z = xy/3 与螺旋线',
          mode: '3d',
          items: [
            {
              type: 'surface', exprs: { z: 'x*y/3' },
              domain: { x0: '-4', x1: '4', y0: '-4', y1: '4' }
            },
            {
              type: 'curve3d', exprs: { x: '3cos(t)', y: '3sin(t)', z: 't/3 - 2' },
              domain: { t0: '0', t1: '4pi' }
            }
          ]
        }
      ]
    }
  ];

})(typeof window !== 'undefined' ? window : globalThis);
