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

### 3.4 GPUI（Zed 的框架）：还原度最好，但有两个否决级问题

`gpui` crate 已单独发布到 crates.io（**0.2.2，Apache-2.0**），可独立使用。

#### 技术指标

| 维度 | 实现 |
|---|---|
| 布局 | **Taffy 0.13**，features 开启 `flexbox` / `grid` / `block_layout` / `float_layout` / `content_size` —— 与浏览器同源的 CSS 布局算法集 |
| 渲染 | macOS **Metal**（`gpui_macos`）、Windows **D3D12/Vulkan**（`gpui_windows`）、Linux **Vulkan**（`gpui_linux`）、另有 `gpui_wgpu`、`gpui_web` |
| 绘制 | `lyon`（路径）、`resvg`/`usvg`（SVG）、阴影、透明度、pattern |
| 字体 | `font-kit`（Zed 的 fork，跨平台系统字体发现）+ `ttf-parser` + `swash`（HarfBuzz 移植） |
| 无障碍 | `accesskit` |
| 平台 | `gpui_macos` / `gpui_linux` / `gpui_windows` / `gpui_apple` / `gpui_ios` / `gpui_web` |
| 可测试 | `toggle_headless` 无头示例 + `platform/visual_test.rs` 截图对比 |

API 是 builder 风格，形如 Tailwind 的 utility class：

```rust
div().flex().flex_col().gap_3().bg(rgb(0x505050)).size(px(500.))
   .justify_center().items_center().shadow_lg().border_1()
   .border_color(rgb(0x0000ff)).text_xl().text_color(rgb(0xffffff))
   .child(...)
```

官方示例里直接有 `uniform_list`（虚拟化列表）、`grid_layout`、`tree`、`text`、`text_wrapper`、`shadow`、`svg`、`a11y`、`toggle_headless` —— 对数据库工具来说该有的骨架都有。

#### 问题一：组件库是 GPL-3.0-or-later，且未发布

| crate | license | 发布状态 |
|---|---|---|
| `gpui` | **Apache-2.0** | ✅ 已发布（crates.io 0.2.2） |
| `ui`（Zed 组件库） | **GPL-3.0-or-later** | ❌ 未发布 |
| `component` | **GPL-3.0-or-later** | ❌ 未发布 |

Zed 工作区根 `Cargo.toml` 写着 `[workspace.package] publish = false`，而 `crates/ui`、`crates/component` 用 `publish.workspace = true` 继承 —— 结果是 **false**，crates.io 上查无此包（索引返回空）。

后果有两层：

1. **许可证**：SelaDB 若依赖 Zed 的组件库（Button / Input / Table / Tree 等现成控件），GPL-3.0 的传染性会要求 SelaDB 整体以 GPL-3.0 分发。对一个数据库管理软件，这通常不可接受。
2. **只能用 git path 依赖**：`git = "https://github.com/zed-industries/zed"` + `path = "crates/ui"`，等于把整个 Zed 仓库拖进构建。

**只能用 `gpui` 本体（Apache-2.0）的话，组件全部自建** —— 处境和 Gio 相同，但可选的现成件更少（Gio 至少有 `widget/material` 的成套基础控件）。

#### 问题二：GPUI 与 Zed 绑定

gpui.rs 官网原文：

> For the near future, GPUI is tied to Zed, so contributions will need to be made there and kept in sync with it.

即：GPUI 的版本节奏由 Zed 决定，而 Zed 是每天几十个 commit 的高速迭代项目。这比 Gio 的「0.x 不回移 bugfix」更不稳定 —— Gio 至少是一个聚焦的小项目，GPUI 是大项目的一个子模块。

#### 还原度评估：GPUI 确实是四者里最接近 Web 的

**能做到的**：

- 布局层面 **Taffy 与浏览器同源**，Flexbox / Grid / Block / Float 的语义、盒模型、gap、aspect-ratio 都能对上
- 视觉属性：圆角、阴影、渐变、边框、透明度、SVG 图标都有
- 字体：系统字体发现 + swash 整形，CJK 覆盖没问题
- API 形态接近 Tailwind，设计稿的 utility 风格可一对一手写

**做不到的**：

