
/**
 * UI 原语:弹层、抽屉、Toast、表单控件。
 *
 * 这些是所有交互的地基 —— 连接向导要用表单,删除表要用确认框,任何操作
 * 都要有反馈。自研不引第三方库,理由和 DataGrid 一样:设计源要能被 Rust
 * 实现复刻,引库等于变成在复刻那个库。
 *
 * 约定:弹层与抽屉挂在 body 上,不进业务 DOM 树,避免被祖先的 overflow 裁掉。
 */

/* -----------------------------------------------------------------------------
 * 弹层
 * -------------------------------------------------------------------------- */

let activeOverlay = null;

/**
 * 打开一个模态框。
 *
 * @param {object} options
 *   - `title` 标题
 *   - `message` 正文(可选,与 fields 二选一)
 *   - `fields` 表单字段数组(可选)
 *   - `confirmText` 确认按钮文案,默认「确定」
 *   - `cancelText` 取消按钮文案,默认「取消」
 *   - `danger` 确认按钮是否为危险操作
 * @returns {Promise<object|null>} 确认时返回字段值对象,取消返回 null
 */
function openDialog(options = {}) {
  const {
    title = "确认",
    message = "",
    fields = [],
    confirmText = "确定",
    cancelText = "取消",
    danger = false,
  } = options;

  return new Promise((resolve) => {
    closeOverlay();

    const overlay = document.createElement("div");
    overlay.className = "dialog__overlay";

    const dialog = document.createElement("div");
    dialog.className = "dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const head = document.createElement("div");
    head.className = "dialog__head";
    const titleEl = document.createElement("div");
    titleEl.className = "dialog__title";
    titleEl.textContent = title;
    head.appendChild(titleEl);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "dialog__close";
    close.setAttribute("aria-label", "关闭");
    close.appendChild(createIcon("close", 13));
    head.appendChild(close);
    dialog.appendChild(head);

    const body = document.createElement("div");
    body.className = "dialog__body";
    if (message) {
      const text = document.createElement("div");
      text.className = "dialog__message";
      text.textContent = message;
      body.appendChild(text);
    }
    const controls = fields.map((field) => createField(field));
    for (const control of controls) body.appendChild(control);
    dialog.appendChild(body);

    const foot = document.createElement("div");
    foot.className = "dialog__foot";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = cancelText;
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = danger ? "btn btn--danger" : "btn btn--primary";
    confirm.textContent = confirmText;
    foot.append(cancel, confirm);
    dialog.appendChild(foot);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const finish = (value) => {
      closeOverlay();
      resolve(value);
    };

    cancel.addEventListener("click", () => finish(null));
    close.addEventListener("click", () => finish(null));
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) finish(null);
    });
    confirm.addEventListener("click", () => {
      const values = {};
      for (const control of controls) {
        const value = control.read();
        if (value === undefined) return;
        values[control.name] = value;
      }
      finish(values);
    });

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    overlay.addEventListener("DOMNodeRemovedFromDocument", () => {
      document.removeEventListener("keydown", onKeyDown);
    });

    activeOverlay = {
      element: overlay,
      destroy: () => {
        document.removeEventListener("keydown", onKeyDown);
        overlay.remove();
        if (activeOverlay?.element === overlay) activeOverlay = null;
      },
    };

    // 首个可聚焦控件拿到焦点,键盘用户不用先 Tab 一遍
    const first = dialog.querySelector("input, select, textarea, button.btn--primary");
    first?.focus();
  });
}

function closeOverlay() {
  activeOverlay?.destroy();
  activeOverlay = null;
}

/* -----------------------------------------------------------------------------
 * 抽屉
 * -------------------------------------------------------------------------- */

/**
 * 打开一个侧边抽屉。
 *
 * 抽屉用来放「不打断主流程」的内容 —— 对象详情、键的值编辑器都走这里。
 *
 * @param {object} options `{ title, content, width, onClose }`
 * @returns {{ element: HTMLElement, close: () => void }}
 */
function openDrawer({ title = "", content = null, width = 420, onClose } = {}) {
  const overlay = document.createElement("div");
  overlay.className = "drawer__overlay";

  const drawer = document.createElement("aside");
  drawer.className = "drawer";
  drawer.style.width = `${width}px`;
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");

  const head = document.createElement("div");
  head.className = "drawer__head";
  const titleEl = document.createElement("div");
  titleEl.className = "drawer__title";
  titleEl.textContent = title;
  head.appendChild(titleEl);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "drawer__close";
  close.setAttribute("aria-label", "关闭");
  close.appendChild(createIcon("close", 13));
  head.appendChild(close);
  drawer.appendChild(head);

  const body = document.createElement("div");
  body.className = "drawer__body";
  if (content) body.appendChild(content);
  drawer.appendChild(body);

  overlay.appendChild(drawer);
  document.body.appendChild(overlay);

  const controller = {
    element: drawer,
    close: () => {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
      onClose?.();
    },
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") controller.close();
  };
  document.addEventListener("keydown", onKeyDown);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) controller.close();
  });
  close.addEventListener("click", () => controller.close());

  return controller;
}

/* -----------------------------------------------------------------------------
 * Toast
 * -------------------------------------------------------------------------- */

let toastStack = null;

/**
 * 弹一条操作反馈。
 *
 * @param {string} message
 * @param {object} options `{ type, duration }` type ∈ success | error | info | warning
 */
