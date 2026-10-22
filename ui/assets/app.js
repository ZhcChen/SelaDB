
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
  /** 命令面板,挂在 body 上,跨路由常驻 */
  palette: null,
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
/**
 * 表编辑器的标签页。
 *
 * 「数据 / 列 / 索引 / 约束 / 外键 / DDL」合成一行 —— 之前是面板头一个
 * 「数据/结构/DDL」分段控件,结构视图里又有一排「列/索引/约束/外键」,
 * 两层标签互相打架,谁在上一层说不清。合成一行是 DBeaver 的做法。
 */
const TABLE_TABS = [
  { key: "data", label: "数据", icon: "table" },
  { key: "columns", label: "列", icon: "columns", count: (s) => s.columns.length },
  { key: "indexes", label: "索引", icon: "index", count: (s) => s.indexes.length },
  { key: "constraints", label: "约束", icon: "check", count: (s) => s.constraints.length },
  { key: "foreignKeys", label: "外键", icon: "keygroup", count: (s) => s.foreignKeys.length },
  { key: "ddl", label: "DDL", icon: "table" },
];

class TableDataView extends DataView {
  constructor(ctx) {
    super(ctx);
    const data = TABLE_DATA[ctx.dataKey];
    if (!data) {
      this.element.appendChild(buildEmpty("没有可显示的数据", `找不到 ${ctx.dataKey} 的数据`));
      return;
    }

    this.data = data;
    this.structure = TABLE_STRUCTURE[ctx.dataKey];
    this.ddl = generateDdl(ctx.dataKey);
    // 树右键菜单的「查看结构」落在列分面上
    this.mode = ctx.mode === "structure" ? "columns" : (ctx.mode ?? "data");

    this.head = buildPanelHead(ctx, "");
    this.element.appendChild(this.head);

    // 标签栏。过滤条放在这一行的右侧 —— 面板头只留标题,
    // 表格上方就只占一行 chrome。
    if (this.structure) {
      const tabs = document.createElement("div");
      tabs.className = "subtabs";

      const tabList = document.createElement("div");
      tabList.className = "subtabs__list";
      for (const tab of TABLE_TABS) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "subtab";
        button.dataset.mode = tab.key;
        button.appendChild(createIcon(tab.icon, 13));
        const label = document.createElement("span");
        label.className = "subtab__label";
        label.textContent = tab.label;
        button.appendChild(label);
        // 数量角标:合并成一行标签之后,一眼看全结构规模的能力不能丢
        const count = document.createElement("span");
        count.className = "subtab__count";
        count.textContent = String(tab.count?.(this.structure) ?? "");
        if (count.textContent) button.appendChild(count);
        button.addEventListener("click", () => this.setMode(tab.key));
        tabList.appendChild(button);
      }
      tabs.appendChild(tabList);

      this.filterHost = document.createElement("div");
      this.filterHost.className = "grid__filter-slot";
      tabs.appendChild(this.filterHost);

      this.element.appendChild(tabs);
      this.tabs = tabs;
    } else {
      // 没有结构视图的表(视图、集合)不需要标签行,过滤条单独放面板头
      this.filterHost = document.createElement("div");
      this.filterHost.className = "grid__filter-slot";
      this.head.appendChild(this.filterHost);
    }

    const body = document.createElement("div");
    body.className = "panel__body";
    this.element.appendChild(body);
    this.body = body;

