# GUI 框架全景对比

> 状态：2026-10-21 调研快照
> 目的：完整列出 Go 与 Rust 生态的跨平台原生 GUI 方案，给出 SelaDB 的选型依据
> 关联：[`gui-architecture.md`](gui-architecture.md)（Gio 方案细节）、[`adr/0004-ui-stack.md`](adr/0004-ui-stack.md)

本文所有版本与状态均于 2026-10-21 从上游仓库核实（Go module proxy / crates.io / GitHub 源码）。

---

## 1. 需求回顾

- **跨平台**：Windows / macOS / Linux
- **全 Go**（用户明确要求 GUI 也用 Go，不用 Web 技术栈）
- **原生平台 GPU 渲染**（不是系统 WebView）
- **中文可用**：中文表名、字段注释、SQL 编辑器里写中文注释

最后一条是很多选型评估里被低估的硬指标，下面会看到它直接改变了结论。

---

## 2. Go 生态全清单

Go 里做跨平台原生 GUI 的方案比想象中多，但绝大多数在某个维度上出局。

| 方案 | 最新版本 | 状态 | GPU 后端 | cgo | 中文 IME | 组件 | 结论 |
|---|---|---|---|---|---|---|---|
| **Gio** | v0.10.3（2026-09-28） | 活跃 | macOS **Metal** / Win **D3D11** / Linux **Vulkan** | darwin + wayland | ✅ 协议级完整 | 需自建 Table/Tree | **纯 Go 原生 GPU 唯一选项** |
| **Ebiten + EbitenUI** | ebiten v2.10.5（2026-10-06）/ ebitenui v0.7.3（2026-03-16） | 活跃 | macOS **Metal** / Win **DirectX** / Linux OpenGL | **无**（内置纯 Go GLFW） | 未验证 | list / grid / text | **本次新发现**，见 2.1 |
| **Fyne** | v2.8.2（2026-10-07） | 活跃 | 仅 OpenGL + 软件回退 | 全平台（glfw） | ⚠️ 3 个 open issue | **Table（虚拟化）+ Tree** | macOS OpenGL 已被 Apple 弃用 |
| giu | v0.15.0（2026-06-02） | 活跃 | OpenGL（Dear ImGui） | 全平台 | — | 弱 | 观感与定位不符 |
| therecipe/qt | 2020-09-04 | **停更** | Qt5/Qt6 | 全平台 | — | 强 | 已废弃 |
| gotk4 | v0.4.1（2026-08-09） | 活跃 | GTK4 | 全平台 | — | GTK 原生 | Linux 优先，三平台观感割裂 |
| lxn/walk | 2021 后停更 | 废弃 | Win 原生 | — | — | — | 仅支持 Windows |
| andlabs/ui | 停更 | 废弃 | OpenGL | 全平台 | — | — | 已废弃 |

### 2.1 Ebiten：本次新发现的候选

之前没把它列进方案，是因为它通常被当作游戏引擎。但从技术指标看它反而很贴：

**`hajimehoshi/ebiten/v2` v2.10.5** 的 `internal/ui/graphics.go` 明确支持多后端选择：

```go
case "opengl":  graphicsLibrary = GraphicsLibraryOpenGL
case "directx": graphicsLibrary = GraphicsLibraryDirectX
case "metal":   graphicsLibrary = GraphicsLibraryMetal
```

对应实现：`ui_darwin.go` → `metal.NewGraphics(...)`（macOS 走 Metal）、`ui_windows.go` → DirectX、`ui_linbsd.go` → OpenGL。桌面窗口层用 `ui_glfw.go`，而 GLFW 是 Ebiten 自己移植的**纯 Go 实现**，所以整体无 cgo。

配套的 `ebitenui/ebitenui`（正确模块路径是 `github.com/ebitenui/ebitenui`，不是 `ebiten-ui`）944 stars、昨天还在更新。

**但有四个需要验证的风险：**

1. **游戏引擎逆用**。Ebiten 的设计目标是逐帧游戏循环，不是桌面应用交互（无窗口内原生菜单、无标准对话框、无文件选择器）
2. **EbitenUI 组件集薄**，且 944 stars 对应 79 个 open issue，比例偏高
3. **CJK 排版质量未验证**。Ebiten 的 `text/v2` 基于 `golang.org/x/image/font/opentype`，没有 go-text 那种 HarfBuzz 级的整形与换行能力
4. **虚拟化表格能力未验证**。EbitenUI 的 `grid` 组件是否虚拟化未知

结论：**值得进 spike 验证，但不该直接定案。**

### 2.2 Go 生态的结构性问题

把上面这张表按维度归一下，会发现 Go 的原生 GUI 方案都撞在同一个三角上：

```
        纯 Go 依赖
           ▲
          ╱ ╲
         ╱   ╲
  组件成熟 ◄───► 原生 GPU 后端
```

