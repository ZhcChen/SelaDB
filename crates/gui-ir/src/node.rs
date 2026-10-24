//! IR 的节点模板。
//!
//! **这是「HTML 的结构」，不是运行时的活树。** 没有计算样式、没有几何、
//! 没有事件监听 —— 那些在 `gui-core::dom` 里。
//!
//! ## 节点分两类
//!
//! | | [`NodeKind::Element`] | [`NodeKind::VirtualList`] |
//! |---|---|---|
//! | 进节点树 | ✓ | **✗**（只存一个描述） |
//! | 参与布局 | ✓ | ✓（占位 + 滚动条） |
//! | 绘制 | 递归画子节点 | **引擎直接画行**，不经过节点树 |
//!
//! 第二类是「虚拟化表」：HTML 里声明「这是一张 10 万行的表」，但那 10 万行
//! **不进节点树**。这是数据网格不炸内存的唯一办法 —— 浏览器也是这么做的
//! （它也不把行放进 DOM）。
//!
//! ## 为什么要单独一类
//!
//! 如果虚拟表的行也进节点树，10 万行 × 10 列 = 100 万节点，每个几百字节，
//! 直接爆内存。设计源自己的数据网格早就是虚拟化的（`rowPool` 复用 DOM 行，
//! 只渲染视口 + 上下各 10 行余量）—— 它早就承认了「DOM 行不是数据通路」。
//!
//! 详见 [`docs/gui-source-language.md`](../../../docs/gui-source-language.md)。

use std::collections::BTreeMap;

/// 节点种类。
#[derive(Debug, Clone, PartialEq)]
pub enum NodeKind {
    /// 普通元素。有标签、属性、子节点。
    Element(Element),
    /// 文本节点。
    Text(String),
    /// 注释节点。解析时保留、渲染时忽略 —— 保留是为了让「设计源 →
    /// 产物」的往返测试能对上。
    Comment(String),
    /// 虚拟化表。数据在宿主侧，引擎直接绘制，不进节点树。
    VirtualList(VirtualList),
}

/// 一个元素。
#[derive(Debug, Clone, PartialEq)]
pub struct Element {
    /// 标签名。**小写归一**（HTML 语义）。
    pub tag: String,
    /// 属性。`class` / `id` / `data-*` / ARIA 都在这里。
    pub attributes: BTreeMap<String, String>,
    pub children: Vec<Node>,
    /// 语义角色。由标签推导（如 `<nav>` → `navigation`），可被 `role` 属性覆盖。
    pub role: Option<String>,
}

/// 虚拟化表描述。
#[derive(Debug, Clone, PartialEq)]
pub struct VirtualList {
    /// 列定义。名字 + 类型（供类型色板与对齐用）。
    pub columns: Vec<VirtualColumn>,
    /// 行数。数据本身不在 IR 里 —— 在宿主侧。
    pub row_count: u64,
    /// 行高（逻辑像素）。
    pub row_height: f32,
    /// 单元格渲染方式。
    pub cell: CellRender,
    /// 排序状态。
    pub sort: Option<SortSpec>,
}

/// 虚拟表的一列。
#[derive(Debug, Clone, PartialEq)]
pub struct VirtualColumn {
    pub name: String,
    /// 类型名。决定类型色板（`--type-int` 等）与对齐（右对齐数值列）。
    pub type_name: String,
    pub width: f32,
}

/// 单元格渲染方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CellRender {
    /// 纯文本。
    Text,
    /// 右对齐的数值。
    Number,
    /// 带类型徽标（如 Redis 的 `string` / `hash`）。
    Badge,
}

/// 排序规格。
#[derive(Debug, Clone, PartialEq)]
pub struct SortSpec {
    pub column: String,
    pub ascending: bool,
}

/// 一个节点。
#[derive(Debug, Clone, PartialEq)]
pub struct Node {
    pub kind: NodeKind,
}

impl Node {
    pub fn element(tag: &str) -> Self {
        Node {
            kind: NodeKind::Element(Element {
                tag: tag.to_ascii_lowercase(),
                attributes: BTreeMap::new(),
                children: Vec::new(),
                role: None,
            }),
        }
    }

    pub fn text(s: &str) -> Self {
        Node {
            kind: NodeKind::Text(s.to_owned()),
        }
    }
}
