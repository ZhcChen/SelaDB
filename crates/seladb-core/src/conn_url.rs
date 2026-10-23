//! 连接串解析。
//!
//! 放在 core 层而不是 CLI：解析连接串是业务规则的一部分（哪些形态合法、
//! 引擎名怎么别名、SQLite 的路径怎么取），CLI 只该把参数传进来。
//!
//! 支持两种形态：
//!
//! ```text
//! scheme://[user[:password]@][host[:port]][/database]
//! scheme:///absolute/path          —— SQLite 文件路径
//! ```

use crate::core::{ConnConfig, Engine};

/// 解析失败。
#[derive(Debug, thiserror::Error)]
#[error("连接串解析失败: {0}")]
pub struct ParseError(pub String);

/// 从连接串解析出连接配置。
///
/// 认不出的 scheme 直接报错 —— 不猜引擎。
pub fn parse(url: &str) -> Result<ConnConfig, ParseError> {
    let (scheme, rest) = url
        .split_once("://")
        .ok_or_else(|| ParseError("缺少 scheme://".into()))?;
    let engine = Engine::from_id(scheme).ok_or_else(|| ParseError(format!("未知引擎: {scheme}")))?;

    // SQLite 的路径直接取全部剩余部分 —— 路径里可以有冒号和斜杠。
    //
    // 注意斜杠的个数:`sqlite:///abs/path` 里第三个斜杠**就是路径自己的首斜杠**,
    // 剥掉它会把绝对路径变成相对路径。`sqlite://rel/path` 才是相对路径。
    // 所以这里原样取 rest,不剥前导斜杠。
    if engine == Engine::Sqlite {
        return Ok(ConnConfig {
            engine,
            host: None,
            port: None,
            user: None,
            password: None,
            database: None,
            path: Some(rest.to_owned()),
        });
    }

    let (authority, database) = match rest.split_once('/') {
        Some((a, d)) => (a, Some(d.to_owned())),
        None => (rest, None),
    };
    let (userinfo, hostport) = match authority.rsplit_once('@') {
        Some((u, h)) => (Some(u), h),
        None => (None, authority),
    };
    let (user, password) = match userinfo {
        Some(u) => match u.split_once(':') {
            Some((a, b)) => (Some(a.to_owned()), Some(b.to_owned())),
            None => (Some(u.to_owned()), None),
        },
        None => (None, None),
    };
    let (host, port): (Option<String>, Option<u16>) = match hostport.rsplit_once(':') {
        Some((h, p)) => (
            Some(h.to_owned()),
            Some(
                p.parse::<u16>()
                    .map_err(|_| ParseError(format!("端口不是数字: {p}")))?,
            ),
        ),
        None => {
            if hostport.is_empty() {
                (None, None)
            } else {
                (Some(hostport.to_owned()), None)
            }
        }
    };

    Ok(ConnConfig {
        engine,
        host,
        port,
        user,
        password,
        database,
        path: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sqlite_absolute_path_keeps_leading_slash() {
        // `sqlite:///abs/path` 的第三个斜杠是路径自己的首斜杠 —— 剥掉它
        // 会把绝对路径变成相对路径。验收脚本用真绝对路径时抓到过这个。
        let c = parse("sqlite:///tmp/a b/c.db").unwrap();
        assert_eq!(c.engine, Engine::Sqlite);
        assert_eq!(c.path.as_deref(), Some("/tmp/a b/c.db"));
    }

    #[test]
    fn sqlite_relative_path_no_leading_slash() {
        let c = parse("sqlite://data.db").unwrap();
        assert_eq!(c.path.as_deref(), Some("data.db"));
    }

    #[test]
    fn full_relational_url() {
        let c = parse("postgresql://alice:s3cret@db.internal:5433/app").unwrap();
        assert_eq!(c.engine, Engine::PostgreSql);
        assert_eq!(c.user.as_deref(), Some("alice"));
        assert_eq!(c.password.as_deref(), Some("s3cret"));
        assert_eq!(c.host.as_deref(), Some("db.internal"));
        assert_eq!(c.port, Some(5433));
        assert_eq!(c.database.as_deref(), Some("app"));
    }

    #[test]
    fn host_only_url() {
        let c = parse("mysql://localhost").unwrap();
        assert_eq!(c.engine, Engine::MySql);
        assert_eq!(c.host.as_deref(), Some("localhost"));
        assert_eq!(c.port, None);
    }

    #[test]
    fn engine_aliases() {
        assert_eq!(parse("postgres://h/x").unwrap().engine, Engine::PostgreSql);
        assert_eq!(parse("mongodb://h/x").unwrap().engine, Engine::MongoDb);
        assert_eq!(parse("mariadb://h/x").unwrap().engine, Engine::MySql);
    }

    #[test]
    fn unknown_engine_errors() {
        assert!(parse("oracle://h/x").is_err());
    }

    #[test]
    fn missing_scheme_errors() {
        assert!(parse("localhost:5432/db").is_err());
    }

    #[test]
    fn non_numeric_port_errors() {
        assert!(parse("postgresql://h:abc/db").is_err());
    }
}
