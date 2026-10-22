# ADR-0006：界面栈选型（自研 gui-core）

- 状态：已采纳
- 日期：2026-10-22
- 取代：[ADR-0004 界面栈选型（GPUI）](0004-ui-stack.md)

## 背景

ADR-0004 在 2026-10-21 采纳了 GPUI（`gpui` 0.2.2）。同一天晚些时候，`docs/gui-framework-architecture.md` 写出了自研 `crates/gui-core/` 的完整设计稿，`crates/gui-core/` 目录也随即建立。**同一仓库里并存两套互斥的 GUI 路线**，且 ADR-0004 状态仍是「已采纳」——任何开工的人都会读到矛盾指令。

本 ADR 在两套方案之间拍板，并明确参考实现的分工。

## 决策

**自研 `crates/gui-core/`**，不引入 gpui 作为依赖。

| 层 | 选型 | 版本 |
|---|---|---|
| GUI 框架 | **自研 `crates/gui-core/`** | — |
| 布局 | `taffy`（CSS Flexbox / Grid 规范实现） | 0.15（**不锁死**） |
| 文本 | `cosmic-text`（swash / HarfBuzz 整形 + UAX#14 断行） | 0.19 |
| CSS 解析 | `cssparser`（MPL-2.0，见「待决」） | 0.38 |
| 渲染 | `wgpu`（Metal / DX12 / Vulkan 统一后端） | 30.0.1 |
| 窗口与事件 | `winit` | 0.30 |
| IME 与无障碍 | `accesskit`（MIT OR Apache-2.0）统一三平台通道 | — |
| GUI 组件 | 自建：Tree / Table / Editor / Palette | — |
| 语法高亮 | tree-sitter（`tree-sitter-sql` + `tree-sitter-highlight`） | — |
| CLI 框架 | `clap` | 4.6.7 |
| MCP SDK | `rmcp`（官方 Rust SDK） | 3.6.0 |
| PostgreSQL | `tokio-postgres` | 0.7.18 |
| 通用异步 SQL | `sqlx` | 0.9.0 |
| SQLite | `rusqlite` | 0.40.2 |
| Redis | `redis` | 1.7.1 |
| 凭据存储 | `keyring` / `secret-service` | 5.2.0 |

## 决策依据

### 为什么不用 gpui

gpui 是好东西，但**在「渲染后端是 wgpu」这个既定前提面前，它的优势所剩无几**：

1. **渲染后端不是 wgpu**。gpui 0.2.2 的 macOS 走 blade（Metal，`macos-blade` 是可选 feature）、Windows 走 D3D11、Linux 走 blade/Vulkan。已定的技术栈要求三平台统一后端。
2. **版本锁死跟不动上游**。`taffy = "=0.9.0"`（当前上游 0.15.0）、Wayland 下 `cosmic-text = "0.14.0"`（当前 0.19.0）。对 CSS 语义敏感的项目，这是长期负债。
3. **依赖面大**：109 个依赖小节（48 个常规 + 47 个 target 专属 + build/dev）。
4. **它也没有树和表格控件**。`src/elements/` 13 个元素里没有 tree 也没有 table；`examples/tree.rs` 是 50 层嵌套 div 的性能演示，不是树控件。SelaDB 的两个决定性需求它一个都不提供。
5. **Zed 的应用层 crate 是 GPL-3.0-or-later 且未发布**，`icons` 也在其中——图标集要自己解决。

### 为什么不用 nanoui

nanoui（`justrach/nanoui`，MIT）是 GPUI 架构的 Zig 移植，做得很漂亮，但：

1. **2026-10-18 才创建**，4 天 112 提交、其中 107 次为作者一人，无社区、无 code review 分担。
2. **没有树控件、没有表格控件、没有无障碍**（README 自述 "no accessibility"）。grep 源码 `tree_view` / `pub fn tree` / `data_table` 零命中。
3. **布局与文本是「Zig 生态缺件」的被迫产物**：自研 flexbox（无 Grid）、自研 TrueType 栈（非 HarfBuzz，贪心断行非 UAX#14）。Rust 侧直接用 taffy 和 cosmic-text 才是正解。
4. **渲染后端是 Metal / OpenGL 3.3 / Windows CPU 软渲染**，不是 wgpu。

### 决定性理由

**决定性需求没有任何现成框架提供**：万行级密集数据网格与多级懒加载对象树，在 2026 年的 Rust GUI 生态里（egui / iced / Dioxus / Slint / Floem / Masonry / xilem / gpui / nanoui）**没有一个开箱可用**。选型省不下这块工作量，而这正是 SelaDB 的核心竞争力所在。

