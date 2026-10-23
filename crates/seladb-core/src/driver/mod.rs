//! 驱动层：小接口 + 引擎注册表。
//!
//! 按 [ADR-0005](../../docs/adr/0005-driver-interfaces.md) 的决策，**不**定义单一
//! 大接口。原因是能力集差异太大：Redis 没有「表」和「列」，MongoDB 没有 schema
//! 概念 —— 大接口会逼着每个引擎写一堆「永远返回错误」的方法，那是接口污染。
//!
//! 于是分成两层：
//!
//! - 必选：[`Driver`]（建连接）+ [`Conn`]（所有引擎共有的最小能力）
//! - 可选：[`DatabaseLister`] / [`SchemaLister`] / [`TableLister`] /
//!   [`ColumnLister`] / [`Querier`] / [`Execer`] —— 调用方按需探测
//!
//! 探测用 `Conn` 上的扩展方法（[`ConnExt`]）封装，返回 `Option<&dyn Trait>`：
//! 能力缺失就是 `None`，UI 层据此隐藏入口，而不是显示一个永远报错的按钮。
//!
//! 这里不用宏或代码生成消除样板代码 —— 那会把编译期检查换成运行时失败。

use std::collections::BTreeMap;
use std::sync::{Arc, RwLock};

use crate::core::{ConnConfig, Engine};

pub mod sqlite;

/// 驱动层错误。
#[derive(Debug, thiserror::Error)]
pub enum DriverError {
    #[error("不支持的引擎: {0}")]
    UnsupportedEngine(String),
    #[error("连接失败: {0}")]
    Connect(String),
    #[error("能力不被该引擎支持: {0}")]
    Unsupported(&'static str),
    #[error("查询失败: {0}")]
    Query(String),
    #[error("IO 失败: {0}")]
    Io(String),
}

/// 驱动层统一结果类型。
pub type DriverResult<T> = Result<T, DriverError>;

/// 引擎工厂：拿到配置，返回一个连接。
pub trait Driver: Send + Sync {
    /// 这个驱动服务的引擎。
    fn engine(&self) -> Engine;

    /// 建立连接。
    fn open(&self, config: &ConnConfig) -> DriverResult<Box<dyn Conn>>;
}

/// 所有引擎共有的最小能力。
///
/// 关于能力探测的形状：ADR-0005 用的是 Go 的类型断言（`conn.(TableLister)`）。
/// Rust 里 `dyn Conn` **不能**下转型成 `dyn TableLister` —— `Any::downcast_ref`
/// 要求目标类型是 `Sized`，而 trait object 不是。
///
/// 所以这里用 Rust 的等价写法：**可选能力各有一个返回 `Option<&dyn Trait>`
/// 的访问器，默认实现是 `None`**，实现了该能力的连接覆写对应项。
///
/// 这没有违反 ADR-0005 的本意：操作仍然住在各自的小 trait 里，
/// `Conn` 上**没有** `list_columns()` 这种「逼所有引擎都实现、Redis 只能
/// 永远报错」的方法 —— Redis 只是不覆写 `table_lister()`，那项能力就不存在。
pub trait Conn: Send {
    /// 关闭连接。
    fn close(&self) -> DriverResult<()>;

    /// 探活。
    fn ping(&self) -> DriverResult<()>;

    /// 该连接服务的引擎。
    fn engine(&self) -> Engine {
        Engine::Sqlite
    }

    /// 能力探测：列出数据库。不支持时为 `None`。
    fn database_lister(&self) -> Option<&dyn DatabaseLister> {
        None
    }

    /// 能力探测：列出 schema。不支持时为 `None`。
    fn schema_lister(&self) -> Option<&dyn SchemaLister> {
        None
    }

    /// 能力探测：列出表。不支持时为 `None`。
    fn table_lister(&self) -> Option<&dyn TableLister> {
        None
    }

    /// 能力探测：列出列。不支持时为 `None`。
    fn column_lister(&self) -> Option<&dyn ColumnLister> {
        None
    }

    /// 能力探测：查询。不支持时为 `None`。
    fn querier(&self) -> Option<&dyn Querier> {
        None
    }

