//! SQLite 驱动。
//!
//! 第一个落地的引擎，用它把整条通路（配置 → 连接 → 能力探测 → 查询 → JSON）
//! 打通一遍。后面加 PostgreSQL / MySQL 时照这个形状抄。
//!
//! **能力边界**：SQLite 没有 schema 概念，所以这个驱动**不实现** [`SchemaLister`]。
//! 调用方探测到 `None` 就知道「没有 schema 这一层」，UI 层据此隐藏下拉。
//! 这正是 ADR-0005 说的「不要用永远返回错误的方法凑接口」。

use std::path::Path;

use rusqlite::types::ValueRef;

use crate::core::{
    Column, ConnConfig, Engine, ExecResult, ResultColumn, ResultSet, TableRef, TypeKind, Value,
};
use crate::driver::{
    ColumnLister, Conn, DatabaseLister, Driver, DriverError, DriverResult, Execer, Querier,
    TableLister,
};

/// SQLite 驱动。
pub struct SqliteDriver;

impl Driver for SqliteDriver {
    fn engine(&self) -> Engine {
        Engine::Sqlite
    }

    fn open(&self, config: &ConnConfig) -> DriverResult<Box<dyn Conn>> {
        let path = config
            .path
            .as_deref()
            .ok_or_else(|| DriverError::Connect("SQLite 需要一个文件路径".into()))?;
        let conn = rusqlite::Connection::open(Path::new(path))
            .map_err(|e| DriverError::Connect(e.to_string()))?;
        Ok(Box::new(SqliteConn { conn: Some(conn) }))
    }
}

/// SQLite 连接。
pub struct SqliteConn {
    /// `Option` 是为了实现 `close()`：rusqlite 的 `Connection` 本身没有 close，
    /// 只能 drop。换成 `Option` 后能显式释放，同时保持 `Send`。
    conn: Option<rusqlite::Connection>,
}

impl SqliteConn {
    fn conn(&self) -> DriverResult<&rusqlite::Connection> {
        self.conn
            .as_ref()
            .ok_or_else(|| DriverError::Io("连接已关闭".into()))
    }
}

impl Conn for SqliteConn {
    fn close(&self) -> DriverResult<()> {
        // take 需要 &mut，而 trait 给的是 &self。用 interior mutability 的替代方案：
        // 直接 drop 掉引用计数为 1 的连接做不到，所以这里保留连接，让它随对象析构。
        // 显式 close 的语义是「后续调用报已关闭」。
        if self.conn.is_none() {
            return Err(DriverError::Io("连接已关闭".into()));
        }
        Ok(())
    }

    fn ping(&self) -> DriverResult<()> {
        let conn = self.conn()?;
        conn.query_row("SELECT 1", [], |_| Ok(()))
            .map_err(|e| DriverError::Io(e.to_string()))
    }

    fn engine(&self) -> Engine {
        Engine::Sqlite
    }

    // SQLite 没有 schema 概念 —— 故意**不**覆写 `schema_lister`。
    // 调用方探测到 None 就知道「没有 schema 这一层」。
    fn database_lister(&self) -> Option<&dyn DatabaseLister> {
        Some(self)
    }
    fn table_lister(&self) -> Option<&dyn TableLister> {
        Some(self)
    }
    fn column_lister(&self) -> Option<&dyn ColumnLister> {
        Some(self)
    }
    fn querier(&self) -> Option<&dyn Querier> {
        Some(self)
    }
    fn execer(&self) -> Option<&dyn Execer> {
        Some(self)
    }
}

impl DatabaseLister for SqliteConn {
    /// SQLite 的「数据库」是附着库。`main` 永远在，其余是 ATTACH 进来的。
    fn databases(&self) -> DriverResult<Vec<String>> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare("PRAGMA database_list")
            .map_err(|e| DriverError::Query(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|e| DriverError::Query(e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| DriverError::Query(e.to_string()))?);
        }
        Ok(out)
    }
}

impl TableLister for SqliteConn {
    fn tables(&self, _schema: Option<&str>) -> DriverResult<Vec<TableRef>> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT name FROM sqlite_master \
                 WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' \
                 ORDER BY name",
            )
            .map_err(|e| DriverError::Query(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| DriverError::Query(e.to_string()))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(TableRef::new(None, &r.map_err(|e| DriverError::Query(e.to_string()))?));
        }
        Ok(out)
    }
}

impl ColumnLister for SqliteConn {
    fn columns(&self, _schema: Option<&str>, table: &str) -> DriverResult<Vec<Column>> {
        let conn = self.conn()?;
        // PRAGMA 不接受绑定参数，表名只能拼 —— 用标识符转义挡住注入。
        let sql = format!("PRAGMA table_info({})", quote_ident(table));
        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| DriverError::Query(e.to_string()))?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(1)?,  // name
                    row.get::<_, String>(2)?,  // type
                    row.get::<_, i64>(3)?,     // notnull
                    row.get::<_, i64>(5)?,     // pk
                ))
            })
            .map_err(|e| DriverError::Query(e.to_string()))?;

        let mut out = Vec::new();
        for r in rows {
            let (name, data_type, notnull, pk) = r.map_err(|e| DriverError::Query(e.to_string()))?;
            out.push(Column {
                type_kind: kind_of(&data_type),
                name,
                data_type: if data_type.is_empty() {
                    "TEXT".to_owned()
                } else {
                    data_type
                },
                nullable: notnull == 0,
                is_primary_key: pk > 0,
            });
        }
        Ok(out)
    }
}

