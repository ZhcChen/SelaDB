# 还原度实测：GPUI v0.2.2 vs Chromium

> 状态：2026-10-21 实测完成
> 目的：把「GPUI 能不能 1:1 复刻 Web 设计稿」从论证变成可复现的数据
> 关联：[`ui-fidelity.md`](ui-fidelity.md)、[`gui-architecture.md`](gui-architecture.md)、[ADR-0004](adr/0004-ui-stack.md)

---

## 1. 结论

| 维度 | 结果 | 依据 |
|---|---|---|
| **布局几何** | **完全一致** | 5 组布局 × 14 个测量点 = 70 个数，最大偏差 **0.000px** |
| **文字度量** | **亚像素一致** | 6 段文本（含中英混排），最大偏差 **0.014px** |
| 像素栅格化 | 未测 | gpui 0.2.2 无截图 API，需真机窗口抓图比对（见 [`5](#5-尚未验证下一步)） |
| CSS 特效 | 已知缺口 | filter / backdrop-filter / mix-blend-mode / 伪元素 / mask |

**对选型的影响**：原生路线的还原度天花板比此前估计的高。此前文档里「98–99% 视觉等价」是估计值，现在可以换成实测结论 —— **占还原度绝大部分的布局与文字度量不是「近似」，而是「等价」**。剩下的不确定项收敛到像素栅格化与 CSS 特效两处。

---

## 2. 方法

### 2.1 被测对象

一棵贴近数据库工具主界面的布局树：侧栏 240 + 主区，工具栏 48（gap 8 / padding 12），表头 32（列 120 / 200 / 1fr），表体 100 行 × 28。两边**逐节点一一对应**，14 个节点带测量标记。

### 2.2 浏览器侧

Playwright + Chromium（headless），`file://` 加载同一棵树的 HTML，用 `getBoundingClientRect()` 取每个节点的 `x / y / width / height`。

> 注意：`moli fetch` 的 `getBoundingClientRect()` 返回占位值（100×20），**不能用于布局测量**；它适合抓内容与截图，不做排版度量。

### 2.3 GPUI 侧（布局）

`gpui` 开启 `test-support` feature，走无头路径：

- `TestAppContext::single()` 建窗口
- `add_window` 的闭包**直接返回 Render 实体**（gpui 0.2.2 里 `Entity<T>` 没有实现 `Render`，传 `cx.new(...)` 编译不过）
- 测试平台**不会自动出帧**，必须手动走一次 `window.draw(cx)`，`debug_bounds` 才有值
- `VisualTestContext::debug_bounds(name)` 读元素边界

### 2.4 GPUI 侧（文字）

测试平台的文本系统是 `NoopTextSystem`，**不加载任何系统字体** —— 字体库里只有 Zed 自带的 11 个回退字体（`DejaVu Sans`、`Ubuntu`、`Menlo` 等），测出来的宽度是等宽回退字体的结果，没有参考价值。

所以文字度量改在**真机小程序**里测：macOS 平台（CoreText 字体源）+ `window.text_system().shape_line(...)`，字体族用 `.AppleSystemUIFont`（即 San Francisco），字号 13px，与浏览器侧 `font: 13px -apple-system` 对齐。

---

## 3. 数据

### 3.1 布局几何

五组 case 的**每组 14 个测量点全部 0.000px 偏差**。这里列差异最大的两组（其余三组与 case a 逐位相同）。

**case a —— 基准**（`#table{overflow:hidden}`、`#toolbar{flex:none}`）

| 元素 | 浏览器 x/y/w/h | GPUI x/y/w/h | 偏差 |
|---|---|---|---|
| APP | 0.000/0.000/1000.000/600.000 | 0.000/0.000/1000.000/600.000 | 0.000 |
| SIDEBAR | 0.000/0.000/240.000/600.000 | 0.000/0.000/240.000/600.000 | 0.000 |
| MAIN | 240.000/0.000/760.000/600.000 | 240.000/0.000/760.000/600.000 | 0.000 |
| TOOLBAR | 240.000/0.000/760.000/48.000 | 240.000/0.000/760.000/48.000 | 0.000 |
| BTN | 252.000/10.000/72.000/28.000 | 252.000/10.000/72.000/28.000 | 0.000 |
| SEARCH | 332.000/10.000/200.000/28.000 | 332.000/10.000/200.000/28.000 | 0.000 |
| TABLE | 240.000/48.000/760.000/552.000 | 240.000/48.000/760.000/552.000 | 0.000 |
| THEAD | 240.000/48.000/760.000/32.000 | 240.000/48.000/760.000/32.000 | 0.000 |
| TH0 | 240.000/48.000/120.000/32.000 | 240.000/48.000/120.000/32.000 | 0.000 |
| TH1 | 360.000/48.000/200.000/32.000 | 360.000/48.000/200.000/32.000 | 0.000 |
| TH2 | 560.000/48.000/440.000/32.000 | 560.000/48.000/440.000/32.000 | 0.000 |
| TBODY | 240.000/80.000/760.000/520.000 | 240.000/80.000/760.000/520.000 | 0.000 |
| TR0 | 240.000/80.000/760.000/28.000 | 240.000/80.000/760.000/28.000 | 0.000 |
| TR1 | 240.000/108.000/760.000/28.000 | 240.000/108.000/760.000/28.000 | 0.000 |

**case e —— 反向验证**（两侧都去掉 `overflow:hidden`，触发 min-content 地板）

| 元素 | 浏览器 x/y/w/h | GPUI x/y/w/h | 偏差 |
|---|---|---|---|
| TABLE | 240.000/48.000/760.000/2832.000 | 240.000/48.000/760.000/2832.000 | 0.000 |
| TBODY | 240.000/80.000/760.000/2800.000 | 240.000/80.000/760.000/2800.000 | 0.000 |
| 其余 12 个元素 | 与 case a 相同 | 与 case a 相同 | 0.000 |

五组 case 的定义：

| case | 变量 |
|---|---|
| a | 基准 |
| b | `#main` 显式 `height:100%` |
| c | `#main` 显式 `height:600px` |
| d | `#toolbar` 去掉 `flex:none`（允许收缩） |
| e | `#table` 去掉 `overflow:hidden` |

### 3.2 文字度量（13px）

| 文本 | 浏览器宽度 | GPUI 宽度（macOS 真机） | 偏差 |
|---|---|---|---|
| Hello | 30.953 | 30.951 | -0.002 |
| user_accounts | 88.766 | 88.766 | +0.000 |
| SELECT * FROM users | 134.813 | 134.805 | -0.008 |
| 数据库表 | 51.609 | 51.595 | -0.014 |
| 订单明细 | 51.609 | 51.595 | -0.014 |
| Hello 数据库 | 73.234 | 73.228 | -0.006 |

两边的 CJK 宽度都等于 3 × 17.2px，即**两边选中的中文字体是同一款**（PingFang SC），且 advance 一致。浮点尾差来自两端不同的舍入路径，不是字体差异。

---

## 4. 实测过程中的三个发现

### 4.1 Taffy 的「自动最小尺寸」规则与 CSS 完全一致

第一轮测量出现的唯一不一致是：GPUI 侧 `TABLE` 高度 2832（内容全高），浏览器侧 552。

原因不是 gpui 有 bug，而是**两边树没对齐** —— HTML 侧 `#table` 带了 `overflow:hidden`，GPUI 侧漏了。CSS 规定：flex item 的 `min-height:auto` 在 `overflow:visible` 时取 min-content 高度，因此 `#table` 压不下去；一旦 `overflow:hidden`，自动最小尺寸变 0，就能被压到 552。

Taffy 0.9 的实现与 CSS 一致（`taffy/src/compute/flexbox.rs` 里 `Overflow::maybe_into_automatic_min_size`：`Hidden | Scroll` → 0，`Visible | Clip` → 用内容尺寸）。

**反向验证（case e）**：两侧都去掉 `overflow:hidden` 后，TABLE 同时变成 2832、TBODY 同时变成 2800 —— 完全一致。两边不是「凑巧对上了」，是**同一套规则**。

**对实现的约束**：设计稿里凡是「看起来是滚动区」的容器，翻译到 gpui 时必须显式给出 `overflow_hidden()` / `overflow_scroll()`，否则会被内容高度顶开。

### 4.2 `overflow_hidden()` 可用，语义等同 CSS

`gpui-macros` 生成的 `overflow_hidden()` / `overflow_x_hidden()` / `overflow_y_hidden()` 存在且可用，映射到 Taffy 的 `Overflow::Hidden`。另有一条 gpui 文档化的等价关系：`scrollbar_width` 为 0 时，`Overflow::Scroll` 与 `Overflow::Hidden` 行为一致。

### 4.3 gpui 测试平台没有字体

`gpui/src/platform/test/platform.rs` 用的是 `NoopTextSystem`。用 `TextSystem::add_fonts()` 灌入系统字体文件也不会出现在 `all_font_names()` 里。

**含义**：任何依赖真实字体的断言（列宽、截断点、换行点）都**不能在 gpui 的测试环境里验证**，必须放到真机窗口或端到端测试里。这条直接影响后续「黄金图回归」的可行性（见 [`5](#5-尚未验证下一步)）。

---

## 5. 尚未验证（下一步）

| 项 | 为什么没测 | 怎么测 |
|---|---|---|
| **像素级栅格化** | gpui 0.2.2 **没有截图 API**（无 `platform/visual_test.rs`、无 `screenshot()`、无 `toggle_headless`） | 真机窗口定位到屏幕原点 → `screencapture -x -R0,0,1000,600` 抓图；浏览器侧 Playwright `deviceScaleFactor: 2` 截图同一 HTML；SSIM ≥ 0.98 进 CI |
| CSS 特效 | gpui 无 filter / backdrop-filter / mix-blend-mode / 伪元素 | 已列为设计规范禁用项，见 [`ui-fidelity.md`](ui-fidelity.md) |
| 滚动条占位 | 两侧当前都是覆盖式滚动条（0 宽），未测经典滚动条 | 强制 `scrollbar-width: auto` 后复测 |
| 断行 / 折行 | 样本都是单行 | 补多行文本 + `white-space` 变体 |
| 真实 Chrome 复核 | Chromium headless 已与先前 chrome-devtools 实测的 14 个值逐位一致 | 换真 Chrome 再跑一遍即可 |

---

## 6. 复现

测量工程（临时目录，不进仓库）：

- `/tmp/fidelity/template.html` —— 布局树模板，`/*CASE_CSS*/` 是各 case 的差异
- `/tmp/fidelity/measure.js` —— Playwright 侧测量
- `/tmp/fidelity/measure-text.js` —— 浏览器侧文字度量
- `/tmp/fid-rs/` —— GPUI 侧布局测量（`test-support` feature）
- `/tmp/fid-native/` —— GPUI 侧文字度量（macOS 真机）
- `/tmp/fidelity/compare.py` —— 两侧对齐成 Markdown 表格

```bash
# 浏览器侧
cd /tmp/fidelity && NODE_PATH=/opt/homebrew/lib/node_modules node measure.js a b c d e

# GPUI 布局侧
cd /tmp/fid-rs && cargo run

# GPUI 文字侧（真机）
cd /tmp/fid-native && cargo run

# 对比
cd /tmp/fidelity && python3 compare.py browser.tsv gpui.tsv
```

---

## 7. 由此修正的既有结论

| 既有结论 | 实测后 |
|---|---|
| 「Taffy 0.13 开启 flexbox / grid / block_layout / **float_layout** / content_size」 | **错**。gpui 0.2.2 精确锁定 `taffy =0.9.0`；0.9 **没有 float 布局**（样式枚举里根本不存在 Float），默认 feature 是 `std / taffy_tree / flexbox / grid / block_layout / calc / content_size / detailed_layout_info` |
| 「gpui 有 `platform/visual_test.rs` 截图对比与 `toggle_headless` 无头模式」 | **错**。gpui 0.2.2 没有这些。测试设施只提供 `debug_bounds`（几何），**不产出像素** |
| 「还原度 98–99% 视觉等价」（估计值） | 换成实测口径：**布局几何 0 偏差、文字度量 ≤0.014px**；栅格化与 CSS 特效仍未测 |
| 「GPUI 的 Taffy 与浏览器同源，还原度天花板最高」（论证） | 保留结论，但论据从「同源」升级为「实测等价」 |

