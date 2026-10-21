//! # gui-core
//!
//! HTML/CSS 风格的跨平台原生 GUI 框架核心。
//!
//! 设计目标：让界面用「结构 + 样式」分离的方式描述，样式直接采用 CSS 语法，
//! 底层走自绘 GPU 管线，而非浏览器引擎。
//!
//! ## 分层
//!
//! ```text
//!  widget/   控件层     Button / TextInput / Table / Tree …（组合下层原语）
//!  event/    事件层     命中测试、capture / target / bubble 三阶段派发
//!  paint/    绘制层     样式树 + 布局结果 → 绘制指令（display list）
//!  layout/   布局层     taffy：CSS Flexbox / Grid / Block / Float 规范实现
//!  text/     文本层     cosmic-text：整形、换行、行盒
//!  style/    样式层     CSS 解析 → 选择器匹配 → 级联 → ComputedStyle
//!  dom/      结构层     节点树（arena 存储）
//! ```
//!
//! 一帧的流水线：
//!
//! ```text
//!  DOM 树 + 样式表 + 元素状态
//!        │  style：级联、特异性、继承、伪类
//!        ▼
//!  ComputedStyle（每节点的绝对值样式）
//!        │  layout：taffy
//!        ▼
//!  几何盒（每个节点的 border box）
//!        │  paint：生成绘制指令
//!        ▼
//!  DisplayList → GPU 后端提交
//! ```
//!
//! ## 独立性约束
//!
//! 本 crate 不依赖任何业务代码，且**公开 API 不泄漏第三方类型** ——
//! taffy / cosmic-text / cssparser 只出现在 `internal` 与实现细节中。
//! 这样将来整体拆成独立仓库时，依赖关系不会外泄。

pub mod app;
pub mod dom;
pub mod event;
pub mod layout;
pub mod paint;
pub mod style;
pub mod text;

mod internal;

pub use app::{Frame, Pipeline};
pub use dom::{ElementId, Node, NodeId, Tree};
pub use event::{Event, EventPhase, PointerButton};
pub use layout::{LayoutBox, LayoutResult};
pub use paint::{DisplayList, PaintOp};
pub use style::{ComputedStyle, Declaration, Selector, StyleSheet};