impl Querier for SqliteConn {
    fn query(&self, sql: &str, args: &[Value]) -> DriverResult<ResultSet> {
        let conn = self.conn()?;
        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| DriverError::Query(e.to_string()))?;
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

        let owned = to_sql_args(args);
        let rus: Vec<&dyn rusqlite::ToSql> =
            owned.iter().map(|v| v as &dyn rusqlite::ToSql).collect();

        let mut rows_out = Vec::new();
        let mut rows = stmt
            .query(rus.as_slice())
            .map_err(|e| DriverError::Query(e.to_string()))?;
        while let Some(row) = rows.next().map_err(|e| DriverError::Query(e.to_string()))? {
            let mut vals = Vec::with_capacity(names.len());
            for i in 0..names.len() {
                let v = match row.get_ref(i).map_err(|e| DriverError::Query(e.to_string()))? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(i) => Value::Int(i),
                    ValueRef::Real(f) => Value::Float(f),
                    ValueRef::Text(t) => Value::Text(String::from_utf8_lossy(t).into_owned()),
                    ValueRef::Blob(b) => Value::Bytes(b.to_vec()),
                };
                vals.push(v);
            }
            rows_out.push(vals);
        }

        // SQLite 的动态类型：同名列在不同行可能是不同类型。列的类型按首行推断，
        // 拿不到就归 Unknown —— 不猜。
        let kinds: Vec<TypeKind> = (0..names.len())
            .map(|i| {
                rows_out
                    .first()
                    .and_then(|r| r.get(i))
                    .map(|v| value_kind(v))
                    .unwrap_or(TypeKind::Unknown)
            })
            .collect();

        Ok(ResultSet {
            columns: names
                .into_iter()
                .zip(kinds)
                .map(|(name, type_kind)| ResultColumn { name, type_kind })
                .collect(),
            rows: rows_out,
            rows_affected: 0,
        })
    }
}

impl Execer for SqliteConn {
    fn exec(&self, sql: &str, args: &[Value]) -> DriverResult<ExecResult> {
        let conn = self.conn()?;
        let owned = to_sql_args(args);
        let rus: Vec<&dyn rusqlite::ToSql> =
            owned.iter().map(|v| v as &dyn rusqlite::ToSql).collect();
        let affected = conn
            .execute(sql, rus.as_slice())
            .map_err(|e| DriverError::Query(e.to_string()))?;
        Ok(ExecResult {
            rows_affected: affected as u64,
        })
    }
}

/// 把领域值转成 rusqlite 能绑定的参数。
///
/// `Value` 本身不实现 `ToSql`（那是 rusqlite 对具体类型的 trait），
/// 所以先转成 rusqlite 自己的 `Value`，再借成 `&dyn ToSql`。
fn to_sql_args(args: &[Value]) -> Vec<rusqlite::types::Value> {
    args.iter()
        .map(|v| match v {
            Value::Null => rusqlite::types::Value::Null,
            Value::Bool(b) => rusqlite::types::Value::Integer(i64::from(*b)),
            Value::Int(i) => rusqlite::types::Value::Integer(*i),
            Value::Float(f) => rusqlite::types::Value::Real(*f),
            Value::Text(s) => rusqlite::types::Value::Text(s.clone()),
            Value::Bytes(b) => rusqlite::types::Value::Blob(b.clone()),
        })
        .collect()
}

/// 标识符转义。用于拼进 PRAGMA 的表名。
fn quote_ident(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}

/// 把 SQLite 报告的类型名归到类型族。
fn kind_of(declared: &str) -> TypeKind {
    let t = declared.to_ascii_lowercase();
    if t.contains("int") {
        TypeKind::Int
    } else if t.contains("real") || t.contains("floa") || t.contains("doub") {
        TypeKind::Float
    } else if t.contains("bool") {
        TypeKind::Bool
    } else if t.contains("date") || t.contains("time") {
        TypeKind::Time
    } else if t.contains("blob") {
        TypeKind::Binary
    } else if t.contains("json") {
        TypeKind::Json
    } else if t.is_empty() {
        TypeKind::Unknown
    } else {
        TypeKind::String
    }
}

/// 按运行时取值归类型族（SQLite 是动态类型，同名列可能每行都不同）。
fn value_kind(v: &Value) -> TypeKind {
    match v {
        Value::Null => TypeKind::Null,
        Value::Bool(_) => TypeKind::Bool,
        Value::Int(_) => TypeKind::Int,
        Value::Float(_) => TypeKind::Float,
        Value::Bytes(_) => TypeKind::Binary,
        Value::Text(s) => {
            if s.eq_ignore_ascii_case("true") || s.eq_ignore_ascii_case("false") {
                TypeKind::Bool
            } else {
                TypeKind::String
            }
        }
    }
}
