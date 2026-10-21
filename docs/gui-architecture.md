# GUI 方案：Gio（原生 GPU 渲染）

> 状态：初版（2026-10-21）
> 关联：ADR-0004（界面栈选型）、ADR-0002（保持 CGO_ENABLED=0）
>
> **本文档取代了初版基于 Wails 的方案。** 需求确认为「Go + 原生平台 GPU 渲染」，因此系统 WebView 路线出局，候选收敛到 Gio / Fyne / giu。

本文聚焦 GUI 客户端。核心库、CLI、MCP Server 的选型见 [`architecture.md`](architecture.md)。

---

## 1. 结论

**GUI 用 `gioui.org`（Gio），immediate mode + 平台原生 GPU 后端。**

| 平台 | 渲染后端 | 实现位置 |
|---|---|---|
| macOS / iOS | **Metal** | `app/metal_darwin.go`、`app/metal_macos.go`、`app/metal_ios.go` |
| Windows | **Direct3D 11** | `app/d3d11_windows.go`（另有 EGL 路径 `app/egl_windows.go`） |
| Linux | **Vulkan** | `app/vulkan_x11.go`、`app/vulkan_wayland.go`、`app/vulkan_android.go`（另有 EGL 路径） |
| macOS 备用 | OpenGL | `app/gl_macos.go` |

Gio 的 `go.mod` 依赖全部是纯 Go：`golang.org/x/exp/shiny`（窗口）、`gioui.org/shader`（着色器）、`github.com/go-text/typesetting`（文本排版）、`eliasnaur.com/font`（字体）。

---

## 2. 候选对比

### 2.1 总览

| 维度 | **Gio** | Fyne | giu |
|---|---|---|---|
| 版本 | v0.10.3（2026-09-28） | v2.8.2（2026-10-07） | v0.15.0（2026-06-02） |
| 架构 | immediate mode | retained mode | immediate mode（Dear ImGui 绑定） |
| macOS GPU | **Metal** | OpenGL | OpenGL |
| Windows GPU | **D3D11** | OpenGL | OpenGL |
| Linux GPU | **Vulkan** | OpenGL | OpenGL |
| cgo | darwin + wayland 需要 | **全平台需要**（glfw） | 全平台需要 |
| 数据表格 | **需自建** | **现成且已虚拟化** | 需自建 |
| 树形导航 | 需自建 | **现成** | 需自建 |
| 桌面 IME | **协议级完整实现** | 有，长尾问题多 | 依赖 ImGui |
| 无头 UI 测试 | **`unit` 包支持黄金图** | 有 test driver | 无 |
| 依赖管理 | **不能锁版本**（见 2.4） | 稳定语义化版本 | 稳定 |
| 视觉 | 完全自绘 | 现成 Material 主题 | ImGui 风格 |

### 2.2 为什么选 Gio 而不是 Fyne

**理由一：Metal / D3D11 / Vulkan 才是真正的「原生平台 GPU 渲染」。**

Fyne 的渲染后端只有 `internal/painter/gl`（OpenGL）与 `internal/painter/software`（软件光栅回退），没有 Metal、没有 Vulkan、没有 D3D。而 **Apple 已全面弃用 OpenGL** —— 它在 Apple 平台上仍可用，但不再是被推荐的 API，风险随时间上升。在 macOS 上用 OpenGL 做新项目，等于给自己埋一颗定时炸弹：Gio 的 Metal 路径没有这个问题。

**理由二：中文输入法质量差距明显。**

Gio 的 `app/ime.go` 是完整的文本输入协议实现：preedit（候选串）、commit（提交）、surrounding text（上下文同步）、UTF-16 ↔ rune 索引互转。这套东西是按 X11 / Wayland / Win32 / Cocoa 的输入协议逐个平台实现的，中文输入法是它的强项。

Fyne 的 IME 则是长期问题重灾区，截至 v2.8.2 仍有三个 open issue 直接命中：

