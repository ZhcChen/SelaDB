# ADR-0004：界面栈选型（Gio 原生 GPU 渲染）

- 状态：已采纳
- 日期：2026-10-21
- 修订：2026-10-21（同日修订，原决策见文末「决策沿革」）

## 背景

项目需要三种界面形态：交互式 CLI、GUI 桌面客户端、供 AI Agent 使用的 MCP Server。

CLI 与 MCP 的选型不受影响（见 ADR-0003、ADR-0006）。GUI 的选型经历了两个阶段：

第一阶段需求是「跨平台 GUI 客户端」，当时评估后选定 Wails v2 + Web 前端。随后需求明确为 **「Go + 原生平台 GPU 渲染」**，系统 WebView 路线出局，候选收敛到 Gio / Fyne / giu。

数据库管理工具的界面需求画像（决定了权重）：

| 需求 | 权重 | 说明 |
|---|---|---|
| 密集数据表格 | 决定性 | 万行级结果集、虚拟滚动、列排序/筛选/调整宽度 |
| 树形导航 | 高 | 连接 → 库 → schema → 表 → 列 的多级懒加载 |
| SQL 编辑器 | 高 | 语法高亮、多行编辑、中文注释 |
| 中文输入法 | 高 | 中文表名、字段注释、中文查询条件 |
| 自由分栏布局 | 中 | 表格/编辑器/侧栏可拖拽调整 |
| 图表 | 低 | 结果分布可视化 |

## 决策

**CLI**
- 子命令框架：`spf13/cobra` v1.10.2
- 交互界面：`charmbracelet/bubbletea` v2（v2.1.0）
- 样式：`charmbracelet/lipgloss` v2（v2.0.6）
- 组件：`charmbracelet/bubbles` v2（v2.2.1）

**GUI**
- 框架：`gioui.org`（Gio）v0.10.3
- 渲染后端：macOS **Metal**、Windows **D3D11**、Linux **Vulkan**（EGL 备用）
- 自建组件：虚拟化数据表格、树形导航（基于 `layout.List`）

**MCP**
- SDK：`modelcontextprotocol/go-sdk` v1.8.0（官方）

## 备选方案与淘汰理由

| 方案 | 版本状态 | 淘汰理由 |
|---|---|---|
| Wails v2 / v3 | v2.17.0 / v3.0.0-beta.34 | 系统 WebView 路线，不满足「原生平台 GPU 渲染」的需求 |
| Fyne | v2.8.2 | 渲染后端只有 OpenGL，而 **Apple 已全面弃用 OpenGL**，macOS 上是给未来埋雷；因 `go-gl/glfw` 三平台全部需要 cgo；桌面 IME 长期不稳（v2.8.2 仍有 #618 输入法候选窗跑出应用外、#2777 中文输入被截断、#2418 不弹中文键盘三个 open issue） |
| giu | v0.15.0 | Dear ImGui 绑定，cgo + 捆绑 ImGui C++，观感与目标不符，数据表格同样要自写，无相对 Gio 的优势 |

### 为什么是 Gio 而不是 Fyne

1. **Metal / D3D11 / Vulkan 才是真正的原生 GPU 渲染**。Fyne 的 `internal/painter` 只有 `gl`（OpenGL）和 `software`（软件光栅回退）两个后端。Apple 已弃用 OpenGL，它在 Apple 平台仍可用但不再是推荐 API，风险随时间上升。
2. **中文输入法质量差距明显**。Gio 的 `app/ime.go` 是完整的文本输入协议实现（preedit、commit、surrounding text、UTF-16 ↔ rune 索引转换），逐平台适配。Fyne 这条路径长期不稳 —— 一个面向中文用户的 SQL 编辑器不能接受。
3. **cgo 依赖面更小**。Fyne 三平台全需 cgo；Gio 只有 darwin 与 Linux Wayland 需要，Windows 与 Linux X11 路径是纯 Go。
4. **无头黄金图测试**。`unit` 包能把界面渲染成图做像素对比，UI 回归测试可在 CI 跑，不占开发者前台。
5. **immediate mode 代码量小**，长期维护成本低。

### 代价与缓解

| 代价 | 缓解 |
|---|---|
| Gio 无 Table / Tree 组件，需自建（表格 800–1500 行，树 300–500 行） | `layout.List` 是真虚拟化，底座现成；这部分工作量用 Fyne 也要做（通用 Table 不提供类型着色、NULL 样式、字节截断，最终仍要重写渲染层） |
| **Gio 依赖不能锁版本**。官方明确「pre-1.0 tags 仅供参考，不指定有持续支持的版本，bugfix 不会回移」，0.x 阶段每次 minor 升级是破坏性变更 | 全部 Gio 代码关在 `internal/ui/` 一个包内，**包外禁止 import `gioui.org`**；CI 每周试一次升级；升级只影响一个包 |

## 前置验证

在正式开发前做 2–3 天技术验证（`spike/` 目录，不进主分支），只回答三个问题：

1. 10 万行结果集的虚拟化表格是否流畅，横向滚动与列头是否同步
2. macOS / Windows / Linux 实机上 SQL 编辑器的中文输入是否正常
3. IME 预编辑串是否会被虚拟滚动打断

第 2 项若在三平台有平台性问题，需要准备降级方案（GUI 仍用 Gio，中文输入引导为直接粘贴），或重新评估 Fyne。

## 后果

- **TUI 与 GUI 是两套界面代码**，视觉与交互不共享，共享的只有 service 层
- **TUI 的中文 IME 输入是弱项**，终端下输入法兼容性依赖具体终端软件。CLI 高频输入是命令与标识符，中文以只读浏览为主
- **TUI 表格的中文列宽需按显示宽度计算**（`runewidth`），不能用字节数或 rune 数
- **CGO 边界需要重新划线**（见 ADR-0002）：核心库/CLI/MCP 保持 `CGO_ENABLED=0`，GUI 轨道在 macOS 与 Linux Wayland 上需要 cgo
- **Gio 依赖必须跟 `main`**，不能锁 tag。这是持续性的维护成本，不是一次性成本
- **GUI 不做跨平台交叉编译**。macOS 与 Windows 各自平台原生构建，Linux 用容器构建。cgo 图形栈交叉编译代价极高

---

## 决策沿革

### 原决策（2026-10-21 上午，已被取代）

GUI 采用 `wailsapp/wails` v2 + Web 前端，理由是：数据表格、树形导航、SQL 编辑器、中文输入法在 Web 技术下全部是强项；系统 WebView 让产物体积控制在 10–20MB；Windows/macOS 构建纯 Go，Linux 需 webkit2gtk。

### 变更原因

需求随后明确为「**Go + 原生平台 GPU 渲染**」，并明确 GUI 也用 Go、不引入 Web 技术栈。系统 WebView 路线（无论 Wails 还是 Electron）不满足该要求，故整体重选。

原决策中的其余判断仍然有效，保留在 ADR-0002 与 `docs/architecture.md` 中。
