# 引擎支持矩阵

记录各数据库引擎的实现状态与支持档位。随驱动实现进度更新。

## 支持档位定义

| 档位 | 含义 |
|---|---|
| **完整** | 元数据浏览 + 查询 + 写入 + 事务，全部可用且经过验证 |
| **可用** | 核心功能可用（连接、元数据、查询），部分特性未实现或未验证 |
| **部分** | 能连接，但元数据浏览或某类操作受限 |
| **尽力而为** | 依赖社区驱动，特性覆盖有限，不承诺完整 SQL 方言 |
| **计划中** | 尚未实现 |

## 当前状态

**尚未实现任何引擎。** 本表记录的是 `docs/architecture.md` 中确定的选型与计划顺序。

| 引擎 | 驱动 | 计划档位 | 状态 |
|---|---|---|---|
| PostgreSQL | `jackc/pgx/v5` v5.11.0 | 完整 | 计划中 |
| MySQL / MariaDB | `go-sql-driver/mysql` v1.10.1 | 完整 | 计划中 |
| SQLite | `modernc.org/sqlite` v1.60.1 | 完整 | 计划中 |
| SQL Server | `microsoft/go-mssqldb` v1.11.2 | 可用 | 计划中 |
| ClickHouse | `ClickHouse/clickhouse-go/v2` v2.49.0 | 可用 | 计划中 |
| Redis | `redis/go-redis/v9` v9.23.0 | 可用 | 计划中 |
| MongoDB | `mongodb/mongo-go-driver/v2` v2.9.2 | 部分 | 计划中 |
| Oracle | `sijms/go-ora/v2` v2.9.0 | 尽力而为 | 计划中 |

首批建议只做 PostgreSQL + MySQL + SQLite 三个，把引擎抽象和 UI 打磨好之后再扩展。

## 能力矩阵

实现一个引擎后，在这里勾选它实际支持的能力项。列对应 `docs/adr/0005-driver-interfaces.md` 中定义的可选接口。

| 引擎 | Databases | Schemas | Tables | Columns | Query | Exec | 事务 |
|---|---|---|---|---|---|---|---|
| PostgreSQL | — | — | — | — | — | — | — |
| MySQL | — | — | — | — | — | — | — |
| SQLite | — | — | — | — | — | — | — |
| SQL Server | — | — | — | — | — | — | — |
| ClickHouse | — | — | — | — | — | — | — |
| Redis | — | — | — | — | — | — | — |
| MongoDB | — | — | — | — | — | — | — |
| Oracle | — | — | — | — | — | — | — |

> Redis 没有「表」和「列」，MongoDB 没有独立「schema」，这些格子保持空是符合设计的，不应视为缺失。

## 引擎差异说明

记录各引擎在核心抽象下的语义差异，供 UI 层和 service 层参考。

### 列举「库」

- PostgreSQL：一个实例即一个库，库与连接一一对应
- MySQL：同一实例内可有多个 schema，MySQL 社区版没有跨实例库
- SQL Server：库 / schema / 表三层
- Oracle：schema 与用户绑定，连接用户即 schema 属主
- ClickHouse：database → table → partition
- SQLite：单文件，无库概念（file 即连接）
- MongoDB：库 → collection → document
- Redis：无库概念，逻辑上按 key 前缀分组

### 列举「列」的类型映射

各引擎的类型系统差异较大，驱动在边界处统一映射到核心领域类型（`TypeString` / `TypeInt` / `TypeFloat` / `TypeBool` / `TypeTime` / `TypeBytes` / `TypeNull` / `TypeUnknown`）。映射表随实现补充。
