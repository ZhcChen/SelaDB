/**
 * MongoDB 文档树。
 *
 * MongoDB 的文档不是表格 —— 字段可以嵌套对象、可以成数组,平铺成一行
 * JSON 字符串会丢掉层级,用户在几十个字段里根本找不到要看的那一项。
 * 这里把 BSON 文档渲染成可折叠的树:分支节点收起时只留一句摘要
 * ({ 3 个字段 } / [ 2 项 ]),展开才铺开子节点。
 *
 * 两个刻意的取舍:
 * - 展开/收起只切 CSS class,不重建 DOM。文档可能很大,重建会让滚动位置
 *   和焦点全丢,交互上像卡了一下;class 切换也正好对应后续 Rust 实现里
 *   「改一个状态位,重绘一次」的做法。
 * - 值的文本一律走 textContent,不拼 innerHTML。文档内容是外部数据,
 *   拼字符串等于把它当 HTML 解析。
 *
 * 组件不关心数据从哪来(Rust 侧 service 层负责),只认「BSON 文档数组」
 * 这一种输入。
 */


/**
 * 默认展开深度(0 = 文档的直接子字段)。
 *
 * 顶层展开、第二层起收起:既能看到文档有哪些字段,又能一眼看出层级,
 * 不用一进来就是一片全展开的长列表。
 */
const DEFAULT_OPEN_DEPTH = 1;

/**
 * 展开/收起的可视状态只靠 class 表达:
 * - `.doc-node__children.is-open` —— 子节点可见
 * - `.doc-node__toggle.is-open` —— 箭头旋转(旋转由 CSS 负责)
 */
const OPEN_CLASS = "is-open";

class DocumentTree {
  /**
   * @param {Array<object>} documents BSON 文档数组
   */
  constructor(documents) {
    this.documents = Array.isArray(documents) ? documents : [];
    /** 挂载容器与渲染出来的列表根 */
    this.container = null;
    this.list = null;
    /** `.doc-node` 根元素 → 分支节点状态 */
    this.branches = new Map();
    /** 每个文档的分支列表(头部「展开全部/收起全部」按文档作用域) */
    this.docBranches = [];
    /** 每个文档头部操作按钮的引用 */
    this.docActions = [];
  }

