//! 结构层：节点树。
//!
//! 借鉴 DOM 的「结构与表现分离」：树只描述元素的嵌套与标签，表现全部由
//! CSS 决定。存储用 arena（`Vec` + 索引），`NodeId` 是轻量句柄。

use std::collections::HashMap;

/// 节点在 arena 中的索引句柄。
///
/// 刻意不暴露 arena 内部结构，这样将来换存储（比如 slotmap）不影响公开 API。
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Debug)]
pub struct NodeId(pub(crate) u32);

/// 元素的类型标签，对应 HTML 的 tag name（`div` / `span` / `button` …）。
///
/// 标签本身不决定外观，只用于 CSS 类型选择器（`div { … }`）。
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct ElementId(pub String);

impl ElementId {
    pub fn new(name: impl Into<String>) -> Self {
        Self(name.into())
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<&str> for ElementId {
    fn from(s: &str) -> Self {
        Self::new(s)
    }
}

/// 单个节点的原始数据。
#[derive(Clone, Debug, Default)]
pub struct Node {
    pub tag: Option<ElementId>,
    /// `id="..."` 属性
    pub id: Option<String>,
    /// `class="a b"` 属性
    pub classes: Vec<String>,
    /// 内联 `style="..."` 声明（优先级最高）
    pub inline_style: Option<String>,
    pub children: Vec<NodeId>,
    pub parent: Option<NodeId>,
}

/// 节点树（arena 存储）。
#[derive(Clone, Default, Debug)]
pub struct Tree {
    nodes: Vec<Node>,
    /// `id` 属性 → 节点，用于 `#id` 选择器与 `getElementById`
    by_id: HashMap<String, NodeId>,
}

impl Tree {
    pub fn new() -> Self {
        Self::default()
    }

    /// 创建一个根节点并返回其 id。
    pub fn root(&mut self, tag: impl Into<ElementId>) -> NodeId {
        self.push_node(Node {
            tag: Some(tag.into()),
            ..Default::default()
        })
    }

    /// 追加子节点。
    pub fn push_child(&mut self, parent: NodeId, child: NodeId) {
        if let Some(p) = self.nodes.get_mut(parent.0 as usize) {
            p.children.push(child);
        }
        if let Some(c) = self.nodes.get_mut(child.0 as usize) {
            c.parent = Some(parent);
        }
    }

    /// 创建并挂载一个子节点。
    pub fn create_element(&mut self, parent: NodeId, tag: impl Into<ElementId>) -> NodeId {
        let id = self.push_node(Node {
            tag: Some(tag.into()),
            ..Default::default()
        });
        self.push_child(parent, id);
        id
    }

    pub fn push_node(&mut self, node: Node) -> NodeId {
        let id = NodeId(self.nodes.len() as u32);
        if let Some(elem_id) = &node.id {
            self.by_id.insert(elem_id.clone(), id);
        }
        self.nodes.push(node);
        id
    }

    pub fn node(&self, id: NodeId) -> Option<&Node> {
        self.nodes.get(id.0 as usize)
    }

    pub fn node_mut(&mut self, id: NodeId) -> Option<&mut Node> {
        self.nodes.get_mut(id.0 as usize)
    }

    pub fn len(&self) -> usize {
        self.nodes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }

    /// 按 `id` 属性查找。
    pub fn get_by_id(&self, id: &str) -> Option<NodeId> {
        self.by_id.get(id).copied()
    }

    /// 深度优先遍历（含自身），返回访问顺序。
    pub fn descendants(&self, root: NodeId) -> Vec<NodeId> {
        let mut out = Vec::new();
        let mut stack = vec![root];
        while let Some(id) = stack.pop() {
            out.push(id);
            if let Some(node) = self.node(id) {
                // 反向压栈以保持文档序
                for &c in node.children.iter().rev() {
                    stack.push(c);
                }
            }
        }
        out
    }

    /// 节点在文档中的深度（根为 0），用于后代选择器匹配。
    pub fn depth(&self, id: NodeId) -> usize {
        let mut d = 0;
        let mut cur = self.node(id).and_then(|n| n.parent);
        while let Some(p) = cur {
            d += 1;
            cur = self.node(p).and_then(|n| n.parent);
        }
        d
    }

    /// 从 `id` 向上收集祖先链（由近及远）。
    pub fn ancestors(&self, id: NodeId) -> Vec<NodeId> {
        let mut out = Vec::new();
        let mut cur = self.node(id).and_then(|n| n.parent);
        while let Some(p) = cur {
            out.push(p);
            cur = self.node(p).and_then(|n| n.parent);
        }
        out
    }
}
