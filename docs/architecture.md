# SelaDB 架构与技术选型

> 状态：初版（2026-10-21）
> 定位：跨平台（Windows / macOS / Linux）数据库管理软件
> 关键约束：**全栈 Go**、**CGO_ENABLED=0**、**核心库不感知 UI 与引擎**

---

## 1. 总体架构

SelaDB 采用「一个核心，多种外壳」的结构。核心库负责所有数据库能力，对外暴露稳定的 Go API；CLI、GUI、MCP Server 三种形态都是核心库的消费者，共享同一套业务逻辑，不重复实现。

```
                    ┌──────────────────────────────────────┐
                    │            SelaDB Core              │
                    │  （engine-agnostic / UI-agnostic）   │
                    │                                      │
                    │  core     领域模型、对象元数据         │
                    │  driver   驱动接口 + 引擎注册表        │
                    │  query    查询执行、结果集、SQL 处理    │
                    │  session  连接会话、凭据管理           │
                    │  config   配置加载                    │
                    └───────────────┬──────────────────────┘
                                    │  稳定的 Go API
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
    ┌───────▼────────┐    ┌─────────▼─────────┐    ┌────────▼────────┐
    │  CLI (Go)      │    │  GUI (Go + Gio)   │    │  MCP Server(Go) │
    │  Bubble Tea v2 │    │  Metal/D3D11/     │    │  官方 go-sdk    │
    │  + Cobra       │    │  Vulkan 原生渲染   │    │  核心操作→工具   │
    └───────┬────────┘    └─────────┬─────────┘    └────────┬────────┘
            │                       │                       │
            └───────────────────────┴───────────────────────┘
                                    │
                          Skill / Agent 包装层
                    （薄封装，调用 CLI 的 --json 输出）
```

**关键点：三条外壳是平行的，不是主次关系。** CLI 不是「降级版本」，GUI 不是「独立产品」，MCP 也不是「附加功能」。它们共享 `pkg/seladb` 暴露的同一套服务方法。

---

## 2. 技术选型清单

版本为 2026-10-21 通过 Go module proxy 核实的实际可用版本。

### 2.1 界面层

| 用途 | 选型 | 版本 | 理由 |
|---|---|---|---|
| CLI 子命令框架 | `spf13/cobra` | v1.10.2 | 事实标准，子命令树 + 文档生成，适合做 `seladb <资源> <动作>` 结构 |
| CLI 交互界面 | `charmbracelet/bubbletea` v2 | v2.1.0 | v2 已于 2026-10 转正；纯 Go，Elm 架构，适合做表格式数据浏览 |
| CLI 样式 | `charmbracelet/lipgloss` v2 | v2.0.6 | 与 Bubble Tea v2 同代，布局与颜色统一 |
| CLI 组件库 | `charmbracelet/bubbles` v2 | v2.2.1 | 现成的 table / viewport / textarea / list |
| GUI 框架 | `gioui.org`（Gio） | v0.10.3 | Go 直接走平台原生 GPU：macOS Metal、Windows D3D11、Linux Vulkan；中文输入法是协议级完整实现 |

> **关于 GUI**：需求确定为「Go + 原生平台 GPU 渲染」，因此不采用系统 WebView 路线（Wails / Electron）。Gio 的代价是无现成的 Table 与 Tree 组件，需基于 `layout.List` 自建（预计 800–1500 行 + 300–500 行）。完整方案见 [`docs/gui-architecture.md`](gui-architecture.md)。

### 2.2 MCP 与协议层

| 用途 | 选型 | 版本 | 理由 |
|---|---|---|---|
| MCP Server SDK | `modelcontextprotocol/go-sdk` | v1.8.0 | 官方 Go SDK，协议演进有保障 |

### 2.3 数据库驱动

全部为**纯 Go 实现**（`CGO_ENABLED=0` 可编译）：