    /// 能力探测：写操作。不支持时为 `None`。
    fn execer(&self) -> Option<&dyn Execer> {
        None
    }
}

/// 可选能力：列出数据库。
pub trait DatabaseLister {
    fn databases(&self) -> DriverResult<Vec<String>>;
}

/// 可选能力：列出 schema。
pub trait SchemaLister {
    fn schemas(&self) -> DriverResult<Vec<String>>;
}

/// 可选能力：列出表。
pub trait TableLister {
    fn tables(&self, schema: Option<&str>) -> DriverResult<Vec<crate::core::TableRef>>;
}

/// 可选能力：列出列。
pub trait ColumnLister {
    fn columns(
        &self,
        schema: Option<&str>,
        table: &str,
    ) -> DriverResult<Vec<crate::core::Column>>;
}

/// 可选能力：查询。
pub trait Querier {
    fn query(&self, sql: &str, args: &[crate::core::Value]) -> DriverResult<crate::core::ResultSet>;
}

/// 可选能力：执行（写）。
pub trait Execer {
    fn exec(&self, sql: &str, args: &[crate::core::Value]) -> DriverResult<crate::core::ExecResult>;
}

/// 能力探测的便捷封装。
///
/// ADR-0005 承认「调用方要做类型断言，代码比胖接口啰嗦」。这里把探测收进
/// 一个扩展 trait：调用方拿到的仍是 `Option<&dyn Trait>` —— 能力缺失就是
/// `None`，不会退化成运行时报错。
pub trait ConnExt {
    fn as_database_lister(&self) -> Option<&dyn DatabaseLister>;
    fn as_schema_lister(&self) -> Option<&dyn SchemaLister>;
    fn as_table_lister(&self) -> Option<&dyn TableLister>;
    fn as_column_lister(&self) -> Option<&dyn ColumnLister>;
    fn as_querier(&self) -> Option<&dyn Querier>;
    fn as_execer(&self) -> Option<&dyn Execer>;
}

/// 给 `dyn Conn` 实现 [`ConnExt`]。直接转发到 `Conn` 上的能力访问器。
impl<T: Conn + ?Sized> ConnExt for T {
    fn as_database_lister(&self) -> Option<&dyn DatabaseLister> {
        self.database_lister()
    }
    fn as_schema_lister(&self) -> Option<&dyn SchemaLister> {
        self.schema_lister()
    }
    fn as_table_lister(&self) -> Option<&dyn TableLister> {
        self.table_lister()
    }
    fn as_column_lister(&self) -> Option<&dyn ColumnLister> {
        self.column_lister()
    }
    fn as_querier(&self) -> Option<&dyn Querier> {
        self.querier()
    }
    fn as_execer(&self) -> Option<&dyn Execer> {
        self.execer()
    }
}

/// 引擎注册表。
///
/// 引擎模块在初始化时注册自己；使用方按引擎标识查驱动。
#[derive(Clone, Default)]
pub struct Registry {
    drivers: Arc<RwLock<BTreeMap<Engine, Arc<dyn Driver>>>>,
}

impl Registry {
    pub fn new() -> Self {
        Self::default()
    }

    /// 注册一个驱动。同引擎后注册的覆盖先注册的 —— 便于测试注入替身。
    pub fn register(&self, driver: Arc<dyn Driver>) {
        let engine = driver.engine();
        let mut map = self.drivers.write().expect("驱动注册表锁中毒");
        map.insert(engine, driver);
    }

    /// 查驱动。引擎没有注册驱动时返回 `None`。
    pub fn driver(&self, engine: Engine) -> Option<Arc<dyn Driver>> {
        let map = self.drivers.read().expect("驱动注册表锁中毒");
        map.get(&engine).cloned()
    }

    /// 已注册的引擎，按标识排序。
    pub fn engines(&self) -> Vec<Engine> {
        let map = self.drivers.read().expect("驱动注册表锁中毒");
        map.keys().copied().collect()
    }
}

/// 全局注册表。
///
/// 引擎模块在 `init()` 里调用 [`register_driver`]。
pub fn register_driver(driver: Arc<dyn Driver>) {
    global_registry().register(driver);
}

/// 全局注册表。
pub fn global_registry() -> &'static Registry {
    use std::sync::OnceLock;
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(Registry::new)
}
