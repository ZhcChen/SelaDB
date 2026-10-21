# Zig vs Rust：自研 GUI 框架的语言选型

> 2026-10-21
> 前提：决定自研一个「HTML/CSS 风格接口」的跨平台原生 GUI 框架
> 结论：**Rust**

---

## 1. 决定性因素：现成件的覆盖度

自研框架的成本不在「写多少行」，而在「哪些部分必须自己从零写」。

### Rust 侧：现成件覆盖约 70–80% 的代码量

| 能力 | crate | 版本 | 下载量 | 最近更新 |
|---|---|---|---|---|
| CSS Flexbox + Grid 布局 | `taffy` | 0.15.0 | 1700 万 | 2026-10-12 |
| GPU 抽象（Metal / DX12 / Vulkan） | `wgpu` | 30.0.1 | 4300 万 | 2026-08-22 |
| 跨平台窗口（Cocoa / Win32 / Wayland） | `winit` | 0.30.13 | 6000 万 | 2026-09-04 |
| 文本整形 + 换行 | `cosmic-text` | 0.19.0 | 1070 万 | 2026-04-22 |
| HarfBuzz 移植 | `swash` | 0.2.10 | 1600 万 | 2026-07-17 |
| CSS 解析器（Firefox 同源） | `cssparser` | 0.38.0 | 1.05 亿 | 2026-09-07 |
| CSS 级联引擎（Firefox 的 Stylo） | `bao-stylo` | 0.22.1 | 3565 | — |
| 跨平台字体发现 | `font-kit` | 0.14.3 | 1800 万 | — |
| 无障碍 | `accesskit` | 0.25.1 | 3000 万 | 2026-09-25 |
| 矩阵运算 | `glam` | 0.34.1 | 1.66 亿 | 2026-10-06 |
| Yoga 的 Rust 绑定（备选） | `yoga` | 0.5.0 | 4 万 | — |

### Zig 侧：约 10–15% 能靠 FFI 拿到

| 能力 | Zig 侧现状 | 代价 |
|---|---|---|
| Flexbox 布局 | `zig cc` 编译 Yoga（C++/MIT）→ FFI | 低，但**只有 flex，没有 Grid** |
| 文本整形 | `zig cc` 编译 HarfBuzz（C/MIT）→ FFI | 低 |
| **文本换行** | ❌ 自己实现 UAX #14 | 中 |
| **CSS 解析** | ⚠️ `chadwain/zss`（50 star，2025-12 后未更新） | 中，参考价值大于可用性 |
| **CSS 级联 / 特异性** | ❌ **完全自己写**（Firefox 的 Stylo 是万行级） | 高 |
| **GPU 抽象** | ❌ **Metal / DX12 / Vulkan 三套各写一遍**（wgpu 那层是十万行级） | 极高 |
| **跨平台窗口** | ❌ **Cocoa / Win32 / Wayland 三套各写一遍**（winit 同量级） | 极高 |
| 字体发现 | ❌ 自己写 | 中 |
| 无障碍 | ❌ 自己写 | 中 |
| 平台文本 | ❌ CoreText / DirectWrite / FreeType 各写 | 高 |
| IME | ❌ 三套协议都自己写 | 极高 |

**关键差异**：`taffy`（CSS 布局规范）、`wgpu`（GPU 抽象）、`winit`（窗口）、
`cosmic-text`（文本）、`cssparser` + `bao-stylo`（CSS 解析与级联）——
这六项恰好是自研方案里最贵的部分，Rust 全是现成且活跃的。

而 Zig 侧这三块（GPU 抽象、窗口、CSS 级联）**恰恰是 Zig 生态最空白的地方**。

### 无论哪种语言都要自己写的（约 20–30%）

绘制命令编码、控件库、事件分发、命中测试、IME 对接、平台胶水。
这部分语言差异不大。

---

## 2. Zig 的真实优势，以及为何在此处不成立

