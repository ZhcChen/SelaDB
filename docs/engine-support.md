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

| 引擎 | 驱动（同步） | 许可 | 目标档位 | 当前档位 | 状态 |
|---|---|---|---|---|---|
| SQLite | `rusqlite` 0.40.2 | MIT | 可用 | **可用** | ✅ 已实现（2026-10-24） |
| PostgreSQL | `postgres` 0.19.14 | MIT OR Apache-2.0 | 完整 | — | 计划中 |
| MySQL / MariaDB | `mysql` 28.0.4 | MIT OR Apache-2.0 | 完整 | — | 计划中 |
| ClickHouse | `clickhouse-rs` 0.1.21 | MIT | 可用 | — | 计划中 |
| Redis | `redis` 1.8.0 | BSD-3-Clause | 可用 | — | 计划中 |
| MongoDB | **无同步驱动** | — | 部分 | — | 后置 |
| SQL Server | **无同步驱动**（`tiberius` 0.13.0 是异步） | — | 可用 | — | 后置 |
| Oracle | 待选 | — | 尽力而为 | — | 计划中 |

### 驱动层是全同步的（2026-10-24 定）

`Driver::open` 与全部能力 trait 都是同步 `fn`。这是**主动选型**，不是省事。

理由：GUI 是事件循环模型，主线程不能被 DB 操作阻塞，所以 DB 操作本来就要
落在 worker 线程上 —— 同步 trait 与这个形态天然合拍。反过来，async 会在
core / service / CLI / 未来的 MCP / GUI 之间**传染**（Rust 里 async 一旦
进来就很难不进来），代价远大于收益。

代价是明确的，记在这里：

- **MongoDB 与 SQL Server 没有同步驱动**（`mongodb` 与 `tiberius` 都是
  tokio-based）。这两个后置。届时用「驱动内部自己起线程 + 通道」的方式包，
  **上层一行不用改**。
- 同步 socket 的查询卡住会占住 worker 线程，靠连接池 + `statement_timeout`
  兜住。
- **不用 `sqlx`**：它 0.9.0 要 rust 1.94，而 workspace 的 MSRV 是 1.87
  （accesskit 0.25.1 的下限）。`postgres` 只要 1.85。

SQLite 是**第一个**落地的引擎，不是随手挑的 —— 它不需要服务器、不需要网络、
能用 `bundled` 特性静态编译，是验证「引擎抽象站不站得住」最省事的样本。
拿它当第一块，后面每个引擎照它的形状抄。

### SQLite 当前做到哪一步

已实现：连接、列出数据库（附着库）、列出表、列出列（含类型/可空/主键）、
查询、写操作、行数估计。

**没有实现**：事务、schema（SQLite 没这个概念）、DDL 预览、类型元数据
（`PRAGMA table_info` 给的类型声明是原样透传的，不是引擎归一化的类型）。

---

## 能力矩阵

列对应 `docs/adr/0005-driver-interfaces.md` 中定义的可选接口。
`—` 表示该引擎压根没有这个概念，**不是**「没实现」。

| 引擎 | Databases | Schemas | Tables | Columns | Query | Exec | 事务 |
|---|---|---|---|---|---|---|---|
| SQLite | ✅ | — | ✅ | ✅ | ✅ | ✅ | — |
| PostgreSQL | — | — | — | — | — | — | — |
| MySQL | — | — | — | — | — | — | — |
| SQL Server | — | — | — | — | — | — | — |
| ClickHouse | — | — | — | — | — | — | — |
| Redis | — | — | — | — | — | — | — |
| MongoDB | — | — | — | — | — | — | — |
| Oracle | — | — | — | — | — | — | — |

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
