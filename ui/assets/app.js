import {
  CONNECTIONS,
  DOCUMENTS,
  ENGINES,
  KEYS,
  TABLE_DATA,
  UI_COPY,
} from "./mock-data.js";
import { DataGrid } from "./datagrid.js";
import { TreeView } from "./tree.js";
import { createIcon } from "./icons.js";
import { openMenu } from "./menu.js";

/* =============================================================================
 * SelaDB 设计源 —— 外壳装配
 *
 * 布局:
 *   标题栏 / 工具栏 / (对象树 | 工作区) / 状态栏
 *
 * 关键设计:
 *   - 全局工作区:多个连接同时打开,对象树顶部并列;Tab 不绑定连接,
 *     标题带引擎标识,跨连接对比直接开两个 Tab。
 *   - 数据视图抽象成 DataView 接口,由 TableDataView / DocumentDataView /
 *     KeyValueListView 分别实现。NoSQL 与关系型的数据形态不同,
 *     不能都塞进 DataGrid。
 * ========================================================================== */

const THEME_KEY = "seladb.ui.theme";
const DENSITY_KEY = "seladb.ui.density";

/** Tab 上的引擎短标识 —— 空间有限,不能用完整名称。 */
const ENGINE_SHORT = {
  postgresql: "PG",
  mysql: "MYSQL",
  sqlite: "SQLITE",
  sqlserver: "MSSQL",
  mongodb: "MONGO",
  redis: "REDIS",
};

const state = {
  /** 已打开的 Tab。Tab 不绑定连接,自身携带 connectionId。 */
  tabs: [],
  activeTabId: null,
  /** dataKey → { connection, node } */
  nodeIndex: new Map(),
  tree: null,
  grid: null,
  /** 当前挂载的数据视图,切 Tab 时要 destroy */
  view: null,
  shell: null,
  density: "comfortable",
  theme: "system",
};

/* -----------------------------------------------------------------------------
 * 1. 主题与密度
 * -------------------------------------------------------------------------- */

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

/**
 * 应用主题。
 * @param {'system'|'light'|'dark'} preference
 */
function applyTheme(preference) {
  state.theme = preference;
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // 隐私模式下 localStorage 不可用,忽略即可
  }
  const resolved = preference === "system" ? (darkQuery.matches ? "dark" : "light") : preference;
  document.body.dataset.theme = resolved;
  // 主题切换后需要重绘 canvas 类内容,这里用自定义事件通知
  document.body.dispatchEvent(new CustomEvent("seladb:themechange", { detail: resolved }));
}

function applyDensity(density) {
  state.density = density;
  try {
    localStorage.setItem(DENSITY_KEY, density);
  } catch {
    // 同上
  }
  document.body.dataset.density = density;
  // 行高变了,网格的虚拟滚动要按新行高重算
  document.body.dispatchEvent(new CustomEvent("seladb:densitychange", { detail: density }));
}

function restorePreferences() {
  let theme = "system";
  let density = "comfortable";
  try {
    theme = localStorage.getItem(THEME_KEY) ?? "system";
    density = localStorage.getItem(DENSITY_KEY) ?? "comfortable";
  } catch {
    // 同上
  }
  applyTheme(theme);
  applyDensity(density);
}

darkQuery.addEventListener("change", () => {
  if (state.theme === "system") applyTheme("system");
});

/* -----------------------------------------------------------------------------
 * 2. 节点索引
 *
 * 树里点了某个对象,要知道它属于哪个连接、该开什么视图。
 * 建一张 dataKey → { connection, node } 的表,查表比每次遍历快。
 * -------------------------------------------------------------------------- */
function buildNodeIndex() {
  state.nodeIndex = new Map();
  for (const connection of CONNECTIONS) {
    // 树的根节点在 connection.tree 上,连接对象本身只是元数据
    walk(connection.tree, connection);
  }
}

function walk(node, connection) {
  if (node.dataKey) {
    state.nodeIndex.set(node.dataKey, { connection, node });
  }
  for (const child of node.children ?? []) {
    walk(child, connection);
  }
}

/* -----------------------------------------------------------------------------
 * 3. 数据视图
 *
 * 三种形态共用一个接口,Tab 只认接口不认具体实现。
 * -------------------------------------------------------------------------- */

class DataView {
  constructor(ctx) {
    this.ctx = ctx;
    this.element = document.createElement("div");
    this.element.className = "panel";
  }

  mount(container) {
    container.appendChild(this.element);
    return this;
  }

  destroy() {
    this.element.remove();
  }
}

/** 关系型表数据 —— 内部用 DataGrid 实现。 */
class TableDataView extends DataView {
  constructor(ctx) {
    super(ctx);
    const data = TABLE_DATA[ctx.dataKey];
    if (!data) {
      this.element.appendChild(buildEmpty("没有可显示的数据", `找不到 ${ctx.dataKey} 的数据`));
      return;
    }

    // 表的真实行数远大于设计源手写的那十几行,扩一批出来让虚拟滚动有东西可滚
    const rows = expandRows(data.rows, data.columns, Math.min(data.total, 600));

    this.element.appendChild(buildPanelHead(ctx, `${rows.length} / ${data.total} 行`));

    const body = document.createElement("div");
    body.className = "panel__body";
    this.element.appendChild(body);

    this.grid = new DataGrid({
      columns: data.columns,
      rows,
      total: data.total,
      onCellChange: (rowIndex, key, oldValue, newValue) => {
        // 设计源里只做提示,真实提交由 Rust 侧的 service 层负责
        console.info("单元格变更", { rowIndex, key, oldValue, newValue });
      },
    });
    this.grid.mount(body);
  }

  destroy() {
    this.grid?.destroy();
    super.destroy();
  }
}

