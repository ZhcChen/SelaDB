//! SelaDB 命令行入口。
//!
//! 职责边界（AGENTS.md 硬约束 3）：**只做「解析参数 → 调 service → 格式化输出」**。
//! 任何业务判断都该在 `seladb-core/src/service/` 里。

use clap::{Parser, Subcommand};
use serde::Serialize;
use seladb_core::core::{ConnConfig, Engine, ResultSet, Table};
use seladb_core::service;

/// SelaDB —— 跨平台数据库管理工具。
#[derive(Debug, Parser)]
#[command(name = "seladb", version, about, long_about = None)]
struct Cli {
    /// 连接串。形如 `sqlite:///path/to.db`。
    ///
    /// 也可以用 `--engine` / `--path` / `--host` 等分开指定；两者都给时以
    /// 分开指定的为准。
    #[arg(long, global = true, value_name = "URL")]
    url: Option<String>,

    /// 引擎标识（postgresql / mysql / sqlite / sqlserver / mongodb / redis）。
    #[arg(long, global = true, value_name = "ENGINE")]
    engine: Option<String>,

    /// 主机。关系型引擎用。
    #[arg(long, global = true, value_name = "HOST")]
    host: Option<String>,

    /// 端口。关系型引擎用。
    #[arg(long, global = true, value_name = "PORT")]
    port: Option<u16>,

    /// 用户名。
    #[arg(long, global = true, value_name = "USER")]
    user: Option<String>,

    /// 密码。
    #[arg(long, global = true, value_name = "PASSWORD")]
    password: Option<String>,

    /// 数据库名。
    #[arg(long, global = true, value_name = "NAME")]
    database: Option<String>,

    /// 文件路径。SQLite 用；关系型引擎用它选 schema。
    #[arg(long, global = true, value_name = "PATH")]
    path: Option<String>,

    /// 以 JSON 输出。**所有命令都支持** —— Skill 包装、MCP 工具、CI 脚本
    /// 三条路径都依赖它（AGENTS.md 硬约束 5）。
    #[arg(long, global = true)]
    json: bool,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// 列出数据库。
    Databases,
    /// 列出 schema。
    Schemas,
    /// 列出表。
    Tables {
        /// schema 名。SQLite 没有 schema，传了会被忽略。
        #[arg(long)]
        schema: Option<String>,
    },
    /// 描述一张表：列定义与行数。
    Describe {
        /// 表名。
        table: String,
        /// schema 名。
        #[arg(long)]
        schema: Option<String>,
    },
    /// 执行一条 SQL 查询。
    Query {
        /// SQL 语句。
        sql: String,
    },
    /// 执行一条写语句。
    Exec {
        /// SQL 语句。
        sql: String,
    },
    /// 探活。
    Ping,
}

