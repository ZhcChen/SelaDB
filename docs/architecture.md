# SelaDB 架构与技术选型

> 状态：2026-10-21 定稿
> 定位：跨平台（Windows / macOS / Linux）数据库管理软件
> 关键约束：**全项目 Rust**、**核心库不感知 UI 与引擎**、**只依赖宽松许可证**

---

## 1. 总体架构

SelaDB 采用「一个核心，多种外壳」的结构。核心库负责所有数据库能力，对外暴露稳定的 Rust API；CLI、GUI、MCP Server 三种形态都是核心库的消费者，共享同一套业务逻辑，不重复实现。

```
                    ┌──────────────────────────────────────┐
                    │          seladb-core                 │
                    │   （engine-agnostic / UI-agnostic）   │
                    │                                      │
                    │  core     领域模型、对象元数据         │
                    │  driver   驱动 trait + 引擎注册表     │
                    │  query    查询执行、结果集、SQL 处理   │
                    │  session  连接会话、凭据管理          │
                    │  service  用例编排（业务逻辑唯一落点）  │
                    │  config   配置加载                   │
                    └───────────────┬──────────────────────┘
                                    │  稳定的 Rust API
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
    ┌───────▼────────┐    ┌─────────▼─────────┐    ┌────────▼────────┐
    │ seladb-cli     │    │  seladb-gui       │    │  seladb-mcp     │
    │  clap          │    │  gpui             │    │  rmcp           │
    │  --json 输出    │    │  Metal/D3D12/     │    │  核心操作→工具   │
    │                │    │  Vulkan 原生渲染   │    │                 │
    └───────┬────────┘    └─────────┬─────────┘    └────────┬────────┘
            │                       │                       │
            └───────────────────────┴───────────────────────┘
                                    │
                          Skill / Agent 包装层
                    （薄封装，调用 CLI 的 --json 输出）
```

**关键点：三条外壳是平行的，不是主次关系。** CLI 不是「降级版本」，GUI 不是「独立产品」，MCP 也不是「附加功能」。它们共享 `seladb-core` 暴露的同一套服务方法。

---

## 2. 技术选型清单

版本为 2026-10-21 从 crates.io / crates 索引 / 上游仓库核实。

### 2.1 界面层

| 用途 | 选型 | 版本 | 理由 |
|---|---|---|---|
| GUI 框架 | `gpui` | 0.2.2 | Taffy 0.9 与浏览器同源（Flexbox+Grid+Block，**无 float**）；Metal / D3D12 / Vulkan；Apache-2.0 且全部依赖已发布；**实测可独立构建**（产物 5.6M）；**布局与字宽与 Chromium 实测等价** |
| GUI 组件 | 自建，参考官方 `examples/data_table.rs` | — | 官方提供 473 行数据表参考实现：固定表头 + `uniform_list` 虚拟化 + 列宽 + 截断 + 自定义滚动条 + 可见范围追踪 |
| 语法高亮 | `tree-sitter` + `tree-sitter-sql` | — | 增量解析，可拿语法树做表名/列名跳转 |
| CLI 框架 | `clap` | 4.6.7 | 事实标准 |
| MCP | `rmcp`（官方 Rust SDK） | 3.6.0 | 协议演进有保障 |

> **GPUI 的能力边界**：原生支持 Flexbox / Grid / 绝对定位 / 盒模型 / `BoxShadow` / `linear_gradient()` / 透明度 / SVG / 矢量路径 / 文本整形。**不支持** CSS 滤镜、混合模式、元素级毛玻璃（仅窗口级 vibrancy）、伪元素、复杂 mask —— 这些要进设计规范的禁用清单，见 [`docs/ui-fidelity.md`](ui-fidelity.md)。

### 2.2 MCP 与协议层

| 用途 | 选型 | 版本 | 理由 |
|---|---|---|---|
| MCP Server SDK | `rmcp` | 3.6.0 | 官方 Rust SDK，协议演进有保障 |

### 2.3 数据库驱动

| 引擎 | 驱动 | 版本 | 备注 |
|---|---|---|---|
| PostgreSQL | `tokio-postgres` | 0.7.18 | 异步原生实现；备选 `sqlx` 通用层 |
| MySQL / MariaDB | `sqlx`（MySQL 后端） | 0.9.0 | |
| SQLite | `rusqlite` | 0.40.2 | `bundled` feature 会编译 SQLite C 源码，需 C 编译器 |
| SQL Server | `sqlx`（MSSQL 后端） | 0.9.0 | |
| ClickHouse | `clickhouse-rs` | 1.1.0-alpha.1 | |
| Redis | `redis` | 1.7.1 | 非 SQL，走独立能力接口 |
| MongoDB | `mongodb` | — | 非 SQL |
| Oracle | `oracle`（纯 Rust） | — | 优于需 Instant Client 的方案 |

### 2.4 基础设施

