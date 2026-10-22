/**
 * 设计源冒烟验收。
 *
 * 覆盖设计源里最要紧的几条:外壳能渲染、对象树能展开、表能开成 Tab、
 * 网格的排序/过滤/编辑真的生效、主题与密度能切。
 *
 * 运行:
 *   cd ui && bun run dev            # 另开一个终端
 *   node tests/smoke.mjs            # 需要 playwright 可用
 *
 * 截图落在 tests/screenshots/ 下,用来做视觉回归的基准。
 */

import { mkdir, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const shotDir = join(here, "screenshots");

// 默认直接跑 file:// —— 设计源是纯静态的,验收不该要求先起服务器。
// 需要对着 dev server 跑时用 SELA_DB_UI_URL 覆盖。
const BASE =
  process.env.SELA_DB_UI_URL ?? `file://${resolve(here, "..", "index.html")}`;

const results = [];
let failures = 0;

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page, name) {
  await page.screenshot({ path: join(shotDir, `${name}.png`) });
}

// ---- 静态约束:设计源不用 ES module,普通脚本里出现 import/export 是语法错误 ----
const assetsDir = join(here, "..", "assets");
const assetFiles = (await readdir(assetsDir)).filter((name) => name.endsWith(".js"));
const moduleSyntax = [];
for (const name of assetFiles) {
  const source = await readFile(join(assetsDir, name), "utf8");
  if (/^\s*(import|export)\s/m.test(source)) moduleSyntax.push(name);
}
check(
  "assets/ 里没有 ES module 语法(file:// 下会被 CORS 拦住)",
  moduleSyntax.length === 0,
  moduleSyntax.join(", "),
);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await mkdir(shotDir, { recursive: true });

// ---- 工作台 ----
console.log("\n[1] 主工作台");
await page.goto(`${BASE}#/design`, { waitUntil: "networkidle" });
await page.waitForSelector(".tree__node", { timeout: 10000 });

const connectionNodes = await page.locator(".tree__node[data-kind='connection']").count();
check("对象树渲染出 4 个连接", connectionNodes === 4, `实际 ${connectionNodes}`);

const engineIcons = await page.locator(".tree__node[data-kind='connection'] .icon--engine").count();
check("连接节点带引擎专属图标", engineIcons === 4, `实际 ${engineIcons}`);

const iconShapes = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll(".tree__node[data-kind='connection'] .icon--engine")];
  return nodes.map((n) => n.querySelector("path")?.getAttribute("d")?.slice(0, 40) ?? "");
});
const distinctShapes = new Set(iconShapes).size;
check("不同引擎的图标形状互不相同", distinctShapes === iconShapes.length, `实际 ${distinctShapes} 种`);

const iconColors = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll(".tree__node[data-kind='connection'] .tree__icon")];
  return nodes.map((n) => getComputedStyle(n).color);
});
check("引擎图标各自带品牌色", new Set(iconColors).size > 1, `实际 ${new Set(iconColors).size} 种颜色`);

// 图标在 16px 下的实际墨量:太小说明归一化变换或 pre 修正没生效
const inkSizes = await page.evaluate(() => {
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:-9999px;top:0";
  document.body.appendChild(holder);
  const out = {};
  for (const id of ["postgresql", "mysql", "sqlite", "mongodb", "redis", "sqlserver"]) {
    const svg = createEngineIcon(id, 16);
    holder.appendChild(svg);
    const bb = svg.getBBox();
    out[id] = { w: +bb.width.toFixed(2), h: +bb.height.toFixed(2) };
  }
  holder.remove();
  return out;
});
const tooSmall = Object.entries(inkSizes).filter(([, v]) => v.w < 7 || v.h < 9);
check(
  "六枚引擎图标在 16px 下的墨量都够",
  tooSmall.length === 0,
  tooSmall.map(([k, v]) => `${k} ${v.w}x${v.h}`).join(", "),
);

