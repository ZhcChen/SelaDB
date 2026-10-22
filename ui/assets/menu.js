/**
 * 轻量菜单。
 *
 * 设计源只需要「点击外部关闭 + Esc 关闭 + 视口翻转」这几件事,
 * 没必要引第三方菜单库。菜单是 fixed 定位,挂到 body 上,避免被祖先的
 * overflow 裁掉。
 */

let activeMenu = null;

function closeActive() {
  if (activeMenu) {
    activeMenu.destroy();
  }
}

/**
 * 打开一个菜单。
 *
 * @param {Array<object>} items 菜单项。普通项 `{ label, shortcut, action, danger, disabled }`,
 *   分隔线 `{ type: 'separator' }`。
 * @param {object} options `{ x, y }` 视口坐标。
 * @returns {{ destroy: () => void }}
 */
function openMenu(items, { x, y } = {}) {
  closeActive();

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (!item) continue;

    if (item.type === "separator") {
      const sep = document.createElement("div");
      sep.className = "menu__sep";
      menu.appendChild(sep);
      continue;
    }

    const button = document.createElement("button");
    button.className = "menu__item";
    button.type = "button";
    button.setAttribute("role", "menuitem");
    if (item.danger) button.classList.add("menu__item--danger");
    if (item.disabled) button.disabled = true;

    const label = document.createElement("span");
    label.textContent = item.label;
    button.appendChild(label);

    if (item.shortcut) {
      const shortcut = document.createElement("span");
      shortcut.className = "menu__shortcut";
      shortcut.textContent = item.shortcut;
      button.appendChild(shortcut);
    }

    if (!item.disabled && item.action) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        closeActive();
        item.action();
      });
    }

    menu.appendChild(button);
  }

  document.body.appendChild(menu);

  // 贴边翻转:菜单超出视口时向内收,保证完整可见
  const rect = menu.getBoundingClientRect();
  const margin = 8;
  let left = x;
  let top = y;
  if (left + rect.width + margin > window.innerWidth) {
    left = Math.max(margin, window.innerWidth - rect.width - margin);
  }
  if (top + rect.height + margin > window.innerHeight) {
    top = Math.max(margin, window.innerHeight - rect.height - margin);
  }
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;

  const onDocPointerDown = (event) => {
    if (!menu.contains(event.target)) closeActive();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") closeActive();
  };

  // 用 capture 阶段的 pointerdown,保证点击菜单项本身不会先触发关闭
  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("keydown", onKeyDown);

  const controller = {
    menu,
    destroy() {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      menu.remove();
      if (activeMenu === controller) activeMenu = null;
    },
  };

  activeMenu = controller;
  return controller;
}

function closeMenu() {
  closeActive();
}
