# GUI 框架对比分析：nanoui vs gpui vs 自研

> 日期：2026-10-22
> 目的：在动工写 `crates/gui-core/` 之前，把两个可参考实现逐层拆开，明确「照抄谁、抄哪一层、什么一律不抄」。
> 相关：[ADR-0004 界面栈选型](adr/0004-ui-stack.md)（将被 ADR-0006 取代）、[GUI 框架架构设计](gui-framework-architecture.md)、[Zig vs Rust 取舍](zig-vs-rust.md)

## 0. 结论

1. **路线定为自研 `crates/gui-core/`**（taffy + cosmic-text + wgpu + winit），nanoui 与 gpui 都只作为**参考蓝本**，不作为依赖。
2. **nanoui 是主参考**——它把 GPUI 架构落成了许可干净、可通读的代码，特别是三块 gpui 拿不到的东西：自绘图标集、无头 Tester、声明式可中断动效。
3. **gpui 是次参考**——只取三样：逐平台 IME 的协议细节、`examples/data_table.rs` 的数据网格蓝本、`examples/input.rs` 的输入处理蓝本。
4. **一律不抄**：nanoui 的自研 flexbox / 自研 TrueType / OpenGL 后端 / CPU 软渲染；gpui 的整个渲染栈（blade + D3D11）。
5. **gpui 的 `icons` crate 是 GPL-3.0-or-later 且未发布**，不能用。这正是 nanoui 相对 gpui 的直接优势。

---

## 1. 三方身份卡

| | **nanoui** | **gpui 0.2.2** | **自研 gui-core** |
|---|---|---|---|
| 语言 | Zig 0.17 | Rust | Rust |
| 许可 | 自有 MIT；衍生自 GPUI(Apache-2.0)、mygo(MIT)、gpui-motion、GPUI Kit，逐项保留上游许可全文（`THIRD_PARTY_NOTICES.md`） | Apache-2.0 | — |
| 出身 | GPUI 架构的 Zig 移植 | Zed 的框架 | — |
| 维护 | **2026-10-18 创建**，4 天 112 提交，107 次为作者 `justrach` 一人；415 star | Zed 公司；crates.io 2025-10-22 发布，累计 38.6 万下载 / 近 90 天 21.8 万 | 未开工 |
| 控件覆盖 | widgets + kit 共 40+ 组件；**无树、无表格、无无障碍** | `src/elements/` 13 个元素，**无树、无表格**；有 `accesskit` 通道 | 自研 |
| 定位 | 单人造物，无社区、无 code review 分担 | 公司维护，有发布节奏 | — |

**成熟度差距是选型的关键**：gpui 有 38.6 万下载与真实第三方使用；nanoui 4 天大。把 GUI 底座押在单人项目上风险高于押在 Zed 公司上。但 gpui 的渲染栈与既定技术栈冲突，这一条又反过来。

> **数据来源**
> - nanoui：本地克隆 `/tmp/nanoui-full`（`git shortlog -sn HEAD`、`THIRD_PARTY_NOTICES.md`、`src/ui/*.zig` 头注释）
> - gpui：crates.io 源码包 `/tmp/gpui-0.2.2`（`Cargo.toml`、`src/elements/`、`examples/`）
> - 下载量：crates.io API 2026-10-22 快照

---

## 2. 逐层对比

