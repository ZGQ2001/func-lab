/* ============================================================
 * core/parser.js — 表达式解析器
 * 词法分析 + 递归下降语法分析，生成 AST
 * 支持：四则运算、^ 乘方（右结合）、! 阶乘、函数调用、
 *      隐式乘法（2x、3sin(x)、(a)(b)、xy）、π/θ 等 Unicode 符号
 * AST 节点：
 *   { type:'num',  value }            数字
 *   { type:'var',  name }             变量
 *   { type:'bin',  op, left, right }  二元运算 + - * / ^
 *   { type:'neg',  arg }              一元负号
 *   { type:'call', name, args }       函数调用
 * 依赖：core/runtime.js
 * ============================================================ */
(function (root) {
  'use strict';
  const NS = root.FuncLab;
  const core = NS.core;
  const RT = core.runtime;

  /* ---------------- 词法分析 ---------------- */

  function isDigit(c)  { return c >= '0' && c <= '9'; }
  function isLetter(c) { return /[A-Za-zθπρ_]/.test(c); }

  function mkErr(message, pos) {
    const e = new Error(message);
    e.isParseError = true;
    e.pos = pos;
    return e;
  }

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];

      if (c === ' ' || c === '\t' || c === '　') { i++; continue; }

      /* 数字（支持 1.5、.5、2e3、1.2e-4） */
      if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
        let j = i;
        while (j < src.length && isDigit(src[j])) j++;
        if (src[j] === '.') { j++; while (j < src.length && isDigit(src[j])) j++; }
        if (src[j] === 'e' || src[j] === 'E') {
          let k = j + 1;
          if (src[k] === '+' || src[k] === '-') k++;
          if (isDigit(src[k])) {                 // 仅当 e 后跟数字才算科学计数
            k++;
            while (k < src.length && isDigit(src[k])) k++;
            j = k;
          }
        }
        toks.push({ t: 'num', v: parseFloat(src.slice(i, j)), pos: i });
        i = j;
        continue;
      }

      /* 标识符（函数名/变量/常量，首字符为字母，后续可带数字如 log2） */
      if (isLetter(c)) {
        let j = i;
        while (j < src.length && (isLetter(src[j]) || isDigit(src[j]))) j++;
        toks.push({ t: 'id', v: src.slice(i, j), pos: i });
        i = j;
        continue;
      }

      /* ** 等价于 ^ */
      if (c === '*' && src[i + 1] === '*') {
        toks.push({ t: 'op', v: '^', pos: i });
        i += 2;
        continue;
      }

      if (c === '(' || c === '[') { toks.push({ t: 'lp', pos: i }); i++; continue; }
      if (c === ')' || c === ']') { toks.push({ t: 'rp', pos: i }); i++; continue; }
      if (c === ',' || c === '，') { toks.push({ t: 'comma', pos: i }); i++; continue; }
      if (c === '!') { toks.push({ t: 'fact', pos: i }); i++; continue; }
      if (c === '=') { toks.push({ t: 'eq', pos: i }); i++; continue; }

      if ('+-*/^'.includes(c)) { toks.push({ t: 'op', v: c, pos: i }); i++; continue; }

      /* 常见 Unicode 数学符号 */
      if (c === '−' || c === '–') { toks.push({ t: 'op', v: '-', pos: i }); i++; continue; }
      if (c === '×' || c === '·' || c === '∙') { toks.push({ t: 'op', v: '*', pos: i }); i++; continue; }
      if (c === '÷') { toks.push({ t: 'op', v: '/', pos: i }); i++; continue; }

      throw mkErr(`无法识别的字符 "${c}"`, i);
    }
    return toks;
  }

  /* ---------------- 语法分析（递归下降） ---------------- */

  /* 节点构造辅助 */
  const N    = v => ({ type: 'num', value: v });
  const V    = name => ({ type: 'var', name });
  const B    = (op, left, right) => ({ type: 'bin', op, left, right });
  const NEG  = arg => ({ type: 'neg', arg });
  const CALL = (name, args) => ({ type: 'call', name, args });

  /* 可作为自由参数的单字母（π 是常量、_ 无意义，均排除） */
  const PARAM_CHAR = /^[A-Za-zθρ]$/;

  /** 标识符中是否含有内置函数名（≥2 字符），用于拦截 sinx 之类的拼写 */
  function findFuncNameIn(s) {
    for (const name of Object.keys(RT.functions)) {
      if (name.length >= 2 && s.includes(name)) return name;
    }
    return null;
  }

  class Parser {
    /**
     * @param {string} src   表达式文本
     * @param {string[]} vars 允许出现的自变量名（如 ['x'] / ['t'] / ['x','y']）
     * @param {{lenient?:boolean}} opts lenient：未知的单字母标识符不报错，
     *        而是解析为变量节点（应用层将其识别为"自由参数"并生成滑块）
     */
    constructor(src, vars, opts) {
      this.src = src;
      this.vars = vars || [];
      this.lenient = !!(opts && opts.lenient);
      this.toks = tokenize(src);
      this.k = 0;
    }

    peek(off) { return this.toks[this.k + (off || 0)]; }
    next()    { return this.toks[this.k++]; }

    parse() {
      if (this.toks.length === 0) throw mkErr('表达式为空', 0);
      const node = this.parseAdd();
      const t = this.peek();
      if (t) {
        if (t.t === 'eq') throw mkErr('表达式中不应出现 "="（隐函数请在整条输入中使用一个等号）', t.pos);
        if (t.t === 'rp') throw mkErr('多余的右括号', t.pos);
        throw mkErr('表达式提前结束于多余内容', t.pos);
      }
      return node;
    }

    parseAdd() {
      let n = this.parseMul();
      for (;;) {
        const t = this.peek();
        if (t && t.t === 'op' && (t.v === '+' || t.v === '-')) {
          this.next();
          n = B(t.v, n, this.parseMul());
        } else break;
      }
      return n;
    }

    parseMul() {
      let n = this.parseUnary();
      for (;;) {
        const t = this.peek();
        if (t && t.t === 'op' && (t.v === '*' || t.v === '/')) {
          this.next();
          n = B(t.v, n, this.parseUnary());
        } else if (t && (t.t === 'num' || t.t === 'id' || t.t === 'lp')) {
          /* 隐式乘法：2x、2(x+1)、(a)(b)、x sin(x) */
          n = B('*', n, this.parseUnary());
        } else break;
      }
      return n;
    }

    parseUnary() {
      const t = this.peek();
      if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
        this.next();
        const arg = this.parseUnary();
        return t.v === '-' ? NEG(arg) : arg;
      }
      return this.parsePower();
    }

    parsePower() {
      const base = this.parsePostfix();
      const t = this.peek();
      if (t && t.t === 'op' && t.v === '^') {
        this.next();
        /* 右结合：2^3^2 = 2^(3^2)；指数允许带一元负号：x^-2 */
        return B('^', base, this.parseUnary());
      }
      return base;
    }

    parsePostfix() {
      let n = this.parsePrimary();
      while (this.peek() && this.peek().t === 'fact') {
        this.next();
        n = CALL('fact', [n]);
      }
      return n;
    }

    parsePrimary() {
      const t = this.peek();
      if (!t) throw mkErr('表达式不完整', this.src.length);

      if (t.t === 'num') { this.next(); return N(t.v); }

      if (t.t === 'lp') {
        this.next();
        const inner = this.parseAdd();
        const r = this.peek();
        if (!r || r.t !== 'rp') throw mkErr('缺少右括号', r ? r.pos : this.src.length);
        this.next();
        return inner;
      }

      if (t.t === 'id') { this.next(); return this.resolveIdent(t); }

      if (t.t === 'comma') throw mkErr('意外的逗号', t.pos);
      if (t.t === 'rp') throw mkErr('意外的右括号', t.pos);
      if (t.t === 'eq') throw mkErr('意外的 "="', t.pos);
      throw mkErr(`意外的符号 "${t.v || ''}"`, t.pos);
    }

    /* 标识符消解：函数调用 / 常量 / 变量 / 紧凑写法拆分（xy → x*y，xsin(x) → x*sin(x)） */
    resolveIdent(tok) {
      const s = tok.v;
      const nextIsLp = this.peek() && this.peek().t === 'lp';

      if (RT.functions[s] && nextIsLp) return this.parseCall(s, tok.pos);
      if (this.vars.includes(s)) return V(s);
      if (RT.constants[s] !== undefined) return N(RT.constants[s]);

      if (RT.functions[s] && !nextIsLp) {
        throw mkErr(`函数 ${s} 后需要括号，例如 ${s}(x)`, tok.pos);
      }

      const parts = this.splitIdent(s, nextIsLp, false);
      if (parts) return this.buildProduct(parts, tok.pos);

      /* 宽松模式：未知的单字母 → 自由参数（变量节点）；
         多字母先排除疑似函数名拼写（如 sinx），其余按单字母乘积拆分（ab → a·b） */
      if (this.lenient) {
        if (s.length === 1 && PARAM_CHAR.test(s)) return V(s);
        const fname = findFuncNameIn(s);
        if (fname) {
          throw mkErr(`未知符号 "${s}"（若要使用函数 ${fname} 请写 ${fname}(…)）`, tok.pos);
        }
        const lparts = this.splitIdent(s, nextIsLp, true);
        if (lparts) return this.buildProduct(lparts, tok.pos);
      }

      const varHint = this.vars.length ? `，本类型可用变量：${this.vars.join('、')}` : '';
      throw mkErr(`未知符号 "${s}"${varHint}`, tok.pos);
    }

    /** 把拆分结果组装成乘积节点 */
    buildProduct(parts, pos) {
      let node = null;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        let sub;
        if (p.kind === 'func') sub = this.parseCall(p.name, pos);
        else if (p.kind === 'var') sub = V(p.name);
        else sub = N(RT.constants[p.name]);
        node = node ? B('*', node, sub) : sub;
      }
      return node;
    }

    /* 把 "pix"、"xsin" 之类的连写拆成已知符号序列；失败返回 null
     * lenient 时允许未知单字母作为自由参数参与拆分（ax → a·x） */
    splitIdent(s, nextIsLp, lenient) {
      const vars = this.vars;
      const rec = (i) => {
        if (i === s.length) return [];
        for (let j = s.length; j > i; j--) {
          const sub = s.slice(i, j);
          /* 末段允许是函数名（其后必须紧跟括号） */
          if (j === s.length && nextIsLp && RT.functions[sub]) {
            return [{ kind: 'func', name: sub }];
          }
          const known = vars.includes(sub) || RT.constants[sub] !== undefined;
          const asParam = !known && lenient && sub.length === 1 && PARAM_CHAR.test(sub);
          if (known || asParam) {
            const rest = rec(j);
            if (rest) {
              const kind = vars.includes(sub) || asParam ? 'var' : 'const';
              return [{ kind, name: sub }, ...rest];
            }
          }
        }
        return null;
      };
      const parts = rec(0);
      return parts && parts.length > 1 ? parts : null;
    }

    parseCall(name, posForErr) {
      const meta = RT.functions[name];
      const lp = this.next();          // 调用前已确认是 lp
      if (!lp || lp.t !== 'lp') throw mkErr(`函数 ${name} 后需要括号`, posForErr);
      const args = [];
      if (this.peek() && this.peek().t === 'rp') {
        throw mkErr(`函数 ${name} 缺少参数`, this.peek().pos);
      }
      for (;;) {
        args.push(this.parseAdd());
        const t = this.peek();
        if (t && t.t === 'comma') { this.next(); continue; }
        if (t && t.t === 'rp') { this.next(); break; }
        throw mkErr(`函数 ${name} 的括号未正确闭合`, t ? t.pos : this.src.length);
      }
      if (args.length !== meta.arity) {
        throw mkErr(`函数 ${name} 需要 ${meta.arity} 个参数，实际给了 ${args.length} 个`, posForErr);
      }
      return CALL(name, args);
    }
  }

  /**
   * 解析表达式
   * @param {string} src
   * @param {string[]} vars 允许的自变量
   * @param {{lenient?:boolean}} [opts] lenient：未知单字母按自由参数处理
   * @returns AST
   */
  function parse(src, vars, opts) {
    return new Parser(String(src), vars, opts).parse();
  }

  /** 收集 AST 中出现的全部变量名（含宽松模式产生的自由参数） */
  function collectVars(node, out) {
    out = out || new Set();
    switch (node.type) {
      case 'var': out.add(node.name); break;
      case 'neg': collectVars(node.arg, out); break;
      case 'bin':
        collectVars(node.left, out);
        collectVars(node.right, out);
        break;
      case 'call': node.args.forEach(a => collectVars(a, out)); break;
    }
    return out;
  }

  /* ---------------- AST → 字符串（用于显示导数表达式等） ---------------- */

  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 2.5, '^': 3 };

  function astToString(node, parentPrec) {
    parentPrec = parentPrec || 0;
    let s, prec;
    switch (node.type) {
      case 'num': {
        const v = node.value;
        if (v === Math.PI) { s = 'π'; prec = 9; break; }
        if (v === Math.E)  { s = 'e'; prec = 9; break; }
        s = NS.util.fmtNum(v, 6);
        prec = (v < 0) ? 2.5 : 9;
        break;
      }
      case 'var': s = node.name; prec = 9; break;
      case 'neg':
        s = '-' + astToString(node.arg, PREC.neg);
        prec = PREC.neg;
        break;
      case 'bin': {
        const op = node.op;
        prec = PREC[op];
        const lo = astToString(node.left, prec);
        /* 左结合运算的右子树、^ 的左子树需要更严格的括号 */
        const ro = astToString(node.right, op === '^' ? prec - 0.5 : prec + 0.5);
        const l2 = (op === '^') ? astToString(node.left, prec + 0.5) : lo;
        s = `${l2}${op === '*' ? '·' : op}${ro}`;
        break;
      }
      case 'call':
        if (node.name === 'fact') {
          s = astToString(node.args[0], 9) + '!';
        } else {
          s = node.name + '(' + node.args.map(a => astToString(a, 0)).join(', ') + ')';
        }
        prec = 9;
        break;
      default: s = '?'; prec = 9;
    }
    return prec < parentPrec ? '(' + s + ')' : s;
  }

  core.parser = { tokenize, parse, astToString, collectVars, nodes: { N, V, B, NEG, CALL } };

})(typeof window !== 'undefined' ? window : globalThis);