function toast(message, { type = "info", duration = 2600 } = {}) {
  if (!toastStack) {
    toastStack = document.createElement("div");
    toastStack.className = "toast-stack";
    document.body.appendChild(toastStack);
  }

  const item = document.createElement("div");
  item.className = `toast toast--${type}`;

  const icon = document.createElement("span");
  icon.className = "toast__icon";
  icon.appendChild(
    createIcon(type === "success" ? "check" : type === "error" ? "error" : "info", 13),
  );
  item.appendChild(icon);

  const text = document.createElement("span");
  text.className = "toast__message";
  text.textContent = message;
  item.appendChild(text);

  toastStack.appendChild(item);

  setTimeout(() => {
    item.classList.add("is-leaving");
    setTimeout(() => item.remove(), 200);
  }, duration);

  return item;
}

/**
 * 复制到剪贴板。
 *
 * 非安全上下文(file:// 或 http)下 clipboard API 不可用,退回 execCommand。
 * 设计源要在 file:// 下能直接跑,所以这个兜底是必需的,不是可选优化。
 */
async function copyText(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 剪贴板不可用(非安全上下文 / 权限被拒),退回老办法
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
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

/* -----------------------------------------------------------------------------
 * 表单控件
 *
 * 每个工厂函数返回一个包装好的元素,并附带 `read()` 用来取值。
 * 字段描述形如 `{ name, label, type, value, options, placeholder, hint, required }`。
 * -------------------------------------------------------------------------- */

/**
 * 造一个字段容器。
 *
 * @param {object} field
 * @returns {{ element: HTMLElement, name: string, read: () => any }}
 */
function createField(field) {
  const wrapper = document.createElement("div");
  wrapper.className = `field${field.full ? " field--full" : ""}`;

  if (field.label) {
    const label = document.createElement("label");
    label.className = "field__label";
    label.textContent = field.required ? `${field.label} *` : field.label;
    label.htmlFor = `field-${field.name}`;
    wrapper.appendChild(label);
  }

  let read;
  switch (field.type) {
    case "select":
      read = appendSelect(wrapper, field);
      break;
    case "switch":
      read = appendSwitch(wrapper, field);
      break;
    case "checkbox":
      read = appendCheckbox(wrapper, field);
      break;
    case "number":
      read = appendNumber(wrapper, field);
      break;
    case "password":
      read = appendPassword(wrapper, field);
      break;
    case "path":
      read = appendPathPicker(wrapper, field);
      break;
    case "textarea":
      read = appendTextarea(wrapper, field);
      break;
    default:
      read = appendInput(wrapper, field);
  }

  if (field.hint) {
    const hint = document.createElement("div");
    hint.className = "field__hint";
    hint.textContent = field.hint;
    wrapper.appendChild(hint);
  }

  return { element: wrapper, name: field.name, read };
}

function appendInput(wrapper, field) {
  const input = document.createElement("input");
  input.className = "input";
  input.id = `field-${field.name}`;
  input.type = "text";
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.value !== undefined) input.value = field.value;
  if (field.disabled) input.disabled = true;
  wrapper.appendChild(input);
  return () => input.value;
}

function appendTextarea(wrapper, field) {
  const area = document.createElement("textarea");
  area.className = "input textarea";
  area.id = `field-${field.name}`;
  area.rows = field.rows ?? 4;
  if (field.placeholder) area.placeholder = field.placeholder;
  if (field.value !== undefined) area.value = field.value;
  wrapper.appendChild(area);
  return () => area.value;
}

function appendSelect(wrapper, field) {
  const select = document.createElement("select");
  select.className = "select";
  select.id = `field-${field.name}`;
  for (const option of field.options ?? []) {
    const el = document.createElement("option");
    el.value = option.value ?? option;
    el.textContent = option.label ?? option;
    if (option.value === field.value) el.selected = true;
    select.appendChild(el);
  }
  wrapper.appendChild(select);
  return () => select.value;
}

function appendNumber(wrapper, field) {
  const input = document.createElement("input");
  input.className = "input input--number";
  input.id = `field-${field.name}`;
  input.type = "number";
  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  if (field.step !== undefined) input.step = field.step;
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.value !== undefined) input.value = field.value;
  wrapper.appendChild(input);
  return () => (input.value === "" ? null : Number(input.value));
}

function appendPassword(wrapper, field) {
  const input = document.createElement("input");
  input.className = "input";
  input.id = `field-${field.name}`;
  input.type = "password";
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.value !== undefined) input.value = field.value;
  wrapper.appendChild(input);
  return () => input.value;
}

function appendSwitch(wrapper, field) {
  const row = document.createElement("div");
  row.className = "switch-row";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "switch__input";
  input.id = `field-${field.name}`;
  input.checked = Boolean(field.value);

  const track = document.createElement("span");
  track.className = "switch__track";

  row.append(input, track);
  wrapper.appendChild(row);
  return () => input.checked;
}

function appendCheckbox(wrapper, field) {
  const row = document.createElement("label");
  row.className = "checkbox-row";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "checkbox__input";
  input.id = `field-${field.name}`;
  input.checked = Boolean(field.value);

  const box = document.createElement("span");
  box.className = "checkbox__box";

  const text = document.createElement("span");
  text.className = "checkbox__text";
  text.textContent = field.text ?? field.label ?? "";

  row.append(input, box, text);
  wrapper.appendChild(row);
  return () => input.checked;
}

function appendPathPicker(wrapper, field) {
  const row = document.createElement("div");
  row.className = "path-picker";

  const input = document.createElement("input");
  input.className = "input";
  input.id = `field-${field.name}`;
  input.type = "text";
  if (field.placeholder) input.placeholder = field.placeholder;
  if (field.value !== undefined) input.value = field.value;

  const browse = document.createElement("button");
  browse.type = "button";
  browse.className = "btn";
  browse.textContent = "浏览…";

  row.append(input, browse);
  wrapper.appendChild(row);
  return () => input.value;
}
