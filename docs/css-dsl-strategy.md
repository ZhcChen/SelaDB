# 「HTML/CSS 风格界面」的可行性分析

> 2026-10-21
> 议题：能否在 Zig 里封装一层，接口直接用 HTML/CSS/JS 那套熟悉写法（布局、样式）？

---

## 1. 先分清两种诉求

「直接走 html + css + js 这套的熟悉的用法」有两种截然不同的实现，**成本差一个数量级**：

### A. 真·HTML/CSS/JS 文件

写 `.html` / `.css`，由浏览器引擎渲染。

**结论：不要自研。** 浏览器引擎已经存在（WebKit2GTK / WebView2 / CEF / WKWebView），而且是几十年积累的工业级实现。要自研一个 CSS 引擎，得到的永远是浏览器的 80%，而 100% 的现成方案就在那里。

如果同时还要求「自己掌控渲染」，唯一正解是**嵌入浏览器引擎**（Tauri / Wails / CEF），不是自研 CSS 引擎。

### B. HTML/CSS **风格的声明式 DSL**

界面写法用 CSS 习惯（`display: flex` / `gap` / `padding` / `border-radius`），但底层是自己写的渲染栈，不跑 JS。

**结论：可行，而且这是自研路线唯一说得通的形态。** 对标物是 Flutter Widget 树、SwiftUI DSL、Jetpack Compose —— 都是「熟悉的声明式用法」，但底层是自绘。

---

## 2. 自研 CSS 引擎：逐项可行性

| CSS 能力 | 可行性 | 关键约束 |
|---|---|---|
| CSS 解析（选择器 + 声明） | ✅ | Zig 有 `chadwain/zss`（50 star）可参考，自己写更可控 |
| 级联 + 特异性 + 继承 | ✅ | 纯逻辑，不碰 GPU。伪类需 hit-test 驱动状态重算 |
| **Flexbox 布局** | ✅ | **Yoga 是 C++/MIT，`zig cc` 直接编译 + FFI**。现成的，不用自己写 |
| **CSS Grid 布局** | ❌ | **Zig 生态没有现成的**。Yoga 只做 flex；Grid 要自己实现，或从 Taffy（Rust）移植 —— 不现实 |
| 文本整形（shaping） | ✅ | HarfBuzz（C/MIT）`zig cc` 编译 |
| 文本换行 / 断行 | ⚠️ | 自己实现 UAX #14；浏览器的 `text-wrap: balance` 等无等价物 |
| **inline 行内布局** | ❌ | **极难**：line box、baseline 对齐、strut、行盒拆分。app UI 基本用不到，可明确声明不支持 |
| 绘制（盒/圆角/边框/阴影/渐变/裁剪） | ✅ | 自己写，GPU shader |
| 滤镜 / 混合模式 / backdrop-filter | ⚠️ | 每个都要写 shader，工作量大。可明确列为不支持 |
| IME（3 平台） | ⚠️ **最难** | macOS `NSTextInputClient` / Windows TSF / Linux `wl_text_input` |
| 平台层（3 套） | ⚠️ **最花时间** | macOS 先单平台跑通 |
| 无障碍 | ⚠️ | macOS AX / Windows UIA / Linux AT-SPI |

---

## 3. 工作量拆解

| 阶段 | 内容 | 单人估时 |
|---|---|---|
| Phase 0 | 工具链验证：`zig cc` 编译 Yoga + HarfBuzz，macOS 开窗画一个 flex 盒子 | 1 周 |
| Phase 1 | macOS 单平台最小闭环：CSS 解析 → 级联 → Yoga 布局 → CoreText 文本 → Metal 绘制 | 4–6 周 |
| Phase 2 | 交互层：命中测试、`:hover`/`:focus` 状态、焦点管理、滚动、事件冒泡 | 4–6 周 |
| Phase 3 | 补齐：Grid 布局（若需要）、阴影/渐变、SVG | 4–8 周 |
| Phase 4 | IME 三平台（中文用户必须做） | 6–10 周 |

**总计：单人到小团队 8–18 个月**，才能达到「能交付一个 app」的成熟度。期间产品功能零进展。

**且在 macOS 单平台跑通之前，不要碰 Windows 与 Linux。**