    this.setMode(this.mode);
  }

  /** 切换数据 / 列 / 索引 / 约束 / 外键 / DDL。 */
  setMode(mode) {
    this.mode = mode;
    for (const item of this.tabs?.querySelectorAll(".subtab") ?? []) {
      item.classList.toggle("is-active", item.dataset.mode === mode);
    }
    // 过滤条只对数据网格有意义。结构视图与 DDL 是只读的,挂着个
    // 「过滤条件,例如 id > 100」纯属语义错乱。
    this.filterHost.style.display = mode === "data" ? "" : "none";

    this.grid?.destroy();
    this.grid = null;
    this.structureView?.destroy();
    this.structureView = null;
    this.body.replaceChildren();

    if (mode === "data") {
      // 表的真实行数远大于设计源手写的那十几行,扩一批出来让虚拟滚动有东西可滚
      const rows = expandRows(this.data.rows, this.data.columns, Math.min(this.data.total, 600));
      this.grid = new DataGrid({
        columns: this.data.columns,
        rows,
        total: this.data.total,
        filterMount: this.filterHost,
        onCellChange: (rowIndex, key, oldValue, newValue) => {
          // 设计源里只做提示,真实提交由 Rust 侧的 service 层负责
          console.info("单元格变更", { rowIndex, key, oldValue, newValue });
        },
      });
      this.grid.mount(this.body);
      // 行数只在底栏显示一次,右上角重复一遍是界面噪音
      this.setMeta("");
      return;
    }

    this.structureView = new StructureView({
      structure: this.structure,
      ddl: this.ddl,
      engine: this.ctx.connection.engine,
    });
    this.structureView.mountPanel(this.body, mode);
    this.setMeta("");
  }

  /** 更新面板头右侧的元信息。 */
  setMeta(text) {
    const meta = this.head.querySelector(".panel__meta");
    if (meta) meta.textContent = text;
  }

  destroy() {
    this.grid?.destroy();
    this.structureView?.destroy();
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

/**
 * 按序号派生一个形如 UUID v4 的确定性标识。
 *
 * 直接把序号转十六进制会让前几组全是 0000,一眼假。这里先做一次
 * FNV-1a 散列再取十六进制,出来的分布跟真 UUID 一样散。
 */
function deriveUuid(index) {
  let hash = 0x811c9dc5 ^ index;
  for (let i = 0; i < 4; i += 1) {
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const base = hash.toString(16).padStart(8, "0");
  const tail = (hash * 2654435761)
    .toString(16)
    .padStart(12, "0")
    .slice(0, 12);
  return [
    base.slice(0, 4),
    base.slice(4, 8),
    `4${base.slice(0, 3)}`,
    `8${base.slice(3, 6)}`,
    tail,
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

/** MongoDB 文档 —— 嵌套结构用可折叠的树呈现,不做列化。 */
class DocumentDataView extends DataView {
  constructor(ctx) {
    super(ctx);
    const documents = DOCUMENTS[ctx.dataKey] ?? [];
    this.element.appendChild(buildPanelHead(ctx, `${documents.length} 个文档`));

    const body = document.createElement("div");
    body.className = "panel__body";
    this.element.appendChild(body);

    this.tree = new DocumentTree(documents);
    this.tree.mount(body);
  }

  destroy() {
    this.tree?.destroy();
    super.destroy();
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
      // 键列表不是关系表,表头不该挂 SQL 类型标注 —— 纯化成 Key / Type / TTL / Size / Value
      columns: [
        { key: "key", name: "key", type: "varchar(128)", width: 280, showType: false },
        {
          key: "type",
          name: "type",
          type: "varchar(16)",
          width: 110,
          showType: false,
          // 类型用语义色徽章:一眼分清 string / hash / list / set / zset
          format: (value) => ({
            text: value,
            badgeClass: `grid__badge grid__badge--${value}`,
          }),
        },
        {
          key: "ttl",
          name: "ttl",
          type: "int",
          width: 100,
          showType: false,
          // -1 是「永不过期」,直接显示数字会让人以为出错了
          format: (value) =>
            value === -1 ? { text: "∞", className: "grid__cell--falsy" } : String(value),
        },
        { key: "size", name: "size", type: "int", width: 100, showType: false },
        { key: "preview", name: "value", type: "text", width: 320, showType: false },
      ],
      rows: keys.map((entry) => ({
        key: entry.key,
        type: entry.type,
        ttl: entry.ttl,
        size: entry.size,
        preview: previewValue(entry),
      })),
      total: keys.length,
      // 键列表不是关系表,过滤是「按键名匹配」,写 id > 100 是 SQL 语义
      filterPlaceholder: "按键匹配,例如 key like cache:*",
      onRowClick: (sourceIndex) => openValueEditor(keys[sourceIndex]),
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

function buildPanelHead(ctx, meta, controls = []) {
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

  // 控件槽:表格的过滤条挂这儿,不占网格上方的纵向空间
  for (const control of controls) {
    head.appendChild(control);
  }

  const spacer = document.createElement("div");
  spacer.className = "panel__spacer";
  head.appendChild(spacer);

  const metaEl = document.createElement("div");
  metaEl.className = "panel__sub panel__meta";
  metaEl.textContent = meta;
  head.appendChild(metaEl);

  return head;
}

/**
 * 空工作区的「快速开始」。
 *
 * 一块空白加两行居中的字,是网页后台的空状态,不是桌面工具的空状态。
 * 真实工具在这里给的是下一步动作:开查询、开连接、回到最近看过的表。
 */
function buildStartPanel() {
  const panel = document.createElement("div");
  panel.className = "start";

  const inner = document.createElement("div");
  inner.className = "start__inner";

  const title = document.createElement("div");
  title.className = "start__title";
  title.textContent = "快速开始";
  inner.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "start__grid";

  const actions = [
    {
      icon: "play",
      title: "新建查询",
      desc: "在当前连接上写 SQL",
      shortcut: "⌘T",
      run: () => openQueryTab(),
    },
    {
      icon: "plus",
      title: "新建连接",
      desc: "添加一个数据库连接",
      run: () => {
        location.hash = "#/connect";
      },
    },
    {
      icon: "search",
      title: "全局搜索",
      desc: "按表名、字段名找对象",
      shortcut: "⌘K",
      run: () => state.palette?.open(),
    },
  ];

  for (const action of actions) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "start__card";
    card.addEventListener("click", action.run);

    const icon = document.createElement("span");
    icon.className = "start__icon";
    icon.appendChild(createIcon(action.icon, 16));
    card.appendChild(icon);

    const text = document.createElement("span");
    text.className = "start__text";
    const name = document.createElement("span");
    name.className = "start__card-title";
    name.textContent = action.title;
    text.appendChild(name);
    const desc = document.createElement("span");
    desc.className = "start__card-desc";
    desc.textContent = action.desc;
    text.appendChild(desc);
    card.appendChild(text);

    if (action.shortcut) {
      const kbd = document.createElement("span");
      kbd.className = "start__kbd";
      kbd.textContent = action.shortcut;
      card.appendChild(kbd);
    }
    grid.appendChild(card);
  }
  inner.appendChild(grid);

  // 最近打开 —— 数据库工具的高频入口就是「回到刚才那张表」
  const recent = document.createElement("div");
  recent.className = "start__recent";
  const recentTitle = document.createElement("div");
  recentTitle.className = "start__recent-title";
  recentTitle.textContent = "最近打开";
  recent.appendChild(recentTitle);

  const recentList = document.createElement("div");
  recentList.className = "start__recent-list";
  for (const key of RECENT_OBJECTS) {
    const entry = state.nodeIndex.get(key);
    if (!entry) continue;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "start__recent-item";
    const badge = document.createElement("span");
    badge.className = `engine-badge engine-${entry.connection.engine}`;
    const dot = document.createElement("span");
    dot.className = "engine-badge__dot";
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(ENGINES[entry.connection.engine].label));
    item.appendChild(badge);
    const name = document.createElement("span");
    name.className = "start__recent-name";
    name.textContent = entry.node.label;
    item.appendChild(name);
    item.addEventListener("click", () => openTabForNode(entry.node));
    recentList.appendChild(item);
  }
  recent.appendChild(recentList);
  inner.appendChild(recent);

  panel.appendChild(inner);
  return panel;
}

/** 「最近打开」里列哪些对象。 */
const RECENT_OBJECTS = [
  "mysql-local/shop/users",
  "pg-local/postgres/public/orders",
  "mongo-local/shop/users",
  "pg-local/postgres/public/users",
];

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
 * 5. 顶栏
 *
 * 标题栏与工具栏合并成一行。之前工具栏只有四五个操作,横向空得发慌,却实实在在
 * 占掉 40px 纵向空间 —— 那是数据网格最该拿到的位置。
 *
 * 排布:品牌 | 数据级操作 ......... 事务 | 当前连接 | 搜索 | 图标
 * 操作按钮一律 Ghost 样式。桌面工具的操作条不该是一排带描边的大圆角网页按钮,
 * 右上角也不该挂一个营销页式的蓝色主按钮。
 * -------------------------------------------------------------------------- */
function buildTopbar() {
  const bar = document.createElement("header");
  bar.className = "topbar";

  const brand = document.createElement("div");
  brand.className = "topbar__brand";
  const logo = document.createElement("span");
  logo.className = "topbar__logo";
  brand.appendChild(logo);
  brand.appendChild(document.createTextNode("SelaDB"));
  bar.appendChild(brand);

  bar.appendChild(buildSeparator());

  // 数据级操作
  const actions = document.createElement("div");
  actions.className = "topbar__group";
  actions.appendChild(
    button("刷新", {
      className: "btn btn--tool",
      icon: "refresh",
      title: "刷新",
      onClick: () => renderWorkspace(),
    }),
  );
  actions.appendChild(
    button("查询", {
      className: "btn btn--tool",
      icon: "play",
      title: "打开查询 ⌘↵",
      onClick: () => openQueryTab(),
    }),
  );
  bar.appendChild(actions);

  const spacer = document.createElement("div");
  spacer.className = "topbar__spacer";
  bar.appendChild(spacer);

  bar.appendChild(buildSeparator());

  // 提交/回滚只对关系型引擎有意义,跟事务模式放一起
  const txButtons = document.createElement("div");
  txButtons.className = "topbar__group";
  txButtons.dataset.role = "tx-actions";
  const commitBtn = button("提交", {
    className: "btn btn--tool",
    icon: "check",
    title: "提交当前连接的事务",
    onClick: () => console.info("提交当前连接的事务"),
  });
  const rollbackBtn = button("回滚", {
    className: "btn btn--tool",
    icon: "undo",
    title: "回滚当前连接的事务",
    onClick: () => console.info("回滚当前连接的事务"),
  });
  txButtons.append(commitBtn, rollbackBtn);
  bar.appendChild(txButtons);

  // 事务模式:做成规范的下拉,原来那个「Auto」按钮既不像下拉也不像开关
  const tx = document.createElement("div");
  tx.className = "topbar__group";
  const txBtn = button("Auto", {
    className: "btn btn--tool",
    title: "事务模式",
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
  });
  txBtn.appendChild(caretIcon());
  tx.appendChild(txBtn);
  bar.appendChild(tx);

  // 当前连接:提交/回滚的作用对象
  const connBtn = button("—", {
    className: "btn btn--tool",
    title: "当前连接",
  });
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

  bar.appendChild(buildSeparator());

  // 搜索
  const search = document.createElement("div");
  search.className = "topbar__search";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "搜索对象或执行命令";
  input.setAttribute("aria-label", "全局搜索");
  // 真正的输入在命令面板里,这里只是个入口
  input.readOnly = true;
  input.addEventListener("focus", () => state.palette?.open());
  input.addEventListener("click", () => state.palette?.open());
  search.appendChild(input);
  const hint = document.createElement("span");
  hint.className = "topbar__search-hint";
  hint.textContent = "⌘K";
  search.appendChild(hint);
  bar.appendChild(search);

  // 图标组
  const icons = document.createElement("div");
  icons.className = "topbar__icons";

  // 主题:点开直接选「浅色 / 深色 / 跟随系统」,不用循环切换去猜
  const themeBtn = button("", {
    className: "btn btn--tool btn--icon",
    icon: themeIcon(state.theme),
    title: `主题:${THEME_LABEL[state.theme]}`,
  });
  themeBtn.dataset.role = "theme-button";
  themeBtn.addEventListener("click", (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    openMenu(
      Object.entries(THEME_LABEL).map(([value, label]) => ({
        label,
        checked: state.theme === value,
        action: () => {
          applyTheme(value);
          syncSettingsControls();
        },
      })),
      { x: rect.left, y: rect.bottom + 4 },
    );
  });
  icons.appendChild(themeBtn);

  // 密度挪到设置页 —— 顶栏本来就有八个控件,再多一个就挤了
  // 新建连接降权成图标按钮 —— 右上角挂一个蓝色大按钮太像营销页
  icons.appendChild(
    button("", {
      className: "btn btn--tool btn--icon",
      icon: "plus",
      title: "新建连接",
      onClick: () => {
        location.hash = "#/connect";
      },
    }),
  );
  bar.appendChild(icons);

  // 设置:带文字的按钮。低频但必须能被找到 —— 之前只有一个齿轮图标,
  // 谁也不会知道点它能改主题。
  bar.appendChild(
    button("设置", {
      className: "btn btn--tool",
      title: "设置",
      onClick: () => {
        location.hash = "#/settings";
      },
    }),
  );

  return bar;
}

/** 主题选项的显示名。 */
const THEME_LABEL = { system: "跟随系统", light: "浅色", dark: "深色" };
const DENSITY_LABEL = { comfortable: "舒适", compact: "紧凑" };

/** 主题按钮的图标:跟随系统用显示器,浅色用太阳,深色用月亮。 */
function themeIcon(preference) {
  if (preference === "light") return "sun";
  if (preference === "dark") return "moon";
  return "monitor";
}

/** 顶栏里的竖向分隔线。 */
function buildSeparator() {
  const sep = document.createElement("div");
  sep.className = "topbar__sep";
  return sep;
}

/** 下拉箭头。 */
function caretIcon() {
  const span = document.createElement("span");
  span.className = "btn__caret";
  span.textContent = "▾";
  return span;
}


/**
 * 树节点右键菜单。
 *
 * 菜单项来自 mock 数据里每个节点声明的 actions,但真正的行为在这里定 ——
 * 引擎差异不应该渗进菜单逻辑,菜单只认「这个节点是什么」。
 */
function buildNodeActions(node) {
  const canOpen = Boolean(node.dataKey);
  const isTable = node.kind === "table" || node.kind === "view";
  const items = [];
  const seen = new Set();

  // mock 数据里每个节点都声明了自己的动作,菜单按声明顺序排,重复的只留一个
  const push = (label, action, options = {}) => {
    if (seen.has(label)) return;
    seen.add(label);
    items.push({ label, action, ...options });
  };

  if (canOpen) {
    push("打开数据", () => openTabForNode(node, "data"), { icon: "table" });
  }
  if (isTable) {
    push("查看结构", () => openTabForNode(node, "structure"), { icon: "schema" });
    push("生成 DDL", () => openTabForNode(node, "ddl"), { icon: "copy" });
  }

  for (const label of node.actions ?? []) {
    if (label === "复制名称") {
      push(label, () => {
        void copyText(node.label);
        toast(`已复制「${node.label}」`, { type: "success" });
      }, { shortcut: "⌘C" });
      continue;
    }
    if (label.startsWith("删除")) {
      push(label, () => confirmDeleteNode(node), { danger: true });
      continue;
    }
    push(label, () => runNodeAction(label, node));
  }

  if (!seen.has("复制名称")) {
    items.push({ type: "separator" });
    push("复制名称", () => {
      void copyText(node.label);
      toast(`已复制「${node.label}」`, { type: "success" });
    }, { shortcut: "⌘C" });
  }

  return items;
}

/** mock 数据里声明的动作。设计源只实现一部分,其余给个明确反馈。 */
function runNodeAction(label, node) {
  switch (label) {
    case "刷新":
      toast(`已刷新「${node.label}」`, { type: "success" });
      return;
    case "复制连接信息":
      void copyText(node.label);
      toast("已复制连接信息", { type: "success" });
      return;
    case "打开连接":
    case "断开连接":
      toast(label === "打开连接" ? "连接已就绪(mock)" : "连接已断开(mock)", { type: "info" });
      return;
    case "编辑连接":
      location.hash = "#/connect";
      return;
    default:
      toast(`「${label}」在设计源里还没有实现`, { type: "warning" });
  }
}

/** 删除确认。破坏性操作必须走确认框,这是设计契约的一部分。 */
async function confirmDeleteNode(node) {
  const result = await openDialog({
    title: `删除 ${node.label}`,
    message: `确定要删除「${node.label}」吗?该操作不可撤销,表里的数据会一并丢失。`,
    confirmText: "删除",
    danger: true,
  });
  if (result) {
    toast(`已删除「${node.label}」(mock)`, { type: "success" });
  }
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
      openMenu(buildNodeActions(node), { x: event.clientX, y: event.clientY });
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

function openTabForNode(node, mode = "data") {
  const entry = state.nodeIndex.get(node.dataKey);
  if (!entry) return;

  const existing = state.tabs.find((tab) => tab.dataKey === node.dataKey);
  if (existing) {
    // 同一个对象可能从不同入口打开(树里点数据、右键点结构),切模式即可
    existing.mode = mode;
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
    mode,
    dirty: false,
  };
  state.tabs.push(tab);
  state.activeTabId = tab.id;
  renderTabs();
  renderWorkspace();
}

/** 查询示例:正常的一条,能在 mock 里跑出结果集。 */
const SAMPLE_SQL = `-- 用户订单概览:按状态统计
SELECT u.id,
       u.name,
       u.status,
       COUNT(o.id) AS orders
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active'
GROUP BY u.id, u.name, u.status
ORDER BY orders DESC
LIMIT 100;
`;

/** 查询示例:故意写错的一张表,用来演示错误定位。 */
const SAMPLE_SQL_ERROR = `-- 这条会失败:order_total 这张表不存在
SELECT o.id, o.amount
FROM order_total o
WHERE o.amount > 100;
`;

/** 走 SQL 的引擎。Redis 是 KV,没有查询编辑器。 */
const RELATIONAL_ENGINES = new Set(["postgresql", "mysql", "sqlite", "sqlserver"]);

function openQueryTab(connection = null) {
  // 查询 Tab 继承当前 Tab 的连接;没有当前 Tab 时用第一个关系型连接
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  let target = connection ?? active?.connection ?? CONNECTIONS[0];
  if (!RELATIONAL_ENGINES.has(target.engine)) {
    target = CONNECTIONS.find((item) => RELATIONAL_ENGINES.has(item.engine)) ?? target;
  }
  const index = state.tabs.filter((tab) => tab.kind === "query").length + 1;

  const tab = {
    id: `tab-query-${Date.now()}-${index}`,
    dataKey: null,
    node: { label: `查询 ${index}`, kind: "query" },
    connection: target,
    title: `查询 ${index}`,
    kind: "query",
    dirty: false,
    sql: SAMPLE_SQL,
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
    host.appendChild(buildStartPanel());
    updateStatusBar(null);
    return;
  }

  if (tab.kind === "query") {
    const view = new QueryView({ tab });
    state.view = view;
    view.mount(host);
    updateStatusBar(tab);
    return;
  }

  const ctx = {
    node: tab.node,
    connection: tab.connection,
    dataKey: tab.dataKey,
    subtitle: tab.connection.subtitle,
    mode: tab.mode ?? "data",
  };
  const view = createDataView(ctx);
  state.view = view;
  view.mount(host);
  updateStatusBar(tab);
}

/**
 * 查询 Tab 的视图。
 *
 * 上下两段:上面是编辑器,下面是执行结果。执行是 mock 的,但错误定位是真的 ——
 * 假执行器会真的去找 FROM 后面的表名,找不到就报「relation "xxx" does not exist」
 * 并把出错的那段标红波浪线。
 */
class QueryView extends DataView {
  constructor({ tab }) {
    super({ node: tab.node, connection: tab.connection });
    this.tab = tab;

    // 头部
    this.element.appendChild(buildPanelHead({ node: tab.node, connection: tab.connection, subtitle: tab.connection.subtitle }, ""));

    const runBtn = button("执行", {
      className: "btn btn--sm btn--primary",
      icon: "play",
      title: "执行 ⌘↵",
      onClick: () => this.execute(),
    });
    this.element.querySelector(".panel__head").appendChild(runBtn);

    // 编辑器
    this.editor = new QueryEditor({
      value: tab.sql ?? "",
      onExecute: () => this.execute(),
      onChange: (value) => {
        this.tab.sql = value;
        this.tab.dirty = true;
        renderTabs();
      },
    });
    this.editor.mount(this.element);

    // 状态条
    const bar = document.createElement("div");
    bar.className = "query__bar";
    this.barInfo = document.createElement("span");
    const spacer = document.createElement("div");
    spacer.className = "query__bar-spacer";
    bar.append(this.barInfo, spacer);
    bar.appendChild(
      button("正常示例", {
        className: "btn btn--sm btn--ghost",
        onClick: () => this.loadSample(SAMPLE_SQL),
      }),
    );
    bar.appendChild(
      button("错误示例", {
        className: "btn btn--sm btn--ghost",
        onClick: () => this.loadSample(SAMPLE_SQL_ERROR),
      }),
    );
    this.element.appendChild(bar);
    this.bar = bar;

    // 结果区
    const body = document.createElement("div");
    body.className = "panel__body";
    this.element.appendChild(body);
    this.resultHost = body;

    this.#updateBar();
  }

  loadSample(sql) {
    this.editor.setValue(sql);
    this.editor.focus();
  }

  execute() {
    const sql = this.editor.getValue();
    const tables = buildTableRegistry(this.tab.connection);
    const result = executeQuery(sql, { tables });

    if (!result.ok) {
      this.editor.setError(result.error);
      this.#showError(result.error);
      this.#updateBar(result);
      return;
    }

    this.editor.clearError();
    this.#showResults(result);
    this.#updateBar(result);
  }

  #updateBar(result = null) {
    const sql = this.editor.getValue();
    const statements = splitStatements(sql).length;
    this.barInfo.replaceChildren();

    const strong = document.createElement("span");
    strong.className = "query__bar-value";
    strong.textContent = String(statements);
    this.barInfo.appendChild(strong);
    this.barInfo.appendChild(document.createTextNode(" 条语句"));
    this.barInfo.appendChild(document.createTextNode(" · ⌘↵ 执行"));
    if (result?.ok) {
      this.barInfo.appendChild(document.createTextNode(" · "));
      const elapsed = document.createElement("span");
      elapsed.className = "query__bar-value";
      elapsed.textContent = String(result.elapsedMs);
      this.barInfo.appendChild(elapsed);
      this.barInfo.appendChild(document.createTextNode(" ms"));
    }
  }

  #showError(error) {
    this.resultHost.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "empty";
    const title = document.createElement("div");
    title.className = "empty__title";
    title.textContent = "查询未执行";
    empty.appendChild(title);
    // 错误详情已经在上方的红色条里说过了,这里不重复
    const desc = document.createElement("div");
    desc.className = "empty__desc";
    desc.textContent = "修正上方标红的部分后重新执行(⌘↵)";
    empty.appendChild(desc);
    this.resultHost.appendChild(empty);
  }

  #showResults(result) {
    this.resultHost.replaceChildren();
    const first = result.results[0];
    if (!first) return;

    if (first.kind === "message") {
      this.resultHost.appendChild(buildEmpty("Query OK", "语句执行完成,没有返回结果集"));
      return;
    }

    const grid = new DataGrid({
      columns: first.columns,
      rows: first.rows,
      total: first.total,
    });
    grid.mount(this.resultHost);
    this.grid = grid;
  }

  destroy() {
    this.grid?.destroy();
    this.editor?.destroy();
    super.destroy();
  }
}

/**
 * 打开 Redis 键的值编辑器。
 *
 * 键列表与值编辑器是分开的两个界面:列表负责扫,编辑器负责改。
 */
function openValueEditor(entry) {
  const content = document.createElement("div");
  content.className = "drawer__content";

  const editor = new ValueEditor(entry);
  editor.mount(content);

  const foot = document.createElement("div");
  foot.className = "value-editor__foot";
  const hint = document.createElement("span");
  hint.className = "value-editor__hint";
  hint.textContent = "改动只在本机保留,保存后才会发回服务端";
  foot.appendChild(hint);

  const spacer = document.createElement("div");
  spacer.className = "value-editor__spacer";
  foot.appendChild(spacer);

  foot.appendChild(
    button("保存", {
      className: "btn btn--primary btn--sm",
      onClick: () => {
        toast(`已保存 ${entry.key}(mock)`, { type: "success" });
        drawer.close();
      },
    }),
  );
  content.appendChild(foot);

  const drawer = openDrawer({
    title: entry.key,
    content,
    width: 460,
    onClose: () => editor.destroy(),
  });
}

/**
 * 某个连接下已知的表,按裸表名索引。
 *
 * mock 执行器是按 `FROM users` 里的裸表名找表的,所以索引也用裸名。
 */
function buildTableRegistry(connection) {
  const registry = new Map();
  for (const [key, data] of Object.entries(TABLE_DATA)) {
    if (!key.startsWith(`${connection.id}/`)) continue;
    const name = key.split("/").pop();
    if (!registry.has(name)) registry.set(name, data);
  }
  return registry;
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

  // 事务按钮只对关系型引擎有意义 —— MongoDB 的单文档原子性和 Redis 都没有
  // 关系型事务,挂在那儿是误导
  const txActions = document.querySelector('[data-role="tx-actions"]');
  if (txActions) {
    const relational = connection ? RELATIONAL_ENGINES.has(connection.engine) : false;
    txActions.style.display = relational ? "" : "none";
  }

  // 工具栏上的「当前连接」要跟状态栏一致:提交/回滚只作用于这个连接
  const connBtn = document.querySelector('[data-role="current-connection"]');
  if (connBtn) {
    connBtn.textContent = connection ? connection.label : "未选择连接";
    connBtn.disabled = !connection;
    connBtn.style.display = connection ? "" : "none";
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

  app.appendChild(buildTopbar());

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
  const dcArrow = document.createElement("span");
  dcArrow.className = "entry__card-arrow";
  dcArrow.appendChild(createIcon("chevron", 13));
  designCard.appendChild(dcArrow);
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
  const scArrow = document.createElement("span");
  scArrow.className = "entry__card-arrow";
  scArrow.appendChild(createIcon("chevron", 13));
  specCard.appendChild(scArrow);
  specCard.addEventListener("click", () => {
    location.hash = "#/spec";
  });
  cards.appendChild(specCard);

  inner.appendChild(cards);

  // 引擎徽标 —— 入口页要一眼看出支持哪些数据库
  const engines = document.createElement("div");
  engines.className = "entry__engines";
  const enginesLabel = document.createElement("span");
  enginesLabel.className = "entry__engines-label";
  enginesLabel.textContent = "第一版支持";
  engines.appendChild(enginesLabel);
  for (const engine of Object.values(ENGINES)) {
    const badge = document.createElement("span");
    badge.className = `engine-badge engine-${engine.id}`;
    const dot = document.createElement("span");
    dot.className = "engine-badge__dot";
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(engine.label));
    engines.appendChild(badge);
  }
  inner.appendChild(engines);

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
        ["P0", "StructureView", "列 / 索引 / 约束 / 外键四个分面,DDL 预览"],
        ["P1", "QueryEditor", "SQL 语法高亮、错误定位、⌘↵ 执行、多语句"],
        ["P1", "CommandPalette", "⌘K 全局命令与对象跳转"],
        ["P1", "表单控件组", "Input / Select / Switch / Checkbox / NumberInput / PasswordInput / PathPicker"],
        ["P1", "Toast", "操作反馈"],
        ["P1", "Icon 系统", "统一图标(引擎徽标、对象类型、状态)"],
        ["P2", "DocumentTree", "MongoDB BSON 嵌套展开与折叠"],
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

/**
 * 连接向导:选引擎 → 填参数 → 测试与保存。
 *
 * 参数表单的字段随引擎变:PostgreSQL 要 schema 与 SSL,MySQL 要字符集,
 * SQLite 只要一个文件路径,Redis 只要密码。表单用 ui-kit 的 createField 拼,
 * 字段描述是纯数据,换引擎只换描述。
 */
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

  const stepBar = document.createElement("div");
  stepBar.className = "wizard__steps";
  wizard.appendChild(stepBar);

  const stepBody = document.createElement("div");
  stepBody.className = "wizard__body";
  wizard.appendChild(stepBody);

  const actions = document.createElement("div");
  actions.className = "wizard__actions";
  const backBtn = button("上一步", {
    onClick: () => goToStep(stepState.step - 1),
  });
  const spacer = document.createElement("div");
  spacer.className = "wizard__actions-spacer";
  // 第二步要先能测连通,再谈保存 —— 这是连数据库的基本节奏
  const testBtn = button("测试连接", {
    icon: "check",
    onClick: () => {
      toast(`已测试 ${stepState.engine?.label ?? "连接"}:连通(mock)`, { type: "success" });
    },
  });
  const nextBtn = button("下一步", { className: "btn btn--primary" });
  actions.append(backBtn, spacer, testBtn, nextBtn);
  wizard.appendChild(actions);

  const stepState = { step: 1, engine: null, values: {} };

  function goToStep(step) {
    stepState.step = Math.min(3, Math.max(1, step));
    renderStepBar();
    renderStepBody();
    backBtn.disabled = stepState.step === 1;
    testBtn.hidden = stepState.step !== 2;
    nextBtn.textContent = stepState.step === 3 ? "保存连接" : "下一步";
    nextBtn.disabled = stepState.step === 1 && !stepState.engine;
  }

  function renderStepBar() {
    stepBar.replaceChildren();
    ["选择引擎", "填写参数", "测试与保存"].forEach((label, index) => {
      const number = index + 1;
      if (number > 1) {
        const sep = document.createElement("div");
        sep.className = "wizard__step-sep";
        stepBar.appendChild(sep);
      }
      const step = document.createElement("div");
      step.className = "wizard__step";
      if (number === stepState.step) step.classList.add("is-active");
      else if (number < stepState.step) step.classList.add("is-done");
      const num = document.createElement("span");
      num.className = "wizard__step-num";
      num.textContent = String(number);
      step.appendChild(num);
      step.appendChild(document.createTextNode(label));
      stepBar.appendChild(step);
    });
  }

  function renderStepBody() {
    stepBody.replaceChildren();
    if (stepState.step === 1) renderEngineStep();
    else if (stepState.step === 2) renderFormStep();
    else renderTestStep();
  }

  function renderEngineStep() {
    const grid = document.createElement("div");
    grid.className = "engine-grid";
    for (const engine of Object.values(ENGINES)) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "engine-card";
      if (stepState.engine?.id === engine.id) card.classList.add("is-selected");
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
        stepState.engine = engine;
        goToStep(1);
      });
      grid.appendChild(card);
    }
    stepBody.appendChild(grid);
  }

  function renderFormStep() {
    const engine = stepState.engine;
    const form = document.createElement("div");
    form.className = "form-grid";

    const fields = connectionFields(engine);
    const controls = fields.map((field) => createField(field));
    controls.forEach((control, index) => {
      // 只有连接名独占一行,其余参数两列排 —— 竖屏那么宽,一行一个太浪费
      if (index === 0) control.element.classList.add("field--full");
      form.appendChild(control.element);
    });
    stepBody.appendChild(form);
  }

  function renderTestStep() {
    const engine = stepState.engine;
    const result = document.createElement("div");
    result.className = "test-result test-result--ok";
    result.appendChild(createIcon("check", 14));
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.textContent = `连接 ${engine.label} 成功`;
    text.appendChild(title);
    const detail = document.createElement("div");
    detail.className = "engine-card__meta";
    detail.textContent = "设计源为 mock,不发起真实连接";
    text.appendChild(detail);
    result.appendChild(text);
    stepBody.appendChild(result);

    const summary = document.createElement("div");
    summary.className = "kv-note";
    summary.textContent = `将保存为「${engine.label} — ${stepState.values.name ?? "未命名"}」`;
    stepBody.appendChild(summary);
  }

  nextBtn.addEventListener("click", () => {
    if (stepState.step === 1) {
      if (!stepState.engine) return;
      goToStep(2);
      return;
    }
    if (stepState.step === 2) {
      // 取一次表单值,给第三步的摘要用
      const engine = stepState.engine;
      const fields = connectionFields(engine);
      stepState.values = { name: `${engine.label} — 新连接` };
      goToStep(3);
      return;
    }
    toast(`已保存连接「${stepState.values.name}」(mock)`, { type: "success" });
    location.hash = "#/design";
  });

  backBtn.addEventListener("click", () => goToStep(stepState.step - 1));

  goToStep(1);

  inner.appendChild(wizard);
  page.appendChild(inner);
  root.appendChild(page);
}

