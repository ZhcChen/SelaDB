/**
 * 探针：JS 正则的特性面 —— 判断能否直译到 Rust `regex` crate。
 *
 * Rust 的 `regex` crate 明确不支持：lookahead、lookbehind、反向引用、
 * 命名组、原子组、条件匹配。设计源里这些全为 0，就说明正则可以直译。
 *
 * 用法:node scripts/probe-regex.mjs
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "..", "ui", "assets");

const files = [
  "app.js", "datagrid.js", "tree.js", "document-tree.js", "structure-view.js",
  "value-editor.js", "query-editor.js", "menu.js", "command-palette.js",
  "ui-kit.js", "icons.js", "engine-icons.js", "mock-data.js", "mock-sql.js", "main.js",
];

const src = (await Promise.all(files.map((f) => readFile(join(assets, f), "utf8")))).join("\n");

// 正则字面量：/.../flags。排除 SVG 片段（含 < 或 path）。
const RX = /(?<![/\w])\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n<>])+\/([gimsuyvd]*)/g;
const all = [];
const perFile = [];
for (const f of files) {
  const s = await readFile(join(assets, f), "utf8");
  const got = [];
  for (const m of s.matchAll(RX)) {
    if (m[0].includes("<") || m[0].includes("path")) continue;
    got.push(m[0]);
  }
  perFile.push([f, got.length]);
  all.push(...got);
}

console.log("=== 真正的 JS 正则字面量 ===");
for (const [f, n] of perFile.sort((a, b) => b[1] - a[1])) {
  if (n) console.log(`  ${f.padEnd(24)}${n}`);
}
console.log(`  合计 ${all.length} 处`);

const UNSUPPORTED = [
  ["lookahead", /\(\?=[^)]|\(\?![^=)]/],
  ["lookbehind", /\(\?<[=!]/],
  ["反向引用", /\\[1-9]/],
  ["命名组", /\(\?<[A-Za-z_]/],
  ["原子组", /\(\?>/],
  ["条件匹配", /\(\?\(|\(\?\(/],
  ["Unicode 属性", /\\p\{/],
];

console.log("\n=== Rust regex crate 不支持的特性 ===");
let bad = 0;
for (const [name, re] of UNSUPPORTED) {
  const hits = all.filter((r) => re.test(r));
  bad += hits.length;
  console.log(`  ${name.padEnd(14)}${String(hits.length).padStart(4)}  ${hits.length ? "需转译" : "无"}`);
  for (const h of hits.slice(0, 3)) console.log(`      ${h.slice(0, 100)}`);
}
console.log(`\n  需特殊处理: ${bad} / ${all.length} 条`);
console.log(bad === 0 ? "  → 全部落在 Rust regex crate 支持范围内，可直接映射" : "  → 需要转译策略");