// 外壳是「左右两大块」:左列是通高的对象树,右列是上下三段
// (顶栏 / 画布 / 底栏)。顶栏与底栏只覆盖右侧,不横跨侧栏 ——
// 侧栏要从窗口顶部一直到底,读起来才是一根完整的柱子。
// 画布那三条边(上 / 下 / 左)由 .workspace 与 .tree 各画一段。
const shellLines = await page.evaluate(() => {
  const read = (sel, prop) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { border: cs[prop], bg: cs.backgroundColor, img: cs.backgroundImage };
  };
  const box = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), h: Math.round(r.height) };
  };
  return {
    top: read(".topbar", "borderBottomWidth"),
    bottom: read(".statusbar", "borderTopWidth"),
    workspaceTop: read(".workspace", "borderTopWidth"),
    workspaceBottom: read(".workspace", "borderBottomWidth"),
    workspaceTopColor: read(".workspace", "borderTopColor"),
    treeRight: read(".tree", "borderRightWidth"),
    treeBox: box(".tree"),
    topbarBox: box(".topbar"),
    statusBox: box(".statusbar"),
    brand: box(".tree__brand"),
    topbarBrand: Boolean(document.querySelector(".topbar__brand")),
    viewH: window.innerHeight,
  };
});
check("顶栏与中间区之间没有分割线", shellLines.top?.border === "0px", `border-bottom ${shellLines.top?.border}`);
check("底栏与中间区之间没有分割线", shellLines.bottom?.border === "0px", `border-top ${shellLines.bottom?.border}`);
check(
  "画布上边有 1px 结构线",
  shellLines.workspaceTop?.border === "1px",
  `border-top ${shellLines.workspaceTop?.border}`,
);
check(
  "画布下边有 1px 结构线",
  shellLines.workspaceBottom?.border === "1px",
  `border-bottom ${shellLines.workspaceBottom?.border}`,
);
check(
  "侧栏右边有 1px 结构线",
  shellLines.treeRight?.border === "1px",
  `border-right ${shellLines.treeRight?.border}`,
);
check(
  "画布三边用同一个 token(--border-subtle)",
  shellLines.workspaceTopColor?.border === "rgb(228, 232, 236)",
  `border-top-color ${shellLines.workspaceTopColor?.border}`,
);
check(
  "顶栏与底栏整条跟侧栏同色",
  shellLines.top?.bg === shellLines.bottom?.bg,
  `${shellLines.top?.bg} / ${shellLines.bottom?.bg}`,
);
check(
  "对象树从窗口顶部到底部通高",
  shellLines.treeBox?.top === 0 && shellLines.treeBox?.bottom === shellLines.viewH,
  `tree ${shellLines.treeBox?.top}..${shellLines.treeBox?.bottom} / 视口 ${shellLines.viewH}`,
);
check(
  "顶栏只覆盖右侧主内容区(不横跨对象树)",
  shellLines.topbarBox?.left >= shellLines.treeBox?.right - 1,
  `topbar left ${shellLines.topbarBox?.left} / tree right ${shellLines.treeBox?.right}`,
);
check(
  "底栏只覆盖右侧主内容区(不横跨对象树)",
  shellLines.statusBox?.left >= shellLines.treeBox?.right - 1,
  `statusbar left ${shellLines.statusBox?.left} / tree right ${shellLines.treeBox?.right}`,
);
check(
  "品牌标识在对象树顶部(窗口左上角)",
  Boolean(shellLines.brand) && shellLines.brand.top === 0 && !shellLines.topbarBrand,
  `brand top ${shellLines.brand?.top} / 顶栏里还有品牌 ${shellLines.topbarBrand}`,
);
check(
  "侧栏品牌行与顶栏同高(搜索框与画布顶边对齐)",
  shellLines.brand?.h === 44,
  `brand height ${shellLines.brand?.h}`,
);