/**
 * 把 mock 行扩到目标条数。
 *
 * 设计源每张表只手写了十几行,但表的总行数是上千。虚拟滚动的滚动条按行数算,
 * 行数太少的话视口里大半是空行,看不出虚拟滚动在干什么。这里用确定性的方式
 * 造出变体:主键与时间戳递增,UUID 按序号派生,金额做小幅扰动,其余字段沿用
 * 原值 —— 看着像真数据,又不引入随机性(截图才能做视觉回归)。
 */
function expandRows(rows, columns, target) {
  if (rows.length >= target) return rows;

  const pkIndex = columns.findIndex((column) => column.pk);
  const uuidIndex = columns.findIndex((column) => /uuid/i.test(column.type ?? ""));
  const emailIndex = columns.findIndex((column) => /email/i.test(column.name ?? ""));
  const timeIndexes = columns
    .map((column, index) => (/timestamp|datetime|date|time/i.test(column.type ?? "") ? index : -1))
    .filter((index) => index >= 0);

  const out = [...rows];
  for (let i = rows.length; i < target; i += 1) {
    const base = rows[i % rows.length];
    const variant = { ...base };

    if (pkIndex >= 0) {
      const key = columns[pkIndex].key;
      const value = variant[key];
      variant[key] = typeof value === "number" ? value + i * 13 : `${value}-${i}`;
    }
    if (uuidIndex >= 0) {
      variant[columns[uuidIndex].key] = deriveUuid(i);
    }
    if (emailIndex >= 0) {
      const key = columns[emailIndex].key;
      const value = String(variant[key] ?? "");
      const at = value.indexOf("@");
      if (at > 0) variant[key] = `${value.slice(0, at)}+${i}@${value.slice(at + 1)}`;
    }
    for (const index of timeIndexes) {
      const key = columns[index].key;
      const value = variant[key];
      if (typeof value === "string") variant[key] = shiftTimestamp(value, i * 7);
    }
    // 金额类做小幅扰动,避免整列数值完全相同
    for (const [index, column] of columns.entries()) {
      if (index === pkIndex) continue;
      const value = variant[column.key];
      if (typeof value === "number" && !Number.isInteger(value)) {
        variant[column.key] = Number((value * (1 + (i % 9) / 100)).toFixed(2));
      }
    }

    out.push(variant);
  }
  return out;
}

/** 按序号派生一个形如 UUID v4 的确定性标识。 */
function deriveUuid(index) {
  const base = index.toString(16).padStart(16, "0");
  return [
    base.slice(0, 4),
    base.slice(4, 8),
    `4${base.slice(8, 12)}`,
    `8${base.slice(12, 16)}`,
    "000000000000",
  ].join("-");
}

/** 把时间戳往后推若干分钟,保持原有格式。 */
function shiftTimestamp(value, minutes) {
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  date.setMinutes(date.getMinutes() + minutes);
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return value.includes("T") ? stamp.replace(" ", "T") : stamp;
}

/** MongoDB 文档 —— 嵌套结构用 JSON 呈现,不做列化。 */
class DocumentDataView extends DataView {
  constructor(ctx) {
    super(ctx);
    const documents = DOCUMENTS[ctx.dataKey] ?? [];
    this.element.appendChild(buildPanelHead(ctx, `${documents.length} 个文档`));

    const body = document.createElement("div");
    body.className = "panel__body";
    this.element.appendChild(body);

    const list = document.createElement("div");
    list.className = "docs";
    body.appendChild(list);

    for (const doc of documents) {
      list.appendChild(buildDocument(doc));
    }
  }
}

/** Redis 键列表 —— 形态上仍是行式表格,直接复用 DataGrid。 */
class KeyValueListView extends DataView {
  constructor(ctx) {
    super(ctx);
    const keys = KEYS[ctx.dataKey] ?? [];
    this.element.appendChild(buildPanelHead(ctx, `${keys.length} 个键`));

    const body = document.createElement("div");
    body.className = "panel__body";
    this.element.appendChild(body);

    this.grid = new DataGrid({
      columns: [
        { key: "key", name: "key", type: "varchar(128)", width: 280 },
        { key: "type", name: "type", type: "varchar(16)", width: 120 },
        { key: "ttl", name: "ttl", type: "int", width: 100 },
        { key: "size", name: "size", type: "int", width: 100 },
        { key: "preview", name: "value", type: "text", width: 320 },
      ],
      rows: keys.map((entry) => ({
        key: entry.key,
        type: entry.type,
        ttl: entry.ttl,
        size: entry.size,
        preview: previewValue(entry),
      })),
      total: keys.length,
    });
    this.grid.mount(body);
  }

  destroy() {
    this.grid?.destroy();
    super.destroy();
  }
}

/**
 * 按数据形态选视图实现。
 *
 * 不能按节点的 kind 选:Redis 的 `db0` 在树上是 database 层级,
 * 但它的数据是键列表。所以以「数据在哪」为准,kind 只作提示。
 */
function createDataView(ctx) {
  if (KEYS[ctx.dataKey]) return new KeyValueListView(ctx);
  if (DOCUMENTS[ctx.dataKey]) return new DocumentDataView(ctx);
  return new TableDataView(ctx);
}

function previewValue(entry) {
  if (entry.value !== undefined) return entry.value;
  if (entry.fields) return JSON.stringify(entry.fields);
  if (entry.entries) return JSON.stringify(entry.entries.slice(0, 3));
  if (entry.values) return JSON.stringify(entry.values.slice(0, 3));
  return "";
}

/* -----------------------------------------------------------------------------
 * 4. 通用片段
 * -------------------------------------------------------------------------- */

