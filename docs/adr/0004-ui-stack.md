# ADR-0004：界面栈选型（GPUI）

- 状态：**已被 ADR-0006 取代**（2026-10-22）
- 日期：2026-10-21
- 修订：2026-10-21（同日两次修订，决策沿革见文末）
- 取代者：[ADR-0006 界面栈选型（自研 gui-core）](0006-self-built-gui-core.md)

> **本文保留为决策沿革。** GPUI 的许可判断与需求画像仍然成立且被 ADR-0006 继承；被推翻的只有「直接依赖 gpui」这一步——理由是 gpui 的渲染后端是 blade/D3D11 而非 wgpu、taffy 与 cosmic-text 被锁死在老版本、且它同样没有树和表格控件。gpui 降级为**只读参考蓝本**（IME 协议细节、`examples/data_table.rs`）。

## 背景

项目需要三种界面形态：交互式 CLI、GUI 桌面客户端、供 AI Agent 使用的 MCP Server。

CLI 与 MCP 的选型不受 GUI 决策影响（见 ADR-0003）。GUI 选型的硬性需求：

- **跨平台**：Windows / macOS / Linux
- **原生平台 GPU 渲染**，不用系统 WebView
- **中文可用**：中文表名、字段注释、SQL 编辑器里写中文注释
- **高还原度**：能用 HTML/CSS 产出的设计稿，尽量接近地还原

数据库管理工具的界面需求画像：

| 需求 | 权重 | 说明 |
|---|---|---|
| 密集数据表格 | 决定性 | 万行级结果集、虚拟滚动、列排序/筛选/调整宽度 |
| 树形导航 | 高 | 连接 → 库 → schema → 表 → 列 的多级懒加载 |
| SQL 编辑器 | 高 | 语法高亮、多行编辑、中文注释 |
| 中文输入法 | 高 | 中文表名、字段注释、中文查询条件 |
| 自由分栏布局 | 中 | 表格/编辑器/侧栏可拖拽调整 |
| 图表 | 低 | 结果分布可视化，属于加分项 |

## 决策

> ⚠️ **本节是 2026-10-21 下午 gpui 路线的原决策，已整体作废。**
> 当前路线：GUI 框架自研 `crates/gui-core/`（taffy + cosmic-text + wgpu + winit），
> 不引入 gpui 作为依赖 —— 见 [ADR-0006](0006-self-built-gui-core.md)。
> 下面两行保留原文只为记录当时的选型依据。

**全项目使用 Rust**（这是 2026-10-21 下午的最终方向，与 ADR-0001 的 Go 方案不同，详见「决策沿革」）。

| 层 | 选型 | 版本 |
|---|---|---|
| GUI 框架 | ~~`gpui`（Zed 的框架，Apache-2.0）~~ **已由自研 `crates/gui-core/` 取代** | ~~0.2.2~~ |
| GUI 组件自建 | ~~基于 `layout.List` / `uniform_list` / `interactivity`~~ **全部自写**（参考蓝本见 ADR-0006） | — |
| 语法高亮 | tree-sitter（`tree-sitter-sql` + `tree-sitter-highlight`） | — |
| CLI 框架 | `clap` | 4.6.7 |
| MCP SDK | `rmcp`（官方 Rust SDK） | 3.6.0 |
| PostgreSQL | `tokio-postgres` | 0.7.18 |
| 通用异步 SQL | `sqlx` | 0.9.0 |
| SQLite | `rusqlite` | 0.40.2 |
| Redis | `redis` | 1.7.1 |
| 凭据存储 | `keyring` / `secret-service` | 5.2.0 |

## 备选方案与淘汰理由

