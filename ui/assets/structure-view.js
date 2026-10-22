/**
 * 表结构视图。
 *
 * 一个表能被追问的东西分四类:有哪些列、列上挂了哪些索引、有哪些约束、
 * 有哪些外键,再加一个"把这一切还原成 DDL"的出口。这四类信息形态差别很大
 * —— 列是行式清单,约束是一段表达式,外键是跨表关系 —— 塞进一张通用表格
 * 只会让每一列都别扭,所以拆成五个子标签,各自一张专表。
 *
 * DDL 预览复用 query-editor.js 的词法着色器:设计源里已经有一套 SQL 着色
 * (关键字/类型/字符串/注释/运算符),再写一套只会让两处慢慢漂移。
 *
 * 本组件只负责「把结构渲染出来并可切换」,不碰业务判断 —— 真实数据由
 * Rust 侧的 service 层给出,这里只做展示。
 */


/**
 * 子标签定义。
 *
 * count 决定标签右侧的条目数;ddl 标签的条目数是 DDL 语句条数,
 * 其余是结构数组的长度,空数组就是 0。
 */
/**
 * 结构的分面。
 *
 * 不含 DDL —— DDL 与「数据」「结构」是同一层级的视图,放在工作区面板头部的
 * 模式切换器上;结构自己的分面只有列、索引、约束、外键这四个。
 */
const TABS = [
  { name: "columns", label: "列", icon: "columns", empty: "没有列" },
  { name: "indexes", label: "索引", icon: "index", empty: "没有索引" },
  { name: "constraints", label: "约束", icon: "check", empty: "没有约束" },
  { name: "foreignKeys", label: "外键", icon: "keygroup", empty: "没有外键" },
];

/**
 * 引擎 → DDL 标签页图标。
 *
 * 设计源只有一套 16px 描边图标,没有各引擎的专属图形。这里按引擎最显著的
 * 结构特征挑:PG 以 schema 为核心,其余用 database。引擎 id 也用在 DDL 头部的
 * 徽标上(color 走 .engine-* 工具类),所以即使图标相同也能区分。
 */
const ENGINE_ICONS = {
  postgresql: "schema",
  mysql: "database",
  sqlite: "database",
  sqlserver: "database",
};

/** 引擎 id → 显示名。组件自带一份,不依赖 mock-data.js,便于复用到真实实现。 */
const ENGINE_LABELS = {
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  sqlite: "SQLite",
  sqlserver: "SQL Server",
};

/** 复制成功后文案停留的时长。 */
const COPY_FEEDBACK_MS = 1500;

/* -----------------------------------------------------------------------------
 * 工具函数
 * -------------------------------------------------------------------------- */

/** 结构对象可能缺字段,统一补成空数组,免得渲染时到处判空。 */
function normalizeStructure(structure) {
  const source = structure ?? {};
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    columns: list(source.columns),
    indexes: list(source.indexes),
    constraints: list(source.constraints),
    foreignKeys: list(source.foreignKeys),
  };
}

/**
 * 位置用 1 起始的序号。
 * 数据里带了 position 就用数据的,否则按出现顺序数 —— 两者通常一致,
 * 但排序过的列定义里 position 才是权威。
 */
function positionOf(column, index) {
  const value = Number(column?.position);
  return Number.isFinite(value) && value > 0 ? value : index + 1;
}

/** 建一个 td。className 可选,值一律走 textContent。 */
function cell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = text ?? "";
  return td;
}

/** 空状态提示。没有条目时显示它,而不是留一张空表。 */
function buildStructEmpty(message) {
  const empty = document.createElement("div");
  empty.className = "struct-empty";
  empty.textContent = message;
  return empty;
}

/**
 * 建一张表。
 * @param {string[]} headers 表头文字
 * @param {HTMLElement} body 已经填好的 tbody
 */
function buildStructTable(headers, body) {
  const table = document.createElement("table");
  table.className = "struct-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const title of headers) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = title;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);

  table.append(thead, body);
  return table;
}

/**
 * 数 DDL 里有几条语句。
 *
 * 不能直接 split(";"):字符串字面量里也会有分号。这里扫一遍,
 * 跳过引号内的内容与注释,只把「引号外的分号」当作语句边界。
 */