| 引擎 | 驱动 | 版本 | 备注 |
|---|---|---|---|
| PostgreSQL | `jackc/pgx/v5` | v5.11.0 | 原生 API，批量与流式查询性能好，不用 `database/sql` |
| MySQL / MariaDB | `go-sql-driver/mysql` | v1.10.1 | 事实标准 |
| SQLite | `modernc.org/sqlite` | v1.60.1 | C 转 Go 的完整实现；备选 `ncruces/go-sqlite3` v0.35.6（WASM，编译更快、体积更小） |
| SQL Server | `microsoft/go-mssqldb` | v1.11.2 | |
| ClickHouse | `ClickHouse/clickhouse-go/v2` | v2.49.0 | |
| Redis | `redis/go-redis/v9` | v9.23.0 | 非 SQL，走独立能力接口 |
| MongoDB | `mongodb/mongo-go-driver/v2` | v2.9.2 | 非 SQL |
| Oracle | `sijms/go-ora/v2` | v2.9.0 | 纯 Go；`godror` 需要 cgo，不采用 |

### 2.4 基础设施

| 用途 | 选型 | 说明 |
|---|---|---|
| 凭据存储 | 系统钥匙串（macOS Keychain / Windows Credential Manager / libsecret） | 密码不进配置文件 |
| 配置格式 | YAML | 人可编辑，适合存放连接配置模板 |
| 日志 | `log/slog` | 标准库，结构化日志 |

---

## 3. 仓库结构

**单 module、多 package**。当前不拆多个 `go.mod`（理由见 ADR-0001）。

```
SelaDB/
├── go.mod
├── cmd/
│   ├── seladb/              # CLI 入口：子命令 + 交互式 TUI
│   ├── seladb-gui/          # GUI 入口（Gio，後期）
│   └── seladb-mcp/          # MCP Server 入口
├── internal/
│   ├── core/                # 领域模型：连接、数据库对象、列元数据
│   ├── driver/              # 驱动接口定义 + 引擎注册表
│   │   ├── postgres/
│   │   ├── mysql/
│   │   ├── sqlite/
│   │   ├── mssql/
│   │   ├── clickhouse/
│   │   ├── redis/
│   │   ├── mongo/
│   │   └── oracle/
│   ├── query/               # 查询执行、结果集、SQL 解析与格式化
│   ├── session/             # 连接会话生命周期、凭据
│   ├── service/             # 用例编排层：CLI / GUI / MCP 共用
│   ├── config/              # 配置加载
│   ├── tui/                 # Bubble Tea 交互界面
│   └── mcp/                 # MCP 工具定义与适配
├── pkg/
│   └── seladb/              # 对外稳定 API（第三方与其它项目可依赖）
├── docs/
│   ├── architecture.md      # 本文件
│   └── adr/                 # 架构决策记录
├── internal/ui/             # Gio 界面层（唯一的 gioui.org import 边界）
└── .specify/                # Spec Kit 工作流
```

### 分层规则

- `internal/` 不对外承诺兼容性，可自由重构
- `pkg/seladb/` 是对外契约，变更需走 ADR
- `service` 层是**唯一的业务逻辑落点**。CLI 命令、GUI 绑定、MCP 工具都只做「参数解析 → 调 service → 格式化输出」，不含业务判断
- `driver` 层只做「把引擎的原生语义翻译成核心抽象」，不做业务编排

---

## 4. 核心抽象

### 4.1 驱动接口：小接口 + 类型断言

**不要**定义一个包含所有能力的大接口 —— Redis 无法实现 `ListColumns`，Oracle 的事务语义也与 PostgreSQL 不同。

```go
package driver

// 引擎标识
type Engine string

// 驱动工厂：注册到全局注册表
type Driver interface {
    Engine() Engine
    Open(ctx context.Context, cfg ConnConfig) (Conn, error)
}

// 连接：只包含所有引擎共有的最小能力
type Conn interface {
    Close() error
    Ping(ctx context.Context) error
}

// 以下能力按引擎可用性，通过类型断言探测
type DatabaseLister interface {  // 列举库
    Databases(ctx context.Context) ([]string, error)
}
type SchemaLister interface {     // 列举 schema
    Schemas(ctx context.Context) ([]string, error)
}
type TableLister interface {       // 列举表
    Tables(ctx context.Context, schema string) ([]Table, error)
}
type ColumnLister interface {      // 列举列
    Columns(ctx context.Context, schema, table string) ([]Column, error)
}
type Querier interface {           // 执行查询
    Query(ctx context.Context, sql string, args []any) (*ResultSet, error)
}
type Execer interface {            // 执行写入
    Exec(ctx context.Context, sql string, args []any) (ExecResult, error)
}
```