function buildPanelHead(ctx, meta) {
  const head = document.createElement("div");
  head.className = "panel__head";

  const title = document.createElement("div");
  title.className = "panel__title";
  const badge = document.createElement("span");
  badge.className = `engine-badge engine-${ctx.connection.engine}`;
  const dot = document.createElement("span");
  dot.className = "engine-badge__dot";
  badge.appendChild(dot);
  badge.appendChild(document.createTextNode(ENGINES[ctx.connection.engine].label));
  title.appendChild(badge);
  title.appendChild(document.createTextNode(ctx.node.label));
  head.appendChild(title);

  // 对象类型的中文名,来自 mock-data 的 UI_COPY,避免这里再维护一份
  const kindMeta = UI_COPY.objectKinds?.[ctx.node.kind];
  if (kindMeta) {
    const kind = document.createElement("span");
    kind.className = "panel__sub";
    kind.textContent = kindMeta.label;
    head.appendChild(kind);
  }

  const sub = document.createElement("div");
  sub.className = "panel__sub";
  sub.textContent = ctx.subtitle ?? "";
  head.appendChild(sub);

  const spacer = document.createElement("div");
  spacer.className = "panel__spacer";
  head.appendChild(spacer);

  const metaEl = document.createElement("div");
  metaEl.className = "panel__sub";
  metaEl.textContent = meta;
  head.appendChild(metaEl);

  return head;
}

function buildEmpty(title, desc) {
  const empty = document.createElement("div");
  empty.className = "empty";
  const t = document.createElement("div");
  t.className = "empty__title";
  t.textContent = title;
  empty.appendChild(t);
  if (desc) {
    const d = document.createElement("div");
    d.className = "empty__desc";
    d.textContent = desc;
    empty.appendChild(d);
  }
  return empty;
}

function buildDocument(doc) {
  const card = document.createElement("div");
  card.className = "doc";

  const head = document.createElement("div");
  head.className = "doc__head";
  const id = document.createElement("span");
  id.className = "doc__id";
  id.textContent = String(doc._id ?? "");
  head.appendChild(id);
  card.appendChild(head);

  const fields = document.createElement("div");
  fields.className = "doc__fields";
  for (const [key, value] of Object.entries(doc)) {
    if (key === "_id") continue;

    const row = document.createElement("div");
    row.className = "doc__field";

    const k = document.createElement("div");
    k.className = "doc__key";
    k.textContent = key;
    row.appendChild(k);

    const v = document.createElement("div");
    v.className = "doc__value";
    if (value === null || value === undefined) {
      v.classList.add("doc__value--null");
      v.textContent = "null";
    } else if (typeof value === "object") {
      v.classList.add("doc__value--nested");
      v.textContent = JSON.stringify(value);
    } else {
      v.textContent = String(value);
    }
    row.appendChild(v);

    fields.appendChild(row);
  }
  card.appendChild(fields);
  return card;
}

function button(label, { icon, className = "btn", onClick, title } = {}) {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  if (title) el.title = title;
  if (icon) el.appendChild(createIcon(icon, 14));
  if (label) el.appendChild(document.createTextNode(label));
  if (onClick) el.addEventListener("click", onClick);
  return el;
}

/* -----------------------------------------------------------------------------
 * 5. 标题栏
 * -------------------------------------------------------------------------- */
function buildTitlebar() {
  const bar = document.createElement("header");
  bar.className = "titlebar";

  const brand = document.createElement("div");
  brand.className = "titlebar__brand";
  const logo = document.createElement("span");
  logo.className = "titlebar__logo";
  brand.appendChild(logo);
  brand.appendChild(document.createTextNode("SelaDB"));
  bar.appendChild(brand);

  const spacer = document.createElement("div");
  spacer.className = "titlebar__spacer";
  bar.appendChild(spacer);

  const search = document.createElement("div");
  search.className = "titlebar__search";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "搜索对象或执行命令";
  input.setAttribute("aria-label", "全局搜索");
  search.appendChild(input);
  const hint = document.createElement("span");
  hint.className = "titlebar__search-hint";
  hint.textContent = "⌘K";
  search.appendChild(hint);
  bar.appendChild(search);

  const themeBtn = button("", {
    className: "btn btn--ghost btn--icon",
    icon: "sun",
    title: "切换主题",
    onClick: () => {
      const order = ["system", "light", "dark"];
      const next = order[(order.indexOf(state.theme) + 1) % order.length];
      applyTheme(next);
      syncSettingsControls();
    },
  });
  bar.appendChild(themeBtn);

  bar.appendChild(
    button("", {
      className: "btn btn--ghost btn--icon",
      icon: "columns",
      title: "切换密度",
      onClick: () => {
        applyDensity(state.density === "compact" ? "comfortable" : "compact");
        syncSettingsControls();
      },
    }),
  );

  bar.appendChild(
    button("", {
      className: "btn btn--ghost btn--icon",
      icon: "settings",
      title: "设置",
      onClick: () => {
        location.hash = "#/settings";
      },
    }),
  );

  bar.appendChild(
    button("新建连接", {
      className: "btn btn--primary",
      icon: "plus",
      onClick: () => {
        location.hash = "#/connect";
      },
    }),
  );

  return bar;
}

/* -----------------------------------------------------------------------------
 * 6. 工具栏
 *
 * 左区是数据级操作,右区是连接级操作。提交/回滚只作用于当前 Tab 所属连接,
 * 这条归属在右侧的连接标识上明示。
 * -------------------------------------------------------------------------- */