// 控件高度只有一个来源 --h-control:搜索框、工具条按钮、表单输入必须同高。
// 之前是 26 / 28 混着用,顶栏 44px 高却只配 26px 的控件,框是扁的。
const controlHeights = await page.evaluate(() => {
  const h = (sel) => {
    const el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  };
  return {
    topbarSearch: h(".topbar__search input"),
    treeSearch: h(".tree__search input"),
    toolBtn: h(".btn--tool"),
    conn: h(".btn--conn"),
    topbar: h(".topbar"),
  };
});
check(
  "两个搜索框与工具条按钮同高(同一个 --h-control)",
  controlHeights.topbarSearch === controlHeights.treeSearch &&
    controlHeights.topbarSearch === controlHeights.toolBtn,
  `搜索 ${controlHeights.topbarSearch}/${controlHeights.treeSearch} · 按钮 ${controlHeights.toolBtn}`,
);
check(
  "顶栏里的控件不矮于顶栏高度的六成",
  controlHeights.topbarSearch >= controlHeights.topbar * 0.6,
  `控件 ${controlHeights.topbarSearch} / 顶栏 ${controlHeights.topbar}`,
);

// 拖动分隔条,侧栏宽度要跟着变
const treeBefore = await page.locator(".tree").evaluate((el) => el.getBoundingClientRect().width);
const splitter = page.locator(".splitter");
if (await splitter.count()) {
  const box = await splitter.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + 300, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}
const treeAfter = await page.locator(".tree").evaluate((el) => el.getBoundingClientRect().width);
check("拖动分隔条能改变侧栏宽度", treeAfter > treeBefore + 30, `${treeBefore} -> ${treeAfter}`);
await page.locator(".tree").evaluate((el) => {
  el.style.width = "";
});

await shot(page, "01-workbench-light");

// ---- 展开并打开表 ----
console.log("\n[2] 对象树与 Tab");
await page.locator(".tree__node[data-id='pg-local']").click();
await page.locator(".tree__node[data-id='pg-local/postgres']").click();
await page.locator(".tree__node[data-id='pg-local/postgres/public']").click();
await page.locator(".tree__node[data-id='pg-local/postgres/public/users']").click();

const tabs = await page.locator(".tab").count();
check("点击表后打开一个 Tab", tabs === 1, `实际 ${tabs}`);

const tabEngine = await page.locator(".tab__engine").first();
check(
  "Tab 带引擎标识",
  (await tabEngine.count()) > 0 && (await tabEngine.getAttribute("aria-label"))?.length > 0,
  `标识 "${await tabEngine.getAttribute("aria-label")}"`,
);

// ---- 网格 ----
console.log("\n[3] 数据网格");
await page.waitForSelector(".grid__row--body", { timeout: 5000 });

/** 只数真正落在视口里的行 —— 行池里超出的行虽然渲染了,但在视口之外。 */
const visibleRows = () =>
  page.evaluate(() => {
    const viewport = document.querySelector(".grid__viewport");
    if (!viewport) return 0;
    const box = viewport.getBoundingClientRect();
    return [...document.querySelectorAll(".grid__row--body")].filter((el) => {
      if (el.style.display === "none") return false;
      const rect = el.getBoundingClientRect();
      return rect.bottom > box.top && rect.top < box.bottom;
    }).length;
  });

/** 底栏显示的行数 —— 这是用户真正看到的口径。 */
const footCount = () =>
  page.evaluate(() => {
    const text = document.querySelector(".grid__foot strong")?.textContent ?? "0";
    return Number(text.replace(/,/g, "")) || 0;
  });

const rowCount = await visibleRows();
check("网格渲染出行", rowCount > 0, `视口内 ${rowCount} 行`);

const cellCount = await page.locator(".grid__row--body .grid__cell").count();
check("网格渲染出单元格", cellCount > 0, `可见 ${cellCount} 个`);

const nullCells = await page.locator(".grid__cell--null").count();
check("NULL 单元格有独立样式", nullCells > 0, `可见 ${nullCells} 个`);

const intCells = await page.locator(".grid__cell--int").count();
check("整数列有类型着色", intCells > 0, `可见 ${intCells} 个`);

/*
 * 顶栏按钮变体的样式必须真的生效。
 *
 * 这类坑出现过两次:顶栏工具按钮写成 `.btn.btn--tool`(0,2,0)之后,
 * `.btn--conn`(0,1,0)的底色与前景色被整个盖掉 —— 注释和文档里写的
 * 「当前连接是微底色药丸」「提交是深色文字」从来没渲染出来过。
 * 注释写着 ≠ 样式生效,这条断言就是防这个的。
 */