| 层 | nanoui | gpui 0.2.2 | 自研采用 |
|---|---|---|---|
| **渲染模型** | immediate mode（GPUI 风格）：视图是状态的函数，每个事件重跑 | immediate mode | 借鉴其分层，不锁死形态 |
| **布局** | **自研 flexbox**（`src/ui/layout.zig`，两趟：measure 自底向上、arrange 自顶向下）。**无 Grid** | taffy，**锁 `=0.9.0`**（当前上游 0.15.0，落后一个大版本） | taffy 0.15，不锁版本 |
| **文本（macOS）** | CoreText + ASCII 快速路径（`src/ui/shaper.zig`，缓存单字符与字符对的字形与 kerning） | `platform/mac/text_system.rs` + `open_type.rs` | **cosmic-text 0.19**（swash/HarfBuzz） |
| **文本（Win/Linux）** | **自研 TrueType 栈**（`src/ui/tt/`：字体解析、字形映射、kerning、字体回退）+ 自研 coverage 栅格化（`tt/raster.zig`，signed-area 累加，与 font-rs 同法）。**无 HarfBuzz 级整形，无 UAX#14** | Wayland 下 cosmic-text `0.14.0`（当前 0.19.0）；X11 走 `x11/xim_handler.rs` | cosmic-text 0.19 |
| **渲染后端** | macOS/iOS **Metal**（单条 instanced draw call）；Linux **OpenGL 3.3**（GLSL 移植 Metal shader）；Windows **CPU 软渲染**（`src/ui/raster.zig`） | macOS **blade/Metal**（`macos-blade` 可选 feature）；Windows **D3D11**；Linux blade/Vulkan | **wgpu 30.0.1**（Metal/DX12/Vulkan 统一） |
| **字形图集** | 自研 `src/ui/atlas.zig`：R8 纹理，shelf packing，512→4096 增长，**亚像素水平分箱 `subpixel_bins = 4`** | 有 `image_cache` 元素 | **照抄 4 箱分箱策略** |
| **图标** | **自绘 76 个**（`src/ui/icons.zig`），24 单位网格、圆头描边，Lucide 风格；由自研 TrueType 栅格化器画出；每个图标有「至少 12 个墨点」的测试 | `icons` crate **GPL-3.0-or-later 且未发布 → 禁用** | 自建；路线取 Lucide（ISC）矢量路径 + resvg/tiny-skia 描边 |
| **虚拟列表** | `src/ui/list.zig` 等高行、overscan 4、`scroll_to` | `uniform_list` 等高 | 需扩展为**变高行 + 异构列** |
| **树 / 表格** | **无**（`grep -ril "tree_view\|pub fn tree\|data_table" src/` 零命中） | **无**（`src/elements/` 13 个元素里没有；`examples/tree.rs` 是 50 层嵌套 div 的性能演示，不是树控件） | 自己写 |
| **中文 IME** | **仅 macOS 完整**（`textinput.zig` 实现 `NSTextInputClient` 协议 14 个方法）；Linux/Windows 走自有路径，能力弱 | **三平台**（Cocoa `NSTextInput`、Wayland `zwp_input_method_v2`、X11 `xim_handler`、Windows `IMM32`/TSF），109 个依赖小节里多年迭代的成果 | 三平台自研，或引入 accesskit 统一通道 |
| **无障碍** | **无**（README 明说 "no accessibility, notifications, channels or plugins yet"） | 有（accesskit） | accesskit（MIT OR Apache-2.0） |
| **测试** | `src/ui/tester.zig`：**不建窗口**，进程内模拟输入、手动推进时间、离屏渲染出 PNG；CLI 支持 `--nanoui-snapshot` / `--nanoui-script` | 有 `gpui_test`，但需要真实窗口上下文 | **照抄 Tester 模式** |
| **断言 API** | **命令化**：`t.clickText("Increment")` / `t.hasText("1")`，按用户可感知的文本/角色写 | 按元素结构写 | **照抄命令化断言** |
| **动效** | `src/ui/motion/`：**声明式可中断** —— 说目标 + 说怎么到，motion 记住当前位置并向目标移动；中途改目标则从当前位置出发、弹簧保留速度 | `animation` 元素，API 不同 | **照搬语义**（与 CSS transition 一致） |
| **弹层** | `src/kit/overlay.zig`：`layer_popover = 20` / `layer_tooltip = 30`；`place()` 首选方向放不下就翻转到对侧，仍放不下夹在窗口内 | `anchored` 元素，能力相近 | 照搬分层与回退逻辑 |
| **代码规模约定** | 单文件 600 行上限（`zig build lines` 强制） | 无 | 借鉴「按职责拆文件」原则，不照抄数值 |