function countDdlStatements(ddl) {
  const text = String(ddl ?? "");
  if (!text.trim()) return 0;

  let count = 0;
  let pending = false;
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      pending = true;
      continue;
    }
    if (ch === ";") {
      count += 1;
      pending = false;
      continue;
    }
    if (!/\s/.test(ch)) pending = true;
  }

  // 最后一条语句后面通常没有分号,单独补上
  if (pending) count += 1;
  return count;
}

/**
 * 复制文本到剪贴板。
 * 非安全上下文(file://、http)下 clipboard API 不可用,退回 execCommand。
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/* -----------------------------------------------------------------------------
 * StructureView
 * -------------------------------------------------------------------------- */
class StructureView {
  constructor({ structure, ddl, engine } = {}) {
    this.structure = normalizeStructure(structure);
    this.ddl = String(ddl ?? "");
    this.engine = engine ?? "postgresql";

    this.tab = "columns";
    this.mounted = false;

    /** [element, type, handler] —— destroy 时逐个摘掉 */
    this.listeners = [];
    this.tabButtons = new Map();
    this.panels = new Map();

    this.copyLabel = null;
    this.copyTimer = null;
  }

  /* ---- 生命周期 ---- */

  mount(container) {
    // 重复 mount 时先清掉上一轮,避免事件与 DOM 叠加
    this.#teardown();

    this.container = container;

    const root = document.createElement("div");
    root.className = "structure";
    this.root = root;

    root.appendChild(this.#buildTabs());
    root.appendChild(this.#buildPanels());

    container.appendChild(root);
    this.mounted = true;
    this.#applyTab();
    return this;
  }

  destroy() {
    this.#teardown();
    this.root?.remove();
    this.root = null;
  }

  /**
   * 只渲染 DDL,不带子标签栏。
   *
   * DDL 与「数据」「结构」是同一层级的视图,由面板头部的模式切换器直接调它;
   * 放在结构的子标签里会让两层都出现 DDL,反而说不清自己在哪一层。
   */
  mountDdl(container) {
    this.#teardown();

    this.container = container;
    const root = document.createElement("div");
    root.className = "structure";
    this.root = root;

    const ddl = this.#buildDdl();
    root.appendChild(ddl ?? buildStructEmpty("没有 DDL"));

    container.appendChild(root);
    this.mounted = true;
    return this;
  }

  /* ---- 对外接口 ---- */

  setTab(name) {
    const exists = TABS.some((tab) => tab.name === name);
    if (!exists) return;
    this.tab = name;
    if (this.mounted) this.#applyTab();
  }

  getTab() {
    return this.tab;
  }

  /* ---- 内部实现 ---- */

  #teardown() {
    for (const [element, type, handler] of this.listeners) {
      element.removeEventListener(type, handler);
    }
    this.listeners = [];
    this.tabButtons = new Map();
    this.panels = new Map();

    if (this.copyTimer) {
      clearTimeout(this.copyTimer);
      this.copyTimer = null;
    }
    this.copyLabel = null;

    this.mounted = false;
    this.root?.remove();
    this.root = null;
  }

  /**
   * 子标签栏。
   * 每个标签带条目数 —— 用户在点进去之前就知道那边有没有东西。
   */
  #buildTabs() {
    const bar = document.createElement("div");
    bar.className = "subtabs";
    bar.setAttribute("role", "tablist");

    for (const tab of TABS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "subtab";
      button.dataset.tab = tab.name;
      button.setAttribute("role", "tab");

      const icon = createIcon(tab.name === "ddl" ? this.#engineIcon() : tab.icon, 13);
      icon.classList.add("subtab__icon");
      button.appendChild(icon);

      const label = document.createElement("span");
      label.className = "subtab__label";
      label.textContent = tab.label;
      button.appendChild(label);

      const count = document.createElement("span");
      count.className = "subtab__count";
      count.textContent = String(this.#countOf(tab.name));
      button.appendChild(count);

      const onClick = () => this.setTab(tab.name);
      button.addEventListener("click", onClick);
      this.listeners.push([button, "click", onClick]);

      bar.appendChild(button);
      this.tabButtons.set(tab.name, button);
    }

    return bar;
  }

  /** 五个面板一次建好,切换时只改可见性 —— 结构数据不会在切标签时变。 */
  #buildPanels() {
    const wrap = document.createElement("div");
    wrap.className = "struct-panels";

    for (const tab of TABS) {
      const panel = document.createElement("div");
      panel.className = "struct-panel";
      panel.dataset.tab = tab.name;
      panel.setAttribute("role", "tabpanel");

      if (tab.name === "ddl") {
        const ddl = this.#buildDdl();
        if (ddl) panel.appendChild(ddl);
        else panel.appendChild(buildStructEmpty(tab.empty));
      } else {
        const table = this.#buildDataTable(tab);
        panel.appendChild(table ?? buildStructEmpty(tab.empty));
      }

      wrap.appendChild(panel);
      this.panels.set(tab.name, panel);
    }

    return wrap;
  }

  #countOf(name) {
    switch (name) {
      case "columns":
        return this.structure.columns.length;
      case "indexes":
        return this.structure.indexes.length;
      case "constraints":
        return this.structure.constraints.length;
      case "foreignKeys":
        return this.structure.foreignKeys.length;
      case "ddl":
        return countDdlStatements(this.ddl);
      default:
        return 0;
    }
  }