const btnVariants = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      visible: rect.width > 0 && rect.height > 0,
    };
  };
  return {
    conn: read(".btn--conn"),
    commit: read(".btn--commit"),
    tool: read(".btn--tool"),
  };
});
const transparent = (c) => !c || c === "rgba(0, 0, 0, 0)" || c === "transparent";
check(
  "顶栏「当前连接」是带底色的药丸",
  btnVariants.conn?.visible && !transparent(btnVariants.conn.bg),
  `bg ${btnVariants.conn?.bg}`,
);
check(
  "「提交」是深色文字(不可逆操作有额外权重)",
  btnVariants.commit?.visible &&
    btnVariants.commit.color !== btnVariants.tool?.color,
  `提交 ${btnVariants.commit?.color} / 回滚 ${btnVariants.tool?.color}`,
);

// 虚拟滚动:mock 行扩到了 600 行,DOM 里只保留视口附近的行
const totalRows = await footCount();
const domRows = await page.evaluate(
  () => document.querySelectorAll(".grid__row--body").length,
);
check(
  "虚拟滚动生效(DOM 行数远小于数据量)",
  domRows < totalRows,
  `DOM ${domRows} 行 / 数据 ${totalRows} 行`,
);

// 排序:表头三态 —— 升序 → 降序 → 取消
const firstCell = () => page.locator(".grid__row--body .grid__cell").nth(1).textContent();
const beforeSort = (await firstCell())?.trim();
await page.locator(".grid__cell--head").first().click();
await page.waitForTimeout(150);
const ascending = (await firstCell())?.trim();
await page.locator(".grid__cell--head").first().click();
await page.waitForTimeout(150);
const descending = (await firstCell())?.trim();
check(
  "点击表头切换排序(升→降)",
  descending !== ascending,
  `升序首行 ${ascending},降序首行 ${descending}`,
);
check("排序首行确实变了", descending !== beforeSort, `${beforeSort} → ${descending}`);

// 过滤:按 id 过滤,底栏的行数要跟着收窄
await page.locator(".grid__filter-input").fill("id > 8000");
await page.waitForTimeout(250);
const filteredCount = await footCount();
check(
  "过滤条件生效(行数收窄)",
  filteredCount > 0 && filteredCount < totalRows,
  `过滤后 ${filteredCount} 行 / 原 ${totalRows} 行`,
);

await page.locator(".grid__filter-input").fill("!!!");
await page.waitForTimeout(250);
const invalid = await page.locator(".grid__filter-input.is-invalid").count();
check("非法过滤条件给出错误提示", invalid === 1);

await page.locator(".grid__filter-clear").click();
await page.waitForTimeout(250);
const restoredCount = await footCount();
check("清除过滤后恢复", restoredCount === totalRows, `${restoredCount} / ${totalRows}`);

// 单元格编辑
const targetCell = page.locator(".grid__row--body .grid__cell").nth(2);
await targetCell.dblclick();
await page.waitForSelector(".grid__cell--editing", { timeout: 3000 });
check("双击进入单元格编辑态", (await page.locator(".grid__cell--editing").count()) === 1);
await page.keyboard.press("Escape");
await page.waitForTimeout(120);
check("Esc 退出编辑态", (await page.locator(".grid__cell--editing").count()) === 0);

await shot(page, "02-grid");

// ---- 多连接 ----
console.log("\n[4] 多连接");
await page.locator(".tree__node[data-id='mysql-local']").click();
await page.locator(".tree__node[data-id='mysql-local/shop']").click();
await page.locator(".tree__node[data-id='mysql-local/shop/users']").click();
await page.waitForTimeout(200);
const multiTabs = await page.locator(".tab").count();
check("可以同时打开多个连接的 Tab", multiTabs === 2, `实际 ${multiTabs}`);

const engines = await page.locator(".tab__engine").evaluateAll((nodes) =>
  nodes.map((n) => n.getAttribute("aria-label") ?? ""),
);
check("各 Tab 带各自引擎标识", new Set(engines.map((t) => t.trim())).size === 2, engines.join(" / "));

