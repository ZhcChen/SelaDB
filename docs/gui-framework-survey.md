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

> **本节的 IME 判断已按 issue 正文核实后修正**，见下方每条 issue 的实际内容。编译速度的实测数据见 [`compile-benchmarks.md`](compile-benchmarks.md)。

### 3.1 egui 的中文 IME：Wayland 正常，X11 + Fcitx5 有边界问题

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

逐条核实 issue 正文后的准确结论：

| Issue | 正文要点 | 状态 |
|---|---|---|
| [#7975](https://github.com/emilk/egui/issues/7975)（2026-03） | **Wayland + IBus 下 IME pre-edit 在 TextEdit 中显示正常**（附中/韩文截图）；X11 + Fcitx5 下 pre-edit 不在 TextEdit 内。报告者明说「**这对中文或日文 IME 不是什么大问题**」，但韩文失焦会丢未提交字符。另注：0.33.3 更糟，IME 仅在光标位于开头时可用 | open |
| [#2024](https://github.com/emilk/egui/issues/2024)（2022-09） | Linux X11 + iBus 下 iBus 未被调用 | open，仅 1 条评论，已陈旧 |
| [#8720](https://github.com/emilk/egui/issues/8720)（2026-10-15） | 标题是「Add native Chinese support」，但正文要的是 **UI 本地化与文档翻译**，**不是输入法** | open，4 条评论 |

**所以「egui 中文 IME 是硬伤」这个说法过头了。** 准确说法是：**egui 的 IME 在 Wayland + IBus 上工作正常，X11 + Fcitx5 组合有边界问题，且对中文影响有限**。这与 Fyne 的处境是同一量级，并不构成把 Rust 排除的理由。

egui 的**字体**方面没问题：`epaint` 0.37 引入 `FontProvider` 机制，区分「配置字体」与「按需发现字体」，eframe 在 `system_fonts` feature 下安装系统字体提供者，缺字时能自动发现并回退到含该字形的系统字体。默认字体是 Ubuntu-Light + Hack（无 CJK），但有系统字体兜底。

Gio 的 `app/ime.go` 仍是完整的文本输入协议实现（preedit、commit、surrounding text、UTF-16 ↔ rune 索引转换），逐平台适配，覆盖面比 egui 完整。

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
| 布局 | **Taffy 0.9.0**（gpui 0.2.2 精确锁定），默认 features 开启 `flexbox` / `grid` / `block_layout` / `content_size` —— 与浏览器同源的 CSS 布局算法集（**无 float 布局**） |
| 渲染 | macOS **Metal**（`gpui_macos`）、Windows **D3D12/Vulkan**（`gpui_windows`）、Linux **Vulkan**（`gpui_linux`）、另有 `gpui_wgpu`、`gpui_web` |
| 绘制 | `lyon`（路径）、`resvg`/`usvg`（SVG）、阴影、透明度、pattern |
| 字体 | `zed-font-kit`（Zed 的 font-kit fork，跨平台系统字体发现）+ `cosmic-text 0.14`（内含 `fontdb` + `rustybuzz` 整形） |
| 无障碍 | `accesskit` |
| 平台 | `gpui_macos` / `gpui_linux` / `gpui_windows` / `gpui_apple` / `gpui_ios` / `gpui_web` |
| 可测试 | `test-support` feature：无头布局测量（`debug_bounds` 读元素几何）。**无截图 API**（初稿记为「`toggle_headless` + `platform/visual_test.rs` 截图对比」，经核实 gpui 0.2.2 无此二者） |

API 是 builder 风格，形如 Tailwind 的 utility class：

```rust
div().flex().flex_col().gap_3().bg(rgb(0x505050)).size(px(500.))
   .justify_center().items_center().shadow_lg().border_1()
   .border_color(rgb(0x0000ff)).text_xl().text_color(rgb(0xffffff))
   .child(...)
```

官方示例里直接有 `data_table`（473 行数据表）、`uniform_list`（虚拟化列表）、`grid_layout`、`tree`、`text`、`text_layout`、`text_wrapper`、`shadow`、`gradient`、`svg` —— 对数据库工具来说该有的骨架都有。（初稿还列了 `a11y` 与 `toggle_headless` 两个示例，核实 gpui 0.2.2 **并无这两个文件**。）

#### 许可证：gpui 本体可独立使用，Zed 的应用层组件不可用

| crate | license | crates.io |
|---|---|---|
| `gpui` | **Apache-2.0** | ✅ 0.2.2 |
| `gpui_collections` / `gpui_http_client` / `gpui-macros` / `gpui_util` / `gpui_util_macros` | Apache-2.0 | ✅ 均为 0.2.x |
| `blade-graphics`（GPU 抽象层） | Apache-2.0 | ✅ 0.9.0 |
| `ui` / `component` / `editor` / `text` / `language` / `theme` / `icons` / `menu` / `search` | **GPL-3.0-or-later** | ❌ 未发布（Zed 工作区 `publish = false`） |

**gpui 本体及其全部依赖都已发布，可完全独立使用**（依赖在发布时重命名以避免与 Zed 主程序冲突：`collections` → `gpui_collections`、`http_client` → `gpui_http_client`、`gpui_macros` → `gpui-macros`）。

不能用的是 Zed 的应用层组件库 —— 那些是 GPL-3.0-or-later 且未发布。但对 SelaDB 来说这影响有限：Zed 的 `ui` 组件是按 Zed 的设计语言做的，数据库工具本来就要自己的组件；**更关键的是官方示例 `examples/data_table.rs` 就在 gpui crate 内（Apache-2.0 的一部分），是 473 行的完整数据表参考实现**。

#### 版本稳定性：比 Gio 更好，而非更差

gpui.rs 官网说：

> For the near future, GPUI is tied to Zed, so contributions will need to be made there and kept in sync with it.

这句话约束的是**「你不能给 gpui 单独打补丁」**（贡献要提到 Zed 仓库），**不是「你不能锁版本」**。

实测 crates.io 发布记录：

| 版本 | 发布时间 |
|---|---|
| 0.2.0 | 2025-10-09 |
| 0.2.1 | 2025-10-14 |
| 0.2.2 | 2025-10-22 |

**三个版本全部集中在 2025 年 10 月，之后整整一年没有新版本。** 这与 Gio 截然相反 —— Gio 官方明说 0.x 阶段每次 minor 升级都是破坏性变更、tags 不回移 bugfix、必须跟 `main`。

**结论：gpui 一年一版、可以正常锁版本，API 稳定性实际优于 Gio。** 这条把此前「GPUI 版本比 Gio 更不稳定」的判断推翻了。

#### 中文 IME：完整逐平台协议实现

gpui 的 IME 不是权宜之计，是按平台协议实现的：

| 平台 | 实现 |
|---|---|
| macOS | Cocoa `NSTextInput` 协议 —— `set_marked_text` / `insert_text` / `has_marked_text` / `marked_text_range` / `valid_attributes_for_marked_text` 全部实现（`src/platform/mac/window.rs`） |
| Linux Wayland | `input_handler.marked_text_range()` 集成（`src/platform/linux/wayland/window.rs`） |
| Linux X11 | 同上（`src/platform/linux/x11/window.rs`） |

Zed 是编辑器，中文输入是刚需，这条路径是生产验证过的。完整度与 Gio 的 `app/ime.go` 相当。

#### 官方数据表参考实现

`examples/data_table.rs`（473 行，Apache-2.0）已经实现了数据库表格需要的全套：

- 固定表头（表头与 `uniform_list` 平级，天然固定）
- `uniform_list` 虚拟化（`cx.processor(move |this, range: Range<usize>, _, _| ...)`，只渲染可见区间）
- 固定列宽（`FIELDS.map(|(key, width)| ... .w(px(width)))`）
- 文本截断（`.truncate().whitespace_nowrap()`）
- 自定义滚动条（`render_scrollbar`）
- 可见范围追踪（`self.visible_range = range.clone()`）
- 单元格类型着色（`change_color` 返回 `gpui::Hsla`）

**这是所有候选方案里唯一由框架作者提供的、Apache-2.0 的完整数据表实现。**

#### 实测验证：gpui 独立可用

我实际拉了 crates.io 上发布的 `gpui 0.2.2`，把官方的 `examples/data_table.rs` 拷进一个空项目，验证「第三方能否脱离 Zed 仓库独立使用」：

```toml
[dependencies]
gpui = "0.2"
rand = "0.9"
```

| 验证项 | 结果 |
|---|---|
| 独立构建 | ✅ 成功 |
| 产物大小 | **5.6M**（比 eframe 的 13M 还小） |
| 链接的图形后端 | `Metal.framework` + `QuartzCore.framework` → **真正的 macOS 原生 GPU 渲染** |
| 冷编译（含 Metal shader 编译） | ~76s |
| 真增量（改一行） | **0.99s** |
| 依赖来源 | 全部来自 crates.io，**不需要 git/path 依赖 Zed 仓库** |

唯一需要处理的坑：`examples/data_table.rs` 用了 `rand 0.9` 的 API（`rand::rng()` / `rng.random_range()`），照抄时注意版本。

#### 构建环境要求：macOS 需要 Metal Toolchain

gpui 的 build.rs 会**在编译期调用 Apple 的 `metal` 着色器编译器**。现代 Xcode 默认不带 Metal Toolchain 组件，实测：

```
cargo::error=metal shader compilation failed:
error: cannot execute tool 'metal' due to missing Metal Toolchain;
use: xcodebuild -downloadComponent MetalToolchain
```

`xcodebuild -showComponent MetalToolchain` → `Status: uninstalled`。

需要执行一次 `xcodebuild -downloadComponent MetalToolchain`（多 GB 下载）。这是 gpui 在 macOS 上独有的前置条件 —— **CI 的 macOS runner 也必须预装这个组件**，否则构建直接失败。这是选型时容易被忽略的运维成本。

#### 还原度评估：GPUI 确实是四者里最接近 Web 的

**能做到的**：

- 布局层面 **Taffy 与浏览器同源**，Flexbox / Grid / Block 的语义、盒模型、gap、aspect-ratio 都能对上；**已实测等价**（几何 0.000px、字宽 ≤0.014px，见 [`fidelity-measurement.md`](fidelity-measurement.md)）
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

### 3.5 横向对照：控件库与测试基建（选型的真正决定性维度）

前面比的是「能不能渲染」。但对产品落地来说，**有没有可商用的控件库**和**能不能做无头 UI 回归测试**同样关键。许可证均从上游仓库的 Cargo.toml / LICENSE 实读：

| 框架 | 可商用控件库 | 无头测试 / 截图 | 渲染后端 | 中文 IME | 版本可锁 |
|---|---|---|---|---|---|
| **gpui** 0.2.2 | ❌ Zed 的 `crates/ui`、`crates/component` 是 **GPL-3.0-or-later**，未发布 | ❌ 无（需开真窗口 + `screencapture`） | Metal / D3D11 / Vulkan | ✅ 逐平台完整 | ⚠️ 跟随 Zed |
| **egui** 0.37.0 | ✅ `egui_extras` MIT OR Apache-2.0 | ✅ `egui_kittest` | wgpu | ⚠️ Wayland+IBus 正常，X11+Fcitx5 边界问题 | ✅ 稳定 |
| **slint** 1.18.1 | ⚠️ GPL-3.0-only OR Slint-Royalty-free-2.0（双许可，非 MIT/Apache） | ✅ | Skia | ✅ 桌面端可用 | ✅ |
| **Fyne** 2.8.2 | ✅ **BSD-3-Clause**，自带完整控件 | ✅ | **仅 OpenGL** | ⚠️ 3 个 open issue | ✅ |
| **Gio** 0.10.3 | ✅ MIT/UNLICENSE，自带 `widget/material` | ✅ `unit` 包 | Metal / D3D11 / Vulkan | ✅ 协议级完整 | ❌ 0.x 政策 |

**没有哪个框架是全绿的。** 按需求交叉：

- 要 **可商用控件库** → egui / Fyne / Gio
- 要 **原生 GPU 后端** → gpui / Gio / egui / Slint
- 要 **中文 IME 可靠** → gpui / Gio / Slint
- 要 **无头 UI 回归** → egui / Slint / Fyne / Gio

**Gio 是唯一「可商用控件 + 原生 GPU + 可靠 IME + 无头测试」四项全中的**，代价是依赖不能锁版本。

**gpui 的长板与短板刚好互补**：后端与 IME 是最强的，但可商用控件库和测试基建要自己补 —— 而这正好是 Gio 已经有的。

### 3.6 自研 GUI 框架（Zig）路线的成本分析

「在 Zig 里封装一层接口，每个平台走底层 GPU 实现」这条路的技术地图如下。

#### 平台后端对照

| 层 | macOS | Windows | Linux |
|---|---|---|---|
| 窗口 | Cocoa `NSWindow` | Win32 `HWND` | **Wayland `wl_surface`**（X11 作兼容回退） |
| GPU | **Metal** | **DXGI + Direct3D 11/12** | **Vulkan**（回退 OpenGL 3.3） |
| 文本 | CoreText | DirectWrite | FreeType + HarfBuzz + Fontconfig |
| IME | `NSTextInputClient` | TSF / IMM32 | `wl_text_input` / XIM |
| 着色器 | Metal Shading Language | HLSL / DXIL | SPIR-V |
| 分发 | .app + codesign + notarization | MSIX / 安装器 | AppImage / deb / Flatpak |

> **需要纠正一处概念**：WinUI 3 不是 GPU API，是基于 XAML 的 UI 框架（依赖 Windows App SDK 与 WinRT/COM 互操作），从 Zig 驱动它极其痛苦。Zig GUI 框架在 Windows 上应当走 **DXGI + D3D**，这与 wgpu 的 windows backend 一致。

#### Linux 侧要点（用户不熟的部分）

1. **Wayland 是必须支持的**。X11 正在被淘汰：Ubuntu 24.04、Fedora 40+ 默认 Wayland，KDE 与 wlroots 系合成器（Sway）只走 Wayland。
2. **Wayland 比 X11 难得多**：没有全局坐标、没有原生窗口句柄、每个 surface 要自绘、焦点与输入走 `wl_keyboard` / `wl_pointer` / `wl_text_input`。中文输入对应 `wl_text_input` 协议。
3. **GPU 选 Vulkan**。Wayland 合成器本身就是 Vulkan 路线；OpenGL 3.3 只作老显卡 / 老虚拟机回退。
4. **系统依赖绕不开**：即使「Zero Dependencies」指无外部 Zig 包，Linux 上仍需 Wayland、Vulkan、FreeType、HarfBuzz、Fontconfig。

#### Zig 生态现状（2026-10-21 核实）

| 项目 | star | 状态 |
|---|---|---|
| Gooey | 少量 | 明确标注 **Early Development**，API 仍在变；Metal / Vulkan / WebGPU；WebGPU/WASM 线被 Zig 0.16 上游阻塞 |
| knots-ui/knots | 51 | 2026-09-27 创建，MIT，immediate-mode |
| sl4de0day/zigui | 0 | 2026-08-18 创建，MIT，21 个后端 |
| CeoMatheusDev/NitroUI | 0 | 2026-10-13 创建 |
| QuaternionWake/qw_gui | 1 | AGPL-3.0，基于 Raylib |

**结论：Zig 没有可用的 GUI 框架生态。** 唯一像样的是 Gooey，且自认早期开发。

#### Zig 本身的优势与代价

优势：`zig cc` 可直接编译 HarfBuzz / FreeType 等 C 库并调用；`@cImport` / `translate-c` 能把 Metal.framework 头文件转成 Zig 绑定；comptime 适合做着色器变体与布局常量；无 GC、单二进制。

代价：框架代码会跟着 Zig 的 breaking change 一起被冲刷（0.16 → 0.17 仍在破坏性演进）；Zig 生态的 GUI 资料极少；一旦自研，你要永久维护字体整形、IME、无障碍、系统集成。

#### 工作量量级

一个「能用」的跨平台原生 GUI 框架，自研到 Gio / egui 现有水平的 80%：

| 阶段 | 熟练小团队 |
|---|---|
| 窗口 + GPU 抽象 + 基础输入 | 3–6 个月 |
| 文本渲染（整形 / CJK / 回退 / 缓存） | 3–6 个月 |
| 三平台 IME（含中文） | 3–6 个月 |
| 控件库 + 布局引擎 + 主题 | 6–12 个月 |
| 打磨到可交付质量 | 6–12 个月 |

期间产品功能零进展。而这正是问题所在：SelaDB 的核心竞争力在数据模型、查询、协议、Agent 集成，不在渲染管线。

#### 关键判断

自研框架解决的是「渲染保真度」问题，但代价是**全部其他维度**。而且**保真度不会因此变成 100%** —— 自研框架同样没有 CSS 引擎，你依然要手写布局与绘制，只是从「调用现成 API」变成「自己实现 API」。

真正的解法是**把设计源与实现解耦**（design token + 黄金图回归），而不是换一个更底层的框架。

### 3.7 「HTML/CSS 风格接口」路线（Zig 自研 CSS 引擎）

若诉求是「用 HTML/CSS 的熟悉写法描述界面，但底层自绘」，完整可行性与成本分析见
[`css-dsl-strategy.md`](css-dsl-strategy.md)。要点：

- **Flexbox 有捷径**：Yoga 是 C++/MIT，`zig cc` 直接编译 + FFI，不用自己写
- **CSS Grid 无捷径**：Zig 生态没有现成实现，Yoga 只做 flex
- **inline 行内布局建议明确不支持**：line box / baseline / strut 极难，app UI 用不到
- **成本 8–18 个月**，且自研并不改变还原度上限（仍然没有浏览器的级联完备性）
- **自研换来的不是保真度而是控制权**；真正省事的路径是 design token 单一设计源 + 黄金图回归，或写一个 CSS→目标框架的转译器（2000–3000 行，几周）

---

## 4. 根本矛盾：原生 GPU 渲染 与 100% 复刻 Web 设计稿 不可兼得

> 补充：Gio 侧的能力缺口已逐项从源码核实，并给出「约束设计规范 + 黄金图回归」的达成路径，见 [`ui-fidelity.md`](ui-fidelity.md)。

这是整个选型里最需要摊开讲的一点。

**原生渲染框架不是浏览器，没有 CSS 引擎。** GPUI 已经是四者里最接近的（Taffy 同源算法 + Tailwind 风格 API），且这一层**已实测**（布局几何与文字度量与 Chromium 等价，差异只剩像素栅格化与被禁用的 CSS 特效）。Gio 更早一层（布局是自研的 flex/absolute/flexible space，没有 grid 布局）。

但要注意一个常被忽略的事实：**WebView 本身也是 GPU 加速渲染的**。WKWebView、WebView2、WebKitGTK 的网页合成都在 GPU 上跑。所谓「原生 GPU 渲染」与「WebView」的区别不是「GPU vs CPU」，而是「你自己写绘制代码 vs 浏览器替你画」。

| 路线 | 还原度 | 产物体积 | 内存 | 启动 | 语言栈 |
|---|---|---|---|---|---|
| Web（系统 webview） | **100%** | 10–20MB | 中 | 中 | Go + Web |
| Web（Electron 捆绑 Chromium） | 100% | 100MB+ | 高 | 慢 | Go/Rust + Web |
| 原生（GPUI） | 布局/字宽实测等价，栅格化有差异 | 10–20MB | 低 | 快 | 纯 Rust |
| 原生（Gio / Ebiten） | 70–95% | 10–20MB | 低 | 快 | 纯 Go |

所以真正的取舍是：**「100% 复刻设计稿」和「纯 Go 单语言栈 + 极致轻快」，二选一。**

### 务实的中间路径

如果两条都想要，采用「**设计源与实现分离**」：

1. **设计源定成 design token 文件**（颜色 / 间距 / 字号 / 圆角 / 阴影 / 动效时长），而不是 HTML。HTML 只作为可视化草图与交互原型
2. token 用一份 JSON/YAML 描述，Go 侧和前端侧共用同一份 → 翻译是机械映射，不会漂移
3. **像素级回归用黄金图**：Gio 的 `unit` 包、egui 的 `egui_kittest` 都能在无头环境截图；**GPUI 0.2.2 没有截图 API**，需要自建抓图链路（真机窗口 + `screencapture`）。把「设计稿渲染图」与「实现截图」做像素 diff，就能量化还原度并防止回归

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

### 5.1.1 GPUI：经过实测后，是原生方案里的最优解

此前对 GPUI 的两条否定理由经核实后都不成立：

| 此前判断 | 核实结果 |
|---|---|
| 「组件库 GPL-3.0 且未发布 → 不可用」 | **gpui 本体 Apache-2.0，全部依赖已发布，可完全独立使用**（已实测构建成功）。GPL-3.0 只影响 Zed 的应用层组件库，而那些组件本就是按 Zed 设计语言做的，数据库工具也要自己的；官方 `data_table.rs` 参考实现就在 Apache-2.0 的 crate 内 |
| 「与 Zed 绑定 → 版本比 Gio 更不稳定」 | **反了**。gpui 0.2.0/0.2.1/0.2.2 全发布于 2025-10，之后一年无新版本 —— 一年一版、可以正常锁版本。Gio 才是「0.x 每次 minor 破坏 + 不回移 bugfix + 必须跟 main」 |

修正后 GPUI 的优势是全部候选里最完整的：

- **Taffy = 浏览器同源的 Flexbox + Grid + Block 全套** → 唯一能直接映射 CSS Grid 的方案（实测几何等价）
- **官方 473 行数据表参考实现**（Apache-2.0）→ 固定表头 + `uniform_list` 虚拟化 + 列宽 + 截断 + 自定义滚动条
- **完整逐平台 IME**（Cocoa `NSTextInput` / Wayland / X11）→ Zed 生产验证
- **实测独立可用**，产物 5.6M，真增量 0.99s
- 公司维护、版本稳定、无头布局测量（`debug_bounds`）

代价（仍然成立）：macOS 构建需装 Metal Toolchain 组件（838MB，CI 也要预装）、交叉编译 Windows 需 mingw-w64、**独立生态规模小**（gpui 38 万下载 vs egui 2722 万 —— 因为 Zed 内部走 path 依赖，第三方参考资料少）。

### 5.2 回答「不行就用 Rust」

**Rust 生态确实更宽，但要选对框架：**

- ✅ **egui 可以** —— 组件最好（虚拟化表格 + 语法高亮现成）、维护主体是公司（Rerun）、社区 2700 万下载、无头快照测试成熟。中文 IME 在 Wayland + IBus 正常，X11 + Fcitx5 有边界问题（对中文影响有限）
- ✅ **Slint 可以** —— 真正原生 GPU 渲染（Skia），桌面端中文 IME 可用，版本稳定（1.18.1）且有商业支持
- ⚠️ **Tauri** —— IME 完美、组件生态最好，但那是 WebView 路线，与「原生 GPU 渲染」的需求冲突；且 Tauri v3 还在 alpha

### 5.3 我的建议

**经源码核实与实测，最终结论：Rust + GPUI。**

理由汇总（全部有实测或源码依据）：

| 维度 | Go + Gio | Rust + GPUI | 胜出 |
|---|---|---|---|
| CSS Grid 布局 | ❌ 无 | ✅ Taffy 浏览器同源 | **Rust** |
| 现成数据表实现 | ❌ 自建 800–1500 行 | ✅ 官方 473 行参考实现 | **Rust** |
| 中文 IME | ✅ 协议级完整 | ✅ 完整逐平台 | 平 |
| 阴影 / 渐变 | ❌ 无阴影原语 | ✅ `BoxShadow` + `linear_gradient()` | **Rust** |
| 版本可锁性 | ❌ 必须跟 main | ✅ 一年一版，可锁 | **Rust** |
| 维护主体 | 个人 | 公司 | **Rust** |
| 增量编译 | 0.83s | 0.99s | 平 |
| 冷编译 | **9.3s** | 76s | **Go** |
| 交叉编译 Windows | **零工具链** | 需 mingw-w64 / VS Build Tools | **Go** |
| macOS 构建前置 | 无 | 需 Metal Toolchain 组件 | **Go** |
| 产物体积 | 8.9M | **5.6M** | **Rust** |

**唯一的 Go 优势是构建摩擦，而它体现在冷编译和交叉编译上。** 日常增量两者持平。

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