- **组件成熟**（Fyne、Qt）→ 依赖重型 C 绑定（glfw / Qt），cgo 全平台必需，且渲染后端退化为 OpenGL
- **原生 GPU 后端**（Gio、Ebiten）→ 组件要么没有（Gio），要么是游戏 UI（EbitenUI）
- **纯 Go + 两者兼得** → 目前只有 Gio，而它自己没造轮子

这不是 Gio 的问题，是 Go 生态在 GUI 领域的整体弱势。Rust 在这里反而有更多选择。

---

## 3. Rust 生态

| 方案 | 最新版本 | 渲染 | 中文 IME | 组件 | 评价 |
|---|---|---|---|---|---|
| **egui / eframe** | 0.37.0（2026-10-15） | wgpu → Metal/Vulkan/DX12 | ❌ **硬伤，见 3.1** | **egui_extras Table + syntax_highlighting** | 组件最好，IME 最差 |
| **Slint** | 1.18.1 | **Skia GPU**（Metal/D3D/Vulkan）+ femtovg + software | ✅ 桌面端可用，见 3.2 | 声明式 .slint DSL | **Rust 里最匹配的** |
| Tauri | 3.0.0-alpha.5（v2 稳定） | 系统 WebView | ✅ 完美 | Web 全生态 | 非原生 GPU 渲染；v3 仍在 alpha |
| iced | 0.14.0 | wgpu | 待验证 | retained 库 | 库性质，组件少 |
| Dioxus | — | Web / wgpu | ✅ | Web 风格 | 需 Rust + WASM 双工具链 |

egui 的生态指标最亮眼：2700 万次下载、700 万次近期下载、Rerun 公司背书、2020 年至今 67 个版本、MIT OR Apache-2.0。

### 3.1 egui 的中文 IME 是硬伤

我查了 emilk/egui 的 issue tracker，**IME 相关 issue 共 42 个**，其中大量仍处于 open 状态：

