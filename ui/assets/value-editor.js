/**
 * Redis 键值编辑器。
 *
 * Redis 的值有五种类型,每种的长相和编辑方式都不一样:字符串是一段文本,
 * 哈希是字段表,列表是有序集合,集合是无序集合,有序集合是带分数的成员表。
 * 统一塞进一个「键值对编辑器」会让用户每次都猜该填什么,所以按类型分开渲染。
 *
 * 编辑器本身是纯展示 + 本地改动的:真实的读写由 Rust 侧的 service 层负责,
 * 这里只把「改一个值要经过哪些界面元素」定下来。
 */


const TYPE_LABEL = {
  string: "字符串",
  hash: "哈希",
  list: "列表",
  set: "集合",
  zset: "有序集合",
};

const TYPE_ICON = {
  string: "table",
  hash: "group",
  list: "sequence",
  set: "index",
  zset: "function",
};

class ValueEditor {
  /**
   * @param {object} entry 形如 `{ key, type, ttl, size, value?, fields?, values?, entries? }`
   */
  constructor(entry) {
    this.entry = entry;
    this.edits = new Map();
  }

  mount(container) {
    this.container = container;

    const root = document.createElement("div");
    root.className = "value-editor";
    this.root = root;

    // 元信息:类型 / TTL / 大小
    root.appendChild(this.#buildMeta());

    // 按类型渲染值
    root.appendChild(this.#buildValue());

    // 底部操作
    const foot = document.createElement("div");
    foot.className = "value-editor__foot";
    const hint = document.createElement("span");
    hint.className = "value-editor__hint";
    hint.textContent = "改动只在本机保留,保存后才会发回服务端";
    foot.appendChild(hint);
    root.appendChild(foot);

    container.appendChild(root);
    return this;
  }

  destroy() {
    this.root?.remove();
  }

  /** 收集本地改动,键是字段路径。 */
  getEdits() {
    return Object.fromEntries(this.edits);
  }

  #buildMeta() {
    const meta = document.createElement("div");
    meta.className = "value-editor__meta";

    const type = document.createElement("div");
    type.className = "value-editor__type";
    type.appendChild(createIcon(TYPE_ICON[this.entry.type] ?? "dot", 14));
    const typeName = document.createElement("span");
    typeName.textContent = TYPE_LABEL[this.entry.type] ?? this.entry.type;
    type.appendChild(typeName);
    meta.appendChild(type);

    const rows = document.createElement("div");
    rows.className = "value-editor__rows";

    rows.appendChild(this.#buildRow("键", this.entry.key, "mono"));
    rows.appendChild(
      this.#buildRow(
        "TTL",
        this.entry.ttl === -1 || this.entry.ttl === undefined
          ? "永不过期"
          : `${this.entry.ttl} 秒`,
      ),
    );
    rows.appendChild(this.#buildRow("大小", formatBytes(this.entry.size ?? 0)));
    meta.appendChild(rows);

    return meta;
  }

  #buildRow(label, value, className = "") {
    const row = document.createElement("div");
    row.className = "value-editor__row";
    const key = document.createElement("span");
    key.className = "value-editor__row-label";
    key.textContent = label;
    const val = document.createElement("span");
    val.className = `value-editor__row-value ${className}`.trim();
    val.textContent = value;
    row.append(key, val);
    return row;
  }

  #buildValue() {
    const body = document.createElement("div");
    body.className = "value-editor__body";

    switch (this.entry.type) {
      case "string":
        body.appendChild(this.#buildString());
        break;
      case "hash":
        body.appendChild(this.#buildHash());
        break;
      case "list":
        body.appendChild(this.#buildList());
        break;
      case "set":
        body.appendChild(this.#buildList(true));
        break;
      case "zset":
        body.appendChild(this.#buildZSet());
        break;
      default:
        body.appendChild(this.#buildEmpty("这个类型还没有专门的编辑器"));
    }
    return body;
  }

  #buildString() {
    const wrap = document.createElement("div");
    wrap.className = "value-editor__string";
    const area = document.createElement("textarea");
    area.className = "input textarea";
    area.rows = 10;
    area.value = this.entry.value ?? "";
    area.addEventListener("input", () => this.edits.set("value", area.value));
    wrap.appendChild(area);
    return wrap;
  }

  #buildHash() {
    const table = document.createElement("div");
    table.className = "value-editor__table";

    const head = document.createElement("div");
    head.className = "value-editor__tr value-editor__tr--head";
    head.appendChild(kvCell("字段"), kvCell("值"), kvCell(""));
    table.appendChild(head);

    const fields = this.entry.fields ?? {};
    for (const [field, value] of Object.entries(fields)) {
      const row = document.createElement("div");
      row.className = "value-editor__tr";
      const keyCell = document.createElement("div");
      keyCell.className = "value-editor__cell value-editor__cell--key mono";
      keyCell.textContent = field;
      const valueCell = document.createElement("div");
      valueCell.className = "value-editor__cell mono";
      valueCell.textContent = value === null ? "null" : String(value);
      valueCell.contentEditable = "true";
      valueCell.addEventListener("input", () => {
        this.edits.set(`fields.${field}`, valueCell.textContent);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "value-editor__remove";
      remove.title = "删除字段";
      remove.appendChild(createIcon("close", 11));
      remove.addEventListener("click", () => {
        row.remove();
        this.edits.set(`fields.${field}`, null);
      });
      row.append(keyCell, valueCell, remove);
      table.appendChild(row);
    }
    return table;
  }

  #buildList(isSet = false) {
    const wrap = document.createElement("div");
    wrap.className = "value-editor__list";
    const values = this.entry.values ?? [];

    values.forEach((value, index) => {
      const row = document.createElement("div");
      row.className = "value-editor__item";
      const indexEl = document.createElement("span");
      indexEl.className = "value-editor__item-index mono";
      indexEl.textContent = isSet ? "•" : String(index);
      const valueEl = document.createElement("span");
      valueEl.className = "value-editor__item-value mono";
      valueEl.textContent = value === null ? "null" : String(value);
      valueEl.contentEditable = "true";
      valueEl.addEventListener("input", () => {
        this.edits.set(`values.${index}`, valueEl.textContent);
      });
      row.append(indexEl, valueEl);
      wrap.appendChild(row);
    });

    if (values.length === 0) {
      wrap.appendChild(this.#buildEmpty("这个集合是空的"));
    }
    return wrap;
  }

  #buildZSet() {
    const table = document.createElement("div");
    table.className = "value-editor__table";

    const head = document.createElement("div");
    head.className = "value-editor__tr value-editor__tr--head";
    head.appendChild(kvCell("成员"), kvCell("分数"), kvCell(""));
    table.appendChild(head);

    for (const entry of this.entry.entries ?? []) {
      const row = document.createElement("div");
      row.className = "value-editor__tr";
      const member = document.createElement("div");
      member.className = "value-editor__cell value-editor__cell--key mono";
      member.textContent = entry.member;
      const score = document.createElement("div");
      score.className = "value-editor__cell value-editor__cell--number mono";
      score.textContent = String(entry.score);
      score.contentEditable = "true";
      score.addEventListener("input", () => {
        this.edits.set(`entries.${entry.member}.score`, score.textContent);
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "value-editor__remove";
      remove.title = "删除成员";
      remove.appendChild(createIcon("close", 11));
      remove.addEventListener("click", () => {
        row.remove();
        this.edits.set(`entries.${entry.member}`, null);
      });
      row.append(member, score, remove);
      table.appendChild(row);
    }
    return table;
  }

  #buildEmpty(message) {
    const empty = document.createElement("div");
    empty.className = "value-editor__empty";
    empty.textContent = message;
    return empty;
  }
}

function kvCell(text) {
  const el = document.createElement("div");
  el.className = "value-editor__cell";
  el.textContent = text;
  return el;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
