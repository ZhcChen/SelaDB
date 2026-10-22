import { createIcon, iconForKind } from "./icons.js";

/**
 * 对象树。
 *
 * 树组件本身是通用的:只认「节点有 children 就是分支,没有就是叶子」,
 * 不关心 PostgreSQL 和 MySQL 的层级差异。各引擎的差异由 mock-data 里的
 * 树规格表达,不在这个组件里写引擎分支判断。
 *
 * 层级深度不固定 —— PostgreSQL 是连接 → database → schema → 表 三层,
 * Redis 是连接 → 编号库 → 类型分组 两层,SQLite 更浅。渲染是递归的。
 */
export class TreeView {
  constructor({ onSelect, onContextMenu } = {}) {
    this.onSelect = onSelect ?? (() => {});
    this.onContextMenu = onContextMenu ?? (() => {});

    this.container = null;
    this.roots = [];
    /** id → { branch, node, children, data } */
    this.branches = new Map();
    this.expanded = new Set();
    this.selectedId = null;
    this.filterText = "";
  }

  mount(container) {
    this.container = container;
    container.classList.add("tree__scroll");
    container.addEventListener("contextmenu", this.#onContextMenu);
    return this;
  }

  /**
   * 替换整棵树。
   *
   * @param {Array<object>} roots 根节点数组(通常每个连接一个)
   */
  setData(roots) {
    this.roots = roots ?? [];
    this.branches.clear();
    if (!this.container) return this;

    this.container.replaceChildren();
    const fragment = document.createDocumentFragment();
    for (const root of this.roots) {
      fragment.appendChild(this.#renderNode(root));
    }
    this.container.appendChild(fragment);
    this.#applyFilter(this.filterText);
    return this;
  }

  /**
   * 按文本过滤树。
   *
   * 命中的节点保留,它的所有祖先自动展开 —— 否则用户搜到东西却看不到在哪。
   */
  filter(text) {
    this.filterText = text ?? "";
    this.#applyFilter(this.filterText);
    return this;
  }

  getSelected() {
    const entry = this.branches.get(this.selectedId);
    return entry ? entry.data : null;
  }

  /** 展开某个 id 的分支(定位到某个对象时用)。 */
  expandTo(id) {
    // 逐级向上展开:id 形如 `pg-local/postgres/public/users`
    const parts = String(id).split("/");
    for (let i = 1; i < parts.length; i += 1) {
      const prefix = parts.slice(0, i).join("/");
      this.expanded.add(prefix);
    }
    this.#syncOpenState();
  }

  destroy() {
    if (this.container) {
      this.container.removeEventListener("contextmenu", this.#onContextMenu);
      this.container.replaceChildren();
    }
    this.branches.clear();
    this.container = null;
  }

  // ---- 内部实现 ----

  #renderNode(data) {
    const branch = document.createElement("div");
    branch.className = "tree__branch";

    const node = document.createElement("div");
    node.className = "tree__node";
    node.dataset.id = data.id;
    node.dataset.kind = data.kind ?? "";
    node.title = data.label;

    const hasChildren = Array.isArray(data.children) && data.children.length > 0;

    // 展开箭头:叶子节点保留占位,避免文字整体左移造成抖动
    const twisty = document.createElement("span");
    twisty.className = "tree__twisty";
    if (!hasChildren) twisty.classList.add("is-leaf");
    twisty.appendChild(createIcon("chevron", 12));
    node.appendChild(twisty);

    // 连接节点左侧的引擎色条,让多连接时一眼分辨。
    // 连接节点的 icon 就是引擎 id,所以 icon 缺失时退回 kind。
    const engineId = data.kind === "connection" ? data.engine ?? data.icon : null;
    if (engineId) {
      const dot = document.createElement("span");
      dot.className = `tree__engine-dot engine-${engineId}`;
      node.appendChild(dot);
    }

    const iconWrap = document.createElement("span");
    iconWrap.className = "tree__icon";
    if (data.kind === "connection") iconWrap.classList.add("tree__icon--connection");
    // 连接节点用统一的插头图标,引擎靠左侧色条区分;
    // mock 数据里的 icon 字段是引擎 id,不是图标名。
    const iconName = data.kind === "connection" ? "connection" : data.icon ?? iconForKind(data.kind);
    iconWrap.appendChild(createIcon(iconName, 15));
    node.appendChild(iconWrap);

    const label = document.createElement("span");
    label.className = "tree__label";
    label.textContent = data.label;
    node.appendChild(label);

    if (typeof data.count === "number") {
      const count = document.createElement("span");
      count.className = "tree__count";
      count.textContent = data.count.toLocaleString("en-US");
      node.appendChild(count);
    }

    branch.appendChild(node);

    const children = document.createElement("div");
    children.className = "tree__children";
    if (hasChildren) {
      for (const child of data.children) {
        children.appendChild(this.#renderNode(child));
      }
    }
    branch.appendChild(children);

    this.branches.set(data.id, { branch, node, children, data, hasChildren });

    node.addEventListener("click", (event) => {
      event.stopPropagation();
      this.#select(data.id);
      // 点箭头只展开/收起,点整行则同时选中并切换展开态
      if (!event.target.closest(".tree__twisty") && hasChildren) {
        this.#toggle(data.id);
      }
    });

    twisty.addEventListener("click", (event) => {
      event.stopPropagation();
      this.#toggle(data.id);
    });

    return branch;
  }

  #select(id) {
    this.selectedId = id;
    for (const [key, entry] of this.branches) {
      entry.node.classList.toggle("is-selected", key === id);
    }
    this.onSelect(this.getSelected());
  }

  #toggle(id) {
    if (this.expanded.has(id)) {
      this.expanded.delete(id);
    } else {
      this.expanded.add(id);
    }
    this.#syncOpenState();
  }

  #syncOpenState() {
    for (const [id, entry] of this.branches) {
      const open = this.expanded.has(id);
      entry.children.classList.toggle("is-open", open && entry.hasChildren);
      entry.node.querySelector(".tree__twisty")?.classList.toggle("is-open", open);
    }
  }

