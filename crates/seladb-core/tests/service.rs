//! 服务层集成测试。
//!
//! 用真实的 SQLite 文件跑完整通路:驱动 → 能力探测 → service → 结果。
//! 不打桩 —— 桩只能证明桩自己是对的。

use std::path::PathBuf;

use seladb_core::core::ConnConfig;
use seladb_core::driver::ConnExt;
use seladb_core::service;

/// 临时 SQLite 库路径。带进程号与计数器,避免并行测试互相踩。
fn temp_db(tag: &str) -> PathBuf {
    use std::sync::atomic::{AtomicU32, Ordering};
    static N: AtomicU32 = AtomicU32::new(0);
    let n = N.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join("seladb-core-tests");
    std::fs::create_dir_all(&dir).expect("建临时目录");
    dir.join(format!("{tag}-{}-{n}.db", std::process::id()))
}

fn sqlite_conn(path: &PathBuf) -> Box<dyn seladb_core::driver::Conn> {
    seladb_core::init();
    let cfg = ConnConfig {
        engine: seladb_core::core::Engine::Sqlite,
        host: None,
        port: None,
        user: None,
        password: None,
        database: None,
        path: Some(path.to_string_lossy().into_owned()),
    };
    service::connect(&cfg).expect("连上 SQLite")
}

fn make_db(path: &PathBuf) {
    let conn = sqlite_conn(path);
    let execer = conn.as_execer().expect("SQLite 应支持写操作");
    execer
        .exec(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                balance REAL,
                is_active BOOLEAN
             )",
            &[],
        )
        .expect("建表");
    execer
        .exec(
            "INSERT INTO users VALUES
                (1, '伟', 'wei@example.com', 4320.50, 1),
                (2, '娜', 'na@example.com', 91.73, 0),
                (3, '强', NULL, 2833.27, 1)",
            &[],
        )
        .expect("插数据");
}

#[test]
fn lists_tables() {
    let path = temp_db("tables");
    make_db(&path);
    let conn = sqlite_conn(&path);

    let tables = service::list_tables(conn.as_ref(), None).expect("列表");
    let names: Vec<_> = tables.iter().map(|t| t.name.as_str()).collect();
    assert_eq!(names, vec!["users"]);
}

#[test]
fn sqlite_has_no_schema_capability() {
    // 能力探测的核心断言:SQLite 没有 schema 概念,这一项必须探测不到。
    // 探测到就意味着有人写了「永远返回空」的凑数方法 —— ADR-0005 明令禁止。
    let path = temp_db("nocap");
    make_db(&path);
    let conn = sqlite_conn(&path);

    assert!(
        conn.as_schema_lister().is_none(),
        "SQLite 不该有 schema 能力"
    );
    assert!(conn.as_table_lister().is_some(), "SQLite 该有表能力");
    assert!(conn.as_querier().is_some(), "SQLite 该有查询能力");
}

#[test]
fn describes_columns_with_types_and_pk() {
    let path = temp_db("describe");
    make_db(&path);
    let conn = sqlite_conn(&path);

    let t = service::describe_table(conn.as_ref(), None, "users").expect("描述");
    assert_eq!(t.columns.len(), 5);

    let id = &t.columns[0];
    assert_eq!(id.name, "id");
    assert!(id.is_primary_key);
    assert_eq!(id.type_kind, seladb_core::core::TypeKind::Int);

    let name = &t.columns[1];
    assert_eq!(name.name, "name");
    assert!(!name.nullable, "NOT NULL 列应报不可空");

    let balance = &t.columns[3];
    assert_eq!(balance.type_kind, seladb_core::core::TypeKind::Float);
}

#[test]
fn row_count_is_present_for_existing_table() {
    let path = temp_db("rowcount");
    make_db(&path);
    let conn = sqlite_conn(&path);

    let t = service::describe_table(conn.as_ref(), None, "users").expect("描述");
    assert_eq!(t.row_count, Some(3));
}

#[test]
fn queries_rows_and_types() {
    let path = temp_db("query");
    make_db(&path);
    let conn = sqlite_conn(&path);

    let rs = service::run_query(conn.as_ref(), "SELECT id, name, balance FROM users ORDER BY id")
        .expect("查询");

    assert_eq!(rs.columns.len(), 3);
    assert_eq!(rs.rows.len(), 3);
    assert_eq!(rs.rows[0][1], seladb_core::core::Value::Text("伟".into()));
    assert_eq!(rs.rows[1][2], seladb_core::core::Value::Float(91.73));
    assert_eq!(rs.rows[2][2], seladb_core::core::Value::Float(2833.27));
}

#[test]
fn null_is_distinct_from_text_null() {
    let path = temp_db("null");
    make_db(&path);
    let conn = sqlite_conn(&path);

    let rs = service::run_query(conn.as_ref(), "SELECT email FROM users WHERE id = 3")
        .expect("查询");
    assert_eq!(rs.rows[0][0], seladb_core::core::Value::Null);

    let rs = service::run_query(conn.as_ref(), "SELECT 'NULL' AS s").expect("查询");
    assert_eq!(rs.rows[0][0], seladb_core::core::Value::Text("NULL".into()));
}

#[test]
fn empty_result_is_not_an_error() {
    let path = temp_db("empty");
    make_db(&path);
    let conn = sqlite_conn(&path);

    let rs = service::run_query(conn.as_ref(), "SELECT id FROM users WHERE id > 999")
        .expect("查询");
    assert!(rs.rows.is_empty());
    assert_eq!(rs.columns.len(), 1);
}

#[test]
fn bad_sql_is_reported_as_error() {
    let path = temp_db("badsql");
    make_db(&path);
    let conn = sqlite_conn(&path);

    let err = service::run_query(conn.as_ref(), "SELECT FROM WHERE").unwrap_err();
    assert!(matches!(err, seladb_core::ServiceError::Query(_)));
}

#[test]
fn unsupported_capability_is_reported_not_faked() {
    // SQLite 没有 schema 能力 → 列出 schema 应该是「不支持」而不是空列表冒充成功。
    let path = temp_db("unsupported");
    make_db(&path);
    let conn = sqlite_conn(&path);

    assert!(conn.as_schema_lister().is_none());
    // list_schemas 走降级路径:返回空列表(不是错误),因为「这个引擎没有 schema」
    // 是正常状态。调用方靠 as_schema_lister() 区分「没有」与「有但是空的」。
    let schemas = service::list_schemas(conn.as_ref()).expect("降级");
    assert!(schemas.is_empty());
}

#[test]
fn registry_reports_registered_engines() {
    seladb_core::init();
    let engines = seladb_core::driver::global_registry().engines();
    assert!(engines.contains(&seladb_core::core::Engine::Sqlite));
}

#[test]
fn unregistered_engine_reports_no_driver() {
    // 没注册的引擎必须明确报「尚未接入驱动」,不能悄悄连到别的引擎。
    let cfg = ConnConfig {
        engine: seladb_core::core::Engine::Redis,
        host: Some("localhost".into()),
        port: None,
        user: None,
        password: None,
        database: None,
        path: None,
    };
    // Box<dyn Conn> 没�� Debug,不能 unwrap_err —— 用 match 拿错误。
    match service::connect(&cfg) {
        Ok(_) => panic!("未注册的引擎不该连上"),
        Err(e) => assert!(matches!(e, seladb_core::ServiceError::NoDriver(_))),
    }
}