| 方案 | 状态 | 淘汰理由 |
|---|---|---|
| Wails v2 / v3 | v2.17.0 / v3.0.0-beta.34 | 系统 WebView 路线，不满足「原生 GPU 渲染」；v3 至今仍是 beta |
| Gio | v0.10.3 | 布局只有 Flex，**无 CSS Grid**；无阴影/滤镜原语；**0.x 每次 minor 破坏且官方明说不回移 bugfix，必须跟 main**；个人维护 |
| Fyne | v2.8.2 | 渲染后端只有 OpenGL，而 Apple 已全面弃用 OpenGL；全平台需 cgo（glfw）；桌面中文 IME 有 3 个 open issue（#618 / #2777 / #2418） |
| egui | 0.37.0 | 组件最好，但中文 IME 在 X11 + Fcitx5 下有边界问题（#7975，Wayland + IBus 正常）；且是 Rust 生态里最像「工具型」的观感 |
| Slint | 1.18.1 | 中文 IME 桌面端可用、原生渲染（Skia），但**无 Table 组件**、需学 `.slint` DSL |
| GPUI | 0.2.2 | ~~**采用**~~ **已作废**（2026-10-22，见 ADR-0006；降级为只读参考蓝本） |
| therecipe/qt | 2020-09 停更 | 已废弃 |
| lxn/walk / andlabs/ui | 2021 停更 | 已废弃 |
| gotk4 | v0.4.1 | GTK 依赖导致三平台观感割裂 |
| giu | v0.15.0 | Dear ImGui 绑定，cgo，观感与定位不符 |

## 为什么是 GPUI

1. **布局层与浏览器同源**。Taffy 0.9.0（gpui 0.2.2 以 `=0.9.0` 精确锁定）默认开启 `flexbox` / `grid` / `block_layout` / `content_size` —— 浏览器的 CSS 布局算法集，**唯一能直接映射 CSS Grid 的方案**，还原度天花板最高。后续实测：同一棵布局树在 Chromium 与 GPUI 上的几何值逐位相同（0.000px），中英混排字宽亚像素一致（≤0.014px），见 [`fidelity-measurement.md`](../fidelity-measurement.md)
2. **官方提供 Apache-2.0 的数据表参考实现**。`examples/data_table.rs`（473 行）已实现固定表头、`uniform_list` 虚拟化、列宽、截断、自定义滚动条、可见范围追踪
3. **完整逐平台 IME**。macOS 走 Cocoa `NSTextInput` 协议（`set_marked_text` / `insert_text` / `marked_text_range`），Wayland 与 X11 集成 `marked_text_range()`。Zed 是编辑器，中文输入是刚需，生产验证过
4. **可完全独立使用**。`gpui` 本体 Apache-2.0，全部依赖已发布到 crates.io（`gpui_collections` / `gpui_http_client` / `gpui-macros` / `gpui_util` / `gpui_util_macros` / `blade-graphics`）。实测：空项目仅依赖 crates.io，独立构建成功，产物 5.6M，链接 `Metal.framework` + `QuartzCore.framework`
5. **版本稳定，可正常锁版本**。0.2.0 / 0.2.1 / 0.2.2 全发布于 2025-10，之后一年无新版本 —— 一年一版，计划性升级
6. **公司维护**（Zed Industries），且提供 `test-support` 无头测量（`debug_bounds` 读元素几何），UI 回归可据此做几何断言

> **修正记录（2026-10-21 实测后）**：本 ADR 初稿称 gpui「有 `visual_test.rs` 截图对比与 `toggle_headless` 无头模式」，经核实 **gpui 0.2.2 并不存在这两个 API** —— 测试设施只产出几何量，不产出像素。黄金图回归需自建抓图链路（真机窗口 + `screencapture`）。此修正不影响选型结论（该项当时是加分项而非决定项）。

## 编译速度：实测结论

「Rust 编译慢」这个常见判断经实测**在日常开发中不成立**：

| 指标 | Go 1.26.8 + Gio | Rust + eframe | Rust + gpui |
|---|---|---|---|
| 冷编译 | 9.3s | 62.2s | ~76s |
| 增量（改一行） | 0.83s | 0.62s | 0.99s |
| 交叉编译 Windows x64 | **0.49s，零工具链** | ❌ 失败 | ❌ 需 mingw-w64 |
| 产物体积 | 8.9M | 13M release / 65M debug | **5.6M** |