  #applyFilter(text) {
    const keyword = text.trim().toLowerCase();

    for (const [id, entry] of this.branches) {
      if (!keyword) {
        entry.branch.classList.remove("is-hidden");
        continue;
      }
      const hit = this.#matches(entry.data, keyword);
      entry.branch.classList.toggle("is-hidden", !hit);
    }

    if (!keyword) {
      this.#syncOpenState();
      return;
    }

    // 命中节点的祖先强制展开
    for (const [id, entry] of this.branches) {
      if (this.#matches(entry.data, keyword)) {
        for (const ancestor of this.#ancestorsOf(id)) {
          this.expanded.add(ancestor);
        }
      }
    }
    this.#syncOpenState();
  }

  /** 节点自身或任一后代命中即视为命中。 */
  #matches(data, keyword) {
    if (String(data.label).toLowerCase().includes(keyword)) return true;
    return (data.children ?? []).some((child) => this.#matches(child, keyword));
  }

  /** 由 id 路径反推祖先 id —— id 用 '/' 拼接层级路径。 */
  #ancestorsOf(id) {
    const parts = String(id).split("/");
    const ancestors = [];
    for (let i = 1; i < parts.length; i += 1) {
      ancestors.push(parts.slice(0, i).join("/"));
    }
    return ancestors;
  }

  #onContextMenu = (event) => {
    const nodeEl = event.target.closest(".tree__node");
    if (!nodeEl) return;
    event.preventDefault();
    const entry = this.branches.get(nodeEl.dataset.id);
    if (!entry) return;
    this.#select(entry.data.id);
    this.onContextMenu(entry.data, event);
  };
}