| Web 能力 | GPUI 现状 |
|---|---|
| CSS 选择器 / 级联 / 伪类 | ❌ 无。GPUI 里的 "selector" 只是 `debug_selector`（测试句柄，如 `debug_selector(\|\| "MENU".into())`）。设计稿的 `.card:hover{}` 必须翻译成 `div().hover(\|s\| s.bg(...))`，**每个状态手写映射** |
| CSS transition / @keyframes | ❌ 无。只有 `spring.rs` 弹簧动画，缓动曲线要重新实现 |
| `backdrop-filter` / `blur()` / `filter: drop-shadow` | ❌ 无等价物 |
| `mix-blend-mode` | ❌ 无 |
| CSS mask / 复杂 `clip-path` | ❌ 无 |
| `::-webkit-scrollbar` 自定义滚动条 | ❌ 无 |
| `::before` / `::after` 伪元素 | ❌ 无 |
| DOM / CSSOM | ❌ 无。浏览器那套「devtools 调样式 → 抄进代码」的流程不成立 |
| 像素级文本渲染 | ❌ 字距、连字、字体回退顺序、subpixel 抗锯齿均与浏览器不同 |

**现实还原度**：

| 设计稿类型 | 可达还原度 |
|---|---|
| 规整 flex/grid 布局 + 常规控件（卡片、表格、按钮、输入框） | **90–95%** |
| 依赖滤镜 / 毛玻璃 / 复杂动画 / 自定义滚动条 | **70–80%** |
| 像素级 1:1 | **不可能** |

---

## 4. 根本矛盾：原生 GPU 渲染 与 100% 复刻 Web 设计稿 不可兼得

> 补充：Gio 侧的能力缺口已逐项从源码核实，并给出「约束设计规范 + 黄金图回归」的达成路径，见 [`ui-fidelity.md`](ui-fidelity.md)。

这是整个选型里最需要摊开讲的一点。

**原生渲染框架不是浏览器，没有 CSS 引擎。** GPUI 已经是四者里最接近的（Taffy 同源算法 + Tailwind 风格 API），也只到 90–95%。Gio 更早一层（布局是自研的 flex/absolute/flexible space，没有 grid 布局）。

但要注意一个常被忽略的事实：**WebView 本身也是 GPU 加速渲染的**。WKWebView、WebView2、WebKitGTK 的网页合成都在 GPU 上跑。所谓「原生 GPU 渲染」与「WebView」的区别不是「GPU vs CPU」，而是「你自己写绘制代码 vs 浏览器替你画」。

| 路线 | 还原度 | 产物体积 | 内存 | 启动 | 语言栈 |
|---|---|---|---|---|---|
| Web（系统 webview） | **100%** | 10–20MB | 中 | 中 | Go + Web |
| Web（Electron 捆绑 Chromium） | 100% | 100MB+ | 高 | 慢 | Go/Rust + Web |
| 原生（Gio / Ebiten / GPUI） | 70–95% | 10–20MB | 低 | 快 | 纯 Go 或 Go+Rust |

所以真正的取舍是：**「100% 复刻设计稿」和「纯 Go 单语言栈 + 极致轻快」，二选一。**

### 务实的中间路径

如果两条都想要，采用「**设计源与实现分离**」：

1. **设计源定成 design token 文件**（颜色 / 间距 / 字号 / 圆角 / 阴影 / 动效时长），而不是 HTML。HTML 只作为可视化草图与交互原型
2. token 用一份 JSON/YAML 描述，Go 侧和前端侧共用同一份 → 翻译是机械映射，不会漂移
3. **像素级回归用黄金图**：Gio 的 `unit` 包、GPUI 的 `visual_test.rs`、egui 的 `egui_kittest` 都能在无头环境截图。把「设计稿渲染图」与「实现截图」做像素 diff，就能量化还原度并防止回归

第 3 点尤其值得做 —— 它把「还原度」从主观感受变成可测量的数字。

---

## 5. 结论

### 5.1 回答「Go 里只有 Gio 合适吗」

**不是只有 Gio，但其它方案各有硬伤：**

