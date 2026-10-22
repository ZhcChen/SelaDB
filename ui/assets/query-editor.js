/**
 * SQL 查询编辑器。
 *
 * 结构是经典的「透明 textarea 叠在高亮层上」:textarea 负责输入与光标,
 * 下面一层 `<pre>` 负责着色。两层的字体、行高、内边距必须逐项一致,
 * 否则字符会错位 —— 这是这类编辑器最容易踩的坑。
 *
 * 词法着色只做「设计源该长什么样」的表达,不追求完整 SQL 方言:
 * 关键字、类型、函数、字符串、数字、注释、运算符七类够用。
 */

const KEYWORDS = new Set([
  "select", "from", "where", "group", "by", "order", "having", "limit", "offset",
  "join", "left", "right", "inner", "outer", "cross", "full", "on", "using",
  "as", "and", "or", "not", "in", "is", "null", "like", "ilike", "between",
  "exists", "case", "when", "then", "else", "end", "insert", "into", "values",
  "update", "set", "delete", "create", "alter", "drop", "table", "index",
  "view", "database", "schema", "with", "union", "all", "distinct", "asc",
  "desc", "returning", "conflict", "do", "nothing", "begin", "commit",
  "rollback", "transaction", "explain", "show", "describe", "use", "truncate",
  "primary", "key", "foreign", "references", "default", "check", "constraint",
  "cascade", "grant", "revoke", "if", "exists", "returning", "lateral",
]);

const TYPES = new Set([
  "int", "integer", "bigint", "smallint", "tinyint", "serial", "bigserial",
  "varchar", "char", "text", "boolean", "bool", "date", "time", "timestamp",
  "timestamptz", "datetime", "decimal", "numeric", "real", "double", "float",
  "json", "jsonb", "uuid", "blob", "bytea", "money", "interval",
]);

const ESCAPE_MAP = { "&": "&", "<": "<", ">": ">" };

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (ch) => ESCAPE_MAP[ch]);
}

/**
 * 把 SQL 切成 token。
 *
 * @param {string} source
 * @returns {Array<{ type: string, text: string, start: number, end: number }>}
 */
export function tokenizeSql(source) {
  const tokens = [];
  const n = source.length;
  let i = 0;

  const push = (type, text) => {
    if (!text) return;
    const start = i;
    tokens.push({ type, text, start, end: start + text.length });
    i += text.length;
  };

  while (i < n) {
    const ch = source[i];

    // 行注释 -- ...
    if (ch === "-" && source[i + 1] === "-") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      push("comment", source.slice(i, stop));
      continue;
    }
    // 块注释 /* ... */
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      push("comment", source.slice(i, stop));
      continue;
    }
    // 字符串
    if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === ch) {
          j += 1;
          break;
        }
        if (source[j] === "\n") break;
        j += 1;
      }
      push("string", source.slice(i, j));
      continue;
    }
    // 数字
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      let j = i;
      while (j < n && /[0-9._]/.test(source[j])) j += 1;
      push("number", source.slice(i, j));
      i = j;
      continue;
    }
    // 标识符 / 关键字 / 类型 / 函数
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j])) j += 1;
      const word = source.slice(i, j);
      const lower = word.toLowerCase();
      let type = "ident";
      if (KEYWORDS.has(lower)) type = "keyword";
      else if (TYPES.has(lower)) type = "type";
      else if (source[j] === "(") type = "function";
      push(type, word);
      continue;
    }
    // 运算符与标点
    if (/[+\-*/%=<>!|&^~,;:()[\]{}.]/.test(ch)) {
      push("operator", ch);
      continue;
    }
    // 空白
    push("whitespace", ch);
  }

  return tokens;
}

/**
 * 生成高亮 HTML。
 *
 * @param {string} source
 * @param {{ start: number, end: number }|null} errorRange 出错区间,落在区间内的 token 会加错误样式
 */
export function highlightSql(source, errorRange = null) {
  const tokens = tokenizeSql(source);
  let html = "";

  for (const token of tokens) {
    if (token.type === "whitespace") {
      html += escapeHtml(token.text);
      continue;
    }
    const inError =
      errorRange && token.start < errorRange.end && token.end > errorRange.start;
    const className = `tok-${token.type}${inError ? " tok--error" : ""}`;
    html += `<span class="${className}">${escapeHtml(token.text)}</span>`;
  }

  // 末尾补一个换行,让最后一行的光标能落到正确位置
  return `${html}\n`;
}

