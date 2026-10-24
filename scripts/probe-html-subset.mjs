/**
 * 探针：设计源实际用到的 HTML 子集与 DOM API 面。
 *
 * 目的：给「Rust 引擎吃 HTML/CSS」这条路线划出子集边界。
 * 跟 CSS 子集那轮（gui-core-plan §5.1）同一种做法 —— 先量，
 * 再决定实现哪些；不靠想象。
 *
 * 量三样：
 *   1. 标签白名单   —— 静态 HTML 里的 + JS 里 createElement 的
 *   2. 属性集       —— 静态的 + JS setAttribute 的
 *   3. DOM API 面   —— JS 实际调用的浏览器 API（决定 IR 要提供什么）
 */
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";

const dir = "/Users/chen/code/SelaDB/ui/assets";
const files = [
  "index.html",
  "assets/app.js", "assets/datagrid.js", "assets/tree.js", "assets/document-tree.js",
  "assets/structure-view.js", "assets/value-editor.js", "assets/query-editor.js",
  "assets/menu.js", "assets/command-palette.js", "assets/ui-kit.js",
  "assets/icons.js", "assets/engine-icons.js", "assets/mock-data.js", "assets/mock-sql.js",
  "assets/main.js",
];

const texts = {};
for (const f of files) {
  try { texts[f] = await readFile(`/Users/chen/code/SelaDB/ui/${f}`, "utf8"); }
  catch { /* 缺文件就跳过 */ }
}
const html = texts["index.html"] ?? "";
const jsAll = Object.entries(texts)
  .filter(([k]) => k.endsWith(".js"))
  .map(([, v]) => v)
  .join("\n");

// ---------------------------------------------------------------- 1. 标签
const staticTags = new Map();
for (const m of html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*?)?>/g)) {
  const t = m[1].toLowerCase();
  staticTags.set(t, (staticTags.get(t) ?? 0) + 1);
}
// 去掉自闭合与注释里的误匹配
for (const t of ["br", "hr", "img", "input", "meta", "link", "source"]) {
  if (!staticTags.has(t)) continue;
}

// JS 里 createElement / innerHTML 造出来的
const jsTags = new Map();
for (const m of jsAll.matchAll(/createElement\(["']([a-zA-Z][a-zA-Z0-9-]*)["']\)/g)) {
  const t = m[1].toLowerCase();
  jsTags.set(t, (jsTags.get(t) ?? 0) + 1);
}
for (const m of jsAll.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)[^>]*>/g)) {
  const t = m[1].toLowerCase();
  jsTags.set(t, (jsTags.get(t) ?? 0) + 1);
}
for (const m of jsAll.matchAll(/<\/\s*([a-zA-Z][a-zA-Z0-9-]*)\s*>/g)) {
  const t = m[1].toLowerCase();
  jsTags.set(t, (jsTags.get(t) ?? 0) + 1);
}

const allTags = new Map();
for (const [t, n] of staticTags) allTags.set(t, (allTags.get(t) ?? 0) + n);
for (const [t, n] of jsTags) allTags.set(t, (allTags.get(t) ?? 0) + n);
console.log("=== 标签白名单（静态 + JS 构造）===");
console.log(
  [...allTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t}:${n}`)
    .join("  "),
);
console.log(`  合计 ${allTags.size} 种`);

// ------------------------------------------------------------ 2. 属性
const staticAttrs = new Set();
for (const m of html.matchAll(/\s([a-zA-Z-]+)(?:=|\s|>)/g)) staticAttrs.add(m[1].toLowerCase());
const jsAttrs = new Set();
for (const m of jsAll.matchAll(/setAttribute\(["']([a-zA-Z-]+)["']/g)) jsAttrs.add(m[1].toLowerCase());
const dynAttrs = new Set();
for (const m of jsAll.matchAll(/\.setAttribute\(\s*`([a-zA-Z-]+)\$/g)) dynAttrs.add(m[1].toLowerCase());
const allAttrs = new Set([...staticAttrs, ...jsAttrs, ...dynAttrs]);
console.log("\n=== 属性集 ===");
console.log("  " + [...allAttrs].sort().join(" "));
console.log(`  合计 ${allAttrs.size} 种`);

// --------------------------------------------------- 3. DOM API 面
const API = [
  "createElement", "createTextNode", "createDocumentFragment",
  "appendChild", "append", "prepend", "insertBefore", "replaceChild", "remove", "removeChild",
  "querySelector", "querySelectorAll", "getElementById", "getElementsByClassName", "closest", "matches",
  "classList", "dataset", "setAttribute", "getAttribute", "removeAttribute", "hasAttribute", "toggleAttribute",
  "addEventListener", "removeEventListener", "dispatchEvent",
  "innerHTML", "outerHTML", "textContent", "innerText",
  "style", "getComputedStyle", "offsetWidth", "offsetHeight", "clientWidth", "clientHeight",
  "scrollTop", "scrollLeft", "scrollWidth", "scrollHeight", "scrollIntoView",
  "getBoundingClientRect", "insertAdjacentHTML",
  "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "setInterval",
  "MutationObserver", "ResizeObserver", "IntersectionObserver",
  "cloneNode", "replaceWith", "contains", "compareDocumentPosition",
  "document.body", "document.documentElement", "document.createElement", "window.",
];
const counts = [];
for (const api of API) {
  const n = (jsAll.match(new RegExp(api.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
  if (n) counts.push([api, n]);
}
counts.sort((a, b) => b[1] - a[1]);
console.log("\n=== DOM / 浏览器 API 调用面（JS 里出现的）===");
for (const [api, n] of counts) console.log(`  ${api.padEnd(26)} ${n}`);
console.log(`  合计 ${counts.length} 种`);

// ----------------------------------------- 4. 内联事件与全局脚本
const inlineHandlers = [...html.matchAll(/\son([a-zA-Z]+)\s*=/g)].map((m) => m[1]);
console.log("\n=== index.html 里的内联事件属性 ===");
console.log("  " + (inlineHandlers.length ? inlineHandlers.join(" ") : "(无)"));
const scriptTags = [...html.matchAll(/<script[^>]*>/g)].length;
console.log(`  <script> 标签数: ${scriptTags}`);
const styleTags = [...html.matchAll(/<style[^>]*>/g)].length;
console.log(`  <style> 标签数: ${styleTags}`);