  /**
   * 渲染到容器。
   *
   * 允许反复调用:先清掉上一次的 DOM 与监听,避免两棵树叠在一起。
   */
  mount(container) {
    this.destroy();
    this.container = container;

    const list = el("div", "doc-list");
    for (const [index, doc] of this.documents.entries()) {
      list.appendChild(this.#renderDocument(doc, index));
    }
    container.appendChild(list);

    this.list = list;
    // 事件全部委托到列表根:一棵树只有两个监听,destroy 时解绑一处即可
    list.addEventListener("click", this.#onClick);
    list.addEventListener("keydown", this.#onKeyDown);
    return this;
  }

  /** 卸载组件并解绑全部事件监听。 */
  destroy() {
    if (this.list) {
      this.list.removeEventListener("click", this.#onClick);
      this.list.removeEventListener("keydown", this.#onKeyDown);
      this.list.remove();
    }
    this.list = null;
    this.container = null;
    this.branches.clear();
    this.docBranches = [];
    this.docActions = [];
  }

  /** 展开全部文档的所有分支。 */
  expandAll() {
    for (const entry of this.branches.values()) {
      this.#applyExpanded(entry, true);
    }
    this.#syncAllDocActions();
    return this;
  }

  /** 收起全部文档的所有分支。 */
  collapseAll() {
    for (const entry of this.branches.values()) {
      this.#applyExpanded(entry, false);
    }
    this.#syncAllDocActions();
    return this;
  }

  // ---- 渲染 ----

  #renderDocument(doc, docIndex) {
    this.docBranches[docIndex] = [];

    const card = el("div", "doc");

    const head = el("div", "doc__head");
    const id = el("span", "doc__id");
    id.textContent = String(doc?._id ?? "");
    head.appendChild(id);

    // 头部右侧改成紧凑的图标按钮组 —— 文字按钮在文档卡片上太抢眼
    const actions = el("div", "doc__actions");
    const copyButton = el("button", "doc__action");
    copyButton.type = "button";
    copyButton.dataset.action = "copy";
    copyButton.dataset.docIndex = String(docIndex);
    copyButton.title = "复制 JSON";
    copyButton.appendChild(createIcon("copy", 13));
    actions.appendChild(copyButton);

    const toggleAllButton = el("button", "doc__action");
    toggleAllButton.type = "button";
    toggleAllButton.dataset.action = "toggle-all";
    toggleAllButton.dataset.docIndex = String(docIndex);
    toggleAllButton.title = this.#toggleAllLabel(docIndex);
    const toggleIcon = createIcon("chevron", 13);
    toggleIcon.classList.add("doc__action-chevron");
    if (this.#isDocExpanded(docIndex)) toggleIcon.classList.add("is-open");
    toggleAllButton.appendChild(toggleIcon);
    actions.appendChild(toggleAllButton);

    head.appendChild(actions);
    card.appendChild(head);

    const body = el("div", "doc-tree__body");
    for (const [key, value] of Object.entries(doc ?? {})) {
      // _id 已经在头部展示,树里再出现一次是重复
      if (key === "_id") continue;
      // 缺失字段没有值可显示,整行不渲染
      if (value === undefined) continue;
      body.appendChild(this.#renderNode(key, value, 0, docIndex));
    }
    card.appendChild(body);

    this.docActions[docIndex] = { copy: copyButton, toggleAll: toggleAllButton };
    return card;
  }

  /**
   * 渲染一个字段节点。
   *
   * @param {string} key 字段名(数组元素是下标)
   * @param {*} value 字段值
   * @param {number} depth 层级,顶层字段为 0
   * @param {number} docIndex 所属文档下标
   */
  #renderNode(key, value, depth, docIndex) {
    const node = el("div", "doc-node");
    const kind = classify(value);
    const children = kind === "scalar" ? [] : childEntries(value, kind === "array");
    const hasChildren = children.length > 0;

    // 箭头始终渲染,叶子节点用 is-leaf 隐藏 —— 少一个元素,字段名就会
    // 比同级分支节点左移一格,整列对不齐。
    const toggle = el("span", "doc-node__toggle");
    if (hasChildren) {
      toggle.setAttribute("role", "button");
      toggle.setAttribute("tabindex", "0");
      toggle.setAttribute("aria-expanded", "false");
    } else {
      toggle.classList.add("is-leaf");
    }
    toggle.appendChild(createIcon("chevron", 12));
    node.appendChild(toggle);

    const keyEl = el("div", "doc-node__key");
    keyEl.textContent = key;
    node.appendChild(keyEl);

    const valueEl = el("div", "doc-node__value");
    let summary = "";
    if (kind === "scalar") {
      const { text, type } = describeScalar(value);
      valueEl.classList.add(`doc__value--${type}`);
      valueEl.textContent = text;
    } else {
      valueEl.classList.add(kind === "array" ? "doc__value--array" : "doc__value--object");
      summary = kind === "array" ? `[ ${children.length} 项 ]` : `{ ${children.length} 个字段 }`;
      valueEl.textContent = summary;
    }
    node.appendChild(valueEl);

    let container = null;
    if (hasChildren) {
      container = el("div", "doc-node__children");
      for (const [childKey, childValue] of children) {
        container.appendChild(this.#renderNode(childKey, childValue, depth + 1, docIndex));
      }
      node.appendChild(container);
    }

    if (hasChildren) {
      const entry = {
        node,
        toggle,
        value: valueEl,
        children: container,
        summary,
        isArray: kind === "array",
        expanded: false,
        docIndex,
      };
      this.branches.set(node, entry);
      this.docBranches[docIndex].push(entry);
      this.#applyExpanded(entry, depth < DEFAULT_OPEN_DEPTH);
    }

    return node;
  }

  // ---- 展开/收起 ----

  /**
   * 把分支节点切到指定状态。
   *
   * 只改 class 和摘要文本,不动 DOM 结构。
   */
  #applyExpanded(entry, expanded) {
    entry.expanded = expanded;
    entry.children.classList.toggle(OPEN_CLASS, expanded);
    entry.toggle.classList.toggle(OPEN_CLASS, expanded);
    entry.toggle.setAttribute("aria-expanded", expanded ? "true" : "false");

    // 数组摘要始终保留:收起时它是唯一的线索,展开时它告诉用户「这是个数组」
    // 而不是一组普通字段;对象展开后子节点已经说明一切,摘要让位。
    if (!entry.isArray) {
      entry.value.textContent = expanded ? "" : entry.summary;
    }
  }

  /** 切换单个分支,并同步所属文档的头部按钮文案。 */
  #toggleEntry(entry) {
    this.#applyExpanded(entry, !entry.expanded);
    this.#syncDocAction(entry.docIndex);
  }

  /** 某个文档是否处于「全展开」状态。 */
  #isDocExpanded(docIndex) {
    const branches = this.docBranches[docIndex] ?? [];
    if (branches.length === 0) return false;
    return branches.every((entry) => entry.expanded);
  }

  /** 展开/收起某个文档的全部分支。 */
  #setDocExpanded(docIndex, expanded) {
    for (const entry of this.docBranches[docIndex] ?? []) {
      this.#applyExpanded(entry, expanded);
    }
    this.#syncDocAction(docIndex);
  }

  // ---- 头部操作 ----

  /** 「展开全部 / 收起全部」的文案跟着当前状态走。 */
  #toggleAllLabel(docIndex) {
    return this.#isDocExpanded(docIndex) ? "收起全部" : "展开全部";
  }

  #syncDocAction(docIndex) {
    const button = this.docActions[docIndex]?.toggleAll;
    if (!button) return;
    button.title = this.#toggleAllLabel(docIndex);
    button.querySelector(".doc__action-chevron")?.classList.toggle("is-open", this.#isDocExpanded(docIndex));
  }

  #syncAllDocActions() {
    for (let index = 0; index < this.docActions.length; index += 1) {
      this.#syncDocAction(index);
    }
  }