function buildToolbar() {
  const bar = document.createElement("div");
  bar.className = "toolbar";

  const left = document.createElement("div");
  left.className = "toolbar__group";
  left.appendChild(button("刷新", { icon: "refresh", onClick: () => renderWorkspace() }));
  left.appendChild(
    button("打开查询", {
      icon: "play",
      onClick: () => openQueryTab(),
    }),
  );
  bar.appendChild(left);

  const div1 = document.createElement("div");
  div1.className = "toolbar__divider";
  bar.appendChild(div1);

  const mid = document.createElement("div");
  mid.className = "toolbar__group";
  mid.appendChild(
    button("提交", {
      className: "btn",
      icon: "check",
      onClick: () => {
        console.info("提交当前连接的事务");
      },
    }),
  );
  const rollback = button("回滚", { className: "btn", icon: "refresh" });
  rollback.addEventListener("click", () => {
    console.info("回滚当前连接的事务");
  });
  mid.appendChild(rollback);
  bar.appendChild(mid);

  const spacer = document.createElement("div");
  spacer.className = "toolbar__spacer";
  bar.appendChild(spacer);

  const txLabel = document.createElement("span");
  txLabel.className = "toolbar__label";
  txLabel.textContent = "事务";
  bar.appendChild(txLabel);
  bar.appendChild(
    button("Auto", {
      className: "btn",
      onClick: (event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        openMenu(
          [
            { label: "Auto(自动提交)", action: () => {} },
            { label: "Manual(手动提交)", action: () => {} },
          ],
          { x: rect.left, y: rect.bottom + 4 },
        );
      },
    }),
  );

  const div2 = document.createElement("div");
  div2.className = "toolbar__divider";
  bar.appendChild(div2);

  // 当前 Tab 所属连接 —— 提交/回滚的作用对象
  const connBtn = button("—", { className: "btn", title: "当前连接" });
  connBtn.dataset.role = "current-connection";
  connBtn.addEventListener("click", (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu(
      CONNECTIONS.map((connection) => ({
        label: `${ENGINES[connection.engine].label} — ${connection.label}`,
        action: () => {},
      })).concat([{ type: "separator" }, { label: "管理连接…", action: () => {} }]),
      { x: rect.left, y: rect.bottom + 4 },
    );
  });
  bar.appendChild(connBtn);

  return bar;
}

/* -----------------------------------------------------------------------------
 * 7. 对象树面板
 * -------------------------------------------------------------------------- */
function buildTreePanel() {
  const panel = document.createElement("aside");
  panel.className = "tree";

  const searchWrap = document.createElement("div");
  searchWrap.className = "tree__search";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "筛选对象";
  input.setAttribute("aria-label", "筛选对象");
  searchWrap.appendChild(input);
  panel.appendChild(searchWrap);

  const treeHost = document.createElement("div");
  panel.appendChild(treeHost);

  const tree = new TreeView({
    onSelect: (node) => {
      if (node?.dataKey) openTabForNode(node);
    },
    onContextMenu: (node, event) => {
      const actions = node.actions ?? ["打开数据"];
      openMenu(
        actions.map((label) => ({ label, action: () => {} })),
        { x: event.clientX, y: event.clientY },
      );
    },
  });
  tree.mount(treeHost);
  // 树的数据源是每个连接的根节点,不是连接对象本身
  tree.setData(CONNECTIONS.map((connection) => connection.tree));
  state.tree = tree;

  input.addEventListener("input", () => {
    tree.filter(input.value);
  });

  return panel;
}

/* -----------------------------------------------------------------------------
 * 8. Tab 栏
 * -------------------------------------------------------------------------- */
function buildTabbar() {
  const bar = document.createElement("div");
  bar.className = "tabbar";
  const tabs = document.createElement("div");
  tabs.className = "tabbar__tabs";
  tabs.dataset.role = "tabs";
  bar.appendChild(tabs);
  bar.appendChild(
    button("", {
      className: "tabbar__new",
      icon: "plus",
      title: "新建查询",
      onClick: () => openQueryTab(),
    }),
  );
  return bar;
}

function openTabForNode(node) {
  const entry = state.nodeIndex.get(node.dataKey);
  if (!entry) return;

  const existing = state.tabs.find((tab) => tab.dataKey === node.dataKey);
  if (existing) {
    state.activeTabId = existing.id;
    renderTabs();
    renderWorkspace();
    return;
  }

  const tab = {
    id: `tab-${state.tabs.length + 1}-${node.dataKey}`,
    dataKey: node.dataKey,
    node,
    connection: entry.connection,
    title: node.label,
    kind: node.kind,
    dirty: false,
  };
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  renderTabs();
  renderWorkspace();
}

function openQueryTab() {
  const connection = CONNECTIONS[0];
  const tab = {
    id: `tab-query-${state.tabs.length + 1}`,
    dataKey: null,
    node: { label: "查询 1", kind: "query" },
    connection,
    title: "查询 1",
    kind: "query",
    dirty: false,
  };
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  renderTabs();
  renderWorkspace();
}

function closeTab(id) {
  const index = state.tabs.findIndex((tab) => tab.id === id);
  if (index === -1) return;
  state.tabs.splice(index, 1);
  if (state.activeTabId === id) {
    state.activeTabId = state.tabs[index]?.id ?? state.tabs[index - 1]?.id ?? null;
  }
  renderTabs();
  renderWorkspace();
}

function renderTabs() {
  const host = document.querySelector('[data-role="tabs"]');
  if (!host) return;
  host.replaceChildren();

  for (const tab of state.tabs) {
    const el = document.createElement("div");
    el.className = "tab";
    if (tab.id === state.activeTabId) el.classList.add("is-active");
    el.dataset.tabId = tab.id;

    const engine = document.createElement("span");
    engine.className = `tab__engine engine-${tab.connection.engine}`;
    engine.textContent = ENGINE_SHORT[tab.connection.engine] ?? "SQL";
    el.appendChild(engine);

    const name = document.createElement("span");
    name.className = "tab__name";
    name.textContent = tab.title;
    el.appendChild(name);

    if (tab.dirty) {
      const dirty = document.createElement("span");
      dirty.className = "tab__dirty";
      dirty.title = "有未提交的修改";
      el.appendChild(dirty);
    }

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab__close";
    close.title = "关闭";
    close.appendChild(createIcon("close", 11));
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTab(tab.id);
    });
    el.appendChild(close);

    el.addEventListener("click", () => {
      state.activeTabId = tab.id;
      renderTabs();
      renderWorkspace();
    });

    host.appendChild(el);
  }
}

