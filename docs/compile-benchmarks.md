# 编译速度实测：Go vs Rust

> **本文是 gpui 路线的编译基准，表格数据保留原样。** 当前路线已变更为自研 `crates/gui-core/`（taffy + cosmic-text + wgpu + winit，见 [ADR-0006](adr/0006-self-built-gui-core.md)），其编译量与 wgpu 依赖树同量级，基准**待重测**。

> 2026-10-21 本机实测
> 环境：macOS 27.0.0 arm64 / Go 1.26.8 / Rust 1.99.0 (cargo 1.99.0) / Apple Silicon
> 基准项目：两个最小 GUI 应用，功能等价（一个标题 + 一段文字）

---

## 1. 数据

| 指标 | Go 1.26.8 + Gio v0.10.3 | Rust 1.99 + eframe 0.37 | Rust 1.99 + gpui 0.2.2 |
|---|---|---|---|
| **冷编译**（下载依赖 + 编译全部依赖） | **9.3s** | 62.2s | ~76s |
| **增量**：改一行（debug，日常开发路径） | 0.83s | **0.62s** | 0.99s (release) |
| **增量**：改一行（release） | 0.80s | 0.81s | 0.99s |
| **交叉编译 Windows x64**（依赖已缓存） | **0.49s** | ❌ 失败 | ❌ 失败 |
| **交叉编译 Windows x64**（依赖冷编译） | 3.8s | ❌ 失败（MSVC target 缺 `link.exe`） | ❌ 失败 |
| 产物 macOS | 8.9M | 13M (release) / 65M (debug) | **5.6M** |
| 产物 Windows x64 | 9.1M | — | — |
| macOS 构建前置 | 无 | 无 | **需 Metal Toolchain 组件（838.9 MB）** |

Rust 依赖树包含 wgpu、resvg、egui-winit、egui-wgpu（eframe 侧）或 blade-graphics、gpui 平台层（gpui 侧），编译量远大于 Go 侧的 Gio。

gpui 那一列是**实际独立编译官方 `examples/data_table.rs` 测得的**：新建空项目，只依赖 crates.io 上的 `gpui = "0.2"` 与 `rand = "0.9"`，构建成功，链接到 `Metal.framework` + `QuartzCore.framework`。

---

## 2. 关键结论

### 2.1 「Rust 编译慢」这个前提，在日常开发中不成立

**实测 Rust 增量编译 0.62s，比 Go 的 0.83s 还快。**

Rust 慢的是**冷编译**（62.2s vs 9.3s），而冷编译只在三种情况发生：

1. 新克隆仓库后的第一次构建
2. CI 无缓存构建
3. 依赖大版本升级后

日常改一行代码跑一次，Rust 和 Go 在同一量级。

> 这推翻了「因为 Rust 编译慢所以只能选 Go」这个选型前提。**如果用 Rust，就全 Rust，不要混。** 混合架构的唯一理由就是编译速度，而这个理由经实测不成立；混合反而会引入跨语言协议和两套工具链。

### 2.2 真正的硬差异是交叉编译

Rust 交叉编译到 Windows **失败**，两种 target 都试过：

```
# x86_64-pc-windows-msvc
error: the msvc targets depend on the msvc linker but `link.exe` was not found
note: please ensure that Visual Studio 2017 or later, or Build Tools for Visual
      Studio were installed with the Visual C++ option
note: VS Code is a different product, and is not sufficient

# x86_64-pc-windows-gnu
error: could not compile `bytemuck` (lib) due to 1 previous error
（缺 gcc / mingw-w64）
```

Rust 需要额外装 mingw-w64（Homebrew 有，stable 14.0.0）或在 Windows 上装 Visual Studio Build Tools。

Go 则是 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build` 一条命令，**零额外工具链**。

**这一点与项目的「跨平台」目标直接相关**，且比编译速度更重要。

### 2.3 gpui 的 API 稳定性反而优于 Gio

gpui 0.2.0 / 0.2.1 / 0.2.2 **全部发布于 2025 年 10 月**（10-09 / 10-14 / 10-22），之后整整一年没有新版本。**一年一版 = 可以正常锁版本、可以计划性升级。**

对比 Gio：官方明说 0.x 阶段每次 minor 升级都是破坏性变更、tags 不回移 bugfix、必须跟 `main` 分支。

这是 Rust 侧相对 Go 侧的一个反直觉优势。

### 2.4 API 稳定性：Rust 侧也不比 Go 好多少

实测 eframe 0.37 时踩到的真实破坏性变更 —— `eframe::App` trait：

```rust
// 旧（≤0.36）
fn update(&mut self, ctx: &egui::Context, frame: &mut eframe::Frame)

