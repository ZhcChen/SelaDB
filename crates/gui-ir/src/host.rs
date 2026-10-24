//! IR 的宿主 API 绑定。
//!
//! **这是「Rust 给 JS 的那个对象」的接口面。**
//!
//! ## 它不是凭空设计的
//!
//! 设计源在浏览器里跑的时候，逻辑层（那 8362 行 JS）调用的是
//! `mock-data.js` + `mock-sql.js` 里的全局。2026-10-24 实测
//! （`scripts/probe-bridge.mjs`）：mock 层定义 31 个顶层名字，**逻辑层
//! 实际只用到 10 个**：
//!
//! | 组 | 名字 | Rust 侧对应 |
//! |---|---|---|
//! | 数据 | `CONNECTIONS` | `list_databases` / 连接配置 |
//! | 数据 | `TABLE_DATA` | 查询结果 |
//! | 数据 | `TABLE_STRUCTURE` | `describe_table` |
//! | 数据 | `DOCUMENTS` | MongoDB 文档 |
//! | 数据 | `KEYS` | Redis 键 |
//! | 数据 | `ENGINES` | `Engine` 枚举 |
//! | 数据 | `UI_COPY` | 文案表（设计源的界面文字） |
//! | 函数 | `executeQuery(sql, {tables})` | `service::run_query` |
//! | 函数 | `splitStatements(sql)` | 多语句切分 —— **Rust 侧还没有** |
//! | 函数 | `generateDdl(dataKey)` | DDL 预览 —— **Rust 侧还没有** |
//!
//! 其余 21 个是 mock 的内部辅助（SQL 分词、DDL 拼装、类型推断），
//! 逻辑层一次都不碰，**Rust 侧也不用做**。
//!
//! ## 也就是说
//!
//! 这个接口面不是「设计出来的」，是**被设计源已经定义好了**。换后端
//! （mock → Rust）就是换实现，调用点一行不改。
//!
//! 详见 [`docs/gui-source-language.md`](../../../docs/gui-source-language.md)。

/// 宿主对象名。JS 侧是一个全局（设计源不能用 ES module，`file://` 下
/// CORS 会拦），所以宿主必须以这个名字注入全局作用域。
pub const HOST_OBJECT: &str = "SELADB";

/// 后端能力。逻辑层通过 `SELADB.<能力>` 调用。
///
/// 这 10 个就是探针量出来的那 10 个。**加能力前先确认逻辑层真的在用** ——
/// mock 层有 21 个名字逻辑层一次都不碰，Rust 侧也不必做。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostCapability {
    // ---- 数据（7 个）----
    /// `CONNECTIONS` —— 已建立的连接列表。
    Connections,
    /// `TABLE_DATA` —— 表数据（行）。
    TableData,
    /// `TABLE_STRUCTURE` —— 表结构（列定义）。
    TableStructure,
    /// `DOCUMENTS` —— 文档集合（MongoDB）。
    Documents,
    /// `KEYS` —— 键集合（Redis）。
    Keys,
    /// `ENGINES` —— 引擎清单。
    Engines,
    /// `UI_COPY` —— 界面文案表。
    UiCopy,

    // ---- 函数（3 个）----
    /// `executeQuery(sql, { tables })` —— 执行查询。
    ExecuteQuery,
    /// `splitStatements(sql)` —— 把多语句 SQL 切��单条。
    SplitStatements,
    /// `generateDdl(dataKey)` —— 生成 DDL 预览。
    GenerateDdl,
}

impl HostCapability {
    /// JS 侧的名字。与设计源 mock 层**逐字一致** —— 换后端就是换实现。
    pub fn js_name(&self) -> &'static str {
        match self {
            HostCapability::Connections => "CONNECTIONS",
            HostCapability::TableData => "TABLE_DATA",
            HostCapability::TableStructure => "TABLE_STRUCTURE",
            HostCapability::Documents => "DOCUMENTS",
            HostCapability::Keys => "KEYS",
            HostCapability::Engines => "ENGINES",
            HostCapability::UiCopy => "UI_COPY",
            HostCapability::ExecuteQuery => "executeQuery",
            HostCapability::SplitStatements => "splitStatements",
            HostCapability::GenerateDdl => "generateDdl",
        }
    }

    /// 这个能力在 Rust 侧**是否已实现**。2026-10-24 的状态。
    pub fn implemented_in_rust(&self) -> bool {
        match self {
            HostCapability::Connections
            | HostCapability::TableData
            | HostCapability::TableStructure
            | HostCapability::Documents
            | HostCapability::Keys
            | HostCapability::Engines
            | HostCapability::UiCopy
            | HostCapability::ExecuteQuery => true,
            // seladb-core/src/service.rs 里还没有
            HostCapability::SplitStatements | HostCapability::GenerateDdl => false,
        }
    }
}

/// 全部能力。**这个列表就是「对象」的完整接口面。**
pub const ALL_CAPABILITIES: &[HostCapability] = &[
    HostCapability::Connections,
    HostCapability::TableData,
    HostCapability::TableStructure,
    HostCapability::Documents,
    HostCapability::Keys,
    HostCapability::Engines,
    HostCapability::UiCopy,
    HostCapability::ExecuteQuery,
    HostCapability::SplitStatements,
    HostCapability::GenerateDdl,
];

use std::collections::BTreeMap;

/// 跨语言调用的收口。
///
/// 需求：Rust 侧可以把「调用其他语言（FFI / JNI）」的能力挂到这个对象上，
/// 而**核心仍然由 Rust 提供**。
///
/// 落法：对象持有一张不透明的句柄表，实际的外语调用由 Rust 执行，
/// JS 永远不直接碰 FFI / JNI。好处是跨语言调用有**唯一收口**，
/// 可审计、可限制、可回溯。
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ForeignRegistry {
    /// 句柄 → 描述。句柄本身是 `u32`，实际对象由 Rust 侧持有。
    handles: BTreeMap<u32, ForeignHandle>,
    next: u32,
}

/// 一个外部对象的句柄。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForeignHandle {
    /// 语言种类。
    pub language: ForeignLanguage,
    /// 该语言里的标识（符号名 / 类名 / 字段路径）。
    pub symbol: String,
    /// 人类可读的描述，进日志用。
    pub label: String,
}

/// 外部语言种类。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ForeignLanguage {
    /// C / C++（FFI）。
    C,
    /// Java（JNI）。
    Java,
    /// 其他（Python / Swift / …）。
    Other,
}