// ---- NoSQL 视图 ----
console.log("\n[5] NoSQL 数据视图");
await page.locator(".tree__node[data-id='mongo-local']").click();
await page.locator(".tree__node[data-id='mongo-local/shop']").click();
await page.locator(".tree__node[data-id='mongo-local/shop/users']").click();
await page.waitForSelector(".doc", { timeout: 5000 });
const docs = await page.locator(".doc").count();
check("MongoDB 渲染出文档卡片", docs > 0, `可见 ${docs} 个`);

const docNodes = await page.locator(".doc-node").count();
check("文档渲染成可折叠树", docNodes > 0, `可见 ${docNodes} 个节点`);

const docBranches = await page.locator(".doc-node__children").count();
const docOpen = await page.locator(".doc-node__children.is-open").count();
check(
  "默认只展开第一层",
  docOpen > 0 && docOpen < docBranches,
  `展开 ${docOpen} / 共 ${docBranches} 个分支`,
);

const docNulls = await page.locator(".doc__value--null").count();
check("文档里的 null 有独立样式", docNulls > 0, `可见 ${docNulls} 个`);

// 折叠交互:点箭头后子节点应当收起
const toggle = page.locator(".doc-node__toggle:not(.is-leaf)").first();
const beforeToggle = await page.locator(".doc-node__children.is-open").count();
await toggle.click();
await page.waitForTimeout(150);
const afterToggle = await page.locator(".doc-node__children.is-open").count();
check("点击箭头可以折叠分支", afterToggle !== beforeToggle, `${beforeToggle} → ${afterToggle}`);

await page.locator('.doc__action[title="展开全部"]').first().click();
await page.waitForTimeout(150);
const afterExpandAll = await page.locator(".doc-node__children.is-open").count();
check("展开全部生效", afterExpandAll >= afterToggle, `${afterToggle} → ${afterExpandAll}`);

await shot(page, "10-document-tree");

await page.locator(".tree__node[data-id='redis-local']").click();
await page.locator(".tree__node[data-id='redis-local/db0']").click();
await page.waitForSelector(".grid__row--body", { timeout: 5000 });
const redisRows = await visibleRows();
check("Redis 渲染出键列表", redisRows > 0, `可见 ${redisRows} 行`);

await shot(page, "03-nosql");

// ---- 查询编辑器 ----
console.log("\n[6] 查询编辑器");
await page.locator(".tree__search input").fill("");
await page.locator('button[title*="打开查询"]').first().click();
await page.waitForSelector(".query__input", { timeout: 5000 });
check("查询编辑器已打开", (await page.locator(".query__input").count()) === 1);

const keywords = await page.locator(".query__code .tok-keyword").count();
check("SQL 关键字有语法着色", keywords > 0, `${keywords} 个关键字 token`);

const lineNumbers = await page.locator(".query__line-number").count();
check("编辑器有行号", lineNumbers > 0, `${lineNumbers} 行`);

// 执行正常示例
await page.locator(".btn--primary", { hasText: "执行" }).click();
await page.waitForTimeout(300);
check("执行后没有错误条", (await page.locator(".query__error").count()) === 0);
const queryRows = await page.locator(".grid__row--body").count();
check("执行后渲染出结果集", queryRows > 0, `${queryRows} 行`);
await shot(page, "07-query");

// 执行错误示例:验证错误定位
await page.locator(".btn--ghost", { hasText: "错误示例" }).click();
await page.waitForTimeout(150);
await page.locator(".btn--primary", { hasText: "执行" }).click();
await page.waitForTimeout(300);
check("错误示例给出错误条", (await page.locator(".query__error").count()) === 1);
const errorText = (await page.locator(".query__error").textContent()) ?? "";
check("错误信息指出不存在的表", errorText.includes("does not exist"), errorText.trim().slice(0, 60));
const errorMarks = await page.locator(".tok--error").count();
check("出错的片段被标红", errorMarks > 0, `${errorMarks} 处`);
await shot(page, "08-query-error");

