# ADR-0002：保持 CGO_ENABLED=0

- 状态：已采纳
- 日期：2026-10-21

## 背景

项目要发布 Windows / macOS / Linux 三平台产物，且需要「轻、快」的定位。开发机为 macOS，**未安装 mingw-w64 交叉编译工具链**。

## 决策

**核心库、CLI、MCP Server 全链路保持 `CGO_ENABLED=0`**，即只使用纯 Go 实现的依赖。GUI 轨道的 Linux 构建是唯一例外（见后果）。

具体到驱动选型：

| 不用 | 改用 |
|---|---|
| `mattn/go-sqlite3`（cgo） | `modernc.org/sqlite`（纯 Go） |
| `godror`（cgo，Oracle） | `sijms/go-ora/v2`（纯 Go） |
| `lib/pq`（已归档） | `jackc/pgx/v5`（纯 Go，功能更全） |

## 理由

1. **交叉编译零摩擦**。纯 Go 栈下 `GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build` 直接出 `.exe`，不需要在每台开发机和每个 CI runner 上装 mingw-w64、sysroot、目标平台 C 库。
2. **产物可复现**。不依赖目标平台的 C 工具链版本，Linux arm64 包不会因为 runner 的 glibc 版本而不同。
3. **分发简单**。静态二进制，无需捆绑 `libsqlite3.so`、Oracle Instant Client 等动态库。
4. **契合定位**。「又轻又快」不只是启动速度，也包括安装包体积和分发摩擦。

## 后果

- **GUI 轨道需要 CGO，但范围已重新划定**（2026-10-21 修订）。GUI 最终选用 Gio（见 ADR-0004），其平台胶水层的 C 代码分布是：macOS 需要（`app/os_darwin.m` 引入 `_cgo_export.h`）、Linux Wayland 需要（`app/os_wayland.c`）、Windows 与 Linux X11 不需要。**核心库、CLI、MCP Server 仍严格保持 `CGO_ENABLED=0`**，本 ADR 针对的正是这一层 —— 它保护的是三平台交叉编译的顺畅度，与 GUI 框架选谁无关。
- **GUI 不做跨平台交叉编译**。macOS 与 Windows 各自平台原生构建，Linux 用容器构建。cgo 图形栈的交叉编译代价极高。
- **部分引擎特性覆盖可能弱于 cgo 驱动**。例如 Oracle 的 `sijms/go-ora` 对复杂类型和 PL/SQL 的支持不如 `godror` 完整。应对：把 Oracle 列为「尽力而为」支持等级，不承诺完整 SQL 方言。
- **SQLite 需在两个纯 Go 实现间取舍**。`modernc.org/sqlite` 是 C 转 Go 的完整实现，兼容性最好；`ncruces/go-sqlite3` 基于 WASM，编译更快、二进制更小但特性少一些。默认选 `modernc.org/sqlite`。
- **未来的本地文件型数据库支持可能破例**。例如直接打开 `.duckdb` 文件需要 duckdb 的 cgo 绑定。届时需单独开 ADR 说明。