使用方写法：

```go
if lister, ok := conn.(driver.TableLister); ok {
    tables, err := lister.Tables(ctx, schema)
}
```

这样新增一个引擎时，只需实现它天然支持的那几项，缺失的能力由 UI 层降级隐藏。

### 4.2 Service 层：三种外壳的唯一共用点

```go
package service

type Service struct { /* 持有连接池、配置、凭据 */ }

func (s *Service) ListDatabases(ctx context.Context, connID string) ([]string, error)
func (s *Service) ListTables(ctx context.Context, connID, schema string) ([]Table, error)
func (s *Service) ListColumns(ctx context.Context, connID, schema, table string) ([]Column, error)
func (s *Service) Query(ctx context.Context, connID, sql string, opts QueryOptions) (*ResultSet, error)
func (s *Service) Execute(ctx context.Context, connID, sql string) (*ExecResult, error)
```

- CLI：`seladb tables --conn prod --json` → 调 `ListTables` → JSON 编码
- MCP：工具 `list_tables` → 调 `ListTables` → JSON 编码（几乎同构）
- GUI：`internal/ui/` 直接调 `ListTables` → 拿到领域类型 → Gio 渲染

### 4.3 结果集统一模型

```go
type ResultSet struct {
    Columns []Column
    Rows    [][]any
    Total   int64     // 受影响行数
    Elapsed time.Duration
}
```

列类型统一为领域类型（`TypeString` / `TypeInt` / `TypeFloat` / `TypeBool` / `TypeTime` / `TypeBytes` / `TypeNull` / `TypeUnknown`），由各驱动在边界处完成映射，避免上层到处做类型断言。

---

## 5. CLI 形态

一套命令，两种用法：

```bash
# 脚本化 / Agent 调用：结构化输出
seladb connections list --json
seladb tables --conn prod --schema public --json
seladb query --conn prod --sql "select * from users limit 10" --json
seladb schema --conn prod --table users --json

# 交互式：直接运行进入 TUI
seladb
```

**`--json` 是硬性要求**，不是可选优化。理由：Skill 包装、MCP 工具、CI 脚本三条路径都依赖机器可读输出。

**Skill 包装的形态**（供 MCode / Codex / Claude Code 使用）：

```markdown
---
name: seladb
description: 查询 SelaDB 中已配置的数据库连接。当用户提到某个数据库连接、
  需要查看表结构、列信息或执行只读查询时使用。
---

连接已在 seladb 配置中管理。使用以下命令：
- 列出连接：seladb connections list --json
- 列出表：  seladb tables --conn <名称> --json
- 查看结构：seladb schema --conn <名称> --table <表名> --json
- 执行查询：seladb query --conn <名称> --sql "<SQL>" --json

注意：只读。写操作需要用户明确确认。
```

---

## 6. MCP Server 形态

`seladb-mcp` 把 service 层的方法注册为 MCP 工具：

| 工具 | 对应 service 方法 | 说明 |
|---|---|---|
| `list_connections` | `ListConnections` | 列出已配置的连接（不含密码） |
| `list_databases` | `ListDatabases` | |
| `list_tables` | `ListTables` | |
| `list_columns` | `ListColumns` | |
| `query` | `Query` | 只读查询，带行数上限 |

工具实现是 service 调用的薄包装，不含额外业务逻辑。**MCP Server 与 CLI 复用同一份 service 代码**，因此两边行为永远一致。

---

## 7. 构建矩阵

### 7.1 CLI / MCP Server（纯 Go，无 CGO）