- [#618](https://github.com/fyne-io/fyne/issues/618) The input method is located outside the app（输入法候选窗跑到应用外）
- [#2777](https://github.com/fyne-io/fyne/issues/2777) Chinese input method string truncated when typing into `widget.NewEntryWithData`（中文输入被截断）
- [#2418](https://github.com/fyne-io/fyne/issues/2418) Android app does not show Chinese (default) keyboard

历史上还有「候选窗跑到左上角」（#6606、#4546、#3884）、「用中文输入法崩溃」（#3213）、「无法输入中文」（#4544）等多个 issue。这些虽然多数已关闭，但说明这条路径长期不稳。对一个 SQL 编辑器要输入中文注释、表名、查询条件的工具，这是不可接受的风险。

**理由三：cgo 依赖面更小。**

Fyne 因为 `github.com/go-gl/glfw/v3.4/glfw`，**三平台全部需要 cgo**。Gio 只有 darwin（`app/os_darwin.m` 引入 `_cgo_export.h`）和 Linux Wayland（`app/os_wayland.c`）需要。这意味着：

- Windows 与 macOS 的 GUI 产物可以在对应系统上直接构建，不依赖完整交叉编译工具链
- Linux 的 X11 路径可以走纯 Go

**理由四：无头黄金图测试。**

Gio 的 `unit` 包能把界面渲染成图片，与基准图做像素对比。这让 UI 回归测试可以在 CI 里跑，不需要真实窗口 —— 与「开发测试不抢占本机前台」的实践要求天然契合。

**理由五：immediate mode 代码量小。**

Fyne 是 retained mode，每个组件要写 CanvasObject、Renderer、对象池、刷新触发，代码量大几倍。Gio 每次调用重建 UI 树，组件就是一个函数。

### 2.3 代价：表格和树要自己写

Gio 的 `widget` 包里有 button、editor（多行）、list、label、text、icon、image、dnd、selectable、border、decorations、material 主题，但**没有 Table，也没有 Tree**。

好消息是底座是现成的：`layout.List` 是真虚拟化，源码注释写明 ——

> Layout can handle very large lists because it only calls w to fill its viewport and the distance scrolled, if any.

即只对可见区间调用渲染回调。Fyne 的 Table 用的也是同一套思路（`visibleRowHeights` / `visibleColumnWidths` + 单元格池化 + 增量刷新）。所以两边的表格性能上限是同一量级，差别只在谁来写。

**这张表要做多少工作**（按数据库场景的真实需求）：

| 能力 | 说明 |
|---|---|
| 虚拟化渲染 | 用 `layout.List` 承接，行高按内容类型分档 |
| 横向滚动 + 纵向同步 | 两轴联动，列头固定 |
| 列头 | 表名 + 类型标识 + 排序指示器 |
| 列宽调整 | 拖拽改变宽度，需缓存每列宽度 |
| 单元格渲染 | 按类型着色、NULL 样式、字节流截断、时间格式 |
| 选中 / 高亮 / 键盘导航 | 方向键移动、Shift 多选、Ctrl 复制 |
| 排序 | 交回 service 层执行（`ORDER BY`），不在客户端排 |

预计 800–1500 行 Gio 代码。这部分工作量对两个方案是一样的 —— 即使用 Fyne，通用 Table 也不提供类型着色、NULL 样式、字节截断，最终照样要重写渲染层。

树形导航（连接 → 库 → schema → 表 → 列）逻辑更简单，约 300–500 行。

### 2.4 Gio 的真实风险：依赖不能锁版本

Gio 的 README 明确写着：

> Pre-1.0 tags are provided for reference only, and do not designate releases with ongoing support. Bugfixes will not be backported to older tags.
> Tags follow semantic versioning. In particular, as the major version is zero: breaking API or behavior changes will increment the minor version component.

即：

1. **不能锁版本号**。锁了 v0.10.3 就拿不到后续 bugfix，因为不承诺回移
2. **必须跟 `main` 分支**。0.x 阶段每次 minor 升级都是破坏性 API 变更
3. 官方 CI 在 builds.sr.ht 上跑，提交频率不低，破坏性变更会持续出现

**风险隔离方案（必做）**：把所有 Gio 代码关在 `internal/ui/` 这一个包里，外部只暴露与引擎无关的领域类型和回调签名。这样 Gio 的 API 变动只影响一个包，修复面可控。禁止在 `internal/ui/` 之外 import `gioui.org`。

配套要求：

- 锁 `go.mod` 中的 Gio 版本，但**允许 CI 每周试一次升级**，而不是被动等破坏
- 在 `internal/ui/` 里维护一层薄适配器，把 Gio 的 `layout.Context` / `op.Ops` 等类型隔离在包内
- 记录「Gio 升级」为一条常规维护任务，升级时只需修 `internal/ui/`

### 2.5 giu 为什么出局

giu 是 Dear ImGui 的 Go 绑定：cgo + 捆绑 ImGui C++ 库。外观是 ImGui 风格（对终端用户是加分，对「现代桌面应用」是减分），数据表格组件同样要自写。相比 Gio 没有优势，相比 Fyne 的组件更弱。多一个候选不改变结论。

---

## 3. 架构约束的变化

### 3.1 CGO 边界需要重新划线

ADR-0002 原本要求全链路 `CGO_ENABLED=0`。选 Gio 后这条约束的**范围**要调整：

| 产物 | CGO | 说明 |
|---|---|---|
| 核心库 | 0 | 不变 |
| CLI | 0 | 不变 |
| MCP Server | 0 | 不变 |
| GUI（macOS） | **需要** | `app/os_darwin.m` 引入 `_cgo_export.h` |
| GUI（Windows） | 0 | 纯 Go（D3D11 / EGL 路径无 C 代码） |
| GUI（Linux X11） | 0 | 纯 Go |
| GUI（Linux Wayland） | **需要** | `app/os_wayland.c` |

原 ADR-0002 的核心判断（「核心库/CLI/MCP 只用纯 Go 依赖，避免为 SQL 驱动引入 C 工具链」）**依然成立且更重要** —— 它保护的是三平台交叉编译的顺畅度，与 GUI 框架的选择无关。

**唯一变化**：GUI 轨道不再是「Linux 才有例外」，而是「macOS 和 Linux Wayland 有例外」。这是范围澄清，不是判断推翻。

### 3.2 目录结构调整

Gio 的 immediate mode 要求「状态在外部、渲染无状态」，这与 Fyne 的 retained mode 目录结构不同：

```
SelaDB/
├── cmd/
│   ├── seladb/              # CLI 入口
│   ├── seladb-gui/          # GUI 入口（cmd/seladb-gui/main.go 只做启动）
│   └── seladb-mcp/          # MCP Server 入口
├── internal/
│   ├── core/                # 领域模型：连接、库、schema、表、列、结果集
│   ├── driver/              # 引擎抽象 + 注册表
│   ├── query/               # 查询执行、结果集
│   ├── session/             # 连接会话、凭据
│   ├── service/             # 业务逻辑唯一落点
│   ├── config/              # 配置加载
│   ├── tui/                 # Bubble Tea 交互界面（CLI）
│   └── ui/                  # ★ Gio 界面层，全部 Gio 代码关在这里
│       ├── app.go           # 窗口与事件循环
│       ├── theme.go         # 配色、字号、间距
│       ├── table.go         # 虚拟化数据表格（自建）
│       ├── tree.go          # 树形导航（自建）
│       ├── editor.go        # SQL 编辑器（基于 widget.Editor + 高亮）
│       └── ...
└── pkg/
    └── seladb/              # 对外稳定 API
```

**硬约束：`internal/ui/` 之外不得 import `gioui.org`。** 这是 Gio 版本风险隔离的技术前提。

### 3.3 状态管理

Gio 是 immediate mode，状态（当前连接、当前选中表、滚动位置、筛选条件）放在 `internal/ui/` 之外的普通 Go 结构里，通过指针传入渲染函数。这样：

- 状态可被单元测试直接构造并断言
- 渲染函数是纯函数式的（输入状态 → 输出操作列表）
- 与 service 层的调用是直接的 Go 调用，不需要序列化

---

## 4. 需要自建的组件

| 组件 | 基于 | 预计规模 | 优先级 |
|---|---|---|---|
| 虚拟化数据表格 | `layout.List` | 800–1500 行 | P0 |
| 树形导航 | 自建（`layout.List` 递归） | 300–500 行 | P0 |
| 单元格类型渲染 | 领域类型 → 样式 | 200 行 | P0 |
| SQL 编辑器 | `widget.Editor` + 自定义高亮 | 300 行 | P1 |
| 分栏布局 | `layout` + 手写拖拽 | 400 行 | P1 |
| 主题（深/浅） | `widget/material` 扩展 | 200 行 | P1 |
| 对话框 / 菜单 | `widget/material` | 100 行 | P2 |

Gio 的 `widget/material` 提供了成套的基础控件（按钮、输入框、列表、开关等），可以直接用，不必全部自绘。

---

## 5. 构建与分发

### 5.1 CLI / MCP（纯 Go，无 CGO）

与 ADR-0002 一致，三平台交叉编译零工具链依赖：

| 目标 | GOOS | GOARCH | CGO_ENABLED |
|---|---|---|---|
| macOS Apple Silicon | darwin | arm64 | 0 |
| macOS Intel | darwin | amd64 | 0 |
| Windows x64 | windows | amd64 | 0 |
| Windows ARM64 | windows | arm64 | 0 |
| Linux x64 | linux | amd64 | 0 |
| Linux ARM64 | linux | arm64 | 0 |

### 5.2 GUI

| 目标 | 构建位置 | CGO | 备注 |
|---|---|---|---|
| macOS arm64 / amd64 | macOS runner | 1 | 需要 Xcode CLT |
| Windows amd64 / arm64 | Windows runner | 0 | |
| Linux amd64 / arm64 | Linux 容器 | 0（X11）/ 1（Wayland） | 构建时需 `libx11`、`libxkbcommon` 等 X11 开发包 |

macOS 与 Windows 可以各自平台原生构建，不需要跨平台 GUI 交叉编译（cgo 交叉编译图形栈代价极高）。这与 CLI 的「交叉编译出包」策略不同，两条流水线应分开。

### 5.3 分发格式

| 平台 | 格式 | 工具 |
|---|---|---|
| macOS | `.app` / `.dmg` | GoReleaser / `create-dmg` |
| Windows | `.exe` / `.msi` | GoReleaser |
| Linux | AppImage / `.deb` | GoReleaser |

---

## 6. 测试策略

Gio 的 `unit` 包支持无头渲染，是本方案的一个额外红利：

```go
// 渲染到内存，与基准图做像素对比
golden := unit.New(frame)
img := golden.Image()
```

价值：

- **UI 回归测试可以在 CI 跑**，不占开发者前台，不依赖真实显示器
- 数据库结果集的表格渲染是高度确定性的（同样的数据 → 同样的图），适合做黄金图
- 主题切换、行高变化、类型着色都能被断言

注意：黄金图测试对字体渲染敏感，跨平台的字形抗锯齿会有细微差异。实践上按平台分别维护基准图（`testdata/golden/darwin/`、`linux/`、`windows/`）。

---

## 7. 风险清单

| 风险 | 影响 | 应对 |
|---|---|---|
| Gio API 破坏性变更频繁 | 编译失败 | 全部 Gio 代码关在 `internal/ui/`；CI 每周试升级 |
| 表格组件自建工作量超预期 | 工期延后 | **先做技术验证（见第 8 节），再决定是否继续** |
| 中文 IME 在目标平台的实际表现 | SQL 编辑器难用 | 验证阶段必须在三平台实机测中文输入 |
| macOS GUI 构建需要 cgo | 构建环境要求 | 独立 GUI 流水线，只在 macOS runner 上构建 |
| Linux Wayland 需要 cgo | 与 X11 产物行为可能不同 | 统一用 X11 构建（纯 Go），Wayland 后续评估 |
| 视觉体系从零做起 | 与主流应用观感有差距 | 用 `widget/material` 打底，再定制主题 |
| 无现成图表组件 | 结果可视化缺失 | 暂缓，或用 Gio 绘图 API 自绘简单图表 |

---

## 8. 前置技术验证（建议先做）

在正式投入 GUI 开发前，先做一个 2–3 天的 spike，只回答三个问题：

1. **虚拟化表格**：10 万行结果集，滚动是否流畅？横向滚动与列头是否同步？列宽拖拽是否可用？
2. **中文输入**：macOS / Windows / Linux 实机上，SQL 编辑器里输入中文注释是否正常？候选窗位置是否正确？
3. **IME + 虚拟滚动共存**：输入法预编辑串（preedit）是否会被虚拟滚动打断？

这三个问题的答案直接决定 Gio 是否可用。如果第 2 项在三平台上有平台性问题，需要准备「GUI 用 Gio、中文输入退化为直接粘贴」的降级方案，或者重新评估 Fyne。

验证代码放在 `spike/` 目录，不进主分支。

---

## 9. 待定项

- **主题**：深色为主，还是深浅双主题
- **字体**：内置字体（体积换一致性）还是用系统字体（体积换通用性）
- **图表**：结果分布可视化是否做，用什么方案
- **首批引擎**：建议 Postgres + MySQL + SQLite，与 GUI 表格组件同步推进
