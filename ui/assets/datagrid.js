/**
 * 数据网格。
 *
 * 纯原生实现,不依赖任何第三方表格库。理由是设计源要能被 Rust 实现复刻:
 * 引入第三方表格库,设计源就会长成那个库的样子,还原目标会从「复刻我们的
 * 设计」变成「复刻 AG Grid」。
 *
 * 虚拟滚动:只渲染视口内的行 + 上下各 10 行余量。滚动条高度按 total 算,
 * 所以 1,284 行的表滚动起来和 14 行一样流畅;未加载到 mock 数据的行
 * 渲染成空行 —— 这正是真实工具在翻页加载时的样子。
 */


const OVERSCAN = 10;
const MIN_COL_WIDTH = 60;

/**
 * 列没有显式给宽度时,按「列名 + 类型」估一个。
 *
 * 数据库的列名长短差很多,一律用固定宽度不是把长名截断就是把短列撑得
 * 太空。这里按字符宽度粗估,中文按两倍算。
 */
function autoColumnWidth(column) {
  const name = String(column.name ?? column.key ?? "");
  const type = String(column.type ?? "");
  // 56 是列头内边距与 PK 标记、排序箭头的预留,不够宽时类型名会被挤没
  const width = name.length * 8 + type.length * 6 + 80;
  return Math.max(96, Math.min(300, Math.round(width)));
}
/** 列类型 → 单元格样式修饰类。 */
const TYPE_CLASS = [
  [/integer|int2|int4|int8|bigint|smallint|tinyint|mediumint|serial/i, "int"],
  [/numeric|decimal|real|double|float|money/i, "float"],
  [/bool/i, "bool"],
  [/timestamp|datetime|date|time/i, "time"],
  [/bytea|blob|binary|varbinary/i, "binary"],
  [/json/i, "json"],
  [/uuid/i, "uuid"],
];

function typeClassOf(type) {
  const text = String(type ?? "");
  for (const [pattern, name] of TYPE_CLASS) {
    if (pattern.test(text)) return `grid__cell--${name}`;
  }
  return "grid__cell--string";
}

/**
 * 给单元格写文字。
 *
 * 文字要包一层 span:单元格是 `display: flex`,而 `text-overflow: ellipsis`
 * 只对「直接含文本的块级元素」生效 —— 放在 flex 容器上永远不触发,
 * 结果就是长文本被 `overflow: hidden` 硬切,连省略号都没有。
 * 省略号要画在 span 上,span 得能收缩(min-width: 0)。
 */
function setCellText(cell, text) {
  let span = cell.firstElementChild;
  if (!span || !span.classList.contains("grid__cell-text")) {
    cell.replaceChildren();
    span = document.createElement("span");
    span.className = "grid__cell-text";
    cell.appendChild(span);
  }
  span.textContent = text;
}

/* -----------------------------------------------------------------------------
 * 过滤表达式
 *
 * 支持 `列 op 值` 的简单条件,多个条件按 AND 组合:
 *   id > 100
 *   name = '伟'
 *   status = active
 *   email like '%example.com'
 *
 * op ∈ = != > >= < <= like
 *
 * 注意:不能先按空格切分再逐个匹配 —— `id > 100` 会被切成三段。
 * 这里直接用一条正则扫出完整条件,条件之间只允许空白或 AND。
 * -------------------------------------------------------------------------- */