| 目标平台 | GOOS | GOARCH | CGO_ENABLED | 产物 |
|---|---|---|---|---|
| macOS Apple Silicon | darwin | arm64 | 0 | `seladb` |
| macOS Intel | darwin | amd64 | 0 | `seladb` |
| Windows x64 | windows | amd64 | 0 | `seladb.exe` |
| Windows ARM64 | windows | arm64 | 0 | `seladb.exe` |
| Linux x64 | linux | amd64 | 0 | `seladb` |
| Linux ARM64 | linux | arm64 | 0 | `seladb` |

三平台交叉编译**不需要任何额外工具链**（本机无 mingw-w64 也能出 Windows 包）。这是坚持纯 Go 的直接收益。

### 7.2 GUI（Gio）

| 目标平台 | 构建方式 | CGO | 额外依赖 |
|---|---|---|---|
| macOS arm64 / amd64 | macOS runner 原生构建 | 1 | Xcode CLT（Gio 的 `app/os_darwin.m` 需要 cgo） |
| Windows amd64 / arm64 | Windows runner 原生构建 | 0 | 无（D3D11 / EGL 路径均为纯 Go） |
| Linux amd64 / arm64 | Linux 容器构建 | 0（X11）/ 1（Wayland） | `libx11`、`libxkbcommon` 等 X11 开发包 |

**GUI 不做跨平台交叉编译。** cgo 图形栈的交叉编译代价极高，macOS 与 Windows 各自平台原生构建，Linux 用容器构建。这与 CLI 的「交叉编译出包」策略是两条独立流水线。

### 7.3 建议的发布流水线

```
tag 触发
  ├─ 矩阵构建 CLI/MCP：6 个目标（纯 Go，无容器，交叉编译）
  └─ 矩阵构建 GUI：macOS runner + Windows runner + Linux 容器（各自原生构建）
```

---

## 8. 已知风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| TUI 中文 IME 输入 | 中文字段名/注释录入体验差 | 优先用 GUI；CLI 的输入场景以命令与标识符为主，中文只读场景可用 |
| TUI 表格宽字符对齐 | 中文列名可能导致列错位 | 渲染时按显示宽度（runewidth）计算，非字节数或 rune 数 |
| 驱动版本升级 | 行为变更 | 锁 `go.sum`，用 Renovate/Dependabot 控节奏 |
| Oracle 驱动成熟度 | `sijms/go-ora` 特性覆盖不如商业驱动 | 列为「尽力而为」支持等级，不承诺完整 SQL 方言 |
| Gio 处于 0.x，API 频繁破坏性变更 | 升级时编译失败 | 全部 Gio 代码关在 `internal/ui/`，包外禁止 import `gioui.org`；CI 每周试升级 |
| Gio 无 Table / Tree 组件 | GUI 核心工作量增加 | 基于 `layout.List` 自建；开发前先做技术验证（10 万行表格 + 中文输入 + IME 与虚拟滚动共存） |
| 依赖不能锁版本 | 无法回移 bugfix | 锁 `go.mod` 版本但不锁 tag，CI 主动试升级而非被动等破坏 |

---

## 9. 后续待定项

以下尚未决策，需要在对应功能开工前确定：

- **GUI 技术验证结论**：10 万行虚拟化表格、中文输入法三平台实测、IME 与虚拟滚动共存 —— 这三项决定 Gio 路线是否成立，见 [`docs/gui-architecture.md`](gui-architecture.md) 第 8 节
- **首批支持的引擎**：建议 Postgres + MySQL + SQLite 起步
- **凭据存储的具体实现**：系统钥匙串各平台的 Go 库选型
- **SQL 解析库**：`xwb1989/sqlparser` 已停止维护（最后提交 2018 年），需在 Vitess 系 fork、bytebase 解析器 或方言专用解析器之间选型
- **是否支持本地文件型数据库直接打开**（如 `.duckdb`、`.sqlite3` 文件）—— 需确认是否引入 duckdb 的 cgo 依赖
- **GUI 主题与字体策略**：深色为主还是双主题；内置字体（体积换一致性）还是系统字体（体积换通用性）
