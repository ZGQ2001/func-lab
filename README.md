# FuncLab · 函数图像实验室

为学习高等数学打造的本地函数绘图软件，界面复刻 MATLAB 一类工程软件的风格。
纯 HTML/CSS/JavaScript 实现，**零依赖、无需安装、无需联网**。

## 快速开始

双击打开 [index.html](index.html) 即可（推荐 Edge / Chrome）。

函数列表与视图会自动保存在浏览器本地，刷新后恢复。

## 功能一览

| 模块 | 内容 |
|------|------|
| 绘图类型（7 种） | 显式函数 y=f(x) · 参数方程 · 极坐标 r(θ) · 隐函数 F(x,y)=0 · 数列 a(n) · 三维曲面 z=f(x,y) · 空间曲线 |
| 分析工具 | 切线/法线 · 导数曲线 f′ f″（符号求导）· 定积分（区域着色 + Simpson）· 泰勒展开（任意点、1–10 阶） |
| 示例库 | 摆线、星形线、心形线、玫瑰线、双纽线、笛卡尔叶形线、圆锥曲线、重要极限 (1+1/n)ⁿ、马鞍面、螺旋线…… 共 6 类 30+ 经典图像 |
| 交互 | 滚轮缩放（Shift/Ctrl 单轴）· 拖动平移 / 3D 旋转 · 单击曲线显示坐标 · 等比例/网格/图例开关 · 导出 PNG |
| 表达式 | 隐式乘法（2x、3sin(x)、xy）、^ 乘方、! 阶乘、π/θ 直接输入、完整初等函数库，详见软件内「语法帮助」 |

## 架构

```
FuncLab/
├── index.html              入口与界面骨架
├── css/styles.css          MATLAB 风格主题（Ribbon 工具条 / 面板 / 对话框）
├── js/
│   ├── core/               ── 数学核心层（纯函数，无 DOM，可独立测试）
│   │   ├── runtime.js      内置函数注册表、常量、Γ 函数、数字格式化
│   │   ├── parser.js       词法 + 递归下降语法分析 → AST（隐式乘法、θ/π）
│   │   ├── compile.js      AST → 嵌套闭包（密集采样零解析开销）
│   │   ├── derivative.js   符号求导（链式法则）+ 化简（常量折叠等）
│   │   └── calculus.js     Simpson 积分、数值微分、切线、泰勒展开
│   ├── plot/               ── 渲染层（Canvas 2D，只读 core）
│   │   ├── viewport.js     世界↔屏幕坐标变换、缩放平移、1-2-5 刻度
│   │   ├── axes.js         boxed 坐标系：网格/零轴/边框/外侧刻度标签
│   │   ├── curves2d.js     显式/参数/极坐标/数列 采样与断点检测
│   │   ├── implicit.js     Marching Squares 隐函数等值线
│   │   ├── surface3d.js    正交投影 + 画家算法 + parula 色图 + 坐标箱
│   │   └── plotter.js      渲染调度：曲线 → 工具叠加层 → 图例 → 数据提示
│   └── app/                ── 应用层（状态与 UI）
│       ├── state.js        类型元数据、函数条目编译、持久化、示例加载
│       ├── examples.js     示例库数据（高数经典图像）
│       ├── tools.js        分析工具的计算与面板 UI
│       ├── panel.js        函数卡片列表、添加菜单
│       └── main.js         启动装配、Ribbon、画布交互、状态栏、导出
└── tests/
    ├── core.test.js        数学核心层单元测试（47 项）
    └── run-tests.html      浏览器测试页
```

依赖方向严格单向：`app → plot → core`。core 层不接触 DOM，
因此测试可直接在 node 下运行：

```
node tests/core.test.js
```

### 数据流

```
输入表达式 ──parser──▶ AST ──compile──▶ 求值闭包
                        │
                        └─derivative──▶ 导函数 AST（切线/泰勒/导数曲线）

求值闭包 ──按类型采样──▶ 世界坐标点列 ──viewport──▶ 屏幕坐标 ──▶ Canvas
```

## 表达式语法速查

- 运算：`+ - * /`，乘方 `^`（`-x^2` 按 `-(x^2)`），阶乘 `!`
- 可省略乘号：`2x`、`3sin(x)`、`(x+1)(x-1)`、`xy`
- 函数：`sin cos tan cot sec csc`、`asin/arcsin …`、`sinh …`、
  `exp ln log lg log2 log10`、`sqrt cbrt abs sign floor ceil round`、
  `min max mod gamma`
- 常量：`pi`（或 `π`）、`e`
- 隐函数可直接写等式：`x^2 + y^2 = 4`
- 极坐标变量可写 `θ`、`theta` 或 `t`

## 已知边界与扩展方向

- 暂不支持分段函数 if/分支语法（可用 `abs/sign/floor` 组合近似）
- 泰勒展开依赖符号求导，`gamma/min/max` 等函数不可展开（会给出提示）
- 规划中：参数滑块（如 y = a·sin(bx)）、梯度场/方向场、级数部分和动画