---

## 4. 收益的真实边界

自研 CSS 引擎**不会**把还原度变成 100%。自研引擎同样没有浏览器的级联完备性、伪类覆盖、滤镜与 inline layout。你依然要手写布局与绘制，只是从「调用现成 API」变成「自己实现 API」。

**自研换来的是控制权，不是保真度。**

它唯一的结构性收益是：**设计稿的 CSS 变成了框架的直接输入，而不是人工翻译成 builder 调用。**

这个收益是真实的 —— 本仓库的 `demo-desktop-app` 就是反例：把 RedCode IM 2.0 的 CSS token 手工搬成 GPUI 调用，是 300 行人工映射。自研引擎要自动化的正是这段。

**但这段映射有更便宜的两条替代路径：**

1. **design token 单一设计源** —— `design/tokens.json`（颜色/间距/字号/圆角/阴影/动效）+ HTML 原型 + 黄金图 diff 回归。翻译是机械的、可自动化的、可测量的
2. **CSS→目标框架的转译器** —— 用 Zig/Go 写一个 CSS subset → builder 调用的转译器，约 2000–3000 行，几周。保留「设计稿直接驱动」的诉求，但不需要自研 CSS 引擎（级联/伪类/滤镜全部简化或放弃）

---

## 5. 三条路线对比

| | 自研 CSS 引擎（Zig） | Gio 路线 | Web 路线（Wails/Tauri） |
|---|---|---|---|
| 还原度上限 | ~95% | 95–99% | **100%** |
| 到达上限时间 | 8–18 个月 | 几周 | 几天 |
| 中文 IME | 自己实现三套协议 | ✅ 协议级完整，已生产验证 | ✅ 浏览器自带 |
| 无头 UI 测试 | 自己搭 | ✅ `unit` 包 | ✅ 浏览器截图 |
| 现成数据表格 | ❌ 还要自己写 | ❌ 也要自己写 | ✅ HTML table |
| 需要你维护 | 整个 GUI 栈 | 业务逻辑 | 业务逻辑 |
| 体积 | 最小 | 小 | 中 |

**三条路线都要自己写数据表格组件**（除非走 Web 路线）。自研路线额外多背 CSS 引擎 + 文本栈 + IME + 平台层的全部成本。

---

## 6. 语言选型：Rust

详细的 crate 级对比见 [`zig-vs-rust.md`](zig-vs-rust.md)。要点：

Rust 侧现成件覆盖了自研方案里最贵的部分 —— `taffy`（CSS Flexbox + Grid 规范实现）、
`wgpu`（Metal/DX12/Vulkan）、`winit`（Cocoa/Win32/Wayland）、`cosmic-text`（整形+换行）、
`cssparser` + `bao-stylo`（Firefox 的 CSS 解析与级联）。

Zig 侧这三块（GPU 抽象、窗口、CSS 级联）恰是生态最空白处，只能 FFI C 库或自己写。
且 Zig 自身 pre-1.0，框架代码会跟着 breaking change 反复重写。

---

## 7. 建议

**除非你打算把 GUI 框架本身当产品**（像 Zed 那样），否则自研是负期望值。

推荐路径：

1. **保留 Gio**（Metal/D3D11/Vulkan + 协议级 IME + `unit` 无头测试），只自建 Table/Tree 组件 —— 这本来就是产品的核心竞争力所在
2. **用 design token 消除「设计稿 → 人工翻译」**，`design/tokens.json` 作为唯一设计源
3. **黄金图 diff 进 CI**，把还原度从主观感受变成可测量指标
4. 若设计稿量大到人工翻译成为瓶颈，**再写 CSS→Gio 的转译器**（几周），而不是自研 CSS 引擎（8–18 个月）

**若仍要验证 Zig 路线的可行性**，只做 Phase 0：两周内用 `zig cc` 编译 Yoga + HarfBuzz，在 macOS 开一个窗口显示中文并接受中文输入。跑通则 Zig 在底层可行（Rust + wgpu 路线同理），跑不通则所有 Zig 方案直接排除。这个 spike 的底层活儿（Metal + CoreText + 整形）在任何路线下都要做，不浪费。
