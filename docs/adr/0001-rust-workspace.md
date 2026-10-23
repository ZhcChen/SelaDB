# ADR-0001：全项目 Rust，多 crate 工作区

- 状态：已采纳
- 日期：2026-10-21
- 修订：2026-10-21（同日修订，原决策见文末）

## 背景

项目定位为跨平台（Windows / macOS / Linux）数据库管理软件，CLI、GUI、MCP Server 三种形态均要实现。

最初选择 Go，理由是**编译快**。随后明确了 GUI 需求为「原生平台 GPU 渲染 + 不用 Web 技术栈」，经完整生态调研与实测后，发现：

1. Go 生态里没有任何方案能同时满足「原生 GPU 渲染 + 高还原度 + 可锁版本 + 靠谱中文 IME」
2. **Rust 侧能自研出满足上述四项的框架**（taffy 与浏览器同源 + cosmic-text 整形 + wgpu 三平台统一后端 + 版本可锁）。当时的候选是 GPUI，路线于 2026-10-22 改为自研 `crates/gui-core/`，见 [ADR-0006](0006-self-built-gui-core.md)
3. **「Rust 编译慢」在日常开发中不成立** —— 实测增量 0.62–0.99s，与 Go 的 0.83s 同一量级；慢的只是冷编译

## 决策

**全项目使用 Rust**，采用 Cargo 多 crate 工作区（workspace），而非单 crate。

```
SelaDB/
├── Cargo.toml            # workspace
├── crates/
│   ├── seladb-core/      # 领域模型、驱动抽象、查询、服务编排
│   ├── seladb-cli/      # CLI 二进制（clap）
│   ├── seladb-mcp/      # MCP Server（rmcp）
│   ├── gui-core/        # 自研 GUI 框架（taffy + cosmic-text + wgpu + winit）
│   └── seladb-gui/      # GUI 二进制（自研 gui-core）
└── docs/
```

### 依赖选型

| 层 | 选型 | 版本 |
|---|---|---|
| GUI 框架 | `gui-core`（自研；布局 taffy / 文本 cosmic-text / 渲染 wgpu） | — |
| CLI 框架 | `clap` | 4.6.7 |
| MCP SDK | `rmcp`（官方 Rust SDK） | 3.6.0 |
| PostgreSQL | `tokio-postgres` | 0.7.18 |
| 通用异步 SQL | `sqlx` | 0.9.0 |
| SQLite | `rusqlite` | 0.40.2 |
| Redis | `redis` | 1.7.1 |
| ClickHouse | `clickhouse-rs` | 1.1.0-alpha.1 |
| 凭据存储 | `keyring` / `secret-service` | 5.2.0 |
| 日志 | `tracing` + `tracing-subscriber` | — |

## 理由

### 多 crate 而非单 crate

Rust 的 crate 边界天然对应「编译单元」与「依赖隔离」：

- GUI 依赖 `crates/gui-core`（重，含 wgpu 与字体栈），CLI 与 MCP 都不需要 —— 单 crate 会让 `cargo build` 拖上 GUI 的全部依赖
- 依赖版本可以按需独立演进（例如 GUI 想用 wgpu，CLI 不需要）
- crate 边界即架构边界的强制约束：GUI 代码无法被 CLI 意外依赖

这正好是 Go 时代用「单 module 多 package + 目录约定」软性约束的事情，在 Rust 里由编译器保证。

### Rust 编译速度的实测结论

| 指标 | Go 1.26.8 + Gio | Rust + eframe | Rust + gpui |
|---|---|---|---|
| 冷编译 | 9.3s | 62.2s | ~76s |
| **增量（改一行）** | 0.83s | **0.62s** | **0.99s** |
| 产物体积 | 8.9M | 13M release / 65M debug | **5.6M** |

Rust 慢的是**冷编译**，只在新克隆、CI 无缓存、依赖大版本升级时发生。日常改一行跑一次，两者持平。

**因此不做 Go + Rust 混合架构** —— 混合的唯一理由是编译速度，而这个理由不成立；混合反而会引入跨语言协议、两套工具链和两套构建矩阵。

## 后果

- **学习成本**：团队需要掌握 Rust 的所有权/生命周期心智模型
- **冷编译慢**：CI 必须配置 cargo 缓存
- **交叉编译 Windows 需额外工具链**（`x86_64-pc-windows-msvc` 需 Windows 上的 Visual Studio Build Tools，或 `x86_64-pc-windows-gnu` 需 mingw-w64）。Go 是零工具链，这是 Rust 的实质劣势
- ~~**macOS GUI 构建需 Metal Toolchain 组件**（838.9 MB），CI 的 macOS runner 必须预装~~。2026-10-22 更正：自研 gui-core 走 wgpu + naga（纯 Rust 着色器翻译），**不需要**该组件，CI 的 macOS runner 无需预装。它是 gpui/blade 路线的要求，见 [ADR-0006](0006-self-built-gui-core.md)
- **GPL 边界**：只依赖 Apache-2.0/MIT 的 crate。Zed 的应用层 crate（`ui` / `component` / `editor` / `text` / `language` / `theme` / `icons` / `menu`）是 GPL-3.0-or-later 且未发布，一律不用
- `rusqlite` 的 `bundled` feature 会编译 SQLite 的 C 源码，需要 C 编译器。Rust 本来就需要平台链接器，因此这不构成额外负担（对比 Go 里 CGO 是可选项，一旦引入就破坏交叉编译）

---

## 决策沿革

### 原决策（2026-10-21 上午，已被取代）

**全项目使用 Go**，单 `go.mod` 多 package。

理由：Go 编译快；跨平台交叉编译零工具链依赖；Gio 提供 Metal / D3D11 / Vulkan 三平台原生 GPU 后端与协议级完整的 IME。

### 变更原因

读 Gio 源码后发现三个问题：① `layout/` 下只有 `flex.go` / `stack.go` / `list.go`，**没有 CSS Grid**，而数据表格的经典布局正是 Grid；② **没有任何阴影原语**，而 `box-shadow` 在现代设计里很常见；③ 官方 tag 政策是「pre-1.0 tags 仅供参考，不指定有持续支持的版本，bugfix 不会回移」，**等于不能锁版本，必须跟 main**。

而 Rust 侧**能自研出解决这三个问题的框架**：Taffy 提供与浏览器同源的 Flexbox + Grid + Block 全套；wgpu 走 naga 的纯 Rust 着色器翻译，不需要 Metal shader 的离线编译；且依赖都能锁版本。（路线于 2026-10-22 从 GPUI 改为自研 `crates/gui-core/`，见 [ADR-0006](0006-self-built-gui-core.md)）

同时，实测证明「Rust 编译慢」这一选型前提不成立（增量 0.62–0.99s，与 Go 持平）。

**详见 ADR-0004（界面栈选型）的完整决策沿革。**
