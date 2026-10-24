/**
 * 探针：哪些 JS 构造在 Rust 里会「咬人」。
 *
 * 上一个探针量的是「用了哪些语言特性」。这个量的是「特性用在哪」——
 * 因为同样的语法，出现在不同位置，翻译难度差一个数量级。
 *
 * 关键区分：
 *   - 箭头函数捕获**不可变**外部值  → Rust 闭包，直接翻
 *   - 箭头函数捕获**可变**外部值  → Rust 要 &mut 生命周期标注，可能咬人
 *   - class 字段在构造器里赋值      → Rust 要 &mut self
 *   - this                          → Rust 的 self
 *   - 局部 let（会被改）            → Rust 要 let mut
 */
import { readFile } from "node:fs/promises";

const root = "/Users/chen/code/SelaDB/ui/assets";
const files = [
  "app.js", "datagrid.js", "tree.js", "document-tree.js", "structure-view.js",
  "value-editor.js", "query-editor.js", "menu.js", "command-palette.js",
  "ui-kit.js", "icons.js", "engine-icons.js", "mock-data.js", "mock-sql.js", "main.js",
];
const src = (await Promise.all(files.map((f) => readFile(`${root}/${f}`, "utf8")))).join("\n");

const count = (re) => (src.match(re) ?? []).length;

console.log("=== Rust 里最容易咬人的构造 ===");
const hostile = [
  ["this.",            /\bthis\./g, "→ Rust 的 self（类方法内）"],
  ["this 整体传参",     /[^.\w]this[,\s\)]/g, "→ self 的所有权/借用"],
  ["局部 let/var",     /\b(?:let|var)\s+[A-Za-z_$][\w$]*/g, "→ Rust 要 let mut（若会被改）"],
  ["赋值给外层变量",    /^\s*([A-Za-z_$][\w$]*)\s*(?:\+\+|--|[+\-*/]?=)/gm, "→ 闭包捕获可变状态"],
  ["class 字段声明",    /^\s{4,}(?:static\s+)?#?[A-Za-z_$][\w$]*\s*=\s*[^=]/gm, "→ 结构体字段"],
  ["this.x = 赋值",    /\bthis\.([A-Za-z_$][\w$]*)\s*=/g, "→ &mut self"],
  ["++ / --",          /\+\+|--/g, "→ Rust 无 ++/--，要改写"],
  ["arguments",        /\barguments\b/g, "→ Rust 无 arguments 对象"],
  ["闭包内 this",      /=>\s*\{[^}]*\bthis\b/g, "→ 闭包捕获 self 的借用"],
  ["for 循环内闭包",    /for\s*\([^)]*\)\s*\{[^}]*=> /g, "→ 循环体内闭包捕获"],
  ["try 内 await",    /catch[\s\S]{0,80}await/g, "→ 异常与异步交叉"],
  ["原型/继承",        /\bObject\.(assign|create)\b|\.prototype\b/g, "→ Rust 无原型链"],
];
for (const [name, re, note] of hostile) {
  const n = count(re);
  console.log(`  ${name.padEnd(20)}${String(n).padStart(4)}  ${n ? "⚠" : "·"} ${note}`);
}

// 局部可变变量的粗略比例：局部 let 总数 vs 顶层 let
const topLevelLets = count(/^(?:const|let|var)\s+/gm);
const allLets = count(/\b(?:let|var)\s+[A-Za-z_$][\w$]*/g);
console.log(`\n  顶层 const/let/var: ${topLevelLets}   全部: ${allLets}   → 局部占比 ${(((allLets - topLevelLets) / Math.max(1, allLets)) * 100).toFixed(0)}%`);

// 类的形状
console.log("\n=== class 的形状（Rust 结构体对照）===");
const classes = [...src.matchAll(/class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$]*))?\s*\{/g)];
console.log(`  class 总数: ${classes.length}`);
for (const m of classes.slice(0, 14)) {
  const start = m.index;
  const body = src.slice(start, src.indexOf("\n}", start) + 2);
  const fields = (body.match(/^\s+(?:static\s+)?#?[A-Za-z_$][\w$]*\s*[=;]/gm) ?? []).length;
  const methods = (body.match(/^\s{4,}[A-Za-z_$][\w$]*\s*\(/gm) ?? []).length;
  console.log(`    ${m[1].padEnd(26)}${m[2] ? "extends " + m[2] : "".padEnd(12)}  字段 ${fields}  方法 ${methods}`);
}
