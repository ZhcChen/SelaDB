# ADR-0005：驱动层用小接口 + 注册表

- 状态：已采纳
- 日期：2026-10-21

## 背景

SelaDB 要支持关系型（Postgres、MySQL、SQLite、SQL Server、ClickHouse、Oracle）和非关系型（Redis、MongoDB）两类引擎。它们的能力集差异很大：Redis 没有「表」和「列」，MongoDB 没有「schema」这个概念，Oracle 的事务与元数据语义也和 PostgreSQL 不同。

## 决策

**不定义单一的大接口，而是定义一组小接口 + 引擎注册表。**

```go
type Driver interface {
    Engine() Engine
    Open(ctx context.Context, cfg ConnConfig) (Conn, error)
}

type Conn interface {          // 所有引擎共有的最小能力
    Close() error
    Ping(ctx context.Context) error
}

// 以下为可选能力，通过类型断言探测
type DatabaseLister interface { Databases(ctx) ([]string, error) }
type SchemaLister interface    { Schemas(ctx) ([]string, error) }
type TableLister interface      { Tables(ctx, schema string) ([]Table, error) }
type ColumnLister interface     { Columns(ctx, schema, table string) ([]Column, error) }
type Querier interface          { Query(ctx, sql string, args []any) (*ResultSet, error) }
type Execer interface           { Exec(ctx, sql string, args []any) (ExecResult, error) }
```

引擎模块在初始化时注册自己：

```rust
// 每个引擎模块实现 Driver 后调用 driver::register
```

使用方按能力探测：

```rust
if let Some(lister) = conn.as_table_lister() {
    let tables = lister.tables(ctx, schema)?;
}
```

## 理由

1. **避免被迫实现不可能的方法**。一个大接口里如果有 `ListColumns`，Redis 就必须提供一个永远返回错误的实现 —— 这种「永久失败的方法」是接口污染的典型来源
2. **UI 层能自然降级**。Redis 连接上不显示「表」树，MongoDB 上不显示「schema」下拉，能力缺失处直接隐藏，而不是显示一个报错按钮
3. **新增引擎成本低**。实现一个只读查询的引擎时，只需实现 `Driver` + `Conn` + `Querier` 三个
4. **符合 Go 惯例**。Go 社区偏好小接口 + 类型断言，而非面向实现的胖接口

## 后果

- 调用方要做类型断言，代码比胖接口啰嗦
- 需要一份「引擎能力矩阵」的文档，供 UI 层决定显示什么。放在 `docs/engine-support.md`，随引擎支持情况维护
- **不能**用宏或代码生成来消除能力探测的样板代码 —— 那样会把编译期检查换成运行时失败，得不偿失

## 修订：Rust 里的能力探测形状（2026-10-24）

ADR 原文用的是 Go 的类型断言（`conn.(TableLister)`）。**Rust 里 `dyn Conn`
不能下转型成 `dyn TableLister`** —— `Any::downcast_ref` 要求目标类型是
`Sized`，trait object 不是。

Rust 侧采用等价写法：**可选能力各有一个返回 `Option<&dyn Trait>` 的访问器，
默认实现是 `None`**，实现了该能力的连接覆写对应项。放在 `Conn` 上，
由 `ConnExt` 转发。

这没有改变 ADR 的本意：操作仍然住在各自的小 trait 里，`Conn` 上**没有**
`list_columns()` 这种「逼所有引擎都实现、Redis 只能永远报错」的方法 ——
Redis 只是不覆写 `table_lister()`，那项能力就不存在。

SQLite 驱动是这套形状的第一个实例：它实现了 `DatabaseLister` /
`TableLister` / `ColumnLister` / `Querier` / `Execer`，
**故意不实现 `SchemaLister`** —— SQLite 没有 schema 概念。
`crates/seladb-core/tests/service.rs` 里有断言守着这件事，
防止以后有人「顺手补一个返回空列表的实现」。
