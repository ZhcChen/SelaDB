# AGENTS.md

SelaDB —— 跨平台（Windows / macOS / Linux）数据库管理软件。

## 技术栈（已定，勿随意更换）

全项目 **Go**。GUI 用 Gio 直接走平台原生 GPU 渲染（macOS Metal / Windows D3D11 / Linux Vulkan），不用 WebView。

| 层 | 选型 |
|---|---|
| CLI 框架 | `spf13/cobra` |
| CLI 交互界面 | `charmbracelet/bubbletea` v2 + `lipgloss` v2 + `bubbles` v2 |
| GUI | `gioui.org`（Gio，immediate mode） |
| MCP | `modelcontextprotocol/go-sdk`（官方 SDK） |
| 日志 | 标准库 `log/slog` |

**完整选型、版本号、构建矩阵见 [`docs/architecture.md`](docs/architecture.md) 与 [`docs/gui-architecture.md`](docs/gui-architecture.md)。决策依据见 [`docs/adr/`](docs/adr/)。**

## 硬约束

1. **核心库 / CLI / MCP Server 保持 `CGO_ENABLED=0`**。这样三平台交叉编译不需要 mingw-w64。GUI 轨道例外：macOS 与 Linux Wayland 需要 cgo（Gio 的平台胶水层），Windows 与 Linux X11 不需要。选纯 Go 替代品：`modernc.org/sqlite`（不用 `mattn/go-sqlite3`）、`sijms/go-ora/v2`（不用 `godror`）、`jackc/pgx/v5`（不用已归档的 `lib/pq`）。
2. **单 `go.mod` 多 package**，不要拆多个 module。当前没有需要独立发版或隔离依赖的场景。
3. **业务逻辑只写在 `internal/service/`**。CLI 命令、GUI 界面、MCP 工具都只做「解析参数 → 调 service → 格式化输出」，不放业务判断。
4. **驱动用小接口 + 类型断言**（见 `docs/adr/0005-driver-interfaces.md`）。不要为了省事定义大接口，Redis 实现不了 `ListColumns`。
5. **CLI 所有命令必须支持 `--json`**。Skill 包装、MCP 工具、CI 脚本三条路径都依赖它。
6. **`internal/ui/` 之外禁止 import `gioui.org`**。Gio 处于 0.x，官方不承诺回移 bugfix、每次 minor 升级都是破坏性变更。把 Gio 关在一个包里，升级时只改一处。

## 加新引擎时

在 `internal/driver/<engine>/` 建包，实现 `driver.Driver` + 最小必要的能力接口，在 `init()` 里 `driver.Register(...)`，然后在 `docs/engine-support.md` 记录支持到哪一档。只实现引擎真正支持的能力，不要用「永远返回错误」的方法凑接口。

## 目录约定

```
cmd/seladb/          CLI 入口        cmd/seladb-mcp/   MCP Server 入口
internal/core/       领域模型        internal/driver/  引擎抽象与实现
internal/query/      查询与结果集    internal/service/ 用例编排（业务逻辑落点）
internal/session/    连接与凭据      internal/tui/     Bubble Tea 界面
pkg/seladb/          对外稳定 API（变更需走 ADR）
```

`internal/` 可自由重构；`pkg/seladb/` 是兼容契约，改动要写 ADR。

## 提交与规范

- 提交信息用简体中文，遵循 Conventional Commits（`feat:` / `fix:` / `chore:` / `docs:`）
- 换行符由仓库根目录 `.gitattributes` 统一管理，不要在编辑器里手动改
- 架构层面的决策走 `docs/adr/`，先写 ADR 再改代码
- 特性开发走 Spec Kit 工作流：`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`
