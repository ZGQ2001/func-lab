/* ============================================================
 * core/derivative.js — 符号求导与化简
 * diff(ast, 'x')  → 导函数 AST（链式法则完整支持）
 * simplify(ast)   → 常量折叠 + 代数恒等式化简
 * 用途：导数曲线、切线斜率、泰勒展开（高阶导反复调用）
 * 依赖：core/runtime.js, core/parser.js, core/compile.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const core = NS.core;
  const { N, V, B, NEG, CALL } = core.parser.nodes;

  class NotDifferentiableError extends Error {
    constructor(fname) {
      super(`函数 ${fname} 暂不支持符号求导`);
      this.fname = fname;
    }
  }

  /* 便捷构造 */
  const add = (a, b) => B('+', a, b);
  const sub = (a, b) => B('-', a, b);
  const mul = (a, b) => B('*', a, b);
  const div = (a, b) => B('/', a, b);
  const pow = (a, b) => B('^', a, b);
  const call = (name, ...args) => CALL(name, args);

  /* ---- 各内置函数的求导规则：u 为内层表达式（链式法则外层部分） ---- */
  const RULES = {
    sin:  u => call('cos', u),
    cos:  u => NEG(call('sin', u)),
    tan:  u => div(N(1), pow(call('cos', u), N(2))),
    cot:  u => NEG(div(N(1), pow(call('sin', u), N(2)))),
    sec:  u => mul(call('sec', u), call('tan', u)),
    csc:  u => NEG(mul(call('csc', u), call('cot', u))),

    asin: u => div(N(1), call('sqrt', sub(N(1), pow(u, N(2))))),
    acos: u => NEG(div(N(1), call('sqrt', sub(N(1), pow(u, N(2)))))),
    atan: u => div(N(1), add(N(1), pow(u, N(2)))),
    arcsin: u => RULES.asin(u),
    arccos: u => RULES.acos(u),
    arctan: u => RULES.atan(u),

    sinh: u => call('cosh', u),
    cosh: u => call('sinh', u),
    tanh: u => sub(N(1), pow(call('tanh', u), N(2))),
    asinh: u => div(N(1), call('sqrt', add(pow(u, N(2)), N(1)))),
    acosh: u => div(N(1), call('sqrt', sub(pow(u, N(2)), N(1)))),
    atanh: u => div(N(1), sub(N(1), pow(u, N(2)))),

    exp:  u => call('exp', u),
    ln:   u => div(N(1), u),
    log:  u => div(N(1), u),
    lg:   u => div(N(1), mul(u, N(Math.LN10))),
    log10:u => div(N(1), mul(u, N(Math.LN10))),
    log2: u => div(N(1), mul(u, N(Math.LN2))),

    sqrt: u => div(N(1), mul(N(2), call('sqrt', u))),
    cbrt: u => div(N(1), mul(N(3), pow(call('cbrt', u), N(2)))),
    abs:  u => call('sign', u),

    /* 阶梯函数：几乎处处导数为 0 */
    sign:  () => N(0),
    floor: () => N(0),
    ceil:  () => N(0),
    round: () => N(0)
  };

  /** 判断子树是否不含变量 v */
  function isConstIn(node, v) {
    switch (node.type) {
      case 'num': return true;
      case 'var': return node.name !== v;
      case 'neg': return isConstIn(node.arg, v);
      case 'bin': return isConstIn(node.left, v) && isConstIn(node.right, v);
      case 'call': return node.args.every(a => isConstIn(a, v));
      default: return false;
    }
  }

  /** 符号求导（不化简，调用方按需 simplify） */
  function diff(node, v) {
    switch (node.type) {
      case 'num': return N(0);
      case 'var': return N(node.name === v ? 1 : 0);
      case 'neg': return NEG(diff(node.arg, v));

      case 'bin': {
        const a = node.left, b = node.right;
        const da = () => diff(a, v), db = () => diff(b, v);
        switch (node.op) {
          case '+': return add(da(), db());
          case '-': return sub(da(), db());
          case '*': return add(mul(da(), b), mul(a, db()));           // (uv)' = u'v + uv'
          case '/': return div(sub(mul(da(), b), mul(a, db())),       // (u/v)' = (u'v − uv')/v²
                               pow(b, N(2)));
          case '^': {
            if (isConstIn(b, v)) {
              /* (u^c)' = c·u^(c−1)·u' */
              return mul(mul(b, pow(a, sub(b, N(1)))), da());
            }
            if (isConstIn(a, v)) {
              /* (c^u)' = c^u·ln(c)·u' */
              return mul(mul(pow(a, b), call('ln', a)), db());
            }
            /* 一般情形 (u^w)' = u^w·(w'·ln u + w·u'/u) */
            return mul(pow(a, b),
                       add(mul(db(), call('ln', a)), mul(b, div(da(), a))));
          }
          default: throw new Error('未知运算符 ' + node.op);
        }
      }

      case 'call': {
        const rule = RULES[node.name];
        if (!rule || node.args.length !== 1) throw new NotDifferentiableError(node.name);
        const u = node.args[0];
        return mul(rule(u), diff(u, v));   // 链式法则
      }

      default:
        throw new Error('未知 AST 节点类型 ' + node.type);
    }
  }

  /* ---------------- 化简 ---------------- */

  const isNum = (n, v) => n.type === 'num' && (v === undefined || n.value === v);

  function simplify(node) {
    switch (node.type) {
      case 'num':
      case 'var':
        return node;

      case 'neg': {
        const a = simplify(node.arg);
        if (isNum(a)) return N(-a.value);
        if (a.type === 'neg') return a.arg;      // −(−x) = x
        return NEG(a);
      }

      case 'bin': {
        const l = simplify(node.left);
        const r = simplify(node.right);
        const op = node.op;

        /* 常量折叠 */
        if (isNum(l) && isNum(r)) {
          const f = { '+': (a, b) => a + b, '-': (a, b) => a - b,
                      '*': (a, b) => a * b, '/': (a, b) => a / b,
                      '^': Math.pow }[op];
          const val = f(l.value, r.value);
          if (Number.isFinite(val)) return N(val);
        }

        switch (op) {
          case '+':
            if (isNum(l, 0)) return r;
            if (isNum(r, 0)) return l;
            if (r.type === 'neg') return simplify(B('-', l, r.arg));
            break;
          case '-':
            if (isNum(r, 0)) return l;
            if (isNum(l, 0)) return simplify(NEG(r));
            if (r.type === 'neg') return simplify(B('+', l, r.arg));
            break;
          case '*':
            if (isNum(l, 0) || isNum(r, 0)) return N(0);
            if (isNum(l, 1)) return r;
            if (isNum(r, 1)) return l;
            if (isNum(l, -1)) return simplify(NEG(r));
            if (isNum(r, -1)) return simplify(NEG(l));
            /* 数字系数合并：a·(b·x) = (a·b)·x */
            if (isNum(l) && r.type === 'bin' && r.op === '*' && isNum(r.left)) {
              return simplify(B('*', N(l.value * r.left.value), r.right));
            }
            /* 把数字移到左侧，便于显示 2·x 而不是 x·2 */
            if (isNum(r) && !isNum(l)) return simplify(B('*', r, l));
            break;
          case '/':
            if (isNum(l, 0)) return N(0);
            if (isNum(r, 1)) return l;
            break;
          case '^':
            if (isNum(r, 0)) return N(1);
            if (isNum(r, 1)) return l;
            if (isNum(l, 1)) return N(1);
            break;
        }
        return B(op, l, r);
      }

      case 'call':
        return CALL(node.name, node.args.map(simplify));

      default:
        return node;
    }
  }

  /** 求导 + 化简一步到位 */
  function derivative(ast, v) {
    return simplify(diff(ast, v));
  }

  core.derivative = { diff, simplify, derivative, NotDifferentiableError };

})(typeof window !== 'undefined' ? window : globalThis);