| 用途 | 选型 | 说明 |
|---|---|---|
| 凭据存储 | `keyring` / `secret-service` | 系统钥匙串，密码不进配置文件 |
| 配置格式 | YAML | 人可编辑，适合存放连接配置模板 |
| 日志 | `tracing` + `tracing-subscriber` | 结构化日志 |

---

## 3. 仓库结构

**Cargo 多 crate 工作区**。crate 边界即架构边界的强制约束（理由见 ADR-0001）。

```
SelaDB/
├── Cargo.toml               # workspace
├── crates/
│   ├── seladb-core/         # 库：领域模型、驱动、查询、服务
│   │   ├── src/
│   │   │   ├── core/        # 领域模型：连接、数据库对象、列元数据
│   │   │   ├── driver/      # 驱动 trait 定义 + 引擎注册表
│   │   │   │   ├── postgres/ mysql/ sqlite/ mssql/ clickhouse/ redis/ mongo/ oracle/
│   │   │   ├── query/       # 查询执行、结果集、SQL 解析与格式化
│   │   │   ├── session/     # 连接会话生命周期、凭据
│   │   │   ├── service/     # 用例编排层：CLI / GUI / MCP 共用
│   │   │   └── config/      # 配置加载
│   │   └── tests/
│   ├── seladb-cli/          # CLI 二进制（clap）
│   ├── seladb-mcp/          # MCP Server 二进制（rmcp）
│   └── seladb-gui/          # GUI 二进制（gpui）
├── design/
│   ├── tokens.json          # 唯一设计源：颜色/间距/字号/圆角/阴影/动效
│   └── screenshots/         # 设计稿导出 PNG（黄金图基准）
├── docs/
│   ├── architecture.md      # 本文件
│   ├── gui-architecture.md  # GUI 方案
│   ├── gui-framework-survey.md  # GUI 框架全景对比
│   ├── ui-fidelity.md       # 设计稿还原度边界
│   ├── compile-benchmarks.md    # Go / Rust 编译实测
│   ├── engine-support.md    # 引擎支持矩阵
│   └── adr/                 # 架构决策记录
└── .specify/                # Spec Kit 工作流
```

### 分层规则

- `seladb-core` 内部按职责分模块，对外只暴露 `service` 层
- `service` 层是**唯一的业务逻辑落点**。CLI 命令、GUI 视图、MCP 工具都只做「解析参数 → 调 service → 格式化输出」，不含业务判断
- `driver` 层只做「把引擎的原生语义翻译成核心抽象」，不做业务编排
- `gpui` 的调用**收敛在 `seladb-gui` crate 内**，不外泄到 `core` / `driver` / `service`
- crate 边界是编译期强制的，不需要靠目录约定自律

---

## 4. 核心抽象

### 4.1 驱动 trait：小接口 + 能力探测

**不要**定义一个包含所有能力的大 trait —— Redis 实现不了 `list_columns`，Oracle 的事务语义也与 PostgreSQL 不同。

```rust
// 所有引擎共有的最小能力
pub trait Connection {
    fn close(&mut self) -> Result<()>;
    fn ping(&self, cx: &Context) -> Result<()>;
}

// 以下为可选能力，通过能力探测使用
pub trait DatabaseLister { fn databases(&self, cx: &Context) -> Result<Vec<String>>; }
pub trait SchemaLister    { fn schemas(&self, cx: &Context) -> Result<Vec<String>>; }
pub trait TableLister     { fn tables(&self, cx: &Context, schema: &str) -> Result<Vec<Table>>; }
pub trait ColumnLister    { fn columns(&self, cx: &Context, schema: &str, table: &str) -> Result<Vec<Column>>; }
pub trait Querier         { fn query(&self, cx: &Context, sql: &str, args: &[Value]) -> Result<ResultSet>; }
pub trait Execer          { fn exec(&self, cx: &Context, sql: &str, args: &[Value]) -> Result<ExecResult>; }
```

使用方写法：

```rust
if conn.supports::<TableLister>() {
    let tables = conn.tables(cx, schema)?;
}
```

这样新增一个引擎时，只需实现它天然支持的那几项，缺失的能力由 UI 层降级隐藏。

### 4.2 Service 层：三种外壳的唯一共用点

```rust
pub struct Service { /* 连接池、配置、凭据 */ }

impl Service {
    pub fn list_databases(&self, cx: &Context, conn_id: &str) -> Result<Vec<String>>;
    pub fn list_tables(&self, cx: &Context, conn_id: &str, schema: &str) -> Result<Vec<Table>>;
    pub fn list_columns(&self, cx: &Context, conn_id: &str, schema: &str, table: &str) -> Result<Vec<Column>>;
    pub fn query(&self, cx: &Context, conn_id: &str, sql: &str, opts: QueryOptions) -> Result<ResultSet>;
    pub fn execute(&self, cx: &Context, conn_id: &str, sql: &str) -> Result<ExecResult>;
}
```

- CLI：`seladb tables --conn prod --json` → 调 `list_tables` → JSON 编码
- MCP：工具 `list_tables` → 调 `list_tables` → JSON 编码（几乎同构）
- GUI：直接调 `list_tables` → 拿到领域类型 → gpui 渲染

