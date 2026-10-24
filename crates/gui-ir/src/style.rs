//! IR 的样式表。
//!
//! **这是「CSS 的解析产物」，不是计算样式。** 计算样式（每个节点最终
//! 用到的绝对值样式）在 `gui-core::style::ComputedStyle`。
//!
//! ## 三层
//!
//! ```text
//!   规则表    选择器 → 声明列表
//!   变量表    自定义属性的定义（tokens.css 的 233 个 token 在这里）
//!   主题      data-theme / data-density 的覆盖层
//! ```
//!
//! ## 设计源实际用到的子集
//!
//! 2026-10-24 实测（`scripts/probe-css-subset.mjs` 同类做法）：
//! 508 条声明组 / 528 条选择器。**子代组合器 `>`、通用兄弟 `~`、
//! `:not()`、`:nth-child()`、ID 选择器、`!important`、`calc()`、
//! `@media` / `@supports` / `@layer` / `@container` / `@import` / `@font-face`
//! 全是 0。** 所以「照抄 CSS」不是「实现 Blink」，是「实现一个 CSS 子集引擎」。
//!
//! 详见 [`docs/gui-source-language.md`](../../../docs/gui-source-language.md)。

use std::collections::BTreeMap;

/// 一条声明。`important` 保留在 IR 里（虽然设计源当前是 0 处）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Declaration {
    pub property: String,
    pub value: String,
    pub important: bool,
}

/// 一条规则。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Rule {
    pub selector: Selector,
    pub declarations: Vec<Declaration>,
}

/// 选择器。
///
/// 只支持设计源实际用到的形态：**类型 / 类 / 属性 / 伪类 / 后代组合**。
/// 不支持子代 `>`、通用兄弟 `~`、伪类函数 `:not()` —— 因为设计源里是 0，
/// 解析器遇到时应该报「不支持」而不是悄悄忽略。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Selector {
    /// 标签选择器（`div`）。
    Type(String),
    /// 类选择器（`.btn`）。
    Class(String),
    /// ID 选择器（`#main`）。设计源 0 处，但实现成本极低，留着。
    Id(String),
    /// 属性选择器（`[disabled]` / `[data-theme="dark"]`）。
    Attribute {
        name: String,
        /// `None` 表示无值形态（`[disabled]`）。
        value: Option<String>,
    },
    /// 伪类（`:hover` / `:focus-visible` / `:checked` / `:active` / `:disabled`）。
    PseudoClass(PseudoClass),
    /// 伪元素（`::before` / `::after` / `::placeholder`）。
    PseudoElement(String),
    /// 后代组合（`a b`）。
    Descendant(Box<Selector>, Box<Selector>),
    /// 逗号分隔的分组（解析时展开成多条 Rule，这里保留原样以便往返测试）。
    Group(Vec<Selector>),
}

/// 伪类。限定在设计源用到的那些。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PseudoClass {
    Hover,
    Focus,
    FocusVisible,
    Active,
    Checked,
    Disabled,
    Selected,
    LastChild,
}

/// 样式表。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StyleSheet {
    /// 规则。按源码顺序排列 —— 级联的「同特异性后来者胜」依赖顺序。
    pub rules: Vec<Rule>,
    /// 自定义属性（CSS 变量）的定义。`tokens.css` 的 233 个 token 在这里。
    pub variables: BTreeMap<String, String>,
    /// 主题覆盖层。key 是 `data-theme` / `data-density` 的值。
    /// 设计源是 5 段（背景 / 类型色板 / 语法色板 / 引擎色 / 阴影）。
    pub themes: BTreeMap<String, Vec<Rule>>,
    /// 解析时报告的不支持项。**非空就该编译失败** ——
    /// 这是 §1.3「完备性验收：未支持属性 = 0」的落地点。
    pub unsupported: Vec<Unsupported>,
}

/// 一条不支持的构造。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Unsupported {
    /// 出处（文件 + 行）。
    pub at: String,
    /// 原文片段。
    pub snippet: String,
    /// 为什么不支持。
    pub reason: &'static str,
}