  #handleAction(action) {
    const kind = action.dataset.action;
    const docIndex = Number(action.dataset.docIndex ?? "0");

    if (kind === "copy") {
      void copyJson(this.documents[docIndex]);
      return;
    }
    if (kind === "toggle-all") {
      this.#setDocExpanded(docIndex, !this.#isDocExpanded(docIndex));
    }
  }

  // ---- 事件 ----

  #onClick = (event) => {
    // 操作按钮在文档头部,不在任何 .doc-node 里,理论上不会落到字段节点上;
    // 仍然先拦一道,避免将来把操作区挪进行节点时误触收起。
    const action = event.target.closest?.(".doc__action");
    if (action) {
      event.stopPropagation();
      this.#handleAction(action);
      return;
    }

    const nodeEl = event.target.closest?.(".doc-node");
    if (!nodeEl) return;
    const entry = this.branches.get(nodeEl);
    if (!entry) return;
    // 点箭头或点行本身都切换,与对象树的手感一致
    this.#toggleEntry(entry);
  };

  #onKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const toggle = event.target.closest?.(".doc-node__toggle");
    if (!toggle) return;
    event.preventDefault();
    const entry = this.branches.get(toggle.closest(".doc-node"));
    if (!entry) return;
    this.#toggleEntry(entry);
  };
}

/* -----------------------------------------------------------------------------
 * 值与类型的处理
 * -------------------------------------------------------------------------- */

/**
 * 值的形态分类。
 *
 * 只分三类:标量 / 对象 / 数组。BSON 里够用了,再细分要驱动层配合。
 */
function classify(value) {
  if (Array.isArray(value)) return "array";
  if (value !== null && typeof value === "object") return "object";
  return "scalar";
}

/**
 * 标量值的展示文本与类型色 class。
 *
 * 数字不加千分位:BSON 里的数字是原样取的,加工过就和原始数据对不上了。
 */
function describeScalar(value) {
  if (value === null) return { text: "null", type: "null" };
  switch (typeof value) {
    case "string":
      return { text: value, type: "string" };
    case "number":
      return { text: String(value), type: "number" };
    case "boolean":
      return { text: value ? "true" : "false", type: "bool" };
    default:
      return { text: String(value), type: "string" };
  }
}

/**
 * 取子节点列表。
 *
 * undefined 的字段不渲染 —— 缺失就是没有值,显示成一行空白只会让人以为
 * 这里有个空字符串。数组元素用原始下标做 key,跳过 undefined 也不会错位。
 */
function childEntries(value, isArray) {
  const entries = [];
  if (isArray) {
    value.forEach((item, index) => {
      if (item === undefined) return;
      entries.push([String(index), item]);
    });
    return entries;
  }
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    entries.push([key, item]);
  }
  return entries;
}

/* -----------------------------------------------------------------------------
 * 小工具
 * -------------------------------------------------------------------------- */

/** 建元素:组件里到处都要设 className,包一层省重复。 */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** 复制文档 JSON 到剪贴板。设计源里不做提示条,只记一条日志。 */
async function copyJson(doc) {
  const text = JSON.stringify(doc ?? {}, null, 2);
  const ok = await copyText(text);
  console.info(ok ? "已复制文档 JSON" : "复制文档 JSON 失败", doc?._id);
}