/** 各引擎的连接参数表单。 */
function connectionFields(engine) {
  const common = [
    { name: "name", label: "连接名", value: `${engine.label} — 新连接`, full: true },
  ];

  switch (engine.id) {
    case "postgresql":
      return [
        ...common,
        { name: "host", label: "主机", value: "127.0.0.1" },
        { name: "port", label: "端口", type: "number", value: 5432 },
        { name: "user", label: "用户名", value: "postgres" },
        { name: "password", label: "密码", type: "password", value: "" },
        { name: "database", label: "数据库", value: "postgres" },
        { name: "schema", label: "Schema", value: "public" },
        { name: "ssl", label: "使用 SSL", type: "switch", value: false },
      ];
    case "mysql":
      return [
        ...common,
        { name: "host", label: "主机", value: "127.0.0.1" },
        { name: "port", label: "端口", type: "number", value: 3306 },
        { name: "user", label: "用户名", value: "root" },
        { name: "password", label: "密码", type: "password", value: "" },
        { name: "database", label: "数据库", value: "" },
        { name: "charset", label: "字符集", value: "utf8mb4" },
        { name: "ssl", label: "使用 SSL", type: "switch", value: false },
      ];
    case "sqlite":
      return [
        ...common,
        { name: "path", label: "数据库文件", type: "path", value: "", full: true, hint: "选择一个本地的 .db / .sqlite3 文件" },
        { name: "readonly", label: "以只读方式打开", type: "checkbox", value: false },
      ];
    case "sqlserver":
      return [
        ...common,
        { name: "host", label: "主机", value: "127.0.0.1" },
        { name: "port", label: "端口", type: "number", value: 1433 },
        { name: "user", label: "用户名", value: "sa" },
        { name: "password", label: "密码", type: "password", value: "" },
        { name: "database", label: "数据库", value: "master" },
        { name: "trust_cert", label: "信任服务器证书", type: "switch", value: true },
      ];
    case "mongodb":
      return [
        ...common,
        { name: "host", label: "主机", value: "127.0.0.1" },
        { name: "port", label: "端口", type: "number", value: 27017 },
        { name: "user", label: "用户名", value: "" },
        { name: "password", label: "密码", type: "password", value: "" },
        { name: "database", label: "数据库", value: "" },
        { name: "auth", label: "认证源", value: "admin" },
      ];
    case "redis":
      return [
        ...common,
        { name: "host", label: "主机", value: "127.0.0.1" },
        { name: "port", label: "端口", type: "number", value: 6379 },
        { name: "password", label: "密码", type: "password", value: "" },
        { name: "db", label: "数据库编号", type: "number", value: 0, hint: "Redis 默认有 16 个编号库(0–15)" },
        { name: "tls", label: "使用 TLS", type: "switch", value: false },
      ];
    default:
      return common;
  }
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
 * 13. 命令面板
 *
 * 命令和对象放在一起检索:对象树可能有几百个节点,让用户先展开三层再找
 * 一张表不现实,直接搜表名更快。
 * -------------------------------------------------------------------------- */
function buildCommands() {
  const commands = [
    {
      id: "cmd:new-connection",
      title: "新建连接",
      category: "命令",
      icon: "plus",
      action: () => {
        location.hash = "#/connect";
      },
    },
    {
      id: "cmd:open-query",
      title: "打开查询",
      subtitle: "在当前连接上新建查询标签",
      category: "命令",
      icon: "play",
      shortcut: "⌘↵",
      action: () => openQueryTab(),
    },
    {
      id: "cmd:refresh",
      title: "刷新对象树",
      category: "命令",
      icon: "refresh",
      action: () => renderWorkspace(),
    },
    {
      id: "cmd:commit",
      title: "提交事务",
      category: "命令",
      icon: "check",
      action: () => console.info("提交当前连接的事务"),
    },
    {
      id: "cmd:rollback",
      title: "回滚事务",
      category: "命令",
      icon: "refresh",
      action: () => console.info("回滚当前连接的事务"),
    },
    {
      id: "cmd:toggle-theme",
      title: "切换主题",
      subtitle: "跟随系统 / 浅色 / 深色",
      category: "命令",
      icon: "sun",
      action: () => {
        const order = ["system", "light", "dark"];
        applyTheme(order[(order.indexOf(state.theme) + 1) % order.length]);
        syncSettingsControls();
      },
    },
    {
      id: "cmd:toggle-density",
      title: "切换密度",
      subtitle: "舒适 / 紧凑",
      category: "命令",
      icon: "columns",
      action: () => {
        applyDensity(state.density === "compact" ? "comfortable" : "compact");
        syncSettingsControls();
      },
    },
    {
      id: "cmd:settings",
      title: "打开设置",
      category: "命令",
      icon: "settings",
      action: () => {
        location.hash = "#/settings";
      },
    },
    {
      id: "cmd:spec",
      title: "查看设计规范",
      category: "命令",
      icon: "info",
      action: () => {
        location.hash = "#/spec";
      },
    },
  ];

  // 对象:能打开数据视图的节点都能直接跳过去
  for (const connection of CONNECTIONS) {
    const engine = ENGINES[connection.engine];
    collectNodes(connection.tree, (node) => {
      if (!node.dataKey) return;
      commands.push({
        id: `obj:${node.dataKey}`,
        title: node.label,
        subtitle: `${engine.label} · ${nodePathLabel(node)}`,
        category: "对象",
        icon: iconForKind(node.kind),
        action: () => openObjectTab(node),
      });
    });
  }

  return commands;
}

/**
 * 跳到某个对象并开成 Tab。
 *
 * 从别的路由跳过来时,得等 hashchange 把工作台渲染出来才能挂 Tab,
 * 所以这里等一次 hashchange 再执行。
 */
function openObjectTab(node) {
  if (parseHash() === "design") {
    openTabForNode(node);
    return;
  }
  const onHashChange = () => {
    window.removeEventListener("hashchange", onHashChange);
    openTabForNode(node);
  };
  window.addEventListener("hashchange", onHashChange);
  location.hash = "#/design";
}

function collectNodes(node, visit) {
  visit(node);
  for (const child of node.children ?? []) collectNodes(child, visit);
}

/** 对象的层级路径,给命令面板当副标题。 */
function nodePathLabel(node) {
  const parts = String(node.id).split("/");
  return parts.slice(1, -1).join(" / ") || "根";
}

/* -----------------------------------------------------------------------------
 * 14. 路由
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
 * 15. 启动
 * -------------------------------------------------------------------------- */
function boot(root) {
  restorePreferences();
  buildNodeIndex();

  // 命令面板挂在 body 上,不随路由切换被清掉
  const palette = new CommandPalette({ commands: buildCommands() });
  palette.mount(document.body);
  state.palette = palette;

  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (palette.isOpen()) {
        palette.close();
      } else {
        palette.open();
      }
    }
  });

  const render = () => renderRoute(root);
  window.addEventListener("hashchange", render);

  if (!location.hash) {
    location.hash = "#/design";
  }
  render();
}
