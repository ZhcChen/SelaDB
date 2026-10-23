//! SelaDB 核心库：领域模型、驱动抽象、业务服务。
//!
//! 分层与依赖方向（单向，不回头）：
//!
//! ```text
//! core/  ←  driver/  ←  service/
//! 领域模型   引擎抽象      业务编排
//! ```
//!
//! - `core` 不含引擎方言，也不做 I/O
//! - `driver` 只描述「这个引擎能做什么」，能力差异用小 trait 表达
//! - `service` 做能力探测后的降级决策，是业务逻辑的唯一落点
//!
//! AGENTS.md 硬约束 3：业务逻辑只写在 [`service`]。

pub mod conn_url;
pub mod core;
pub mod driver;
pub mod service;

pub use core::{
    Column, ConnConfig, Engine, ExecResult, ResultColumn, ResultSet, Table, TableRef, TypeKind,
    Value,
};
pub use driver::{
    ColumnLister, Conn, ConnExt, DatabaseLister, Driver, DriverError, DriverResult, Execer,
    Querier, Registry, SchemaLister, TableLister,
};
pub use service::ServiceError;

/// 注册全部内置引擎驱动。
///
/// 引擎模块在这里显式注册 —— 不靠自动发现，依赖关系写在代码里而不是藏在
/// 某个宏或 build.rs 里。
pub fn init() {
    use std::sync::Arc;
    driver::register_driver(Arc::new(driver::sqlite::SqliteDriver));
}
