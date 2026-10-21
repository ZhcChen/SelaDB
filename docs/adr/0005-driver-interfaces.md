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

引擎包在 `init()` 中注册自己：

```go
func init() {
    driver.Register(&PostgresDriver{})
}
```

使用方按能力探测：

```go
if lister, ok := conn.(driver.TableLister); ok {
    tables, err := lister.Tables(ctx, schema)
}
```

## 理由

1. **避免被迫实现不可能的方法**。一个大接口里如果有 `ListColumns`，Redis 就必须提供一个永远返回错误的实现 —— 这种「永久失败的方法」是接口污染的典型来源
2. **UI 层能自然降级**。Redis 连接上不显示「表」树，MongoDB 上不显示「schema」下拉，能力缺失处直接隐藏，而不是显示一个报错按钮
3. **新增引擎成本低**。实现一个只读查询的引擎时，只需实现 `Driver` + `Conn` + `Querier` 三个
4. **符合 Go 惯例**。Go 社区偏好小接口 + 类型断言，而非面向实现的胖接口

## 后果

- 调用方要做类型断言，代码比胖接口啰嗦
- 需要一份「引擎能力矩阵」的文档，供 UI 层决定显示什么。计划放在 `docs/engine-support.md`，随引擎支持情况维护
- **不能**用反射或代码生成来消除类型断言的样板代码 —— 那样会把编译期检查换成运行时失败，得不偿失