// ---- 命令面板 ----
console.log("\n[7] 命令面板");
await page.keyboard.press("Meta+k");
await page.waitForTimeout(250);
check("⌘K 打开命令面板", (await page.locator(".palette").count()) === 1);

await page.locator(".palette__input").fill("order");
await page.waitForTimeout(250);
const hits = await page.locator(".palette__item").count();
check("面板能模糊匹配对象", hits > 0, `匹配 ${hits} 项`);

const marks = await page.locator(".palette__item mark").count();
check("命中字符高亮", marks > 0, `${marks} 处`);

await page.keyboard.press("ArrowDown");
await page.waitForTimeout(120);
const activeIndex = await page.evaluate(
  () => [...document.querySelectorAll(".palette__item")].findIndex((el) => el.classList.contains("is-active")),
);
check("方向键移动选中项", activeIndex >= 0, `选中第 ${activeIndex + 1} 项`);

await shot(page, "09-palette");

await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("Esc 关闭面板", (await page.locator(".palette").count()) === 1 && (await page.locator(".palette__overlay:not([hidden])").count()) === 0);

// ---- 主题与密度 ----
console.log("\n[8] 主题与密度");
await page.locator(".tree__search input").fill("");
await page.evaluate(() => {
  localStorage.setItem("seladb.ui.theme", "dark");
});
await page.reload({ waitUntil: "networkidle" });
const darkTheme = await page.evaluate(() => document.body.dataset.theme);
check("主题可持久化为深色", darkTheme === "dark", `实际 ${darkTheme}`);
await shot(page, "04-workbench-dark");

await page.evaluate(() => {
  localStorage.setItem("seladb.ui.density", "compact");
});
await page.reload({ waitUntil: "networkidle" });
const density = await page.evaluate(() => document.body.dataset.density);
check("密度可持久化为紧凑", density === "compact", `实际 ${density}`);

await page.evaluate(() => {
  localStorage.clear();
});

// ---- 表结构视图 ----
console.log("\n[9] 表结构视图");
await page.locator(".tree__node[data-id='pg-local']").click();
await page.locator(".tree__node[data-id='pg-local/postgres']").click();
await page.locator(".tree__node[data-id='pg-local/postgres/public']").click();
await page.locator(".tree__node[data-id='pg-local/postgres/public/users']").click();
await page.waitForSelector(".subtab", { timeout: 5000 });

const modes = await page.locator(".subtab").allTextContents();
check(
  "表编辑器是单一标签行(数据/列/索引/约束/外键/DDL)",
  modes.length === 6,
  modes.join(" / "),
);

await page.locator('.subtab[data-mode="columns"]').click();
await page.waitForTimeout(250);
const columnRows = await page.locator(".struct-panel:not([hidden]) .struct-table tbody tr").count();
check("列分面渲染出列定义", columnRows > 0, `${columnRows} 行`);

const structRows = await page.locator(".struct-panel:not([hidden]) .struct-table tbody tr").count();
check("列出列定义", structRows > 0, `${structRows} 行`);

const pkBadges = await page.locator(".struct-key--pk").count();
check("主键有标识", pkBadges > 0, `${pkBadges} 处`);

await shot(page, "11-structure");

// DDL
await page.locator('.subtab[data-mode="ddl"]').click();
await page.waitForTimeout(250);
const ddlText = (await page.locator(".struct-ddl__code").textContent()) ?? "";
check("DDL 预览有内容", ddlText.includes("CREATE TABLE"), ddlText.split("\n")[0]);
check("DDL 带语法着色", (await page.locator(".struct-ddl__code .tok-keyword").count()) > 0);
const ddlBadge = await page.locator(".struct-ddl__head .engine-badge").textContent();
check("DDL 标出引擎方言", (ddlBadge ?? "").includes("PostgreSQL"), ddlBadge?.trim());
await shot(page, "12-ddl");

// ---- 右键菜单与确认框 ----
console.log("\n[10] 右键菜单与确认框");
await page.locator('.subtab[data-mode="data"]').click();
await page.locator(".tree__node[data-id='pg-local/postgres/public/orders']").click({ button: "right" });
await page.waitForSelector(".menu", { timeout: 3000 });

