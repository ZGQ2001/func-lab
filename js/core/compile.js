/* ============================================================
 * core/compile.js — AST 编译器
 * 把 AST 递归编译为嵌套闭包，求值时零解析开销（密集采样性能关键）
 * 用法：const f = compile(ast); f({ x: 1.5 }) → 数值
 * 依赖：core/runtime.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const core = NS.core;
  const RT = core.runtime;

  function compile(node) {
    switch (node.type) {

      case 'num': {
        const v = node.value;
        return () => v;
      }

      case 'var': {
        const name = node.name;
        return scope => {
          const v = scope[name];
          return v === undefined ? NaN : v;
        };
      }

      case 'neg': {
        const a = compile(node.arg);
        return scope => -a(scope);
      }

      case 'bin': {
        const l = compile(node.left);
        const r = compile(node.right);
        switch (node.op) {
          case '+': return scope => l(scope) + r(scope);
          case '-': return scope => l(scope) - r(scope);
          case '*': return scope => l(scope) * r(scope);
          case '/': return scope => l(scope) / r(scope);
          case '^': return scope => Math.pow(l(scope), r(scope));
          default: throw new Error('未知运算符 ' + node.op);
        }
      }

      case 'call': {
        const meta = RT.functions[node.name];
        if (!meta) throw new Error('未知函数 ' + node.name);
        const fn = meta.fn;
        if (node.args.length === 1) {
          const a = compile(node.args[0]);
          return scope => fn(a(scope));
        }
        if (node.args.length === 2) {
          const a = compile(node.args[0]);
          const b = compile(node.args[1]);
          return scope => fn(a(scope), b(scope));
        }
        const args = node.args.map(compile);
        return scope => fn.apply(null, args.map(g => g(scope)));
      }

      default:
        throw new Error('未知 AST 节点类型 ' + node.type);
    }
  }

  /** 常量表达式求值（无变量时），失败返回 null */
  function evalConst(node) {
    try {
      const v = compile(node)({});
      return Number.isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  core.compile = { compile, evalConst };

})(typeof window !== 'undefined' ? window : globalThis);