---

## 3. 五个关键差异的深挖

### 3.1 nanoui 的布局与文本**不能抄**——那是 Zig 生态缺 Taffy/HarfBuzz 的被迫产物

nanoui 自研 flexbox 是因为 Zig 侧拿不到成熟的 CSS 布局库（仓库自己的 `docs/zig-vs-rust.md` 已论证 Zig 只能靠 FFI 拿 Yoga/HarfBuzz，其余全空）。自研 TrueType 栈同理：没有 HarfBuzz 级整形就没有复杂脚本与连字，没有 UAX#14 就没有正确的中日韩断行。

**SelaDB 的表名、字段注释、SQL 注释全是中文，断行质量是刚需**；数据网格还要 CSS Grid。这两条正好是 nanoui 缺的。

> **结论**：布局用 taffy，文本用 cosmic-text，nanoui 这两层一行都不要抄。

### 3.2 gpui 的 `icons` crate 不能用，nanoui 的自绘图标集能抄

`AGENTS.md` 硬约束 2 已经写明：Zed 的应用层 crate（`ui`/`component`/`editor`/`text`/`language`/`theme`/**`icons`**/`menu`）是 GPL-3.0-or-later 且未发布，一律不用。

nanoui 的 `src/ui/icons.zig` 是**自绘的 76 个 Lucide 风格线条图标**（24 网格、圆头描边、少量填充形状与挖空），MIT 许可。**这是 nanoui 相对 gpui 的直接优势**：它把 gpui 里拿不到的东西补齐了。

要抄的是**设计方法**（24 网格 + 圆头 + 描边 + `cut` 挖空），不是 Zig 代码本身。Rust 侧用 SVG path + resvg/tiny-skia 描边渲染成 glyph atlas 即可。

顺带抄一个工程习惯：nanoui 给每个图标写了「至少画 12 个墨点」的测试（`test "every icon draws ink"`）——图标集最容易出现「画出来是空白」，这个测试很便宜。

### 3.3 IME 是 gpui 的资产，nanoui 只能抄 macOS 那一半

| | macOS | Wayland | X11 | Windows |
|---|---|---|---|---|
| gpui | Cocoa `NSTextInput`（`set_marked_text`/`insert_text`/`marked_text_range`） | `zwp_input_method_v2` | `x11/xim_handler.rs` | `IMM32` / TSF |
| nanoui | `NSTextInputClient` 协议 14 方法全实现 ✓ | 自有路径，能力弱 | 同左 | 同左 |

**gpui 的 IME 是公司维护、多年迭代、109 个依赖小节堆出来的**，nanoui 只有 macOS 完整。SelaDB 要三平台中文都能用，这块**只能参考 gpui 的协议细节**（协议本身是公开的），不能靠抄代码。

> **落地建议**：优先做 macOS（`NSTextInputClient`），Linux（`zwp_input_method_v2`）与 Windows（`IMM32`/`TSF`）排后；或引入 **accesskit**（MIT OR Apache-2.0，3000 万下载，活跃）统一无障碍与 IME 通道，把三个平台的差异关在一个 crate 里。

### 3.4 渲染后端：nanoui 的「三后端像素一致性测试」方法可抄，后端选型不抄

nanoui 有 Metal / OpenGL / CPU 三个后端的**像素一致性测试**（`tests_opengl.zig` / `tests_raster.zig`）——同一个场景在三个后端出图比对。

我们用 wgpu 统一三平台，不存在多后端一致性问题；但**「同一场景跨平台出图比对」这个回归手段可以直接搬**。

后端选型上：nanoui 在 Windows 用 CPU 软渲染（因为 Metal/D3D 不通用），我们用 wgpu 走 DX12；nanoui 在 Linux 用 OpenGL 3.3（Apple 已弃用 OpenGL，`docs/adr/0004-ui-stack.md` 记录了 Fyne 因此被淘汰），我们用 Vulkan。