Rust 慢的是**冷编译**，只在新克隆、CI 无缓存、依赖升级时发生。日常增量两者持平。

**因此：既然选 Rust，就全 Rust，不做 Go + Rust 混合** —— 混合的唯一理由是编译速度，而这个理由不成立，混了反而多出跨语言协议和两套工具链。

## 后果

- **只依赖 Apache-2.0 的部分**。Zed 的应用层 crate（`ui` / `component` / `editor` / `text` / `language` / `theme` / `icons` / `menu`）是 GPL-3.0-or-later 且未发布，一律不用。组件自建，但官方 `data_table.rs` 参考实现可用
- **macOS 构建需装 Metal Toolchain**（838.9 MB）。gpui 的 build.rs 在编译期调用 Apple 的 `metal` 编译器，现代 Xcode 默认不带。**CI 的 macOS runner 必须预装**，否则构建失败
- **交叉编译 Windows 需额外工具链**。`x86_64-pc-windows-msvc` 需要 Windows 上的 Visual Studio Build Tools；`x86_64-pc-windows-gnu` 需要 mingw-w64。这是 Go 相对 Rust 的实质优势
- **GUI 不做跨平台交叉编译**，各平台原生构建
- **独立生态规模小**。gpui 38 万下载 vs egui 2722 万 —— 因为 Zed 内部走 path 依赖。第三方参考资料少，遇问题主要靠读 Zed 源码
- **gpui 由 Zed 单方面演进**，API 可能破坏。锁版本、按季评估升级（一年一版的节奏使这可行）
- **还原度不是 100%，是 98–99% 视觉等价**。需要设计规范约束（禁用 CSS 滤镜/混合模式/复杂 mask/伪元素/float），并用黄金图回归把还原度做成 CI 里可测量的指标。布局几何与文字度量已实测等价（0.000px / ≤0.014px），剩余差异集中在像素栅格化。详见 [`ui-fidelity.md`](../ui-fidelity.md) 与 [`fidelity-measurement.md`](../fidelity-measurement.md)

---

## 决策沿革

本 ADR 在同一天修订两次，完整记录变更过程。

### 第一版：Wails v2 + Web 前端（上午，已取代）

GUI 采用 `wailsapp/wails` v2 + Web 前端。理由：数据表格、树形导航、SQL 编辑器、中文输入法在 Web 技术下全部是强项；系统 WebView 让产物体积控制在 10–20MB。

**变更原因**：需求随后明确为「Go + 原生平台 GPU 渲染」，并明确 GUI 也用 Go、不引入 Web 技术栈。系统 WebView 路线（无论 Wails 还是 Electron）不满足该要求。

### 第二版：Gio（中午，已取代）

GUI 采用 `gioui.org` v0.10.3。理由：macOS 走 Metal、Windows 走 D3D11、Linux 走 Vulkan；`app/ime.go` 是协议级完整的 IME；纯 Go 依赖树。

**变更原因**：读源码后发现三个问题 —— ① `layout/` 下只有 `flex.go` / `stack.go` / `list.go`，**没有 CSS Grid**，而数据表格的经典布局正是 Grid；② **没有任何阴影原语**（`op/paint` 与 `op/clip` 里都没有），而 `box-shadow` 在现代设计里很常见；③ 官方 tag 政策是「pre-1.0 tags 仅供参考，不指定有持续支持的版本，bugfix 不会回移」，**等于不能锁版本，必须跟 main**。

### 第三版：GPUI（下午，最终）

**变更原因**：GPUI 同时解决上述三个问题 —— Taffy 提供与浏览器同源的 Flexbox **+ Grid + Block** 全套；gpui 有 `shadow` 能力（官方 `examples/shadow.rs`）与渐变（`examples/gradient.rs`）；且 gpui 是**正常发布的 crate，一年一版，可以锁版本**，与 Gio 的 0.x 政策相反。

同时实测确认：gpui 独立构建成功、产物 5.6M、真增量 0.99s、中文 IME 完整、官方 473 行数据表参考实现可用。