/* -----------------------------------------------------------------------------
 * 9. 工作区
 * -------------------------------------------------------------------------- */
function renderWorkspace() {
  const host = document.querySelector('[data-role="workspace-body"]');
  if (!host) return;

  // 切 Tab 前先销毁上一个视图,否则网格的滚动监听与事件会泄漏
  state.view?.destroy();
  state.view = null;
  host.replaceChildren();

  const tab = state.tabs.find((item) => item.id === state.activeTabId);

  if (!tab) {
    host.appendChild(
      buildEmpty("没有打开的对象", "在左侧对象树里选择一个表、集合或键分组"),
    );
    updateStatusBar(null);
    return;
  }

  if (tab.kind === "query") {
    host.appendChild(buildQueryPlaceholder());
    updateStatusBar(tab);
    return;
  }

  const ctx = {
    node: tab.node,
    connection: tab.connection,
    dataKey: tab.dataKey,
    subtitle: tab.connection.subtitle,
  };
  const view = createDataView(ctx);
  state.view = view;
  view.mount(host);
  updateStatusBar(tab);
}

function buildQueryPlaceholder() {
  const panel = document.createElement("div");
  panel.className = "panel";
  const head = document.createElement("div");
  head.className = "panel__head";
  const title = document.createElement("div");
  title.className = "panel__title";
  title.textContent = "查询 1";
  head.appendChild(title);
  panel.appendChild(head);

  const body = document.createElement("div");
  body.className = "panel__body";
  body.appendChild(
    buildEmpty(
      "查询编辑器将在 V0.3 实现",
      "当前版本先固定工作台的信息架构:对象树导航、Tab 工作区、状态栏反馈。",
    ),
  );
  panel.appendChild(body);
  return panel;
}

function updateStatusBar(tab) {
  const status = document.querySelector('[data-role="statusbar"]');
  if (!status) return;
  status.replaceChildren();

  const connection = tab?.connection;

  const dot = document.createElement("span");
  dot.className = `statusbar__dot ${connection ? "statusbar__dot--ok" : ""}`;
  status.appendChild(dot);
  status.appendChild(statusItem(connection ? `已连接 ${connection.subtitle}` : "未选择连接"));

  if (connection) {
    status.appendChild(statusItem(connection.charset));
    status.appendChild(statusItem(`事务 ${connection.transaction === "auto" ? "Auto" : "Manual"}`));
    status.appendChild(statusItem(`${connection.latencyMs} ms`));
  }

  const spacer = document.createElement("div");
  spacer.className = "statusbar__spacer";
  status.appendChild(spacer);

  status.appendChild(statusItem("就绪"));

  // 工具栏上的「当前连接」要跟状态栏一致:提交/回滚只作用于这个连接
  const connBtn = document.querySelector('[data-role="current-connection"]');
  if (connBtn) {
    connBtn.textContent = connection ? connection.label : "—";
    connBtn.disabled = !connection;
  }
}

function statusItem(text) {
  const el = document.createElement("div");
  el.className = "statusbar__item";
  const value = document.createElement("span");
  value.className = "statusbar__value";
  value.textContent = text;
  el.appendChild(value);
  return el;
}

/* -----------------------------------------------------------------------------
 * 10. 工作台外壳
 * -------------------------------------------------------------------------- */
function renderWorkbench(root) {
  root.replaceChildren();
  const app = document.createElement("div");
  app.className = "app";

  app.appendChild(buildTitlebar());
  app.appendChild(buildToolbar());

  const body = document.createElement("div");
  body.className = "app__body";
  body.appendChild(buildTreePanel());
  body.appendChild(buildSplitter());

  const workspace = document.createElement("main");
  workspace.className = "workspace";
  workspace.appendChild(buildTabbar());
  const workspaceBody = document.createElement("div");
  workspaceBody.className = "panel__body";
  workspaceBody.dataset.role = "workspace-body";
  workspace.appendChild(workspaceBody);
  body.appendChild(workspace);

  app.appendChild(body);

  const statusbar = document.createElement("footer");
  statusbar.className = "statusbar";
  statusbar.dataset.role = "statusbar";
  app.appendChild(statusbar);

  root.appendChild(app);
  state.shell = app;

  renderTabs();
  renderWorkspace();
}

/** 对象树与工作区之间的拖拽手柄。 */
function buildSplitter() {
  const splitter = document.createElement("div");
  splitter.className = "splitter";

  splitter.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    splitter.classList.add("is-dragging");
    splitter.setPointerCapture(event.pointerId);

    const treeEl = document.querySelector(".tree");
    const startX = event.clientX;
    const startWidth = treeEl?.getBoundingClientRect().width ?? 268;

    const onMove = (moveEvent) => {
      if (!treeEl) return;
      const next = startWidth + (moveEvent.clientX - startX);
      const min = parseFloat(getComputedStyle(treeEl).minWidth) || 180;
      const max = parseFloat(getComputedStyle(treeEl).maxWidth) || 520;
      treeEl.style.width = `${Math.min(max, Math.max(min, next))}px`;
    };

    const onUp = () => {
      splitter.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });

  return splitter;
}

/* -----------------------------------------------------------------------------
 * 11. 路由页面
 * -------------------------------------------------------------------------- */

