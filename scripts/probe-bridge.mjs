/**
 * 探针：「对象」接口面 —— Rust 要提供给 JS 的东西，已经被设计源定义好了。
 *
 * 前提：设计源是浏览器里的「假后端 + 逻辑层」。它把后端能力放在
 * mock-data.js / mock-sql.js 的全局里，JS 逻辑层直接调这些全局。
 * SelaDB 的 Rust 引擎要提供的是**同一套名字**，只是实现换成 Rust。
 *
 * 所以这个探针量的是：mock 层定义了哪些全局、逻辑层实际引用了哪些。
 * 差集 = mock 里有但逻辑层没用的 = Rust 侧可以先不做。
 */
import { readFile } from "node:fs/promises";

const root = "/Users/chen/code/SelaDB/ui";
const read = async (f) => (await readFile(`${root}/${f}`, "utf8"));

const MOCKS = ["assets/mock-data.js", "assets/mock-sql.js"];
const LOGIC = [
  "assets/app.js", "assets/datagrid.js", "assets/tree.js", "assets/document-tree.js",
  "assets/structure-view.js", "assets/value-editor.js", "assets/query-editor.js",
  "assets/menu.js", "assets/command-palette.js", "assets/ui-kit.js", "assets/main.js",
  "assets/icons.js", "assets/engine-icons.js",
];

// mock 层定义的顶层名字
const defined = new Map(); // name -> {file, kind}
for (const f of MOCKS) {
  const s = await read(f);
  for (const m of s.matchAll(/^(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
    const kind = m[0].startsWith("function") || m[0].startsWith("class") || m[0].startsWith("async")
      ? "fn" : "data";
    defined.set(m[1], { file: f, kind });
  }
}
console.log(`=== mock 层定义的顶层名字：${defined.size} 个 ===`);
for (const [n, d] of [...defined].sort((a, b) => a[1].kind.localeCompare(b[1].kind) || a[0].localeCompare(b[0]))) {
  console.log(`  ${d.kind.padEnd(5)} ${n.padEnd(28)} ${d.file}`);
}

// 逻辑层实际引用了哪些
const used = new Map();
for (const f of LOGIC) {
  const s = await read(f);
  for (const [name] of defined) {
    const re = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, "\\$")}(?![\\w$])`);
    const n = (s.match(re) ?? []).length;
    if (n) used.set(name, (used.get(name) ?? 0) + n);
  }
}

// 逻辑层引用了、但 mock 层没定义的全局（说明 JS 侧还有别的依赖面）
const otherKnown = new Set([
  "AUI", "window", "document", "console", "Math", "JSON", "Object", "Array", "String",
  "Number", "Boolean", "Set", "Map", "Promise", "Date", "RegExp", "Error", "Symbol",
  "localStorage", "navigator", "requestAnimationFrame", "cancelAnimationFrame",
  "setTimeout", "clearTimeout", "setInterval", "clearInterval", "structuredClone",
  "performance", "URL", "Intl", "WeakMap", "WeakSet", "Proxy", "Reflect",
]);
console.log(`\n=== 逻辑层真正用到的 mock 全局：${used.size} 个 ===`);
for (const [n, c] of [...used].sort((a, b) => b[1] - a[1])) {
  const d = defined.get(n);
  console.log(`  ${d.kind.padEnd(5)} ${n.padEnd(28)} 引用 ${c} 次`);
}

const unused = [...defined.keys()].filter((n) => !used.has(n));
console.log(`\n=== mock 里有但逻辑层没用的（Rust 侧可以先不做）：${unused.length} 个 ===`);
console.log("  " + (unused.join(" ") || "(无)"));

// 逻辑层里对未定义全局的引用
const allLogic = (await Promise.all(LOGIC.map(read))).join("\n");
const known = new Set([...defined.keys(), ...otherKnown]);
const suspects = new Map();
for (const m of allLogic.matchAll(/(?<![.\w$])([A-Z][A-Z0-9_]{2,})(?![_\w$])/g)) {
  const n = m[1];
  if (!known.has(n)) suspects.set(n, (suspects.get(n) ?? 0) + 1);
}
console.log(`\n=== 逻辑层引用但 mock 层没提供的大写全局（可能是漏定义的依赖）：${suspects.size} 个 ===`);
for (const [n, c] of [...suspects].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${n.padEnd(30)} ${c} 次`);
}