const menuLabels = await page.locator(".menu__item").allTextContents();
check("菜单有打开数据/结构/DDL", ["打开数据", "查看结构", "生成 DDL"].every((l) => menuLabels.includes(l)), menuLabels.join(" / "));
check("菜单项不重复", new Set(menuLabels).size === menuLabels.length, menuLabels.join(" / "));
await shot(page, "13-context-menu");

await page.locator(".menu__item", { hasText: "删除表" }).click();
await page.waitForSelector(".dialog", { timeout: 3000 });
const dialogText = (await page.locator(".dialog__message").textContent()) ?? "";
check("删除走确认框", dialogText.includes("orders"), dialogText.trim().slice(0, 40));
await page.locator(".dialog__foot .btn--danger").click();
await page.waitForTimeout(300);
check("确认后有 Toast 反馈", (await page.locator(".toast").count()) > 0);

// ---- Redis 值编辑器 ----
console.log("\n[11] Redis 值编辑器");
await page.locator(".tree__node[data-id='redis-local']").click();
await page.locator(".tree__node[data-id='redis-local/db0']").click();
await page.waitForSelector(".grid__row--body", { timeout: 5000 });
await page.locator(".grid__row--body").first().click();
await page.waitForSelector(".value-editor", { timeout: 3000 });
check("点键打开值编辑器", (await page.locator(".value-editor").count()) === 1);
const typeLabel = (await page.locator(".value-editor__type").textContent()) ?? "";
check("值编辑器标出类型", typeLabel.length > 0, typeLabel.trim());
await shot(page, "14-value-editor");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

// ---- 连接向导 ----
console.log("\n[12] 连接向导");
await page.goto(`${BASE}#/connect`, { waitUntil: "networkidle" });
await page.waitForSelector(".engine-card", { timeout: 5000 });
check("向导第一步列出六种引擎", (await page.locator(".engine-card").count()) === 6);

const cardIcons = await page.locator(".engine-card .icon--engine").count();
check("六个引擎卡片各带专属图标", cardIcons === 6, `实际 ${cardIcons}`);

const allHaveIcon = await page.evaluate(() =>
  ["postgresql", "mysql", "sqlite", "mongodb", "redis", "sqlserver"].every((id) =>
    hasEngineIcon(id),
  ),
);
check("六种引擎都定义了专属图标", allHaveIcon);

await page.locator(".engine-card").first().click();
await page.locator(".btn--primary", { hasText: "下一步" }).click();
await page.waitForSelector(".field", { timeout: 3000 });
const fieldCount = await page.locator(".field").count();
check("第二步是参数表单", fieldCount > 0, `${fieldCount} 个字段`);
check("表单含密码输入", (await page.locator('input[type="password"]').count()) > 0);
check("表单含开关控件", (await page.locator(".switch__input").count()) > 0);
await shot(page, "15-connect");

// ---- 其他路由 ----
console.log("\n[13] 路由");
for (const [route, selector] of [
  ["/entry", ".entry__card"],
  ["/spec", ".swatches"],
  ["/connect", ".engine-card"],
  ["/settings", ".setting-row"],
]) {
  await page.goto(`${BASE}#${route}`, { waitUntil: "networkidle" });
  const count = await page.locator(selector).count();
  check(`${route} 渲染正常`, count > 0, `命中 ${count}`);
}

// 恢复默认偏好(浅色、舒适密度)再拍规范页
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.goto(`${BASE}#/spec`, { waitUntil: "networkidle" });
await page.waitForSelector(".swatches", { timeout: 5000 });
await shot(page, "05-spec");

await page.goto(`${BASE}#/entry`, { waitUntil: "networkidle" });
await page.waitForSelector(".entry__card", { timeout: 5000 });
await shot(page, "06-entry");

// ---- 控制台 ----
console.log("\n[14] 控制台");
check("无控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();

console.log(`\n结果:${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
  console.log("失败项:");
  for (const r of results.filter((r) => !r.ok)) console.log(`  - ${r.name} ${r.detail}`);
  process.exit(1);
}
