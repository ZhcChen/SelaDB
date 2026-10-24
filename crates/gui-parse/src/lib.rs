//! # gui-parse —— 源语言解析器
//!
//! 把 HTML / CSS / JS 解析成 [`gui_ir`] 的 IR。**这一层只管语法，不管语义。**
//!
//! ## 三个解析器
//!
//! | 源 | 产出 | 依赖 |
//! |---|---|---|
//! | HTML | [`gui_ir::node::NodeTree`] | 手写（HTML 子集小，见下） |
//! | CSS | [`gui_ir::style::StyleSheet`] | `cssparser` 0.38（**MPL-2.0，待拍板**） |
//! | JS | AST → 逻辑绑定 | `swc` 系列（**Apache-2.0**，待核实） |
//!
//! ## HTML 子集有多小（2026-10-24 实测）
//!
//! `scripts/probe-html-subset.mjs` 的结论：设计源**没有可吃的静态 HTML** ——
//! 静态标签只有 13 个（9 个是文档壳），真正可吃的界面元素只有 1 个
//! `<div id="app">`；界面是 JS 造的（364 次 `createElement`）。
//!
//! 这不改变设计 —— 设计源是浏览器里的「假后端 + 逻辑层」，Rust 实现侧是
//! 「真后端 + 声明层」。但它说明：**HTML 解析器要支持的是我们自己写的
//! 模板，不是设计源。** 子集边界由我们自己定，可以比 HTML 小得多。
//!
//! ## 不支持的东西要报错，不能忽略
//!
//! 解析遇到不认识的东西 → 记进 [`gui_ir::style::StyleSheet::unsupported`] →
//! **编译失败**。这是 §1.3「完备性验收：未支持属性 = 0」的落地点。

pub mod css;
pub mod html;
pub mod js;