/** 入口页:分流到规范页与产品预览。 */
function renderEntry(root) {
  const page = document.createElement("div");
  page.className = "entry";

  const inner = document.createElement("div");
  inner.className = "entry__inner";

  const brand = document.createElement("div");
  brand.className = "entry__brand";
  const logo = document.createElement("span");
  logo.className = "entry__logo";
  brand.appendChild(logo);
  const names = document.createElement("div");
  const name = document.createElement("div");
  name.className = "entry__name";
  name.textContent = "SelaDB";
  names.appendChild(name);
  const tag = document.createElement("div");
  tag.className = "entry__tag";
  tag.textContent = "跨平台数据库管理工具 · UI 设计源";
  names.appendChild(tag);
  brand.appendChild(names);
  inner.appendChild(brand);

  const cards = document.createElement("div");
  cards.className = "entry__cards";

  const designCard = document.createElement("button");
  designCard.type = "button";
  designCard.className = "entry__card";
  const dcTitle = document.createElement("div");
  dcTitle.className = "entry__card-title";
  dcTitle.textContent = "产品预览";
  designCard.appendChild(dcTitle);
  const dcDesc = document.createElement("div");
  dcDesc.className = "entry__card-desc";
  dcDesc.textContent =
    "主工作台:对象树 + Tab 工作区 + 状态栏。六种引擎的原生层级、可交互数据网格、文档视图与键列表。";
  designCard.appendChild(dcDesc);
  const dcMeta = document.createElement("div");
  dcMeta.className = "entry__card-meta";
  dcMeta.textContent = "#/design";
  designCard.appendChild(dcMeta);
  designCard.addEventListener("click", () => {
    location.hash = "#/design";
  });
  cards.appendChild(designCard);

  const specCard = document.createElement("button");
  specCard.type = "button";
  specCard.className = "entry__card";
  const scTitle = document.createElement("div");
  scTitle.className = "entry__card-title";
  scTitle.textContent = "设计规范";
  specCard.appendChild(scTitle);
  const scDesc = document.createElement("div");
  scDesc.className = "entry__card-desc";
  scDesc.textContent =
    "设计 token、类型色板、引擎色、组件清单与引擎支持矩阵。Rust 实现阶段以这份规范为验收依据。";
  specCard.appendChild(scDesc);
  const scMeta = document.createElement("div");
  scMeta.className = "entry__card-meta";
  scMeta.textContent = "#/spec";
  specCard.appendChild(scMeta);
  specCard.addEventListener("click", () => {
    location.hash = "#/spec";
  });
  cards.appendChild(specCard);

  inner.appendChild(cards);

  const foot = document.createElement("div");
  foot.className = "entry__foot";
  foot.textContent =
    "设计源为纯静态 HTML + CSS + JS,不依赖任何第三方 UI 库。所有数据为 mock,交互行为对标产品真实行为。";
  inner.appendChild(foot);

  page.appendChild(inner);
  root.appendChild(page);
}

/** 规范页:token、组件清单、引擎矩阵。 */
function renderSpec(root) {
  const page = document.createElement("div");
  page.className = "page";
  const inner = document.createElement("div");
  inner.className = "page__inner";

  inner.appendChild(
    buildPageHead("设计规范", "SelaDB 设计系统", "所有颜色、间距、字号、圆角、动效的唯一真源是 assets/tokens.css。Rust 实现阶段以这份规范为还原度验收依据。"),
  );

  // 色板
  inner.appendChild(buildSwatchSection("主题与语义色", [
    ["--bg-canvas", "画布"], ["--bg-surface", "面板"], ["--bg-sunken", "凹陷"],
    ["--bg-selected", "选中"], ["--border-default", "边框"], ["--fg-default", "前景"],
    ["--fg-muted", "次要前景"], ["--accent", "强调色"], ["--danger", "危险"],
    ["--warning", "警告"], ["--success", "成功"], ["--info", "信息"],
  ]));

  inner.appendChild(buildSwatchSection("数据类型色板(数据网格专用)", [
    ["--type-int", "整数"], ["--type-float", "浮点/金额"], ["--type-bool", "布尔"],
    ["--type-time", "时间"], ["--type-null", "NULL"], ["--type-binary", "二进制"],
    ["--type-json", "JSON"], ["--type-uuid", "UUID"], ["--type-string", "字符串"],
  ]));

  inner.appendChild(buildSwatchSection("引擎品牌色", [
    ["--engine-postgresql", "PostgreSQL"], ["--engine-mysql", "MySQL"],
    ["--engine-sqlite", "SQLite"], ["--engine-sqlserver", "SQL Server"],
    ["--engine-mongodb", "MongoDB"], ["--engine-redis", "Redis"],
  ]));

  // 组件清单
  const componentSection = document.createElement("section");
  componentSection.className = "section";
  const ct = document.createElement("h2");
  ct.className = "section__title";
  ct.textContent = "组件清单";
  componentSection.appendChild(ct);
  const cd = document.createElement("p");
  cd.className = "section__desc";
  cd.textContent = "P0 是没有就不可用的核心;P2 是 NoSQL 差异化部分,排在 V0.5 验证 DataView 接口是否站得住。";
  componentSection.appendChild(cd);
  componentSection.appendChild(
    buildTable(
      ["优先级", "组件", "关键能力"],
      [
        ["P0", "DataGrid", "虚拟滚动、列宽拖拽、排序、筛选、单元格内编辑、NULL 样式、类型着色、右键菜单、列显隐"],
        ["P0", "TreeView", "懒加载展开、搜索过滤、右键菜单、徽标计数、任意深度"],
        ["P0", "TabBar", "多标签、脏标记、关闭确认、拖拽排序"],
        ["P0", "Toolbar / StatusBar", "分区布局、连接级与数据级操作分离、连接状态与耗时反馈"],
        ["P0", "Splitter", "对象树与工作区可拖拽分栏"],
        ["P0", "Dialog / Modal / Drawer", "确认框、表单弹层、侧边抽屉"],
        ["P1", "QueryEditor", "SQL 语法高亮、错误定位、多语句执行"],
        ["P1", "CommandPalette", "⌘K 全局命令与对象跳转"],
        ["P1", "表单控件组", "Input / Select / Switch / Checkbox / NumberInput / PasswordInput / PathPicker"],
        ["P1", "Icon 系统", "统一图标(引擎徽标、对象类型、状态)"],
        ["P2", "DocumentTree / JsonViewer", "MongoDB BSON 嵌套展开与折叠"],
        ["P2", "KeyValueList / ValueEditor", "Redis 键列表 + 按类型渲染的值编辑器"],
      ],
      (row) => {
        const pill = document.createElement("span");
        pill.className = `pill pill--${row[0] === "P0" ? "ok" : row[0] === "P1" ? "plan" : "later"}`;
        pill.textContent = row[0];
        return [pill, row[1], row[2]];
      },
    ),
  );
  inner.appendChild(componentSection);

  // 引擎矩阵
  const engineSection = document.createElement("section");
  engineSection.className = "section";
  const et = document.createElement("h2");
  et.className = "section__title";
  et.textContent = "引擎支持矩阵";
  engineSection.appendChild(et);
  const ed = document.createElement("p");
  ed.className = "section__desc";
  ed.textContent =
    "对象树保留各引擎的原生层级,差异由引擎树规格驱动,不写进树组件。";
  engineSection.appendChild(ed);
  engineSection.appendChild(
    buildTable(
      ["引擎", "对象树层级", "数据视图", "第一版状态"],
      [
        ["PostgreSQL", "连接 → database → schema → 表/视图/函数/序列", "行式表格", "已设计"],
        ["MySQL / MariaDB", "连接 → database → 表/视图/存储过程/事件", "行式表格", "已设计"],
        ["SQLite", "连接 → 表/视图/索引/触发器", "行式表格", "已设计"],
        ["SQL Server", "连接 → database → schema → 表/存储过程", "行式表格", "已设计"],
        ["MongoDB", "连接 → database → 集合/视图/索引", "文档树", "已设计"],
        ["Redis", "连接 → db0 → 类型分组 → 键", "键列表", "已设计"],
      ],
      (row) => {
        const badge = document.createElement("span");
        badge.className = `engine-badge engine-${row[0] === "MySQL / MariaDB" ? "mysql" : row[0].toLowerCase().replace(/\s+/g, "")}`;
        const dot = document.createElement("span");
        dot.className = "engine-badge__dot";
        badge.appendChild(dot);
        badge.appendChild(document.createTextNode(row[0]));
        const pill = document.createElement("span");
        pill.className = "pill pill--ok";
        pill.textContent = row[3];
        return [badge, row[1], row[2], pill];
      },
    ),
  );
  inner.appendChild(engineSection);

  page.appendChild(inner);
  root.appendChild(page);
}

