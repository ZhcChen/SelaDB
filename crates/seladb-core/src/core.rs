//! 领域模型：连接、对象引用、列、值、结果集。
//!
//! 这一层只描述「数据是什么」，不含任何引擎方言，也不做 I/O。
//! 引擎差异全部收敛在 [`crate::driver`] 里。

use serde::{Deserialize, Serialize};

/// 支持的引擎。
///
/// 变体名与 `ui/assets/engine-icons.js` 的 `ENGINE_BRAND_ICONS` 键一一对应，
/// 也与 `docs/engine-support.md` 的能力矩阵一一对应。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Engine {
    PostgreSql,
    MySql,
    Sqlite,
    SqlServer,
    MongoDb,
    Redis,
}

impl Engine {
    /// 引擎的稳定标识符，用于 URL 解析与配置文件。
    pub fn id(self) -> &'static str {
        match self {
            Engine::PostgreSql => "postgresql",
            Engine::MySql => "mysql",
            Engine::Sqlite => "sqlite",
            Engine::SqlServer => "sqlserver",
            Engine::MongoDb => "mongodb",
            Engine::Redis => "redis",
        }
    }

    /// 引擎显示名。
    pub fn label(self) -> &'static str {
        match self {
            Engine::PostgreSql => "PostgreSQL",
            Engine::MySql => "MySQL",
            Engine::Sqlite => "SQLite",
            Engine::SqlServer => "SQL Server",
            Engine::MongoDb => "MongoDB",
            Engine::Redis => "Redis",
        }
    }

    /// 从标识符解析引擎。未知引擎返回 `None` —— 不静默退回某个默认引擎。
    pub fn from_id(id: &str) -> Option<Self> {
        match id.to_ascii_lowercase().as_str() {
            "postgresql" | "postgres" | "pg" => Some(Engine::PostgreSql),
            "mysql" | "mariadb" => Some(Engine::MySql),
            "sqlite" | "sqlite3" => Some(Engine::Sqlite),
            "sqlserver" | "mssql" => Some(Engine::SqlServer),
            "mongodb" | "mongo" => Some(Engine::MongoDb),
            "redis" => Some(Engine::Redis),
            _ => None,
        }
    }

    /// 该引擎是否走 SQL 语义（决定 UI 层给出「表/schema」还是「集合/键」树）。
    pub fn is_relational(self) -> bool {
        matches!(
            self,
            Engine::PostgreSql | Engine::MySql | Engine::Sqlite | Engine::SqlServer
        )
    }
}

impl std::fmt::Display for Engine {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.id())
    }
}

/// 连接配置。
///
/// 密码不进 `Debug`：密钥不该出现在日志与错误信息里。
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConnConfig {
    pub engine: Engine,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub user: Option<String>,
    #[serde(skip_serializing)]
    pub password: Option<String>,
    pub database: Option<String>,
    /// SQLite 等文件型引擎用它；关系型引擎用它选 schema。
    pub path: Option<String>,
}

impl std::fmt::Debug for ConnConfig {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ConnConfig")
            .field("engine", &self.engine)
            .field("host", &self.host)
            .field("port", &self.port)
            .field("user", &self.user)
            .field("password", &self.password.as_ref().map(|_| "***"))
            .field("database", &self.database)
            .field("path", &self.path)
            .finish()
    }
}

/// 表引用。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TableRef {
    /// schema 名。SQLite 没有 schema 概念时为 `None`。
    pub schema: Option<String>,
    pub name: String,
}

impl TableRef {
    pub fn new(schema: Option<&str>, name: &str) -> Self {
        Self {
            schema: schema.map(str::to_owned),
            name: name.to_owned(),
        }
    }
}

/// 列定义。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Column {
    pub name: String,
    /// 引擎报告的类型名，原样保留（`varchar(64)`、`uuid` …）。
    pub data_type: String,
    pub nullable: bool,
    pub is_primary_key: bool,
    /// 类型族的归类，供 UI 层选类型色。
    pub type_kind: TypeKind,
}

/// 列类型族。UI 层的类型色板按这个分，不直接匹配引擎的类型名。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TypeKind {
    Int,
    Float,
    Bool,
    Time,
    Null,
    Binary,
    Json,
    Uuid,
    String,
    Unknown,
}

/// 实现里的列类型与可空性。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Table {
    pub reference: TableRef,
    pub columns: Vec<Column>,
    /// 引擎能给出的行数估计；拿不到时为 `None`（不要填 0，0 是「确实没有行」）。
    pub row_count: Option<u64>,
}

/// 一个字段值。
///
/// 不用 `serde_json::Value`：驱动层要能把「NULL」与「NULL 字符串」分开，
/// 而 JSON 的 `null` 与字符串 `"NULL"` 在 JSON 里是两回事，够用但读起来别扭。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Value {
    Null,
    Bool(bool),
    Int(i64),
    Float(f64),
    Text(String),
    Bytes(Vec<u8>),
}

impl Value {
    /// 类型名，供 JSON 输出时标注。
    pub fn type_name(&self) -> &'static str {
        match self {
            Value::Null => "null",
            Value::Bool(_) => "bool",
            Value::Int(_) => "int",
            Value::Float(_) => "float",
            Value::Text(_) => "text",
            Value::Bytes(_) => "bytes",
        }
    }

    /// 展示用的紧凑文本。UI 层拿这个渲染单元格。
    pub fn to_display(&self) -> String {
        match self {
            Value::Null => "NULL".to_owned(),
            Value::Bool(b) => b.to_string(),
            Value::Int(i) => i.to_string(),
            Value::Float(f) => f.to_string(),
            Value::Text(s) => s.clone(),
            Value::Bytes(b) => format!("<{} bytes>", b.len()),
        }
    }
}

/// 查询结果的一列。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResultColumn {
    pub name: String,
    pub type_kind: TypeKind,
}

/// 查询结果集。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ResultSet {
    pub columns: Vec<ResultColumn>,
    pub rows: Vec<Vec<Value>>,
    /// 受影响行数。非查询语句用它。
    pub rows_affected: u64,
}

impl ResultSet {
    pub fn empty() -> Self {
        Self {
            columns: Vec::new(),
            rows: Vec::new(),
            rows_affected: 0,
        }
    }

    /// 表格视图用：把一行拼成「列名 = 值」的映射。
    pub fn row_pairs(&self, row: &[Value]) -> Vec<(String, Value)> {
        self.columns
            .iter()
            .zip(row.iter())
            .map(|(c, v)| (c.name.clone(), v.clone()))
            .collect()
    }
}

/// 执行语句（非查询）的结果。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecResult {
    pub rows_affected: u64,
}