其余框架的许可状况先淘汰一半：Slint 是 GPL-3.0-only；egui 生态最大但中文 IME 在 X11 + Fcitx5 下有已知缺陷（[#7975](https://github.com/emilk/egui/issues/7975)）；iced 发布断了近一年；Floem 架构最接近但 crates.io 近两年未发版；Masonry / xilem 近 90 天下载量分别 3079 / 2500 次，等于无社区。

自研反而能精确命中 SelaDB 的两个差异化要求：**100% 中文可用**（三平台中文 IME + 中文断行 + 中文表格列宽），以及 **CLI / MCP / GUI 共用一套 service 层**（`AGENTS.md` 硬约束 3）。

## 参考实现的分工

**nanoui 与 gpui 都不作为依赖引入，只作参考蓝本。** 逐层对比与借鉴清单见 [`docs/gui-framework-comparison.md`](../gui-framework-comparison.md)。要点：

| 来源 | 抄什么 |
|---|---|
| **nanoui（主参考）** | 无头 Tester 模式与命令化断言、glyph atlas 亚像素 4 箱分箱、弹层分层与定位回退、声明式可中断动效、Lucide 风格线条图标方法论、控件分层（primitive / kit） |
| **gpui（次参考）** | 逐平台 IME 的协议细节（`NSTextInput` / `zwp_input_method_v2` / `IMM32`/TSF）、`examples/data_table.rs`（473 行）与 `examples/input.rs`（746 行）两份蓝本 |
| **一律不抄** | nanoui 的自研 flexbox / 自研 TrueType / OpenGL 后端 / CPU 软渲染；gpui 的 blade + D3D11 渲染栈与版本锁；任何 GPL 或非标准许可的组件 |

## 备选方案与淘汰理由

| 方案 | 状态 | 淘汰理由 |
|---|---|---|
| Wails v2 / v3 | v2.17.0 / v3.0.0-beta.34 | 系统 WebView 路线，不满足「原生 GPU 渲染」；v3 至今仍是 beta |
| Gio | v0.10.3 | 布局只有 Flex，**无 CSS Grid**；无阴影/滤镜原语；**0.x 每次 minor 破坏且官方明说不回移 bugfix，必须跟 main**；个人维护 |
| Fyne | v2.8.2 | 渲染后端只有 OpenGL，而 Apple 已全面弃用 OpenGL；全平台需 cgo（glfw）；桌面中文 IME 有 3 个 open issue（#618 / #2777 / #2418） |
| egui | 0.37.0 | 组件最好，但中文 IME 在 X11 + Fcitx5 下有边界问题（#7975，Wayland + IBus 正常）；且是 Rust 生态里最像「工具型」的观感 |
| Slint | 1.18.1 | 许可含 GPL-3.0-only，不满足宽松许可硬约束；**无 Table 组件**、需学 `.slint` DSL |
| gpui | 0.2.2 | 见「为什么不用 gpui」 |
| nanoui | 2026-10-18 起 | 见「为什么不用 nanoui」 |
| therecipe/qt | 2020-09 停更 | 已废弃 |
| lxn/walk / andlabs/ui | 2021 停更 | 已废弃 |

## 后果

**正面**

- 三平台统一 wgpu 渲染，Metal / DX12 / Vulkan 一套代码路径。
- taffy / cosmic-text 不锁版本，可跟上游。
- 业务组件（树、网格、编辑器、命令面板）完全自控，能精确满足中文场景。
- GUI 框架零业务依赖，将来可整体拆成独立仓库。

**负面**

- IME、平台胶水、绘制命令编码、命中测试、焦点管理全部自己扛，约占框架代码量的 20–30%。
- 中文 IME 三平台一致性是最难的部分，需按 macOS → Wayland → Windows 排期，或借 accesskit 统一。
- 数据网格的变高行 + 异构列虚拟化比等高列表难一个数量级。
- ~~macOS 构建需 Metal Toolchain 组件（838.9 MB），CI runner 必须预装~~。2026-10-22 更正：自研路线走 wgpu + naga（WGSL→MSL 纯 Rust 翻译），**不需要**该组件，CI 的 macOS runner 不必预装。它是 gpui/blade 路线的要求。

**中性**

- 需要自己维护图标集（Zed 的 `icons` crate 是 GPL-3.0-or-later 且未发布）。
- 需要自己维护无头测试链路（Tester 模式 + 几何/像素回归）。

## 待决

- **R7：`cssparser` 的许可是 MPL-2.0**（文件级弱 copyleft），不是 MIT/Apache。替换方案 `lightningcss` 1.0.0-alpha.72 同样是 MPL-2.0，此路不通。需明确把 MPL-2.0 列入 `AGENTS.md` 的许可白名单并写清理由（只调用不修改其源码则无传染义务），否则自研 CSS 分词器。
