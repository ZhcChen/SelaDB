/**
 * 探针：「JS → Rust」这条 AOT 翻译路径需要支持的语言特性面。
 *
 * 前提（2026-10-24 定的架构）：HTML/CSS/JS 是源语言，最终 AOT 翻译成 Rust，
 * 发布产物里没有 JS 引擎。所以要问的是：**设计源实际用到的 JS 特性有多少？**
 *
 * 跟 CSS 子集那轮同一种做法 —— 先量，不猜。
 */
import { readFile } from "node:fs/promises";

const root = "/Users/chen/code/SelaDB/ui/assets";
const files = [
  "app.js", "datagrid.js", "tree.js", "document-tree.js", "structure-view.js",
  "value-editor.js", "query-editor.js", "menu.js", "command-palette.js",
  "ui-kit.js", "icons.js", "engine-icons.js", "mock-data.js", "mock-sql.js", "main.js",
];
const src = (await Promise.all(files.map((f) => readFile(`${root}/${f}`, "utf8")))).join("\n");

// 每个特性：[名字, 正则, 判定说明]
const FEATURES = [
  ["函数声明",        /\bfunction\s+[A-Za-z_$][\w$]*\s*\(/g, "普通函数"],
  ["箭头函数",        /=>/g, "=> 表达式"],
  ["class 声明",      /\bclass\s+[A-Za-z_$][\w$]*/g, "class + 继承 + 方法"],
  ["class 继承",      /\bextends\s+[A-Za-z_$]/g, "extends"],
  ["构造器",          /\bconstructor\s*\(/g, "constructor(){}"],
  ["getter/setter",   /\b(get|set)\s+[A-Za-z_$][\w$]*\s*\(/g, "对象存取器"],
  ["静态方法",        /\bstatic\s+[A-Za-z_$]/g, "static"],
  ["私有字段 #",      /#[A-Za-z_$][\w$]*/g, "ES2022 私有字段"],
  ["模板字符串",      /`[^`]*\$\{/g, "`…${…}`"],
  ["解构 声明",       /\b(?:const|let|var)\s*[\[{]/g, "const {a} = …"],
  ["解构 赋值",       /\(\s*\{[^}]*\}\s*\)\s*=>/g, "参数解构"],
  ["数组解构",       /\[\s*[^\]]*,\s*[^\]]*\]\s*=\s*/g, "const [a,b] = …"],
  ["展开 ...",        /\.\.\./g, "…rest / …spread"],
  ["可选链 ?.",       /\?\./g, "a?.b"],
  ["空值合并 ??",     /\?\?/g, "a ?? b"],
  ["逻辑赋值 ||= &&= ??=",  /(\|\|=|&&=|\?\?=)/g, "a ||= b"],
  ["async 函数",      /\basync\s+(function|\()/g, "async function"],
  ["await",           /\bawait\s+/g, "await expr"],
  ["Promise",         /\bnew Promise\b|\.then\(|\.catch\(/g, "Promise"],
  ["async/迭代器",     /\bfor\s+await\b/g, "for await"],
  ["生成器 yield",    /\bfunction\s*\*|\byield\b/g, "function* / yield"],
  ["Proxy/Reflect",   /\bnew Proxy\b|\bReflect\./g, "Proxy / Reflect"],
  ["Symbol",          /\bSymbol\./g, "Symbol.xxx"],
  ["Map / Set",       /\bnew (Map|Set|WeakMap|WeakSet)\b/g, "Map/Set"],
  ["正则字面量",      /\/[^/\n]+\/[gimsuyd]*/g, "/re/flags"],
  ["标签模板",        /\b[A-Za-z_$][\w$]*`/g, "tag`…`"],
  ["try/catch/finally", /\btry\s*\{/g, "try"],
  ["throw",           /\bthrow\s+/g, "throw"],
  ["typeof/instanceof", /\b(typeof|instanceof)\b/g, "typeof / instanceof"],
  ["delete",          /\bdelete\s+[A-Za-z_$]/g, "delete obj.x"],
  ["in 运算符",       /\bin\s+[A-Za-z_$]/g, "'x' in obj"],
  ["with",            /\bwith\s*\(/g, "with (obj) {}"],
  ["void",            /\bvoid\s+/g, "void 0"],
  ["标签语句",        /^\s*[A-Za-z_$][\w$]*:\s*$/gm, "label:"],
  ["switch",          /\bswitch\s*\(/g, "switch"],
  ["for 传统",        /\bfor\s*\(\s*(let|var)\b/g, "for (let i…)"],
  ["for-of",          /\bfor\s*\(\s*(const|let|var)?\s*[\[\w$]+\s+of\b/g, "for (x of y)"],
  ["for-in",          /\bfor\s*\(\s*(const|let|var)?\s*[\[\w$]+\s+in\b/g, "for (x in y)"],
  ["do-while",        /\bdo\s*\{/g, "do {} while"],
  ["三元",            /\?[^:?\n]{1,40}:/g, "a ? b : c"],
  ["箭头简写返回",    /=>\s*\{?\s*return\b/g, "=> { return }"],
  ["数字分隔符",      /\b\d+_\d/g, "1_000"],
  ["BigInt",          /\bBigInt\b|\d+n\b/g, "BigInt"],
  ["可选 catch 绑定",  /\bcatch\s*\{/g, "catch {}"],
  ["Object.entries",  /\bObject\.(entries|values|assign|fromEntries)\b/g, "Object.*"],
  ["Array.from",      /\bArray\.(from|of)\b/g, "Array.from"],
  ["structuredClone", /\bstructuredClone\b/g, "structuredClone"],
  ["globalThis",      /\bglobalThis\b/g, "globalThis"],
  ["eval",            /\beval\s*\(/g, "eval()"],
  ["new Function",    /\bnew Function\b/g, "new Function()"],
];

console.log("=== JS 特性使用面（设计源 15 个文件，8362 行）===");
console.log("  特性".padEnd(22) + "次数   说明");
const rows = [];
for (const [name, re] of FEATURES) {
  const n = (src.match(re) ?? []).length;
  rows.push([name, n]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [name, n] of rows) {
  const mark = n === 0 ? "·" : " ";
  console.log(`  ${name.padEnd(22)}${String(n).padStart(4)}  ${mark}`);
}
const used = rows.filter((r) => r[1] > 0).length;
console.log(`\n  用到的特性: ${used} / ${FEATURES.length} 种`);

// 模块系统
console.log("\n=== 模块系统 ===");
const esm = (src.match(/^\s*(import|export)\s/gm) ?? []).length;
console.log(`  ES module 语法: ${esm} 处（0 = 全部靠全局，file:// 下 CORS 限制所致）`);
const iife = (src.match(/\(\s*function\s*\(\s*\)\s*\{|^\s*\(function\s*\(\)/gm) ?? []).length;
console.log(`  IIFE 包裹: ${iife} 处`);

// 闭包与作用域
console.log("\n=== 作用域复杂度 ===");
const closures = (src.match(/=>/g) ?? []).length;
const nested = (src.match(/\bfunction\b[^{]*\{[^}]*\{[^}]*\{/g) ?? []).length;
console.log(`  箭头函数(闭包): ${closures}`);
console.log(`  三层以上嵌套函数定义: ${nested}`);

// 全局污染面
console.log("\n=== 全局污染面（逻辑层往全局写了什么）===");
const assigns = new Map();
for (const m of src.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) {
  assigns.set(m[1], (assigns.get(m[1]) ?? 0) + 1);
}
console.log(`  顶层定义: ${assigns.size} 个名字`);
// 重复定义 = 覆盖
const dup = [...assigns.entries()].filter(([, n]) => n > 1);
console.log(`  跨文件重名(会互相覆盖): ${dup.length} 个`);
for (const [n, c] of dup.slice(0, 12)) console.log(`    ${n} × ${c}`);