const CONDITION_RE =
  /([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|<=|!=|=|>|<|like)\s*('[^']*'|"[^"]*"|[^\s]+)/gi;

function buildCondition(column, op, rawValue) {
  let value = rawValue.trim();
  let quoted = false;
  if (
    (value.startsWith("'") && value.endsWith("'") && value.length >= 2) ||
    (value.startsWith('"') && value.endsWith('"') && value.length >= 2)
  ) {
    value = value.slice(1, -1);
    quoted = true;
  }
  const isNull = !quoted && /^null$/i.test(value);
  const numeric = !quoted && !isNull && value !== "" && !Number.isNaN(Number(value));
  return {
    column,
    op: op.toLowerCase(),
    value: isNull ? null : numeric ? Number(value) : value,
    isNull,
  };
}

function parseFilter(text) {
  const source = (text ?? "").trim();
  if (!source) return { ok: true, conditions: [] };

  const conditions = [];
  let consumed = 0;
  let match;
  CONDITION_RE.lastIndex = 0;

  while ((match = CONDITION_RE.exec(source)) !== null) {
    // 两个条件之间只允许空白或 AND
    const gap = source.slice(consumed, match.index).trim();
    if (gap && !/^and$/i.test(gap)) {
      return { ok: false, message: `无法解析过滤条件:${gap}`, conditions: [] };
    }
    consumed = match.index + match[0].length;
    conditions.push(buildCondition(match[1], match[2], match[3]));
  }

  const rest = source.slice(consumed).trim();
  if (rest) {
    return { ok: false, message: `无法解析过滤条件:${rest}`, conditions: [] };
  }
  if (conditions.length === 0) {
    return { ok: false, message: "无法解析过滤条件", conditions: [] };
  }
  return { ok: true, conditions };
}

function matchCondition(row, condition) {
  const actual = row?.[condition.column];
  const isNullActual = actual === null || actual === undefined;

  if (condition.isNull) {
    if (condition.op === "=" || condition.op === "!=") {
      return condition.op === "=" ? isNullActual : !isNullActual;
    }
    return false;
  }

  if (isNullActual) {
    // NULL 与任何值比较都不成立
    return false;
  }

  const { op, value } = condition;

  if (op === "like") {
    const needle = String(value).replace(/^%/, "").replace(/%$/, "");
    return String(actual).toLowerCase().includes(needle.toLowerCase());
  }

  const left = typeof value === "number" ? Number(actual) : String(actual);
  const right = value;

  switch (op) {
    case "=":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    default:
      return false;
  }
}

/* -----------------------------------------------------------------------------
 * 剪贴板
 * -------------------------------------------------------------------------- */


/* -----------------------------------------------------------------------------
 * DataGrid
 * -------------------------------------------------------------------------- */
class DataGrid {
  constructor(config = {}) {
    this.config = config;
    this.columns = (config.columns ?? []).map((column) => ({
      ...column,
      width: column.width ?? autoColumnWidth(column),
    }));
    this.rows = config.rows ?? [];
    this.total = config.total ?? this.rows.length;

    this.sort = null; // { key, dir: 'asc' | 'desc' }
    this.filterText = "";
    this.filterConditions = [];
    this.filterError = null;

    /** 视图行 → 源行下标 */
    this.view = [];
    this.selected = new Set();
    this.focusIndex = 0;
    this.editing = null;

    this.rowPool = [];
    this.mounted = false;
    this.frame = null;

    this.onSortChange = config.onSortChange ?? (() => {});
    /** 行点击回调,参数是源行下标(过滤排序之后的下标没意义) */
    this.onRowClick = config.onRowClick ?? (() => {});
    this.onFilterChange = config.onFilterChange ?? (() => {});
    this.onCellChange = config.onCellChange ?? (() => {});
    this.onSelectionChange = config.onSelectionChange ?? (() => {});
    this.onContextMenu = config.onContextMenu ?? null;
    this.onExport = config.onExport ?? null;
  }

  /* ---- 生命周期 ---- */

  mount(container) {
    this.container = container;

    const root = document.createElement("div");
    root.className = "grid";
    this.root = root;

    // 过滤条。默认独占一行;传了 filterMount 就挂到那儿去(面板头),
    // 网格上方能省下一整行的纵向空间。
    const filterbar = document.createElement("div");
    const filterMount = this.config.filterMount;
    filterbar.className = filterMount ? "grid__filter grid__filter--inline" : "grid__filterbar";
    const input = document.createElement("input");
    input.className = "grid__filter-input";
    input.type = "text";
    input.placeholder = this.config.filterPlaceholder ?? "过滤条件,例如 id > 100";
    input.setAttribute("aria-label", "过滤条件");
    const clear = document.createElement("button");
    clear.className = "grid__filter-clear";
    clear.type = "button";
    clear.textContent = "清除";
    const msg = document.createElement("span");
    msg.className = "grid__filter-msg";
    filterbar.append(input, clear, msg);
    (filterMount ?? root).appendChild(filterbar);
    this.filterInput = input;
    this.filterMsg = msg;

    // 视口
    const viewport = document.createElement("div");
    viewport.className = "grid__viewport";
    const sizer = document.createElement("div");
    sizer.className = "grid__sizer";
    const header = document.createElement("div");
    header.className = "grid__header";
    const headerRow = document.createElement("div");
    headerRow.className = "grid__row grid__row--header";
    header.appendChild(headerRow);
    const body = document.createElement("div");
    body.className = "grid__body";
    sizer.append(header, body);
    viewport.appendChild(sizer);
    root.appendChild(viewport);
    this.viewport = viewport;
    this.sizer = sizer;
    this.headerRow = headerRow;
    this.bodyEl = body;

    // 底栏
    const foot = document.createElement("div");
    foot.className = "grid__foot";
    this.footCount = document.createElement("span");
    this.footSelection = document.createElement("span");
    const footSpacer = document.createElement("div");
    footSpacer.className = "grid__foot-spacer";
    foot.append(this.footCount, this.footSelection, footSpacer);
    if (this.onExport) {
      const exportBtn = document.createElement("button");
      exportBtn.type = "button";
      exportBtn.className = "btn btn--sm";
      exportBtn.textContent = "导出";
      exportBtn.addEventListener("click", () => this.onExport(this.getSelected()));
      foot.appendChild(exportBtn);
    }
    root.appendChild(foot);

    container.appendChild(root);
    this.mounted = true;

    // 事件
    input.addEventListener("input", () => this.setFilter(input.value));
    clear.addEventListener("click", () => {
      input.value = "";
      this.setFilter("");
    });
    viewport.addEventListener("scroll", () => this.#scheduleRender(), { passive: true });
    viewport.addEventListener("contextmenu", (event) => this.#onContextMenu(event));
    viewport.addEventListener("mousedown", (event) => this.#onMouseDown(event));
    viewport.addEventListener("dblclick", (event) => this.#onDoubleClick(event));
    viewport.addEventListener("keydown", (event) => this.#onKeyDown(event));
    viewport.tabIndex = 0;

    // 密度变了行高会变,虚拟滚动的换算要跟着重算
    this.onDensityChange = () => this.render();
    document.body.addEventListener("seladb:densitychange", this.onDensityChange);

    // 首次渲染时视口可能还没完成布局(高度为 0),行池会按 0 高度算小,
    // 之后要等别的事件触发才补齐。ResizeObserver 让行池始终贴合实际视口。
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(viewport);

    this.#buildHeader();
    this.#recomputeView();
    this.render();
    return this;
  }

  destroy() {
    this.mounted = false;
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.resizeObserver?.disconnect();
    document.body.removeEventListener("seladb:densitychange", this.onDensityChange);
    this.root?.remove();
    this.rowPool = [];
  }

  /* ---- 数据 ---- */

  setData({ columns, rows, total } = {}) {
    if (columns) {
      // 保留用户拖过的列宽
      const previous = new Map(this.columns.map((c) => [c.key, c.width]));
      this.columns = columns.map((column) => ({
        ...column,
        width: previous.get(column.key) ?? column.width ?? autoColumnWidth(column),
      }));
    }
    if (rows) this.rows = rows;
    if (total !== undefined) this.total = total;
    this.selected.clear();
    this.focusIndex = 0;
    this.#buildHeader();
    this.#recomputeView();
    this.render();
  }

  setFilter(text) {
    this.filterText = text ?? "";
    const parsed = parseFilter(this.filterText);
    this.filterError = parsed.ok ? null : parsed.message;
    this.filterConditions = parsed.conditions;
    this.filterInput?.classList.toggle("is-invalid", !parsed.ok);
    if (this.filterMsg) this.filterMsg.textContent = parsed.ok ? "" : parsed.message;
    this.#recomputeView();
    this.render();
    this.onFilterChange(this.filterText);
  }

  getSelected() {
    return [...this.selected].sort((a, b) => a - b).map((i) => this.rows[i]).filter(Boolean);
  }

  clearSelection() {
    this.selected.clear();
    this.#syncSelectionClasses();
    this.onSelectionChange([]);
  }

  /* ---- 视图计算 ---- */

  #recomputeView() {
    let indices = this.rows.map((_, index) => index);

    if (this.filterConditions.length > 0) {
      indices = indices.filter((index) =>
        this.filterConditions.every((condition) => matchCondition(this.rows[index], condition)),
      );
    }

    if (this.sort) {
      const { key, dir } = this.sort;
      const factor = dir === "asc" ? 1 : -1;
      indices = [...indices].sort((a, b) => {
        const left = this.rows[a][key];
        const right = this.rows[b][key];
        // NULL 恒排最后,升序降序都一样
        const leftNull = left === null || left === undefined;
        const rightNull = right === null || right === undefined;
        if (leftNull && rightNull) return 0;
        if (leftNull) return 1;
        if (rightNull) return -1;
        if (typeof left === "number" && typeof right === "number") {
          return (left - right) * factor;
        }
        return String(left).localeCompare(String(right), "zh-Hans-CN") * factor;
      });
    }

    this.view = indices;
  }

  #rowHeight() {
    const value = getComputedStyle(this.root).getPropertyValue("--row-h");
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }

  #headerHeight() {
    const value = getComputedStyle(this.root).getPropertyValue("--header-h");
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 32;
  }

  /* ---- 表头 ---- */

  #buildHeader() {
    this.headerRow.replaceChildren();

    const rowno = document.createElement("div");
    rowno.className = "grid__cell grid__cell--rowno";
    rowno.textContent = "#";
    this.headerRow.appendChild(rowno);

    for (const column of this.columns) {
      const cell = document.createElement("div");
      cell.className = "grid__cell grid__cell--head";
      cell.dataset.col = column.key;
      // 数值列表头跟着数值右对齐,否则表头和值不在同一条基准线上
      if (column.type && /int|numeric|decimal|real|double|float|money/i.test(column.type)) {
        cell.classList.add("grid__cell--head--num");
      }
      cell.title = `${column.name} · ${column.type ?? ""}`;

      // 表头分两行:列名在上、类型在下。挤在一行时,列名会被类型文字吃掉
      // 一半,横向扫表根本扫不出字段名。
      const title = document.createElement("span");
      title.className = "grid__col-title";

      const name = document.createElement("span");
      name.className = "grid__col-name";
      name.textContent = column.name ?? column.key;
      title.appendChild(name);

      if (column.pk) {
        const pk = document.createElement("span");
        pk.className = "grid__col-pk";
        pk.textContent = "PK";
        pk.title = "主键";
        title.appendChild(pk);
      }

      const sort = document.createElement("span");
      sort.className = "grid__sort";
      title.appendChild(sort);
      cell.appendChild(title);

      // showType 为 false 时只保留类型带来的着色,不显示类型文字
      if (column.type && column.showType !== false) {
        const type = document.createElement("span");
        type.className = "grid__col-type";
        type.textContent = column.type;
        cell.appendChild(type);
      }

      const resize = document.createElement("span");
      resize.className = "grid__col-resize";
      resize.dataset.col = column.key;
      cell.appendChild(resize);

      cell.addEventListener("click", (event) => {
        if (event.target.closest(".grid__col-resize")) return;
        this.#cycleSort(column.key);
      });
      resize.addEventListener("pointerdown", (event) => this.#startResize(event, column.key));

      this.headerRow.appendChild(cell);
    }

    this.#applyColumnWidths();
    this.#syncSortIndicators();
  }

  #applyColumnWidths() {
    if (!this.headerRow) return;
    const headerCells = this.headerRow.querySelectorAll(".grid__cell--head");
    this.columns.forEach((column, index) => {
      const width = `${column.width}px`;
      headerCells[index]?.style.setProperty("width", width);
    });
    // 表体行是复用的,列宽变化时要一起刷新
    for (const row of this.rowPool) {
      row.cells.forEach((cell, index) => {
        if (this.columns[index]) cell.style.setProperty("width", `${this.columns[index].width}px`);
      });
    }
  }

  #cycleSort(key) {
    if (!this.sort || this.sort.key !== key) {
      this.sort = { key, dir: "asc" };
    } else if (this.sort.dir === "asc") {
      this.sort = { key, dir: "desc" };
    } else {
      this.sort = null;
    }
    this.#recomputeView();
    this.#syncSortIndicators();
    this.render();
    this.onSortChange(this.sort);
  }

  #syncSortIndicators() {
    const cells = this.headerRow?.querySelectorAll(".grid__cell--head") ?? [];
    this.columns.forEach((column, index) => {
      const indicator = cells[index]?.querySelector(".grid__sort");
      if (!indicator) return;
      if (this.sort?.key === column.key) {
        indicator.textContent = this.sort.dir === "asc" ? "▲" : "▼";
      } else {
        indicator.textContent = "";
      }
    });
  }

  /* ---- 渲染 ---- */

  render() {
    if (!this.mounted) return;

    const rowHeight = this.#rowHeight();
    const headerHeight = this.#headerHeight();
    // 虚拟行数:过滤时收窄到命中条数,不然过滤完下面全是空行;
    // 未过滤时按 total 算,这样 1,284 行的表和 14 行一样流畅。
    const filtered = this.filterConditions.length > 0;
    const virtualCount = filtered
      ? this.view.length
      : Math.max(this.total, this.rows.length);

    this.sizer.style.height = `${headerHeight + virtualCount * rowHeight}px`;

    const scrollTop = this.viewport.scrollTop;
    const viewportHeight = this.viewport.clientHeight;
    const first = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const visible = Math.ceil(viewportHeight / rowHeight) + 1;
    const last = Math.min(virtualCount - 1, first + visible + OVERSCAN * 2);

    const needed = Math.max(0, last - first + 1);
    while (this.rowPool.length < needed) {
      this.rowPool.push(this.#createRow());
    }
    for (let i = needed; i < this.rowPool.length; i += 1) {
      this.rowPool[i].el.style.display = "none";
    }

    for (let i = 0; i < needed; i += 1) {
      const virtualIndex = first + i;
      const row = this.rowPool[i];
      row.el.style.display = "";
      row.el.style.transform = `translateY(${virtualIndex * rowHeight}px)`;
      row.el.dataset.index = String(virtualIndex);
      // 斑马纹按数据序号算,不能用 nth-child —— 虚拟滚动时 DOM 里的行会换位,
      // 用 nth-child 条纹会跟着滚动闪。
      row.el.dataset.parity = virtualIndex % 2 === 0 ? "even" : "odd";
      this.#fillRow(row, virtualIndex);
    }

    this.#syncSelectionClasses();
    this.#updateFoot();
  }

  #scheduleRender() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  #createRow() {
    const el = document.createElement("div");
    el.className = "grid__row grid__row--body";

    const rowno = document.createElement("div");
    rowno.className = "grid__cell grid__cell--rowno";
    el.appendChild(rowno);

    const cells = [];
    for (const column of this.columns) {
      const cell = document.createElement("div");
      cell.className = `grid__cell ${typeClassOf(column.type)}`;
      if (column.pk) cell.classList.add("grid__cell--pk");
      cell.style.setProperty("width", `${column.width}px`);
      el.appendChild(cell);
      cells.push(cell);
    }

    const row = { el, rowno, cells };
    // 行池里的行一开始就挂进表体,渲染时只改内容与位置
    this.bodyEl.appendChild(el);
    el.addEventListener("click", (event) => {
      const index = Number(el.dataset.index);
      if (Number.isNaN(index)) return;
      if (event.target.closest(".grid__cell--editing")) return;
      this.focusIndex = index;
      if (event.metaKey || event.ctrlKey) {
        this.#toggleSelection(index);
      } else {
        this.selected.clear();
        this.selected.add(index);
        this.onSelectionChange(this.getSelected());
      }
      this.#syncSelectionClasses();
      const sourceIndex = this.view[index];
      if (sourceIndex !== undefined) this.onRowClick(sourceIndex, event);
    });

    return row;
  }

  #fillRow(row, virtualIndex) {
    row.rowno.textContent = String(virtualIndex + 1);

    const sourceIndex = this.view[virtualIndex];
    const source = sourceIndex === undefined ? null : this.rows[sourceIndex];

    for (let i = 0; i < this.columns.length; i += 1) {
      const cell = row.cells[i];
      const column = this.columns[i];
      const value = source ? source[column.key] : undefined;

      cell.className = `grid__cell ${typeClassOf(column.type)}`;
      if (column.pk) cell.classList.add("grid__cell--pk");

      if (!source) {
        setCellText(cell, "");
        continue;
      }
      // 列可以自带 format,用来做「语义化」的显示:Redis 的类型徽章、
      // TTL 的 ∞、枚举的中文名这类 —— 颜色与文案都是数据的一部分。
      if (typeof column.format === "function") {
        const formatted = column.format(value);
        if (formatted && typeof formatted === "object") {
          if (formatted.badgeClass) {
            // 徽章是单元格里的一个子元素 —— 胶囊要有自己的高度与内边距,
            // 直接修饰单元格会把整行高度都改掉
            cell.replaceChildren();
            const badge = document.createElement("span");
            badge.className = formatted.badgeClass;
            badge.textContent = formatted.text ?? "";
            cell.appendChild(badge);
          } else {
            setCellText(cell, formatted.text ?? "");
            if (formatted.className) {
              for (const token of formatted.className.split(/\s+/).filter(Boolean)) {
                cell.classList.add(token);
              }
            }
          }
        } else {
          setCellText(cell, formatted ?? "");
        }
        continue;
      }

      if (value === null || value === undefined) {
        setCellText(cell, "NULL");
        cell.classList.add("grid__cell--null");
      } else {
        setCellText(cell, String(value));
        // true 与 false 语义相反,不能是同一个绿
        if (typeof value === "boolean" && value === false) {
          cell.classList.add("grid__cell--bool-false");
        }
      }
    }
  }

  #syncSelectionClasses() {
    for (const row of this.rowPool) {
      const index = Number(row.el.dataset.index);
      row.el.classList.toggle("is-selected", this.selected.has(index));
      row.el.classList.toggle("is-focused", index === this.focusIndex);
    }
  }

  #updateFoot() {
    if (!this.footCount) return;
    const filtered = this.filterConditions.length > 0;
    const shown = filtered ? this.view.length : this.total;
    this.footCount.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = shown.toLocaleString("en-US");
    this.footCount.appendChild(strong);
    this.footCount.appendChild(
      document.createTextNode(filtered ? ` 行(已过滤,共 ${this.total.toLocaleString("en-US")} 行)` : " 行"),
    );
    // 真实行数大于已加载行数时,说明还有没拉取的分页
    if (!filtered && this.rows.length < this.total) {
      this.footCount.appendChild(
        document.createTextNode(` · 已加载 ${this.rows.length.toLocaleString("en-US")}`),
      );
    }

    this.footSelection.textContent = this.selected.size > 0 ? `已选 ${this.selected.size} 行` : "";
  }

  /* ---- 交互:选择 ---- */

  #toggleSelection(index) {
    if (this.selected.has(index)) {
      this.selected.delete(index);
    } else {
      this.selected.add(index);
    }
    this.onSelectionChange(this.getSelected());
  }

  #selectRange(from, to) {
    this.selected.clear();
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    for (let i = start; i <= end; i += 1) this.selected.add(i);
    this.onSelectionChange(this.getSelected());
  }

  #moveFocus(index) {
    const max = Math.max(0, this.view.length - 1);
    this.focusIndex = Math.min(max, Math.max(0, index));
    this.#scrollFocusIntoView();
    this.#syncSelectionClasses();
  }

  #scrollFocusIntoView() {
    const rowHeight = this.#rowHeight();
    const top = this.focusIndex * rowHeight;
    const viewportHeight = this.viewport.clientHeight;
    if (top < this.viewport.scrollTop) {
      this.viewport.scrollTop = top;
    } else if (top + rowHeight > this.viewport.scrollTop + viewportHeight) {
      this.viewport.scrollTop = top + rowHeight - viewportHeight;
    }
  }

  /* ---- 交互:编辑 ---- */

  #onDoubleClick(event) {
    const cellEl = event.target.closest(".grid__cell");
    if (!cellEl || cellEl.classList.contains("grid__cell--rowno")) return;
    const rowEl = cellEl.closest(".grid__row--body");
    if (!rowEl) return;
    const index = Number(rowEl.dataset.index);
    const columnIndex = Array.prototype.indexOf.call(rowEl.children, cellEl) - 1;
    if (columnIndex < 0) return;
    this.focusIndex = index;
    this.#beginEdit(index, columnIndex, cellEl);
  }

  #beginEdit(rowIndex, columnIndex, cellEl) {
    const sourceIndex = this.view[rowIndex];
    if (sourceIndex === undefined) return;
    const column = this.columns[columnIndex];
    if (!column) return;

    const row = this.rows[sourceIndex];
    const original = row[column.key];
    // 数据库里空串与 NULL 不同,这里约定编辑框清空即写 NULL
    const current = original === null || original === undefined ? "" : String(original);

    cellEl.classList.add("grid__cell--editing");
    const editor = document.createElement("input");
    editor.className = "grid__cell-editor";
    editor.type = "text";
    editor.value = current;
    cellEl.replaceChildren(editor);
    editor.focus();
    editor.select();

    this.editing = { rowIndex, columnIndex, cellEl, editor, sourceIndex, column, original };

    editor.addEventListener("keydown", (keyEvent) => {
      keyEvent.stopPropagation();
      if (keyEvent.key === "Enter") {
        this.#commitEdit();
        if (!keyEvent.shiftKey) this.#moveFocus(this.editing?.rowIndex ?? rowIndex);
      } else if (keyEvent.key === "Escape") {
        this.#cancelEdit();
      } else if (keyEvent.key === "Tab") {
        this.#commitEdit();
        const next = rowIndex + (keyEvent.shiftKey ? -1 : 1);
        this.#moveFocus(next);
        this.#beginEditAt(next, columnIndex);
      }
    });
    editor.addEventListener("blur", () => {
      // 失焦也提交,避免用户点了别处改动丢失
      if (this.editing) this.#commitEdit();
    });
  }

  #beginEditAt(rowIndex, columnIndex) {
    if (rowIndex < 0 || rowIndex >= this.view.length) return;
    this.render();
    const rowEl = this.bodyEl.querySelector(`.grid__row--body[data-index="${rowIndex}"]`);
    const cellEl = rowEl?.children[columnIndex + 1];
    if (cellEl) this.#beginEdit(rowIndex, columnIndex, cellEl);
  }

  #commitEdit() {
    if (!this.editing) return;
    const { editor, sourceIndex, column, original, cellEl } = this.editing;
    const text = editor.value;
    const next = text === "" ? null : text;
    const previous = original === undefined ? null : original;

    cellEl.classList.remove("grid__cell--editing");
    this.editing = null;

    if (next !== previous) {
      this.rows[sourceIndex][column.key] = next;
      this.#recomputeView();
      this.onCellChange(sourceIndex, column.key, previous, next);
    }
    this.render();
  }

  #cancelEdit() {
    if (!this.editing) return;
    const { cellEl } = this.editing;
    cellEl.classList.remove("grid__cell--editing");
    this.editing = null;
    this.render();
  }

  /* ---- 交互:键盘 ---- */

  #onKeyDown(event) {
    if (this.editing) return;
    const key = event.key;

    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      const delta = key === "ArrowDown" ? 1 : -1;
      if (event.shiftKey) {
        this.#selectRange(this.focusIndex, this.focusIndex + delta);
        this.#moveFocus(this.focusIndex + delta);
      } else {
        this.selected.clear();
        this.selected.add(this.focusIndex + delta);
        this.onSelectionChange(this.getSelected());
        this.#moveFocus(this.focusIndex + delta);
      }
      return;
    }

    if (key === "Enter") {
      event.preventDefault();
      const cellEl = this.#cellAt(this.focusIndex, 0);
      if (cellEl) this.#beginEdit(this.focusIndex, 0, cellEl);
      return;
    }

    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "a") {
      event.preventDefault();
      this.selected.clear();
      for (let i = 0; i < this.view.length; i += 1) this.selected.add(i);
      this.onSelectionChange(this.getSelected());
      this.#syncSelectionClasses();
      this.#updateFoot();
    }
  }

  #cellAt(rowIndex, columnIndex) {
    const rowEl = this.bodyEl.querySelector(`.grid__row--body[data-index="${rowIndex}"]`);
    return rowEl?.children[columnIndex + 1] ?? null;
  }

  /* ---- 交互:列宽 ---- */

  #startResize(event, key) {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.classList.add("is-active");
    handle.setPointerCapture(event.pointerId);

    const column = this.columns.find((c) => c.key === key);
    if (!column) return;
    const startX = event.clientX;
    const startWidth = column.width;

    const onMove = (moveEvent) => {
      const next = Math.max(MIN_COL_WIDTH, startWidth + (moveEvent.clientX - startX));
      column.width = next;
      this.#applyColumnWidths();
    };
    const onUp = () => {
      handle.classList.remove("is-active");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  /* ---- 交互:右键菜单 ---- */

  #onContextMenu(event) {
    event.preventDefault();
    const rowEl = event.target.closest(".grid__row--body");
    const cellEl = event.target.closest(".grid__cell");
    const index = rowEl ? Number(rowEl.dataset.index) : this.focusIndex;
    const columnIndex = rowEl && cellEl
      ? Array.prototype.indexOf.call(rowEl.children, cellEl) - 1
      : 0;

    if (this.onContextMenu) {
      this.onContextMenu(index, event, columnIndex);
      return;
    }

    const sourceIndex = this.view[index];
    const source = sourceIndex === undefined ? null : this.rows[sourceIndex];
    const column = this.columns[columnIndex];
    const value = source && column ? source[column.key] : null;

    openMenu(
      [
        {
          label: "编辑单元格",
          disabled: !source,
          action: () => {
            const cellEl = this.#cellAt(index, columnIndex);
            if (cellEl) this.#beginEdit(index, columnIndex, cellEl);
          },
        },
        {
          label: "复制单元格值",
          disabled: value === null,
          action: () => copyText(String(value ?? "")),
        },
        {
          label: "复制整行",
          disabled: !source,
          action: () => {
            const text = this.columns
              .map((c) => `${c.name}\t${source[c.key] === null || source[c.key] === undefined ? "NULL" : source[c.key]}`)
              .join("\n");
            copyText(text);
          },
        },
        { type: "separator" },
        {
          label: "设为 NULL",
          disabled: !source || value === null,
          danger: true,
          action: () => {
            this.rows[sourceIndex][column.key] = null;
            this.#recomputeView();
            this.onCellChange(sourceIndex, column.key, value, null);
            this.render();
          },
        },
      ],
      { x: event.clientX, y: event.clientY },
    );
  }

  #onMouseDown(event) {
    // 点到非网格区域时收起焦点态
    if (!event.target.closest(".grid__row--body")) {
      this.viewport.focus();
    }
  }
}