| 优势 | 在本项目中的价值 |
|---|---|
| 编译快 | 框架写完后增量编译都很快，**不是瓶颈**。只有冷编译阶段有感，而那是一次性的 |
| `zig cc` 集成度高 | Rust 侧有 `cc` crate + 海量 `-sys` crate（`winit-sys`、`wgpu-hal`…），差距不大 |
| 无 GC、单二进制 | Rust 同样能做到 |
| Zig 语言本身简洁 | 各有胜负，与决策无关 |

**Zig 的隐性成本：**

1. **ObjC 消息派发在 Zig 里没有原生支持。** Metal 的整个 API 都是消息派发，
   要靠 extern 声明 + 运行时 `objc_msgSend` 查找，绑定工作量显著大于 Rust 的 `objc2` crate。
2. **Windows COM**（DirectWrite 的 `IDWriteTextFormat` 等）在 Zig 里同样要手写 vtable 绑定。
3. **Wayland 协议是动态 XML 生成的**，需要代码生成器，Zig 生态没有像 `wayland-scanner` 那样的成熟等价物。
4. **Zig 自身 pre-1.0，breaking change 频繁。** 0.15 刚做过一次 Io/async 大改，0.16 → 0.17 仍在演进。
   自研框架代码会跟着 Zig 的变更反复重写。Rust 1.99 的 API 稳定性是另一个量级。

---

## 3. 推荐架构（Rust）

自研框架不等于从零写一切。正确做法是**现成件拼装 + 只写差异部分**：

```
你的 GUI 框架 (Rust)
├── CSS 解析      → cssparser        （Firefox 同源）
├── 级联/特异性    → bao-stylo        （Firefox 的 Stylo）
├── 布局          → taffy            （CSS Flexbox + Grid 规范实现）
├── 文本整形+换行  → cosmic-text      （HarfBuzz 级）
├── GPU           → wgpu             （Metal / DX12 / Vulkan）
├── 窗口          → winit            （Cocoa / Win32 / Wayland）
├── 字体发现      → font-kit
├── 无障碍        → accesskit
└── 自己做
    ├── 样式树 → 绘制命令的转换
    ├── 控件库（Table / Tree / TextInput / ScrollView …）
    ├── 事件模型（命中测试、冒泡、焦点管理）
    ├── IME 对接（三平台协议）
    └── 平台胶水
```

**这样「HTML/CSS 熟悉用法」就不是 DSL 近似，而是真 CSS 语义** —— 你写的
`.card { display: flex; gap: 8px; border-radius: 14px }` 由 Firefox 的级联引擎
算出来，由 Taffy 按 CSS 规范布局，由 cosmic-text 排版。

对比 Zig 路线：即使写完，CSS 级联能力也只等于你手写的那个子集，
达不到 Firefox 的完备度；而布局只有 flex 没有 grid。

---

## 4. 什么情况下 Zig 才更划算

只有同时满足这三条时，Zig 的额外成本才划得来：

1. **你确定要自己写 GPU 抽象层**（而不是用 wgpu）—— 否则 wgpu 一行代码就够
2. **冷编译速度对你的工作流是硬约束**（例如 CI 每次全量构建）
3. **你愿意长期维护框架与 Zig 语言升级的耦合**

只要第 1 条不成立，Zig 就没有优势了 —— 因为现成的件都在 Rust 生态。

---

## 5. 建议

**选 Rust。**

理由按重要性：

1. **现成件覆盖度决定性**：taffy + wgpu + winit + cosmic-text + cssparser + bao-stylo
   覆盖了自研方案里最贵的部分，且全部活跃
2. **Zig 侧的三块空白恰是最贵的**：GPU 抽象、窗口、CSS 级联
3. **API 稳定性**：Rust 1.99 vs Zig pre-1.0 的破坏性变更节奏
4. **生态与可检索性**：出问题能搜到答案，Zig GUI 方向没有

**落地建议**：先做一个 Phase 0 spike 验证最小闭环 ——
一个窗口 + 一份真实 CSS + 一个 flex 容器 + 一段中文文本 + 一次中文输入。
这个 spike 用 Rust 写只需约两周，且成果（布局/文本/渲染管线）可直接演进成框架；
如果验证通过，框架的地基就等于有了，剩下的是控件与打磨。
