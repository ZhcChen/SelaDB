//! # gui-codegen —— AOT 代码生成（发布期）
//!
//! 把 IR 翻译成 **Rust 源码**。
//!
//! ## 「翻译」不是「转译」
//!
//! 转译（transpile）是逐行换皮：JS 的 `x++` 变成 Rust 的 `x++`（不存在）。
//! 翻译（translate）是**语义等价**：JS 的 `x++` 变成 Rust 的 `x += 1`。
//! 产物是**读得懂、能断点、能进 profiler 的 Rust 代码**，不是机器码。
//!
//! ## 为什么发布期要 AOT
//!
//! 发布产物里**没有 JS 引擎、没有 HTML 解析器、没有 DOM**。逻辑层必须变成
//! Rust 代码。这是「HTML/CSS/JS 是源语言」这个选择的直接后果。
//!
//! ## 最大的风险点（2026-10-24 实测）
//!
//! 设计源 8362 行 JS 的特性面（`scripts/probe-js-subset.mjs`）：
//!
//! | 构造 | 次数 | 难度 |
//! |---|---|---|
//! | `++` / `--` | 2041 | 机械改写 |
//! | `this.` | 753 | → `self` |
//! | `this.x =` | 177 | → `&mut self` |
//! | 私有字段 `#` | 234 | → 命名约定 |
//! | 闭包捕获可变外层变量 | **69** | ⚠ **要 `&mut` 生命周期标注** |
//! | 标签模板 | **40** | ⚠ **要转成 Rust 宏** |
//!
//! 而**四个无底洞全是 0**：生成器、Proxy/Reflect、Symbol、eval/new Function。
//! 正则 87 条里 lookaround / 反向引用 / 命名组也全是 0 —— 全部落在
//! Rust `regex` crate 支持范围内。
//!
//! 详见 [`docs/gui-source-language.md`](../../docs/gui-source-language.md)。

pub mod emit;
pub mod jsast;