### 4.3 结果集统一模型

```rust
pub struct ResultSet {
    pub columns: Vec<Column>,
    pub rows: Vec<Vec<Value>>,
    pub total: u64,
    pub elapsed: Duration,
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

# 交互式：直接运行
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
| `list_connections` | `list_connections` | 列出已配置的连接（不含密码） |
| `list_databases` | `list_databases` | |
| `list_tables` | `list_tables` | |
| `list_columns` | `list_columns` | |
| `query` | `query` | 只读查询，带行数上限 |

工具实现是 service 调用的薄包装，不含额外业务逻辑。**MCP Server 与 CLI 复用同一份 service 代码**，因此两边行为永远一致。

---

## 7. 构建矩阵

### 7.1 CLI / MCP Server

| 目标平台 | target | 额外依赖 |
|---|---|---|
| macOS Apple Silicon | `aarch64-apple-darwin` | 无 |
| macOS Intel | `x86_64-apple-darwin` | 无 |
| Windows x64 | `x86_64-pc-windows-msvc` | Windows 上的 Visual Studio Build Tools（提供 `link.exe`） |
| Windows ARM64 | `aarch64-pc-windows-msvc` | 同上 |
| Linux x64 | `x86_64-unknown-linux-gnu` | gcc / musl 工具链 |
| Linux ARM64 | `aarch64-unknown-linux-gnu` | 同上 |

**交叉编译到 Windows 需要额外一道工序**（Rust 需要平台链接器），这是 Rust 相对 Go 的实质劣势。缓解：CLI/MCP 的 Windows 包可以用 Windows runner 原生构建，不必依赖 macOS 交叉编译。

### 7.2 GUI（gpui）

| 目标平台 | 构建方式 | 额外依赖 |
|---|---|---|
| macOS arm64 / amd64 | macOS runner 原生构建 | **Metal Toolchain 组件**（`xcodebuild -downloadComponent MetalToolchain`，838.9 MB） |
| Windows amd64 / arm64 | Windows runner 原生构建 | 无（MSVC 工具链自带） |
| Linux amd64 / arm64 | Linux 容器构建 | `libx11`、`libxkbcommon`、Vulkan 驱动 |

**GUI 不做跨平台交叉编译**（图形栈交叉编译代价极高），各平台原生构建。

### 7.3 建议的发布流水线

```
tag 触发
  ├─ 矩阵构建 CLI/MCP：6 个目标（cargo，交叉编译）
  └─ 矩阵构建 GUI：macOS runner（预装 Metal Toolchain）+ Windows runner + Linux 容器
```

---

## 8. 已知风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| **macOS 缺 Metal Toolchain** | GUI 构建直接失败 | 一次性安装；CI macOS runner 预装并检查 |
| **Windows 交叉编译需链接器工具链** | 与跨平台目标冲突 | Windows 包用 Windows runner 原生构建 |
| **冷编译慢**（gpui 约 76s） | CI 慢 | 配 cargo 缓存；日常增量 0.99s 可接受 |
| **gpui 由 Zed 单方面演进** | API 可能破坏 | 锁版本、按季评估升级（一年一版，升级频率天然低） |
| **gpui 独立生态规模小**（38 万下载） | 第三方参考资料少 | 官方示例质量高；组件自建为主 |
| **设计稿无法 100% 像素复刻** | 还原度打折 | 约束设计规范 + design token + 黄金图回归，见 [`ui-fidelity.md`](ui-fidelity.md)；布局与字宽已实测等价，见 [`fidelity-measurement.md`](fidelity-measurement.md) |
| **gpui 无截图 API** | 黄金图回归缺现成能力 | 自建抓图链路（真机窗口 + `screencapture`） |
| **gpui 测试平台无字体** | 字体相关断言无法进单测 | 列宽 / 截断 / 换行类断言放真机端到端测试 |
| **Oracle 驱动成熟度** | 特性覆盖有限 | 列为「尽力而为」支持等级，不承诺完整 SQL 方言 |
| **rusqlite 需 C 编译器** | 构建环境要求 | Rust 本就需要平台链接器，不构成额外负担 |

---

## 9. 后续待定项

以下尚未决策，需要在对应功能开工前确定：

- **GUI 主题**：深色为主还是深浅双主题
- **字体**：gpui 默认走系统字体（`font-kit`），是否额外内置一套保证跨平台一致
- **首批支持的引擎**：建议 Postgres + MySQL + SQLite 起步
- **凭据存储的具体实现**：`keyring` 各平台的 Go/Rust 绑定差异
- **SQL 解析库**：tree-sitter 方案（与编辑器一致，可拿语法树）还是 TextMate/syntect 方案
- **是否支持本地文件型数据库直接打开**（如 `.duckdb`、`.sqlite3` 文件）—— 需确认 duckdb 的 C 依赖
- **GUI 技术验证结论**：10 万行虚拟化表格、中文输入法三平台实测、IME 与虚拟滚动共存