- **Ebiten + EbitenUI** 技术指标最贴（纯 Go、Metal、DirectX、无 cgo），但组件与桌面交互能力不足，且 CJK 排版与虚拟化表格未验证 → **建议进 spike**
- **Fyne** 组件最全（Table + Tree 现成），但 macOS 只能走已被 Apple 弃用的 OpenGL，中文 IME 有 3 个 open issue
- **therecipe/qt / walk / andlabs/ui** 已废弃或仅支持单平台
- **gotk4** 依赖 GTK，三平台观感割裂

**Gio 仍然是「全 Go + 原生 GPU + 靠谱中文输入」三项同时满足的唯一方案。**

### 5.1.1 GPUI 的位置：不是 Go 方案，但值得单列

GPUI 的还原度是所有候选里最高的（Taffy 同源布局算法 + Tailwind 风格 API + 视觉测试），但两个问题对 SelaDB 是**否决级**的：

1. **组件库 GPL-3.0-or-later 且未发布** —— 用了就把 SelaDB 拖进 GPL 分发；不用就只剩 `gpui` 本体，组件全自建
2. **与 Zed 绑定** —— 版本跟着每天几十个 commit 的 Zed 走，比 Gio 更不稳定

如果 SelaDB 确定开源并接受 GPL-3.0，GPUI 值得重新评估；如果要闭源或用宽松许可证，直接排除。

### 5.2 回答「不行就用 Rust」

**Rust 生态确实更宽，但要选对框架：**

- ❌ **egui 不行** —— 组件最好（虚拟化表格 + 语法高亮现成），但中文 IME 是硬伤，有个 open issue 标题就是「Add native Chinese support」
- ✅ **Slint 可以** —— 真正原生 GPU 渲染（Skia），桌面端中文 IME 可用，版本稳定（1.18.1）且有商业支持
- ⚠️ **Tauri** —— IME 完美、组件生态最好，但那是 WebView 路线，与「原生 GPU 渲染」的需求冲突；且 Tauri v3 还在 alpha

### 5.3 我的建议

**第一步先定「还原度」是不是硬需求。** 这是所有分支的根：

- **如果「100% 复刻 HTML/CSS 设计稿」是硬需求** → 必须走 Web 路线。此时 **Wails v2（Go + 系统 webview）是被低估的平衡点**：后端、CLI、MCP、GUI 壳全是 Go，前端用 Web 技术，设计稿 100% 复刻，产物 10–20MB（远小于 Electron 的 100MB+）。需要放弃的是「自己写 GPU 绘制代码」，但 webview 内部同样是 GPU 加速合成
- **如果「原生 GPU 渲染 + 纯 Go 单栈 + 极致轻快」是硬需求** → 接受 90–95% 的还原度上限，选 Gio 或 Ebiten
- **如果两条都要** → 走「design token 分离 + 黄金图回归」路线（见第 4 节）

**定完之后按这个顺序做验证：**

1. **spike 验证 Gio**（2–3 天）：10 万行虚拟化表格、中文输入三平台实测、IME 与虚拟滚动共存
2. **spike 验证 Ebiten**（1–2 天）：同样的三项，额外看 CJK 排版质量和桌面交互能力
3. **spike 验证 Slint**（2–3 天）：仅在 1、2 都失败时启动，重点看中文 IME 和 Skia GPU 表现

三者的验证代码可以放在同一个 `spike/` 目录下，用同一套测试数据和断言，对比结果一目了然。

**换 Rust 的成本要说清楚**：不是「引入一个 GUI 库」，而是「引入一门语言 + 一套构建链 + 一份跨语言协议」。这与项目最初「全 Go」的定位冲突，收益是更好的表格组件和更成熟的维护状态。**只有当 Go 侧验证全部失败时，这个交换才划算。**

---

## 6. 待验证清单（三方案通用）

| 验证项 | 判定标准 | 对应风险 |
|---|---|---|
| 10 万行结果集渲染 | 滚动 60fps，横向滚动与列头同步 | 表格组件缺失 / 未虚拟化 |
| 中文输入 | macOS/Windows/Linux 实机输入中文注释，预编辑串位置正确 | IME 实现缺陷 |
| IME × 虚拟滚动 | 输入法预编辑过程中滚动不打断 | 状态管理冲突 |
| CJK 排版 | 中文标点、混排、换行、显示宽度 | 字体与整形能力 |
| 深色主题 | 三平台一致 | 主题系统 |
| 首启耗时 | 含字体索引扫描 | 启动性能 |