  #engineIcon() {
    return ENGINE_ICONS[this.engine] ?? "table";
  }

  /**
   * 切换标签。
   * 隐藏用 hidden 属性 + 内联 display 双保险:作者样式里若给 .struct-panel
   * 设了 display,会盖掉浏览器默认的 [hidden] 规则,只靠 hidden 会漏出面板。
   */
  #applyTab() {
    for (const tab of TABS) {
      const active = tab.name === this.tab;

      const button = this.tabButtons.get(tab.name);
      if (button) {
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      }

      const panel = this.panels.get(tab.name);
      if (panel) {
        panel.hidden = !active;
        panel.style.display = active ? "" : "none";
      }
    }
  }

  /* ---- 四张数据表 ---- */

  #buildDataTable(tab) {
    switch (tab.name) {
      case "columns":
        return this.#buildColumns();
      case "indexes":
        return this.#buildIndexes();
      case "constraints":
        return this.#buildConstraints();
      case "foreignKeys":
        return this.#buildForeignKeys();
      default:
        return null;
    }
  }

  /**
   * 外键列集合。
   * 「列」表里要标 FK,得从外键定义反推:哪些本地列被外键引用了。
   */
  #foreignKeyColumns() {
    const names = new Set();
    for (const foreignKey of this.structure.foreignKeys) {
      for (const name of foreignKey?.columns ?? []) {
        names.add(name);
      }
    }
    return names;
  }

  /** 列:位置 / 列名 / 类型 / 可空 / 默认值 / 键 */
  #buildColumns() {
    const columns = this.structure.columns;
    if (columns.length === 0) return null;

    const foreignKeyColumns = this.#foreignKeyColumns();
    const body = document.createElement("tbody");

    columns.forEach((column, index) => {
      const tr = document.createElement("tr");
      // 主键行整行加底色,扫一眼就能找到键
      if (column?.pk) tr.classList.add("is-pk");

      tr.appendChild(cell(String(positionOf(column, index))));

      const nameCell = document.createElement("td");
      nameCell.className = "mono";
      nameCell.textContent = column?.name ?? "";
      // 列注释放进 title,表格不因此多一列
      if (column?.comment) nameCell.title = column.comment;
      tr.appendChild(nameCell);

      tr.appendChild(cell(column?.type ?? "", "mono"));
      tr.appendChild(cell(column?.nullable === false ? "否" : "是"));

      const defaultCell = document.createElement("td");
      if (column?.default === null || column?.default === undefined) {
        const none = document.createElement("span");
        none.className = "null";
        none.textContent = "NULL";
        defaultCell.appendChild(none);
      } else {
        defaultCell.className = "mono";
        defaultCell.textContent = String(column.default);
      }
      tr.appendChild(defaultCell);

      const keyCell = document.createElement("td");
      if (column?.pk) {
        keyCell.className = "struct-key struct-key--pk";
        keyCell.textContent = "PK";
      } else if (foreignKeyColumns.has(column?.name)) {
        keyCell.className = "struct-key struct-key--fk";
        keyCell.textContent = "FK";
      }
      tr.appendChild(keyCell);

      body.appendChild(tr);
    });

    return buildStructTable(["位置", "列名", "类型", "可空", "默认值", "键"], body);
  }

  /** 索引:名称 / 列 / 唯一 / 方法 / 主键 */
  #buildIndexes() {
    const indexes = this.structure.indexes;
    if (indexes.length === 0) return null;

    const body = document.createElement("tbody");
    for (const index of indexes) {
      const tr = document.createElement("tr");
      if (index?.primary) tr.classList.add("is-pk");

      tr.appendChild(cell(index?.name ?? "", "mono"));
      // 复合索引的列顺序有意义,按给定顺序拼接
      tr.appendChild(cell((index?.columns ?? []).join(", "), "mono"));
      tr.appendChild(cell(index?.unique ? "是" : "否"));
      tr.appendChild(cell(index?.method ?? "—", "mono"));
      tr.appendChild(cell(index?.primary ? "是" : "否"));

      body.appendChild(tr);
    }

    return buildStructTable(["名称", "列", "唯一", "方法", "主键"], body);
  }

  /** 约束:名称 / 类型 / 表达式 */
  #buildConstraints() {
    const constraints = this.structure.constraints;
    if (constraints.length === 0) return null;

    const body = document.createElement("tbody");
    for (const constraint of constraints) {
      const tr = document.createElement("tr");

      tr.appendChild(cell(constraint?.name ?? "", "mono"));
      tr.appendChild(cell(constraint?.type ?? ""));
      // 表达式可能很长,允许换行,不让它把整张表撑宽
      tr.appendChild(cell(constraint?.expression ?? "", "mono struct-wrap"));

      body.appendChild(tr);
    }

    return buildStructTable(["名称", "类型", "表达式"], body);
  }

  /** 外键:名称 / 列 / 引用表 / 引用列 / 更新规则 / 删除规则 */
  #buildForeignKeys() {
    const foreignKeys = this.structure.foreignKeys;
    if (foreignKeys.length === 0) return null;

    const body = document.createElement("tbody");
    for (const foreignKey of foreignKeys) {
      const tr = document.createElement("tr");

      tr.appendChild(cell(foreignKey?.name ?? "", "mono"));
      tr.appendChild(cell((foreignKey?.columns ?? []).join(", "), "mono"));
      // 引用表带 schema 全名,跨库时才知道指向哪张表
      tr.appendChild(cell(foreignKey?.refTable ?? "", "mono"));
      tr.appendChild(cell((foreignKey?.refColumns ?? []).join(", "), "mono"));
      tr.appendChild(cell(foreignKey?.onUpdate ?? "—"));
      tr.appendChild(cell(foreignKey?.onDelete ?? "—"));

      body.appendChild(tr);
    }

    return buildStructTable(["名称", "列", "引用表", "引用列", "更新规则", "删除规则"], body);
  }

  /* ---- DDL ---- */

  #buildDdl() {
    if (!this.ddl.trim()) return null;

    const box = document.createElement("div");
    box.className = "struct-ddl";

    const head = document.createElement("div");
    head.className = "struct-ddl__head";

    const title = document.createElement("div");
    title.className = "struct-ddl__title";
    title.textContent = "DDL 预览";
    head.appendChild(title);

    // 引擎徽标:DDL 的方言由引擎决定,标出来免得看错
    const badge = document.createElement("span");
    badge.className = `engine-badge engine-${this.engine}`;
    const dot = document.createElement("span");
    dot.className = "engine-badge__dot";
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(ENGINE_LABELS[this.engine] ?? this.engine));
    head.appendChild(badge);

    const spacer = document.createElement("div");
    spacer.className = "struct-ddl__spacer";
    head.appendChild(spacer);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "btn btn--sm struct-ddl__copy";
    copyButton.appendChild(createIcon("copy", 13));
    const copyLabel = document.createElement("span");
    copyLabel.className = "struct-ddl__copy-label";
    copyLabel.textContent = "复制";
    copyButton.appendChild(copyLabel);
    this.copyLabel = copyLabel;

    const onCopy = () => this.#copyDdl();
    copyButton.addEventListener("click", onCopy);
    this.listeners.push([copyButton, "click", onCopy]);

    head.appendChild(copyButton);
    box.appendChild(head);

    const codeBox = document.createElement("div");
    codeBox.className = "struct-ddl__code";
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    // 着色 HTML 由 highlightSql 生成,是设计源内部产物,其余数据一律走 textContent
    code.innerHTML = highlightSql(this.ddl);
    pre.appendChild(code);
    codeBox.appendChild(pre);
    box.appendChild(codeBox);

    return box;
  }

  async #copyDdl() {
    const ok = await copyToClipboard(this.ddl);
    if (!ok || !this.copyLabel) return;

    this.copyLabel.textContent = "已复制";
    if (this.copyTimer) clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => {
      if (this.copyLabel) this.copyLabel.textContent = "复制";
      this.copyTimer = null;
    }, COPY_FEEDBACK_MS);
  }
}