/// JSON 输出的统一信封。
///
/// 错误也走 JSON —— 脚本不该去解析 stderr 里的自由文本。
#[derive(Serialize)]
struct Envelope<T: Serialize> {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl<T: Serialize> Envelope<T> {
    fn ok(data: T) -> Self {
        Self {
            ok: true,
            data: Some(data),
            error: None,
        }
    }
    fn err(message: impl std::fmt::Display) -> Self {
        Self {
            ok: false,
            data: None,
            error: Some(message.to_string()),
        }
    }
}

/// 结果集的 JSON 形态。
#[derive(Serialize)]
struct ResultSetJson {
    columns: Vec<String>,
    rows: Vec<Vec<seladb_core::core::Value>>,
    row_count: usize,
}

/// 表的 JSON 形态。
#[derive(Serialize)]
struct TableJson {
    schema: Option<String>,
    name: String,
    columns: Vec<seladb_core::core::Column>,
    row_count: Option<u64>,
}

fn main() {
    let cli = Cli::parse();
    seladb_core::init();

    match run(&cli) {
        Ok(()) => {}
        Err(e) => {
            if cli.json {
                let env: Envelope<serde_json::Value> = Envelope::err(&e);
                println!(
                    "{}",
                    serde_json::to_string_pretty(&env).unwrap_or_else(|_| format!("{{\"ok\":false,\"error\":\"{e}\"}}"))
                );
            } else {
                eprintln!("错误: {e}");
            }
            std::process::exit(1);
        }
    }
}

fn run(cli: &Cli) -> Result<(), seladb_core::ServiceError> {
    let config = build_config(cli)?;

    // `ping` 不需要真的打开连接之外的任何能力，先建连接。
    let conn = service::connect(&config)?;

    match &cli.command {
        Command::Ping => {
            conn.ping().map_err(|e| seladb_core::ServiceError::Query(e.to_string()))?;
            emit(cli, Envelope::ok(serde_json::json!({ "engine": config.engine.id() })));
        }
        Command::Databases => {
            let dbs = service::list_databases(conn.as_ref())?;
            emit(cli, Envelope::ok(serde_json::json!({ "databases": dbs })));
        }
        Command::Schemas => {
            let schemas = service::list_schemas(conn.as_ref())?;
            emit(cli, Envelope::ok(serde_json::json!({ "schemas": schemas })));
        }
        Command::Tables { schema } => {
            let tables = service::list_tables(conn.as_ref(), schema.as_deref())?;
            let rows: Vec<_> = tables
                .iter()
                .map(|t| TableRefJson {
                    schema: t.schema.clone(),
                    name: t.name.clone(),
                })
                .collect();
            emit(cli, Envelope::ok(serde_json::json!({ "tables": rows })));
        }
        Command::Describe { table, schema } => {
            let t: Table = service::describe_table(conn.as_ref(), schema.as_deref(), table)?;
            let data = TableJson {
                schema: t.reference.schema.clone(),
                name: t.reference.name.clone(),
                columns: t.columns.clone(),
                row_count: t.row_count,
            };
            if cli.json {
                emit_json(&Envelope::ok(data));
            } else {
                println!("{}", human_describe(&t));
            }
        }
        Command::Query { sql } => {
            let rs: ResultSet = service::run_query(conn.as_ref(), sql)?;
            if cli.json {
                emit_json(&Envelope::ok(result_set_json(&rs)));
            } else {
                println!("{}", human_result_set(&rs));
            }
        }
        Command::Exec { sql } => {
            let affected = service::run_exec(conn.as_ref(), sql)?;
            emit(
                cli,
                Envelope::ok(serde_json::json!({ "rows_affected": affected })),
            );
        }
    }
    Ok(())
}

/// 结果集的人读形态:第一行是列名,下面每行一条记录。
fn human_result_set(rs: &ResultSet) -> String {
    if rs.columns.is_empty() {
        return format!("(无结果,受影响 {} 行)", rs.rows_affected);
    }
    let headers: Vec<String> = rs.columns.iter().map(|c| c.name.clone()).collect();
    let rows: Vec<Vec<String>> = rs
        .rows
        .iter()
        .map(|r| {
            r.iter()
                .map(|v| match v {
                    seladb_core::core::Value::Null => "NULL".to_owned(),
                    other => other.to_display(),
                })
                .collect()
        })
        .collect();

    // SQLite 是动态类型:同名列每行都可能不同。列宽按每列最宽的那格算。
    let mut widths: Vec<usize> = headers.iter().map(|h| display_width(h)).collect();
    for row in &rows {
        for (i, c) in row.iter().enumerate() {
            widths[i] = widths[i].max(display_width(c));
        }
    }

    let mut out = String::new();
    out.push_str(&join_row(&headers, &widths));
    out.push('\n');
    out.push_str(
        &widths
            .iter()
            .map(|w| "-".repeat(*w))
            .collect::<Vec<_>>()
            .join("  "),
    );
    out.push('\n');
    for row in &rows {
        out.push_str(&join_row(row, &widths));
        out.push('\n');
    }
    out.push_str(&format!("({} 行)", rows.len()));
    out.trim_end().to_owned()
}

/// 表描述的人读形态:先说表是什么,再说列。
fn human_describe(t: &Table) -> String {
    let mut out = String::new();
    let schema = t.reference.schema.as_deref().unwrap_or("-");
    out.push_str(&format!(
        "表 {}.{}",
        schema, t.reference.name
    ));
    match t.row_count {
        Some(n) => out.push_str(&format!("  ({n} 行)")),
        None => out.push_str("  (行数未知)"),
    }
    out.push_str("\n\n");

    let headers = vec![
        "列名".to_owned(),
        "类型".to_owned(),
        "可空".to_owned(),
        "主键".to_owned(),
        "类型族".to_owned(),
    ];
    let rows: Vec<Vec<String>> = t
        .columns
        .iter()
        .map(|c| {
            vec![
                c.name.clone(),
                c.data_type.clone(),
                if c.nullable { "是".into() } else { "否".into() },
                if c.is_primary_key { "是".into() } else { "" .into() },
                format!("{:?}", c.type_kind).to_lowercase(),
            ]
        })
        .collect();

    let mut widths: Vec<usize> = headers.iter().map(|h| display_width(h)).collect();
    for row in &rows {
        for (i, c) in row.iter().enumerate() {
            widths[i] = widths[i].max(display_width(c));
        }
    }
    out.push_str(&join_row(&headers, &widths));
    out.push('\n');
    out.push_str(
        &widths
            .iter()
            .map(|w| "-".repeat(*w))
            .collect::<Vec<_>>()
            .join("  "),
    );
    out.push('\n');
    for row in &rows {
        out.push_str(&join_row(row, &widths));
        out.push('\n');
    }
    out.trim_end().to_owned()
}

/// 一行,按宽度补齐。
fn join_row(cells: &[String], widths: &[usize]) -> String {
    cells
        .iter()
        .enumerate()
        .map(|(i, c)| pad(c, widths[i]))
        .collect::<Vec<_>>()
        .join("  ")
        .trim_end()
        .to_owned()
}

#[derive(Serialize)]
struct TableRefJson {
    schema: Option<String>,
    name: String,
}

fn result_set_json(rs: &ResultSet) -> ResultSetJson {
    ResultSetJson {
        columns: rs.columns.iter().map(|c| c.name.clone()).collect(),
        rows: rs.rows.clone(),
        row_count: rs.rows.len(),
    }
}

/// 组装连接配置。
///
/// `--url` 与分开指定的参数合并：**分开指定的优先**，这样脚本可以先用 URL
/// 带上大部分信息，再用单个参数覆盖其中一个。
fn build_config(cli: &Cli) -> Result<ConnConfig, seladb_core::ServiceError> {
    let mut engine: Option<Engine> = cli.engine.as_deref().and_then(Engine::from_id);
    let mut host = cli.host.clone();
    let mut port = cli.port;
    let mut user = cli.user.clone();
    let mut password = cli.password.clone();
    let mut database = cli.database.clone();
    let mut path = cli.path.clone();

    if let Some(url) = &cli.url {
        let parsed = seladb_core::conn_url::parse(url)
            .map_err(|e| seladb_core::ServiceError::Connect(e.to_string()))?;
        engine.get_or_insert(parsed.engine);
        host = host.or(parsed.host);
        port = port.or(parsed.port);
        user = user.or(parsed.user);
        password = password.or(parsed.password);
        database = database.or(parsed.database);
        path = path.or(parsed.path);
    }

    let engine = engine.ok_or_else(|| {
        seladb_core::ServiceError::Connect("没指定引擎:用 --url 或 --engine".into())
    })?;

    Ok(ConnConfig {
        engine,
        host,
        port,
        user,
        password,
        database,
        path,
    })
}

/// 输出 JSON。
fn emit_json<T: Serialize>(env: &Envelope<T>) {
    match serde_json::to_string_pretty(env) {
        Ok(s) => println!("{s}"),
        Err(e) => println!("{{\"ok\":false,\"error\":\"{e}\"}}"),
    }
}

/// 输出。`--json` 走 JSON，其它走给人看的表格。
fn emit<T: Serialize>(cli: &Cli, env: Envelope<T>) {
    if cli.json {
        emit_json(&env);
    } else if let Some(data) = &env.data {
        // 序列化成 JSON 再转人看的文本 —— 只需要 Serialize，不需要 Debug。
        match serde_json::to_value(data) {
            Ok(v) => println!("{}", human(&v)),
            Err(e) => println!("(输出序列化失败: {e})"),
        }
    }
}

/// 把 JSON 变成人看的文本。
///
/// 对象数组渲染成对齐的表格 —— 数据工具的输出不该是一堆 YAML 碎块。
fn human(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::Object(map) => {
            if map.len() == 1 {
                let (k, val) = map.iter().next().unwrap();
                return match val {
                    serde_json::Value::Array(items) if items.is_empty() => format!("{k}: (空)"),
                    serde_json::Value::Array(items) => {
                        let mut s = format!("{k} ({})", items.len());
                        s.push('\n');
                        s.push_str(&table(items));
                        s
                    }
                    other => format!("{k}: {}", human(other)),
                };
            }
            let mut s = String::new();
            for (k, val) in map {
                s.push_str(&format!("{k}: {}\n", human(val)));
            }
            s.trim_end().to_owned()
        }
        serde_json::Value::Array(items) => {
            if items.is_empty() {
                return "(空)".to_owned();
            }
            if items.iter().all(|i| i.is_object()) {
                return table(items);
            }
            let mut s = String::new();
            for it in items {
                s.push_str(&format!("{}\n", human(it)));
            }
            s.trim_end().to_owned()
        }
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Null => "NULL".to_owned(),
        other => other.to_string(),
    }
}

