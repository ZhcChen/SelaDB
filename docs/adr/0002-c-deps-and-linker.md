# ADR-0002：C 依赖与链接器工具链边界

- 状态：已采纳
- 日期：2026-10-21
- 修订：2026-10-21（同日修订，原决策见文末）

## 背景

项目要发布 Windows / macOS / Linux 三平台产物。开发机为 macOS，**未安装 mingw-w64 交叉编译工具链**。

Go 时代的约束是 `CGO_ENABLED=0`：一旦引入 cgo 依赖，Windows 交叉编译就要装 mingw-w64，Linux 还要维护目标平台的 C 库。

## 决策

**Rust 下的对应约束是「尽量避免 C 依赖」与「GUI 工具链只在需要处出现」。**

| 环节 | C 依赖 | 工具链要求 |
|---|---|---|
| `seladb-core`（驱动、查询、服务） | 仅 `rusqlite` 的 `bundled` feature 会编译 SQLite C 源码 | 需要 C 编译器；Rust 本身也需要平台链接器，故不构成额外负担 |
| `seladb-cli` / `seladb-mcp` | 同上 | **纯 Rust + 平台链接器**。交叉编译 Windows 需 `x86_64-pc-windows-msvc`（需 Windows 上的 Visual Studio Build Tools）或 `x86_64-pc-windows-gnu`（需 mingw-w64） |
| `seladb-gui` | 无（blade-graphics 是纯 Rust 绑定 Metal / Vulkan / DX12） | macOS 需 **Metal Toolchain 组件**；Windows 需 MSVC；Linux 需 X11 / xkbcommon / Vulkan 驱动 |

**具体替代选择**：

| 不用 | 改用 | 原因 |
|---|---|---|
| `mattn/go-sqlite3`（cgo） | `rusqlite`（bundled） | Rust 生态的等价物；C 依赖不可避免，但 Rust 本就需要链接器 |
| `godror`（cgo，Oracle） | `sijms/go-ora/v2`（纯 Go） | Rust 侧对应 `oracle` crate（纯 Rust），优于依赖 Instant Client 的方案 |
| `lib/pq`（已归档） | `tokio-postgres` | Rust 生态的活跃实现 |
| `mattn/go-sqlite3` + `CGO_ENABLED=0` 的严格约束 | 允许 `rusqlite` bundled | Rust 下 CGO 不是可选项而是链接器的一部分，约束应改为「不让 C 依赖污染不需要它的 crate」 |

## 理由

1. **GUI 各平台原生构建，不做交叉编译**。图形栈交叉编译代价极高，macOS / Windows / Linux 各自原生构建即可。GUI 的工具链要求因此只影响构建机，不影响用户。
2. **CLI 与 MCP Server 仍然可以交叉编译**。它们不需要 GUI 依赖，交叉编译到 6 个目标（darwin/linux × amd64/arm64 + windows × amd64/arm64）只需要对应的 Rust target 与链接器。
3. **Metal Toolchain 不是必需的**。它是 gpui/blade 路线的前置条件（其 `build.rs` 调 `xcrun metal` 离线编译 `.metal` 文件）。自研 gui-core 走 wgpu + naga（WGSL→MSL 的纯 Rust 翻译），**不需要**这个 838.9 MB 的组件，CI runner 也不必预装。（本条于 2026-10-22 修订，路线变更见 [ADR-0006](0006-self-built-gui-core.md)。）

## 后果

- **交叉编译 Windows 需要额外一道工序**。这是 Rust 相对 Go 的实质劣势 —— Go 是 `GOOS=windows go build` 一条命令零工具链。缓解：CLI/MCP 的 Windows 包可以用 Windows runner 原生构建，不必依赖 macOS 交叉编译
- **~~macOS GUI 构建在干净的 CI runner 上会失败，除非预装 Metal Toolchain~~**。2026-10-22 修订：自研 gui-core 走 wgpu + naga，不再需要 Metal Toolchain，干净的 macOS runner 可直接构建
- **`rusqlite` 需要 C 编译器**。CI 的 Linux runner 通常自带 gcc；Windows runner 自带 MSVC；macOS runner 需 Xcode CLT（Rust 工具链已要求）
- **不再有 `CGO_ENABLED=0` 这个环境变量层面的护栏**。取而代之的是 crate 边界 —— GUI 的重依赖不污染 CLI/MCP 的构建

---

## 决策沿革

### 原决策（2026-10-21 上午，已被取代）

**全链路保持 `CGO_ENABLED=0`**，核心库、CLI、MCP Server 只用纯 Go 依赖，GUI 的 Linux 构建是唯一例外。

理由：纯 Go 栈下 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build` 直接出 `.exe`，不需要在每台开发机和每个 CI runner 上装 mingw-w64、sysroot、目标平台 C 库。

### 变更原因

语言栈整体转向 Rust（见 ADR-0001）。Rust 下不存在 `CGO_ENABLED=0` 这个开关，C 依赖与平台链接器是绑定的，因此约束的形式与内容都要重写 —— 核心不变的原则是「不让 GUI 与图形栈的构建要求污染到 CLI 与 MCP Server 上」。