function buildPageHead(eyebrow, title, lead) {
  const head = document.createElement("div");
  head.className = "page__head";
  const e = document.createElement("div");
  e.className = "page__eyebrow";
  e.textContent = eyebrow;
  head.appendChild(e);
  const t = document.createElement("h1");
  t.className = "page__title";
  t.textContent = title;
  head.appendChild(t);
  const l = document.createElement("p");
  l.className = "page__lead";
  l.textContent = lead;
  head.appendChild(l);
  return head;
}

function buildSwatchSection(label, entries) {
  const section = document.createElement("div");
  section.className = "swatch-group";
  const l = document.createElement("div");
  l.className = "swatch-group__label";
  l.textContent = label;
  section.appendChild(l);

  const grid = document.createElement("div");
  grid.className = "swatches";
  for (const [token, name] of entries) {
    const swatch = document.createElement("div");
    swatch.className = "swatch";
    const chip = document.createElement("div");
    chip.className = "swatch__chip";
    chip.style.background = `var(${token})`;
    swatch.appendChild(chip);
    const meta = document.createElement("div");
    meta.className = "swatch__meta";
    const n = document.createElement("div");
    n.className = "swatch__name";
    n.textContent = name;
    meta.appendChild(n);
    const v = document.createElement("div");
    v.className = "swatch__value";
    v.textContent = token;
    meta.appendChild(v);
    swatch.appendChild(meta);
    grid.appendChild(swatch);
  }
  section.appendChild(grid);
  return section;
}

