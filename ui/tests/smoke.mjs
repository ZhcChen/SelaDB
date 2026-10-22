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

import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.SELA_DB_UI_URL ?? "http://127.0.0.1:8030";
const here = dirname(fileURLToPath(import.meta.url));
const shotDir = join(here, "screenshots");

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
await page.goto(`${BASE}/#/design`, { waitUntil: "networkidle" });
await page.waitForSelector(".tree__node", { timeout: 10000 });

const connectionNodes = await page.locator(".tree__node[data-kind='connection']").count();
check("对象树渲染出 4 个连接", connectionNodes === 4, `实际 ${connectionNodes}`);

const engineDots = await page.locator(".tree__engine-dot").count();
check("连接节点带引擎色条", engineDots === 4, `实际 ${engineDots}`);

await shot(page, "01-workbench-light");

// ---- 展开并打开表 ----
console.log("\n[2] 对象树与 Tab");
await page.locator(".tree__node[data-id='pg-local']").click();
await page.locator(".tree__node[data-id='pg-local/postgres']").click();
await page.locator(".tree__node[data-id='pg-local/postgres/public']").click();
await page.locator(".tree__node[data-id='pg-local/postgres/public/users']").click();

const tabs = await page.locator(".tab").count();
check("点击表后打开一个 Tab", tabs === 1, `实际 ${tabs}`);

const tabEngine = await page.locator(".tab__engine").first().textContent();
check("Tab 带引擎标识", (tabEngine ?? "").trim().length > 0, `标识 "${tabEngine?.trim()}"`);

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

const engines = await page.locator(".tab__engine").allTextContents();
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

await page.locator(".doc__action", { hasText: "展开全部" }).first().click();
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
await page.locator("button", { hasText: "打开查询" }).first().click();
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

// ---- 其他路由 ----
console.log("\n[9] 路由");
for (const [route, selector] of [
  ["#/entry", ".entry__card"],
  ["#/spec", ".swatches"],
  ["#/connect", ".engine-card"],
  ["#/settings", ".setting-row"],
]) {
  await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
  const count = await page.locator(selector).count();
  check(`${route} 渲染正常`, count > 0, `命中 ${count}`);
}

// 恢复默认偏好(浅色、舒适密度)再拍规范页
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.goto(`${BASE}/#/spec`, { waitUntil: "networkidle" });
await page.waitForSelector(".swatches", { timeout: 5000 });
await shot(page, "05-spec");

await page.goto(`${BASE}/#/entry`, { waitUntil: "networkidle" });
await page.waitForSelector(".entry__card", { timeout: 5000 });
await shot(page, "06-entry");

// ---- 控制台 ----
console.log("\n[10] 控制台");
check("无控制台错误", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

await browser.close();

console.log(`\n结果:${results.length - failures}/${results.length} 通过`);
if (failures > 0) {
  console.log("失败项:");
  for (const r of results.filter((r) => !r.ok)) console.log(`  - ${r.name} ${r.detail}`);
  process.exit(1);
}