/// 对象数组 → 对齐的表格。
fn table(items: &[serde_json::Value]) -> String {
    // 收集所有出现过的键,按首次出现排序
    let mut keys: Vec<String> = Vec::new();
    for it in items {
        if let serde_json::Value::Object(m) = it {
            for k in m.keys() {
                if !keys.contains(k) {
                    keys.push(k.clone());
                }
            }
        }
    }
    if keys.is_empty() {
        return "(空)".to_owned();
    }

    let cell = |it: &serde_json::Value, key: &str| -> String {
        match it.get(key) {
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(serde_json::Value::Null) | None => "-".to_owned(),
            Some(other) => other.to_string(),
        }
    };

    let mut widths: Vec<usize> = keys.iter().map(|k| k.chars().count()).collect();
    let rows: Vec<Vec<String>> = items
        .iter()
        .map(|it| keys.iter().map(|k| cell(it, k)).collect())
        .collect();
    for row in &rows {
        for (i, c) in row.iter().enumerate() {
            widths[i] = widths[i].max(c.chars().count());
        }
    }

    let mut out = String::new();
    // 表头
    let head: Vec<String> = keys
        .iter()
        .enumerate()
        .map(|(i, k)| pad(k, widths[i]))
        .collect();
    out.push_str(head.join("  ").trim_end());
    out.push('\n');
    // 分隔线
    let sep: Vec<String> = widths.iter().map(|w| "-".repeat(*w)).collect();
    out.push_str(&sep.join("  "));
    out.push('\n');
    // 数据行
    for row in &rows {
        let line: Vec<String> = row
            .iter()
            .enumerate()
            .map(|(i, c)| pad(c, widths[i]))
            .collect();
        out.push_str(line.join("  ").trim_end());
        out.push('\n');
    }
    out.trim_end().to_owned()
}

/// 按显示宽度补齐。中日韩字符占两列,按 `chars().count()` 补会歪。
fn pad(s: &str, width: usize) -> String {
    let w = display_width(s);
    let mut out = s.to_owned();
    for _ in w..width {
        out.push(' ');
    }
    out
}

/// 字符串的显示宽度(CJK 宽字符算 2)。
fn display_width(s: &str) -> usize {
    s.chars().map(char_width).sum()
}

fn char_width(c: char) -> usize {
    let cp = c as u32;
    // CJK 统一表意文字、全角形式、假名、韩文音节
    if (0x1100..=0x115F).contains(&cp)
        || (0x2E80..=0xA4CF).contains(&cp)
        || (0xAC00..=0xD7A3).contains(&cp)
        || (0xF900..=0xFAFF).contains(&cp)
        || (0xFE30..=0xFE6F).contains(&cp)
        || (0xFF00..=0xFF60).contains(&cp)
        || (0xFFE0..=0xFFE6).contains(&cp)
    {
        2
    } else {
        1
    }
}