### 3.5 「无头测试 + 不打扰开发者」是 nanoui 最值得抄的工程实践

nanoui 的 `tester.zig` 让 GUI 测试完全不建窗口；而它的 `AGENTS.md` 把这件事写成硬规则：

> Never show windows on the developer's screen / Never drive the real screen / Nothing polls

**落到 SelaDB**：`gui-core` 增加 `TestHarness`——不创建 winit 窗口，进程内喂合成 `InputEvent`、手动推进虚拟时钟、读回 taffy 几何与绘制命令列表（不产生像素）。断言按可感知语义写：

```rust
grid.cell_text(3, "id");
tree.expanded("public.users");
```

而不是按内部结构写。这与仓库 `docs/fidelity-measurement.md` 的几何断言思路能接上。

---

## 4. 借鉴清单

### 4.1 照搬设计（与语言无关）

| 采纳项 | 来源 | 落到 taffy + cosmic-text + wgpu 的做法 |
|---|---|---|
| 无头 Tester | nanoui `src/ui/tester.zig` | `gui-core::TestHarness`：不建窗口，喂合成事件、推进虚拟时钟、读回几何与绘制命令 |
| 命令化断言 | nanoui tester | 断言按文本/角色写，不按内部结构 |
| 亚像素分箱 | nanoui `src/ui/atlas.zig`（4 箱） | cosmic-text 出字形与 x 偏移，自建 R8 图集，按 `⌊x×4⌋` 分箱，采样按 fractional x 插值 |
| 弹层分层与定位回退 | nanoui `src/kit/overlay.zig` | layer 20/30 分批绘制、每批重设 scissor rect；`place()` 照搬翻转与夹取逻辑 |
| 声明式可中断动效 | nanoui `src/ui/motion/` | 目标值 + 过渡参数作状态，渲染循环读插值；中途改目标从当前值出发、弹簧保留速度 |
| 线条图标方法论 | nanoui `src/ui/icons.zig`（76 个） | Lucide（ISC）矢量路径 + resvg/tiny-skia 描边；配「至少 12 墨点」的测试 |
| 控件分层 | nanoui `widgets.zig` vs `kit/` | `gui-core` 只放 primitive，`seladb-gui` 放业务组件——与硬约束 3 一致 |
| 跨平台出图比对 | nanoui 三后端像素一致性测试 | 同一场景在 macOS/Linux/Windows runner 出图比对 |
| 不打扰开发者 | nanoui `AGENTS.md` | 抄进仓库 `AGENTS.md`：跑 GUI 用例一律无头，不弹窗、不抢焦点、不驱动真实屏幕 |

### 4.2 只读协议细节

| 项 | 来源 | 读什么 |
|---|---|---|
| 逐平台 IME | gpui `src/platform/` | Cocoa `NSTextInput` 的 `set_marked_text`/`insert_text`/`marked_text_range` 语义；Wayland `zwp_input_method_v2` 协议；Windows `IMM32`/TSF |
| 数据网格蓝本 | gpui `examples/data_table.rs`（473 行，Apache-2.0） | 固定表头 + `uniform_list` 虚拟化 + 列宽 + 截断 + 自定义滚动条 + 可见范围追踪 |
| 输入处理 | gpui `examples/input.rs`（746 行） | 焦点管理、按键分发、文本输入状态机 |
| 动效元素 | gpui `src/elements/animation.rs` + `examples/animation.rs` | 缓动曲线与时序的组织方式 |
| 布局元素 | gpui `src/elements/div.rs` | CSS 属性到 taffy 属性的映射粒度 |

### 4.3 一律不抄