| Issue | 标题 | 状态 |
|---|---|---|
| [#8720](https://github.com/emilk/egui/issues/8720) | **Add native Chinese support** | open |
| [#3532](https://github.com/emilk/egui/issues/3532) | IME input broken | open |
| [#2024](https://github.com/emilk/egui/issues/2024) | Input methods not working for eframe | open |
| [#7975](https://github.com/emilk/egui/issues/7975) | On Linux X11 + Fcitx5, IME pre-edit text is not in `TextEdit` | open |
| [#2529](https://github.com/emilk/egui/issues/2529) | Japanese IME does not work when using fcitx5 server | open |
| [#2964](https://github.com/emilk/egui/issues/2964) | Sogou Input Method window cannot be located near the text box | open |
| [#2317](https://github.com/emilk/egui/issues/2317) | Can't shift IME in Windows 11 | open |
| [#4486](https://github.com/emilk/egui/issues/4486) | Can't input CompositionEnd only characters | open |
| [#5817](https://github.com/emilk/egui/issues/5817) | UTF-8 characters cannot be typed into TextEdit | open |
| [#7941](https://github.com/emilk/egui/issues/7941) | IMEOutput missing essential text input information | open |

历史上还有一条已关闭的 [#962](https://github.com/emilk/egui/issues/962)「Rendering of Chinese characters is very slow」。

**有一条 open issue 的标题直接就是「Add native Chinese support」** —— 也就是说 egui 到 0.37.0 为止，连「原生中文支持」都还在待办里。

对比 Gio：`app/ime.go` 是完整的文本输入协议实现（preedit、commit、surrounding text、UTF-16 ↔ rune 索引转换），逐平台适配。这是一个**结构性差距**，不是「多点几次能绕过去」的问题。

对 SelaDB 来说，SQL 编辑器要写中文注释、表名和字段名大概率是中文、查询条件含中文 —— 这条是硬指标。

egui 的**字体**方面倒是没问题：`epaint` 0.37 引入了 `FontProvider` 机制，区分「配置字体」与「按需发现字体」，eframe 在 `system_fonts` feature 下会安装系统字体提供者，缺字时能自动发现并回退到含该字形的系统字体。默认字体是 Ubuntu-Light + Hack（无 CJK），但有系统字体兜底。

**所以 egui 的问题精确地说是 IME，不是字体。**

### 3.2 Slint：Rust 里唯一匹配的

Slint 的 IME 历史 issue 与 egui 相反 —— 涉及中文的几乎全部已 closed：

| Issue | 标题 | 状态 |
|---|---|---|
| [#1644](https://github.com/slint-ui/slint/issues/1644) | Support chinese IME for text input widget | closed |
| [#4698](https://github.com/slint-ui/slint/issues/4698) | How to input Chinese into the edit box of slint ui | closed |
| [#8716](https://github.com/slint-ui/slint/issues/8716) | Microsoft Pinyin Input Method, the interface may freeze | closed |
| [#3427](https://github.com/slint-ui/slint/issues/3427) | There is garbled text in Chinese input | closed |
| [#2658](https://github.com/slint-ui/slint/issues/2658) | Sogou Input Method window cannot be located near the text box | closed |
| [#14032](https://github.com/slint-ui/slint/issues/14032) | LineEdit cannot accept Chinese IME input on iOS device | open |
| [#6680](https://github.com/slint-ui/slint/issues/6680) | Have a virtual keyboard that supports inputting Chinese | open |
| [#3811](https://github.com/slint-ui/slint/issues/3811) | Input Method support in the public Platform API | open |

剩余 open 的是 iOS 专项、虚拟键盘、以及「公开 Platform API 的 IME 支持」这类 API 设计问题，不是桌面端功能缺失。

渲染后端在 `internal/renderers/` 下有三个：`skia`（Metal on macOS / D3D+Vulkan on Windows/Linux / CPU）、`femtovg`（OpenGL）、`software`（纯软件）。**是真正的原生 GPU 渲染。**

代价：
- 要学 `.slint` 声明式 DSL（虽然可与 Rust 混用）
- 组件集不如 web 生态，也不如 egui_extras
- 要同时引入 Rust 工具链

### 3.3 混编的架构含义

如果走「Go 核心 + Rust GUI」，边界其实很干净，因为 service 层已经存在：

```
┌──────────────────┐   JSON-RPC over stdio / 本地 socket
│  Rust GUI 客户端  │ ───────────────────────────────►
├──────────────────┤   ┌──────────────────────────────┐
│  Go core         │   │  Go: core + driver + service │
│  CLI / MCP       │   │  驱动实现、查询执行、凭据       │
└──────────────────┘   └──────────────────────────────┘
```

Go 二进制作为「引擎」被 GUI 拉起，两边共用同一份协议定义。好处是 CLI 与 GUI 行为完全一致。代价是：

- 两套语言、两套构建矩阵
- 需要维护一份跨语言协议定义（可用 JSON Schema / protobuf 生成）
- 调试链路变长

---

## 4. 结论

### 4.1 回答「Go 里只有 Gio 合适吗」

**不是只有 Gio，但其它方案各有硬伤：**

- **Ebiten + EbitenUI** 技术指标最贴（纯 Go、Metal、DirectX、无 cgo），但组件与桌面交互能力不足，且 CJK 排版与虚拟化表格未验证 → **建议进 spike**
- **Fyne** 组件最全（Table + Tree 现成），但 macOS 只能走已被 Apple 弃用的 OpenGL，中文 IME 有 3 个 open issue
- **therecipe/qt / walk / andlabs/ui** 已废弃或仅支持单平台
- **gotk4** 依赖 GTK，三平台观感割裂

**Gio 仍然是「全 Go + 原生 GPU + 靠谱中文输入」三项同时满足的唯一方案。**

### 4.2 回答「不行就用 Rust」

**Rust 生态确实更宽，但要选对框架：**

- ❌ **egui 不行** —— 组件最好（虚拟化表格 + 语法高亮现成），但中文 IME 是硬伤，有个 open issue 标题就是「Add native Chinese support」
- ✅ **Slint 可以** —— 真正原生 GPU 渲染（Skia），桌面端中文 IME 可用，版本稳定（1.18.1）且有商业支持
- ⚠️ **Tauri** —— IME 完美、组件生态最好，但那是 WebView 路线，与「原生 GPU 渲染」的需求冲突；且 Tauri v3 还在 alpha

### 4.3 我的建议

**先不换栈，按这个顺序做验证：**

1. **spike 验证 Gio**（2–3 天）：10 万行虚拟化表格、中文输入三平台实测、IME 与虚拟滚动共存
2. **spike 验证 Ebiten**（1–2 天）：同样的三项，额外看 CJK 排版质量和桌面交互能力
3. **spike 验证 Slint**（2–3 天）：仅在 1、2 都失败时启动，重点看中文 IME 和 Skia GPU 表现

三者的验证代码可以放在同一个 `spike/` 目录下，用同一套测试数据和断言，对比结果一目了然。

**换 Rust 的成本要说清楚**：不是「引入一个 GUI 库」，而是「引入一门语言 + 一套构建链 + 一份跨语言协议」。这与项目最初「全 Go」的定位冲突，收益是更好的表格组件和更成熟的维护状态。**只有当 Go 侧验证全部失败时，这个交换才划算。**

---

## 5. 待验证清单（三方案通用）

| 验证项 | 判定标准 | 对应风险 |
|---|---|---|
| 10 万行结果集渲染 | 滚动 60fps，横向滚动与列头同步 | 表格组件缺失 / 未虚拟化 |
| 中文输入 | macOS/Windows/Linux 实机输入中文注释，预编辑串位置正确 | IME 实现缺陷 |
| IME × 虚拟滚动 | 输入法预编辑过程中滚动不打断 | 状态管理冲突 |
| CJK 排版 | 中文标点、混排、换行、显示宽度 | 字体与整形能力 |
| 深色主题 | 三平台一致 | 主题系统 |
| 首启耗时 | 含字体索引扫描 | 启动性能 |