// 新（0.37）
fn ui(&mut self, ui: &mut egui::Ui, frame: &mut Frame)
fn logic(&mut self, cx: &mut Context)   // 新增，在 ui 之前调用
```

`update` 已被移除。**egui 0.x 的 minor 升级同样是破坏性的**，与 Gio 的 0.x 策略无异。

> 更正：本文档早期版本曾称「egui 用语义化版本，比 Gio 稳定」。该说法不准确 —— 0.x 阶段的 minor 升级都是破坏性的，egui 与 Gio 在这一点上处境相同。

### 2.5 产物体积

Go 8.9M / eframe 13M(release) / **gpui 5.6M** —— gpui 甚至比 Go 的 Gio 还小。eframe 的 debug 产物 65M，比 Go 大一个数量级。开发期频繁拷贝/上传产物时会有差别。

---

## 3. Rust 生态对 SelaDB 完整技术栈的覆盖

全部于 2026-10-21 从 crates.io 稀疏索引核实：

| 层 | 选型 | 版本 |
|---|---|---|
| CLI 框架 | `clap` | 4.6.7 |
| GUI | `eframe` / `egui` | 0.37.0 |
| GUI（备选） | `slint` | 1.18.1 |
| MCP SDK | `rmcp`（官方 Rust SDK） | 3.6.0 |
| PostgreSQL | `tokio-postgres` | 0.7.18 |
| 异步 SQL 通用 | `sqlx` | 0.9.0 |
| SQLite | `rusqlite` | 0.40.2 |
| Redis | `redis` | 1.7.1 |
| MongoDB | `mongodb` | — |
| ClickHouse | `clickhouse-rs` | 1.1.0-alpha.1 |
| 凭据存储 | `keyring` / `secret-service` | 5.2.0 |

**Rust 侧的完整度是够的**，不存在「Rust 缺某某模块」的问题。

---

## 4. Rust GUI 生态相对 Go 的真实优势

| 优势 | 具体证据 |
|---|---|
| **现成的虚拟化表格** | `egui_extras::Table`：`Column::resizable` + `range()` 限制列宽拖拽范围、表头固定、斑马纹、异构行高、双击自适应。Slint 只有 `ListView`，无 Table |
| **SQL 语法高亮现成** | `egui_extras::syntax_highlighting`（基于 syntect） |
| **无头快照测试** | `egui_kittest` 0.37.0，与 Gio `unit`、GPUI `visual_test` 同类能力 |
| **维护主体是公司** | egui ← Rerun；Slint ← Slint Labs。Go 侧 Gio 由 Elias Naur 个人维护（同时也是 Fyne 作者） |
| **社区规模** | egui 累计 2700 万次下载、700 万次近期下载 |
| **GPU 后端统一** | wgpu 一套代码覆盖 Metal / Vulkan / DX12 |

## 5. Rust GUI 生态的代价

| 代价 | 说明 |
|---|---|
| **中文 IME 有边界问题** | #7975 附截图证明 **Wayland + IBus 下中文 pre-edit 正常**；X11 + Fcitx5 下 pre-edit 不在 TextEdit 内，报告者明说「对中文或日文 IME 这不是大问题」，但韩文失焦会丢未提交字符。#2024（2022 年，Linux X11 iBus）仍 open 但仅 1 条评论 |
| **交叉编译 Windows 需额外工具链** | 见 2.2 |
| **冷编译 62s** | CI 必须配缓存 |
| **debug 产物 65M** | 见 2.4 |
| **学习成本** | 第二门语言 + Rust 特有的所有权/生命周期心智模型 |
| **egui 0.x 破坏性变更** | 见 2.3，与 Gio 同级 |

---

## 6. 复现方法

```bash
# Go 基准
mkdir bench-go && cd bench-go
cat > go.mod <<'EOF'
module bench
go 1.24.0
require gioui.org v0.10.3
EOF
# main.go 见本仓库 spike 记录
/usr/bin/time -p go build -o bench-go .

# Rust 基准
cargo new bench-rs && cd bench-rs
cargo add eframe@0.37 egui@0.37
/usr/bin/time -p cargo build --release
```

注意：Gio v0.10.3 的 API 与旧版不同 —— 事件循环是 `w.Run(func() {...})`（不是 `EventLoop`），
`app.Option` 不返回 error，`app.Size` 接受两个 `unit.Dp` 参数，
`layout.Widget` 是**函数类型** `func(gtx Context) Dimensions`，所以要传方法值：

```go
layout.Center.Layout(gtx, material.H1(th, "Hello").Layout)  // 注意末尾的 .Layout
```

eframe 0.37 的 `App` trait 要求实现 `fn ui(&mut self, ui: &mut egui::Ui, frame: &mut Frame)`。