- **nanoui**：自研 flexbox、自研 TrueType 栈、OpenGL 3.3 后端、CPU 软渲染、SF Symbols 依赖、Zig 语言机制（`comptime` 泛型、ArenaAllocator、`@Fn`）、600 行上限这个数值本身
- **gpui**：整个渲染栈（blade/Metal + D3D11）、`taffy =0.9.0` 与 `cosmic-text 0.14.0` 的版本锁、109 个依赖的引入方式
- **任何来源**：GPL-3.0-or-later 或非标准许可的组件（Zed 的 `ui`/`component`/`editor`/`text`/`language`/`theme`/`icons`/`menu`、Slint 全家）

---

## 5. 自研 gui-core 的分层与分工

沿用 `docs/gui-framework-architecture.md` 的分层，本轮把它与参考实现的对应关系钉死：

```text
┌─ widget ────────────────────────────────────────────┐
│  控件：Tree / Table / Editor / Palette               │  ← 全部自写（两个参考实现都没有）
├─ event ─────────────────────────────────────────────┤
│  命中测试 + 派发                                     │  ← 自写
├─ paint ──────────────────────────────────────────────┤
│  样式 + 几何 → 绘制指令（display list）              │  ← 自写，参考 nanoui 的分层
├─ layout ────────────────────────────────────────────┤
│  taffy 0.15（不锁版本）                              │  ← 不用 nanoui 的自研 flexbox
├─ text ───────────────────────────────────────────────┤
│  cosmic-text 0.19 + 自建 glyph atlas（4 箱分箱）      │  ← 不用 nanoui 的自研 TrueType
├─ style ──────────────────────────────────────────────┤
│  CSS 解析 → 选择器匹配 → 级联 → ComputedStyle       │  ← cssparser（MPL-2.0，见风险 R7）
└─ runtime ────────────────────────────────────────────┤
│  winit 0.30 + wgpu 30.0.1 + accesskit（IME/无障碍）    │  ← 不用 nanoui 的 Metal/GL/CPU 三分
```

---

## 6. 风险与待决

| 编号 | 风险 | 等级 | 说明与缓解 |
|---|---|---|---|
| **R7** | `cssparser 0.38.0` 的许可是 **MPL-2.0**（文件级弱 copyleft），不是 MIT/Apache | 低中 | 替换方案 `lightningcss` 1.0.0-alpha.72 **也是 MPL-2.0**，此路不通（已核实 crates.io）。MPL-2.0 只在修改其源码时传染，自用不构成约束；但 `AGENTS.md` 硬约束 2 写的是「只依赖宽松许可证的 crate」，**需要明确把 MPL-2.0 列入白名单并写清理由**，否则自研 CSS 分词器 |
| **R2** | 自研成本被低估：绘制命令编码、命中测试、焦点管理、IME 对接、平台胶水约占 20–30% 代码量 | 中高 | 先做 Phase 0 最小闭环（窗口 + 真 CSS + flex 容器 + 中文文本 + 中文输入）再往上堆控件 |
| **R3** | 中文 IME 三平台一致性是刚需也是最难自研的部分 | 中高 | 优先 macOS；或引入 accesskit 统一通道 |
| **R4** | 数据网格的变高行 + 异构列虚拟化，比等高列表难一个数量级 | 中 | 两个参考实现都只有等高列表；需自建行高缓存（测量 + 缓存 + 失效） |
| **R6** | 依赖版本漂移：cosmic-text 0.19.0（2026-04 发布，距今半年）、taffy 0.15.0、wgpu 30.0.1、cssparser 0.38.0 均在活跃迭代 | 中 | 锁版本 + 定期升级；反面教材是 gpui 锁死 `taffy =0.9.0` / `cosmic-text 0.14.0` 后跟不动上游 |
| **R9** | 无头测试链路缺失：Rust 侧尚无几何/像素回归手段 | 中 | 把 TestHarness 排进 gui-core 早期排期，否则 UI 重构无法回归 |

---

## 7. 一句话记住

> **nanoui 教我们「架构可以这么分层、测试可以完全无头、图标可以自己画」；gpui 教我们「IME 协议细节长什么样、数据网格可以怎么写」。两者的布局与文本层都别抄——那是 Zig 生态的缺件，不是最优解。**
