//! 业务服务层。
//!
//! AGENTS.md 硬约束 3：**业务逻辑只写在 `seladb-core/src/service/`**。
//! CLI 命令、MCP 工具、GUI 视图都只做「解析参数 → 调 service → 格式化输出」。
//!
//! 这一层负责能力探测后的降级决策：某个引擎没有某项能力时，
//! 返回什么由这里决定，而不是让调用方拿到一个「永远失败的方法」。

use crate::core::{Column, ConnConfig, Engine, ResultSet, Table, TableRef, Value};
use crate::driver::{global_registry, Conn, ConnExt, DriverError, DriverResult};

/// 服务层错误。
#[derive(Debug, thiserror::Error)]
pub enum ServiceError {
    #[error("引擎 {0} 尚未接入驱动")]
    NoDriver(Engine),
    #[error("连接失败: {0}")]
    Connect(String),
    #[error("当前引擎不支持该操作: {0}")]
    Unsupported(&'static str),
    #[error("查询失败: {0}")]
    Query(String),
}

impl From<DriverError> for ServiceError {
    fn from(e: DriverError) -> Self {
        match e {
            DriverError::UnsupportedEngine(s) => ServiceError::NoDriver(
                Engine::from_id(&s).unwrap_or(Engine::Sqlite),
            ),
            DriverError::Connect(s) => ServiceError::Connect(s),
            DriverError::Unsupported(what) => ServiceError::Unsupported(what),
            DriverError::Query(s) => ServiceError::Query(s),
            DriverError::Io(s) => ServiceError::Query(s),
        }
    }
}

/// 服务层统一结果类型。
pub type ServiceResult<T> = Result<T, ServiceError>;

/// 按引擎建立连接。
///
/// 驱动从全局注册表取；没注册就报「尚未接入驱动」——不静默退回别的引擎。
pub fn connect(config: &ConnConfig) -> ServiceResult<Box<dyn Conn>> {
    let registry = global_registry();
    let driver = registry
        .driver(config.engine)
        .ok_or(ServiceError::NoDriver(config.engine))?;
    Ok(driver.open(config)?)
}

/// 列出数据库。
///
/// 引擎没有这项能力时返回空列表而不是报错：Redis 连上了但「没有数据库列表」
/// 是正常状态，不是故障。
pub fn list_databases(conn: &dyn Conn) -> ServiceResult<Vec<String>> {
    match conn.as_database_lister() {
        Some(l) => Ok(l.databases()?),
        None => Ok(Vec::new()),
    }
}

/// 列出 schema。
pub fn list_schemas(conn: &dyn Conn) -> ServiceResult<Vec<String>> {
    match conn.as_schema_lister() {
        Some(l) => Ok(l.schemas()?),
        None => Ok(Vec::new()),
    }
}

/// 列出表。
pub fn list_tables(conn: &dyn Conn, schema: Option<&str>) -> ServiceResult<Vec<TableRef>> {
    match conn.as_table_lister() {
        Some(l) => Ok(l.tables(schema)?),
        None => Ok(Vec::new()),
    }
}

/// 描述一张表：列定义 + 行数估计。
///
/// 行数拿不到就是 `None`，**不填 0**——0 在 UI 上表示「确实没有行」，
/// 与「不知道」是两回事。
pub fn describe_table(
    conn: &dyn Conn,
    schema: Option<&str>,
    table: &str,
) -> ServiceResult<Table> {
    let columns: Vec<Column> = match conn.as_column_lister() {
        Some(l) => l.columns(schema, table)?,
        None => {
            return Err(ServiceError::Unsupported("列信息"));
        }
    };
    let row_count = estimate_rows(conn, schema, table).ok();
    Ok(Table {
        reference: TableRef::new(schema, table),
        columns,
        row_count,
    })
}

/// 估行数。引擎给不出就返回 `Err`，调用方转成 `None`。
fn estimate_rows(conn: &dyn Conn, schema: Option<&str>, table: &str) -> DriverResult<u64> {
    let q = conn
        .as_querier()
        .ok_or(DriverError::Unsupported("查询"))?;
    let name = match schema {
        Some(s) => format!("{}.{}", s, table),
        None => table.to_owned(),
    };
    // 表名不能绑定参数，只能拼 —— 走标识符转义。
    let sql = format!("SELECT COUNT(*) FROM {}", quote_ident_path(&name));
    let rs = q.query(&sql, &[])?;
    Ok(rs
        .rows
        .first()
        .and_then(|r| r.first())
        .and_then(|v| match v {
            Value::Int(i) => Some(*i as u64),
            _ => None,
        })
        .unwrap_or(0))
}

/// 执行查询。
pub fn run_query(conn: &dyn Conn, sql: &str) -> ServiceResult<ResultSet> {
    let q = conn
        .as_querier()
        .ok_or(ServiceError::Unsupported("查询"))?;
    Ok(q.query(sql, &[])?)
}

/// 执行写语句。
pub fn run_exec(conn: &dyn Conn, sql: &str) -> ServiceResult<u64> {
    let e = conn
        .as_execer()
        .ok_or(ServiceError::Unsupported("写操作"))?;
    Ok(e.exec(sql, &[])?.rows_affected)
}

/// 标识符转义。支持 `schema.table` 的点分形式。
fn quote_ident_path(path: &str) -> String {
    path.split('.')
        .map(|part| format!("\"{}\"", part.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(".")
}
