
/**
 * 命令面板(⌘K)。
 *
 * 一个弹层里同时检索「命令」和「对象」—— 数据库工具的对象树可能很大,
 * 让用户先展开三层再找一张表不现实,直接搜表名更有效。
 *
 * 匹配用子序列模糊匹配:连续命中与前缀命中权重更高。
 */

/**
 * 模糊匹配。
 *
 * @param {string} query
 * @param {string} text
 * @returns {{ score: number, indices: number[] }|null}
 */
function fuzzyMatch(query, text) {
  const q = (query ?? "").trim().toLowerCase();
  const t = (text ?? "").toLowerCase();
  if (!q) return { score: 0, indices: [] };
  if (t.startsWith(q)) {
    return { score: 1000 - t.length, indices: [...q].map((_, i) => i) };
  }

  let qi = 0;
  let score = 0;
  const indices = [];
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) continue;
    indices.push(ti);
    score += 10;
    // 连续命中额外加权,「usr」应该比「u_s_r」更靠前
    if (indices.length > 1 && indices[indices.length - 2] === ti - 1) score += 15;
    qi += 1;
  }
  if (qi < q.length) return null;
  score -= t.length * 0.1;
  return { score, indices };
}

/** 把命中字符高亮成 <mark>。 */
function highlight(text, indices) {
  const fragment = document.createDocumentFragment();
  if (!indices || indices.length === 0) {
    fragment.appendChild(document.createTextNode(text));
    return fragment;
  }
  const set = new Set(indices);
  let buffer = "";
  let inMark = false;

  const flush = () => {
    if (!buffer) return;
    if (inMark) {
      const mark = document.createElement("mark");
      mark.textContent = buffer;
      fragment.appendChild(mark);
    } else {
      fragment.appendChild(document.createTextNode(buffer));
    }
    buffer = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const hit = set.has(i);
    if (hit && !inMark) {
      flush();
      inMark = true;
    } else if (!hit && inMark) {
      flush();
      inMark = false;
    }
    buffer += text[i];
  }
  flush();
  return fragment;
}

class CommandPalette {
  constructor({ commands = [], onSelect } = {}) {
    this.commands = commands;
    this.onSelect = onSelect ?? (() => {});
    this.open_ = false;
    this.activeIndex = 0;
    this.results = [];
  }

  mount(container) {
    this.container = container;

    const overlay = document.createElement("div");
    overlay.className = "palette__overlay";
    overlay.hidden = true;

    const palette = document.createElement("div");
    palette.className = "palette";
    palette.setAttribute("role", "dialog");
    palette.setAttribute("aria-modal", "true");
    palette.setAttribute("aria-label", "命令面板");

    const search = document.createElement("div");
    search.className = "palette__search";
    const icon = createIcon("search", 15);
    icon.classList.add("palette__search-icon");
    search.appendChild(icon);
    const input = document.createElement("input");
    input.className = "palette__input";
    input.type = "text";
    input.placeholder = "搜索命令或对象…";
    input.setAttribute("aria-label", "搜索命令或对象");
    search.appendChild(input);
    palette.appendChild(search);

    const list = document.createElement("div");
    list.className = "palette__list";
    palette.appendChild(list);

    overlay.appendChild(palette);
    container.appendChild(overlay);

    this.overlay = overlay;
    this.input = input;
    this.list = list;

    input.addEventListener("input", () => this.#render());
    input.addEventListener("keydown", (event) => this.#onKeyDown(event));
    // 点遮罩关闭
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) this.close();
    });
    // ⌘K 之外的面板内快捷键
    palette.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    return this;
  }

  setCommands(commands) {
    this.commands = commands ?? [];
  }

  isOpen() {
    return this.open_;
  }

  open(prefill = "") {
    this.open_ = true;
    this.overlay.hidden = false;
    this.input.value = prefill;
    this.activeIndex = 0;
    this.#render();
    this.input.focus();
    this.input.select();
  }

  close() {
    this.open_ = false;
    this.overlay.hidden = true;
    this.input.value = "";
  }

  destroy() {
    this.overlay?.remove();
    this.open_ = false;
  }

  // ---- 内部实现 ----

  #render() {
    const query = this.input.value;
    const scored = [];

    for (const command of this.commands) {
      const titleHit = fuzzyMatch(query, command.title);
      if (!titleHit) continue;
      // 副标题也参与匹配,分低一些,保证标题命中的排前面
      const subHit = command.subtitle ? fuzzyMatch(query, command.subtitle) : null;
      scored.push({
        command,
        score: titleHit.score + (subHit ? subHit.score * 0.3 : 0),
        indices: titleHit.indices,
        subIndices: subHit ? subHit.indices : null,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    this.results = scored;
    this.activeIndex = Math.min(this.activeIndex, Math.max(0, scored.length - 1));

    this.list.replaceChildren();

    if (scored.length === 0) {
      const empty = document.createElement("div");
      empty.className = "palette__empty";
      empty.textContent = query ? "没有匹配的命令或对象" : "输入以搜索";
      this.list.appendChild(empty);
      return;
    }

    let currentGroup = null;
    scored.forEach((entry, index) => {
      const group = entry.command.category ?? "命令";
      if (group !== currentGroup) {
        currentGroup = group;
        const title = document.createElement("div");
        title.className = "palette__group-title";
        title.textContent = group;
        this.list.appendChild(title);
      }

      const item = document.createElement("button");
      item.type = "button";
      item.className = "palette__item";
      if (index === this.activeIndex) item.classList.add("is-active");
      item.dataset.index = String(index);

      if (entry.command.icon) {
        const iconWrap = document.createElement("span");
        iconWrap.className = "palette__item-icon";
        iconWrap.appendChild(createIcon(entry.command.icon, 14));
        item.appendChild(iconWrap);
      }

      const text = document.createElement("span");
      text.className = "palette__item-text";
      const titleEl = document.createElement("span");
      titleEl.className = "palette__item-title";
      titleEl.appendChild(highlight(entry.command.title, entry.indices));
      text.appendChild(titleEl);
      if (entry.command.subtitle) {
        const sub = document.createElement("span");
        sub.className = "palette__item-subtitle";
        sub.appendChild(highlight(entry.command.subtitle, entry.subIndices));
        text.appendChild(sub);
      }
      item.appendChild(text);

      if (entry.command.shortcut) {
        const shortcut = document.createElement("span");
        shortcut.className = "palette__item-shortcut";
        shortcut.textContent = entry.command.shortcut;
        item.appendChild(shortcut);
      }

      item.addEventListener("mouseenter", () => {
        this.activeIndex = index;
        this.#syncActive();
      });
      item.addEventListener("click", () => this.#execute(index));

      this.list.appendChild(item);
    });
  }

  #syncActive() {
    const items = this.list.querySelectorAll(".palette__item");
    items.forEach((item, index) => {
      item.classList.toggle("is-active", index === this.activeIndex);
    });
    items[this.activeIndex]?.scrollIntoView({ block: "nearest" });
  }

  #execute(index) {
    const entry = this.results[index];
    if (!entry) return;
    this.close();
    entry.command.action?.();
  }

  #onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      this.activeIndex = Math.min(this.results.length - 1, this.activeIndex + 1);
      this.#syncActive();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      this.activeIndex = Math.max(0, this.activeIndex - 1);
      this.#syncActive();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.#execute(this.activeIndex);
    }
  }
}