function buildTable(headers, rows, decorate) {
  const table = document.createElement("table");
  table.className = "spec-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const header of headers) {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  for (const row of rows) {
    const tr = document.createElement("tr");
    const cells = decorate ? decorate(row) : row;
    for (const cell of cells) {
      const td = document.createElement("td");
      if (cell instanceof Node) td.appendChild(cell);
      else td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/** 连接向导:选引擎 → 填参数 → 测试。 */
function renderConnect(root) {
  const page = document.createElement("div");
  page.className = "page";
  const inner = document.createElement("div");
  inner.className = "page__inner";

  const wizard = document.createElement("div");
  wizard.className = "wizard";

  wizard.appendChild(
    buildPageHead("连接", "新建连接", "设计源只演示流程与参数形态,不连真实数据库。"),
  );

  const steps = document.createElement("div");
  steps.className = "wizard__steps";
  const labels = ["选择引擎", "填写参数", "测试与保存"];
  labels.forEach((label, index) => {
    if (index > 0) {
      const sep = document.createElement("div");
      sep.className = "wizard__step-sep";
      steps.appendChild(sep);
    }
    const step = document.createElement("div");
    step.className = "wizard__step";
    const num = document.createElement("span");
    num.className = "wizard__step-num";
    num.textContent = String(index + 1);
    step.appendChild(num);
    step.appendChild(document.createTextNode(label));
    steps.appendChild(step);
  });
  wizard.appendChild(steps);

  const engineGrid = document.createElement("div");
  engineGrid.className = "engine-grid";
  for (const engine of Object.values(ENGINES)) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "engine-card";
    const dot = document.createElement("span");
    dot.className = "engine-card__dot";
    dot.style.setProperty("--engine-color", engine.color);
    card.appendChild(dot);
    const text = document.createElement("div");
    const name = document.createElement("div");
    name.className = "engine-card__name";
    name.textContent = engine.label;
    text.appendChild(name);
    const meta = document.createElement("div");
    meta.className = "engine-card__meta";
    meta.textContent = `${engine.group} · 驱动 ${engine.driver}`;
    text.appendChild(meta);
    card.appendChild(text);
    card.addEventListener("click", () => {
      for (const other of engineGrid.querySelectorAll(".engine-card")) {
        other.classList.remove("is-selected");
      }
      card.classList.add("is-selected");
    });
    engineGrid.appendChild(card);
  }
  wizard.appendChild(engineGrid);

  const actions = document.createElement("div");
  actions.className = "wizard__actions";
  const spacer = document.createElement("div");
  spacer.className = "wizard__actions-spacer";
  actions.appendChild(spacer);
  actions.appendChild(
    button("返回工作台", {
      onClick: () => {
        location.hash = "#/design";
      },
    }),
  );
  actions.appendChild(
    button("下一步", {
      className: "btn btn--primary",
      onClick: () => {
        const chosen = engineGrid.querySelector(".engine-card.is-selected");
        if (!chosen) {
          window.alert("请先选择一种数据库引擎");
          return;
        }
        const name = chosen.querySelector(".engine-card__name").textContent;
        showTestResult(name);
      },
    }),
  );
  wizard.appendChild(actions);

  const result = document.createElement("div");
  result.dataset.role = "connect-result";
  wizard.appendChild(result);

  inner.appendChild(wizard);
  page.appendChild(inner);
  root.appendChild(page);
}

function showTestResult(engineName) {
  const host = document.querySelector('[data-role="connect-result"]');
  if (!host) return;
  host.replaceChildren();
  const box = document.createElement("div");
  box.className = "test-result test-result--ok";
  box.appendChild(createIcon("check", 14));
  box.appendChild(
    document.createTextNode(`连接 ${engineName} 成功(设计源为 mock,不发起真实连接)`),
  );
  host.appendChild(box);
}

/** 设置页:主题、密度。 */
function renderSettings(root) {
  const page = document.createElement("div");
  page.className = "page";
  const inner = document.createElement("div");
  inner.className = "page__inner";

  inner.appendChild(
    buildPageHead("设置", "偏好设置", "主题默认跟随系统,密度可调 —— 同样 1000 行,紧凑模式能多看一半。"),
  );

  const section = document.createElement("section");
  section.className = "section";

  section.appendChild(
    settingRow("主题", "默认跟随系统;也可以固定为浅色或深色。", ["system", "light", "dark"], ["跟随系统", "浅色", "深色"], () => state.theme, (value) => applyTheme(value)),
  );
  section.appendChild(
    settingRow("密度", "影响表格行高、树行高与基础字号。", ["comfortable", "compact"], ["舒适", "紧凑"], () => state.density, (value) => applyDensity(value)),
  );

  inner.appendChild(section);

  const actions = document.createElement("div");
  actions.className = "wizard__actions";
  actions.appendChild(
    button("返回工作台", {
      onClick: () => {
        location.hash = "#/design";
      },
    }),
  );
  inner.appendChild(actions);

  page.appendChild(inner);
  root.appendChild(page);
  syncSettingsControls();
}

function settingRow(label, desc, values, labels, getValue, setValue) {
  const row = document.createElement("div");
  row.className = "setting-row";

  const text = document.createElement("div");
  text.className = "setting-row__text";
  const l = document.createElement("div");
  l.className = "setting-row__label";
  l.textContent = label;
  text.appendChild(l);
  const d = document.createElement("div");
  d.className = "setting-row__desc";
  d.textContent = desc;
  text.appendChild(d);
  row.appendChild(text);

  const group = document.createElement("div");
  group.className = "segmented";
  group.dataset.role = `setting-${label}`;
  group.dataset.current = getValue();
  values.forEach((value, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "segmented__item";
    item.textContent = labels[index];
    item.dataset.value = value;
    item.addEventListener("click", () => {
      setValue(value);
      group.dataset.current = value;
      syncSettingsControls();
    });
    group.appendChild(item);
  });
  row.appendChild(group);

  return row;
}

/** 设置页与标题栏的控件状态要保持一致。 */
function syncSettingsControls() {
  for (const group of document.querySelectorAll(".segmented")) {
    for (const item of group.querySelectorAll(".segmented__item")) {
      item.classList.toggle("is-active", item.dataset.value === group.dataset.current);
    }
  }
}

/* -----------------------------------------------------------------------------
 * 12. 路由
 * -------------------------------------------------------------------------- */
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path] = raw.split("?");
  return path || "design";
}

function renderRoute(root) {
  // 路由切换必须先清空挂载点,否则上一个页面的 DOM 会留在文档里
  root.replaceChildren();
  // 上一屏的组件也要拆掉,否则网格的滚动监听与 ResizeObserver 会泄漏
  state.view?.destroy();
  state.view = null;
  state.tree?.destroy();
  state.tree = null;

  const route = parseHash();
  switch (route) {
    case "entry":
      renderEntry(root);
      break;
    case "spec":
      renderSpec(root);
      break;
    case "connect":
      renderConnect(root);
      break;
    case "settings":
      renderSettings(root);
      break;
    case "design":
    default:
      renderWorkbench(root);
      break;
  }
}

/* -----------------------------------------------------------------------------
 * 13. 启动
 * -------------------------------------------------------------------------- */
export function boot(root) {
  restorePreferences();
  buildNodeIndex();

  const render = () => renderRoute(root);
  window.addEventListener("hashchange", render);

  if (!location.hash) {
    location.hash = "#/design";
  }
  render();
}
