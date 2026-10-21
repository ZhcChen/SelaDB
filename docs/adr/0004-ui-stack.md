# ADR-0004：界面栈选型（Cobra + Bubble Tea v2 / Wails v2）

- 状态：已采纳
- 日期：2026-10-21

## 背景

需要同时确定 CLI 与 GUI 的界面技术栈。选型时核实了 2026-10-21 的实际版本状态。

## 决策

**CLI**
- 子命令框架：`spf13/cobra` v1.10.2
- 交互界面：`charmbracelet/bubbletea` v2（v2.1.0，2026-10-08 转正）
- 样式：`charmbracelet/lipgloss` v2（v2.0.6）
- 组件：`charmbracelet/bubbles` v2（v2.2.1）

**GUI**
- 框架：`wailsapp/wails` v2（v2.17.0）
- 前端：Web 技术，框架待定

**MCP**
- SDK：`modelcontextprotocol/go-sdk` v1.8.0（官方）

## 备选方案与淘汰理由

| 方案 | 版本状态 | 淘汰理由 |
|---|---|---|
| Wails v3 | v3.0.0-beta.34（2026-10-20） | 至今仍是 beta，不适合作为项目主力 |
| Fyne v2 | v2.8.2 | 需要 cgo + OpenGL，Linux 分发要打包一堆依赖；组件集对密集数据表格支持弱 |
| Gio | v0.10.3 | 1.0 之前，API 不稳定 |
| Bubble Tea v1 | v1.3.10（2025-09） | 已被 v2 取代 |
| `mark3labs/mcp-go` | v1.3.0 | 社区实现，协议演进无官方保障 |

## 理由

**Bubble Tea v2**：v2 在 2026-10 刚转正，Elm 架构适合做「表格式数据浏览」这种交互密集的场景（`bubbles` 自带 table、viewport、textarea 组件）。纯 Go，与 ADR-0002 的 `CGO_ENABLED=0` 约束一致。

**Wails v2**：Go 后端 + 系统 WebView。数据表格、树形结构、图表渲染、中文输入法支持均无短板 —— 这正是 GUI 相对 TUI 的核心优势。v2 已稳定维护多年。

**官方 MCP SDK**：MCP 协议仍在演进，官方 Go SDK 保证协议跟进。

## 关于 GUI 前端用 Web 技术的说明

Wails 只要求「后端是 Go」。界面层使用 Web 技术是桌面应用的主流做法，不代表项目不是 Go 项目：所有业务逻辑、驱动、协议处理全在 Go 侧，前端只负责渲染与交互，跨进程调用走 Wails 生成的类型安全绑定。

如果坚持「整个项目都是 Go」到界面层，唯一的现实选项是 Fyne 或 Gio，代价是数据表格能力显著弱于 Web 前端 —— 对一个数据库管理软件来说这是致命的。

## 后果

- **TUI 与 GUI 是两套界面代码**，视觉与交互不共享。共享的只有 service 层。若未来要统一视觉，只能共享设计语言，不能共享组件代码
- **TUI 的中文 IME 输入是弱项**。终端下输入法兼容性依赖具体终端软件。缓解：CLI 的高频输入场景是命令与标识符，中文以只读浏览为主；需要输入中文的正式场景引导到 GUI
- **TUI 表格的中文列宽需按显示宽度计算**（`runewidth`），不能用字节数或 rune 数，否则列会错位
- **Linux GUI 构建需要 CGO 与 `libwebkit2gtk-4.1-dev`**，在 CI 容器中完成