export class QueryEditor {
  constructor({ value = "", onExecute, onChange } = {}) {
    this.value = value;
    this.onExecute = onExecute ?? (() => {});
    this.onChange = onChange ?? (() => {});
    this.errorRange = null;
    this.mounted = false;
  }

  mount(container) {
    this.container = container;
    const root = document.createElement("div");
    root.className = "query";
    this.root = root;

    const main = document.createElement("div");
    main.className = "query__main";

    // 行号槽
    const gutter = document.createElement("div");
    gutter.className = "query__gutter";
    const gutterInner = document.createElement("div");
    gutterInner.className = "query__gutter-inner";
    gutter.appendChild(gutterInner);
    main.appendChild(gutter);

    // 编辑区
    const editor = document.createElement("div");
    editor.className = "query__editor";

    const highlight = document.createElement("pre");
    highlight.className = "query__highlight";
    const code = document.createElement("code");
    code.className = "query__code";
    highlight.appendChild(code);

    const input = document.createElement("textarea");
    input.className = "query__input";
    input.spellcheck = false;
    input.setAttribute("autocapitalize", "off");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-label", "SQL 查询");
    input.value = this.value;

    editor.append(highlight, input);
    main.appendChild(editor);
    root.appendChild(main);
    container.appendChild(root);

    this.gutterInner = gutterInner;
    this.code = code;
    this.input = input;

    input.addEventListener("input", () => {
      this.value = input.value;
      this.#sync();
      this.onChange(this.value);
    });
    input.addEventListener("scroll", () => this.#syncScroll());
    input.addEventListener("keydown", (event) => this.#onKeyDown(event));

    this.mounted = true;
    this.#sync();
    return this;
  }

  destroy() {
    this.mounted = false;
    this.root?.remove();
  }

  getValue() {
    return this.input?.value ?? this.value;
  }

  setValue(text) {
    this.value = text ?? "";
    if (this.input) this.input.value = this.value;
    this.#sync();
    this.onChange(this.value);
  }

  focus() {
    this.input?.focus();
  }

  /**
   * 标出错区间。
   * @param {{ message: string, detail?: string, start: number, end: number }|null} error
   */
  setError(error) {
    this.errorRange = error ? { start: error.start, end: error.end } : null;
    this.#sync();
    this.#renderError(error);
  }

  clearError() {
    this.setError(null);
  }

  // ---- 内部实现 ----

  #sync() {
    if (!this.mounted) return;
    this.code.innerHTML = highlightSql(this.getValue(), this.errorRange);
    this.#syncGutter();
    this.#syncScroll();
  }

  #syncGutter() {
    const lines = this.getValue().split("\n").length;
    if (this.gutterInner.childElementCount === lines) return;
    this.gutterInner.replaceChildren();
    for (let i = 1; i <= lines; i += 1) {
      const el = document.createElement("div");
      el.className = "query__line-number";
      el.textContent = String(i);
      this.gutterInner.appendChild(el);
    }
  }

  /** 高亮层与行号槽要跟着输入层的滚动位置走,否则会错位。 */
  #syncScroll() {
    if (!this.mounted) return;
    const { scrollTop, scrollLeft } = this.input;
    this.code.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
    this.gutterInner.style.transform = `translateY(${-scrollTop}px)`;
  }

  #renderError(error) {
    const existing = this.root.querySelector(".query__error");
    existing?.remove();
    if (!error) return;

    const bar = document.createElement("div");
    bar.className = "query__error";

    const icon = document.createElement("span");
    icon.className = "query__error-icon";
    icon.textContent = "!";
    bar.appendChild(icon);

    const text = document.createElement("div");
    const message = document.createElement("div");
    message.className = "query__error-message";
    message.textContent = error.message;
    text.appendChild(message);
    if (error.detail) {
      const detail = document.createElement("div");
      detail.className = "query__error-detail";
      detail.textContent = error.detail;
      text.appendChild(detail);
    }
    bar.appendChild(text);

    this.root.appendChild(bar);
  }

  #onKeyDown(event) {
    // ⌘↵ / Ctrl+↵ 执行
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      this.onExecute(this.getValue());
      return;
    }
    // Tab 插入两个空格,而不是跳焦点
    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart, selectionEnd, value } = this.input;
      this.input.value = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
      this.input.selectionStart = this.input.selectionEnd = selectionStart + 2;
      this.value = this.input.value;
      this.#sync();
      this.onChange(this.value);
    }
  }
}
