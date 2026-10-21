# GUI 方案：Wails v2

> 状态：初版（2026-10-21）
> 关联：ADR-0004（界面栈选型）、ADR-0002（保持 CGO_ENABLED=0）

本文聚焦 GUI 客户端。核心库、CLI、MCP Server 的选型见 [`architecture.md`](architecture.md)。

---

## 1. 结论

**GUI 用 `wailsapp/wails` v2（v2.17.0），前端用 Web 技术，运行时复用操作系统自带的 WebView。**

即：Go 后端 + 系统 WebView 打包成原生桌面窗口。不是捆绑 Chromium 的 Electron 模式。

---

## 2. 为什么是这个方案

### 2.1 GUI 场景的需求画像

数据库管理工具的界面需求与其它桌面软件不同，这决定了技术选型的权重：

| 需求 | 权重 | 说明 |
|---|---|---|
| 密集数据表格 | 决定性 | 万行级结果集、虚拟滚动、列排序/筛选/调整宽度 |
| 树形导航 | 高 | 连接 → 库 → schema → 表 → 列 的多级懒加载 |
| SQL 编辑器 | 高 | 语法高亮、多行编辑、括号匹配 |
| 自由分栏布局 | 中 | 表格/编辑器/侧栏可拖拽调整 |
| 中文输入法 | 高 | 中文表名、字段注释、中文查询条件 |
| 图表 | 低 | 结果分布可视化，属于加分项 |

前四项里，前三项「Web 技术」全部是强项，第四项 Fyne/Gio 这类自绘方案要付出大量额外工作。

### 2.2 候选对比

| 方案 | 版本 | 表格/树/编辑器 | 中文 IME | 产物体积 | 三平台构建 | 成熟度 |
|---|---|---|---|---|---|---|
| **Wails v2** | v2.17.0 | Web 技术，无短板 | 可靠 | ~10–20MB | Win/macOS 纯 Go；Linux 需 webkit2gtk + CGO | 稳定 |
| Wails v3 | v3.0.0-beta.34 | 同上 | 可靠 | 同上 | Linux 默认 GTK4 + WebKitGTK 6.0 | **官方自述 Beta** |
| Fyne v2 | v2.8.2 | Table/Tree 有基础实现，细节要自己造 | 一般（自绘控件） | ~10–15MB | 需 cgo + OpenGL，Linux 还要 libgl/mesa | 稳定 |
| Gio | v0.10.3 | 需自绘 | 弱 | 小 | 需 GPU | 1.0 前，API 不稳 |
| lxn/walk | 2021 年后停更 | — | — | 小 | 仅 Windows | 废弃 |
| zserge/lorca | v0.1.10（2021） | Web 技术 | 可靠 | 依赖已装 Chrome | 需用户装 Chrome | 废弃 |

### 2.3 淘汰 Wails v3 的具体理由

Wails v3 自己的路线图文档（`docs/mpress/content/status.md`）写明：

> ## 当前状态：Beta
> Linux | amd64 和 arm64 | 默认使用 GTK4 + WebKitGTK 6.0；GTK3 + WebKit2GTK 4.1 在整个 v3.0.x 期间仍作为 `-tags gtk3` 旧版选项提供，并将在 v3.1 中移除

两个问题：

1. **API 仍是 Beta**，官方承诺「在 v3.0.0 之前仍可能修正预发布版本的缺陷以及已明确公告的变更」。项目刚起步就要押注在会变的 API 上不划算。
2. **Linux 依赖门槛抬高**。v3 默认要 WebKitGTK 6.0，而 Ubuntu 22.04 / Debian 12 / Fedora ≤39 都没有，只能退回 `-tags gtk3` 旧路径，而这条路径在 v3.1 就被移除。v2 只要 WebKit2GTK 4.0/4.1，覆盖面宽得多。

---

## 3. 运行时形态：系统 WebView

Wails v2 默认使用操作系统自带的 WebView，**不捆绑浏览器内核**：

| 平台 | WebView 实现 | 额外安装 |
|---|---|---|
| Windows 10/11 | WebView2（Edge / Chromium） | Win11 自带；Win10 需 Evergreen 运行时 |
| macOS 10.13+ | WKWebView | 系统自带 |
| Linux | WebKitGTK | 需 `libwebkit2gtk-4.0-dev`（或 4.1） |

对比捆绑 Chromium 的方案（Electron / Wails 的 browser 模式）：产物从 100MB+ 降到 10–20MB，启动从秒级降到百毫秒级。这是「轻快」定位在 GUI 侧的兑现。

代价是各平台 WebView 的渲染行为有细微差异，需要在实现时对三平台做实际验证，尤其是 CSS 动画、WebGL、滚动性能。

---

## 4. 前端栈

### 4.1 推荐组合

| 用途 | 选型 | 理由 |
|---|---|---|
| 构建工具 | Vite | Wails v2 对 Vite 有原生支持（`-frontenddevserverurl`），热重载链路最短 |
| 语言 | TypeScript | Wails 自动从 Go 结构体生成 TS 类型定义，类型安全有保障 |
| 框架 | React（或 Vue，取决于团队熟悉度） | 数据密集型应用的生态最成熟 |
| 表格 | TanStack Table + TanStack Virtual | 无头（headless），渲染完全自控，体积小；数据库结果集需要的能力它都覆盖 |
| SQL 编辑器 | CodeMirror 6 | 比 Monaco 轻一个量级，语法高亮够用 |
| 状态 | Zustand（或 TanStack Query） | 与 Wails 绑定配合简单 |

**关于表格库的取舍**：AG Grid Community 是另一种选择，开箱即用度高（排序、筛选、列拖拽、虚拟滚动全有），代价是包体积和样式定制受限。TanStack 是无头方案，需要自己写渲染层，但能精确控制单元格渲染（类型着色、NULL 显示、字节流截断等数据库场景的细节）。

### 4.2 与 Go 侧的连接

Wails 会从绑定的 Go 方法自动生成 TS 包装与类型定义。由于 service 层的方法签名已经定好（见 `architecture.md` 第 4.2 节），前端拿到的就是完整的类型安全接口：

```go
// internal/service
func (s *Service) ListTables(ctx context.Context, connID, schema string) ([]core.Table, error)
func (s *Service) Query(ctx context.Context, connID, sql string, opts QueryOptions) (*core.ResultSet, error)
```

前端直接调用生成的 `ListTables` / `Query`，无需手写 API 客户端，也无需引入 HTTP 层。

---

## 5. 目录结构

```
SelaDB/
├── cmd/
│   ├── seladb/              # CLI 入口
│   ├── seladb-gui/          # GUI 入口（wails.Run）
│   └── seladb-mcp/          # MCP Server 入口
├── internal/
│   ├── service/             # 业务逻辑唯一落点（GUI 直接调用）
│   └── ...
├── frontend/                # Wails 前端工程（wails.json 约定位置）
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
└── build/                   # Wails 构建产物（gitignore）
```

GUI 的 `main.go` 只做三件事：读配置、构造 service、注册 Wails 绑定并 `wails.Run()`。不写业务逻辑。

---

## 6. 构建矩阵

### 6.1 跨平台目标

Wails v2 CLI 支持的 `-platform` 取值（官方 CLI Reference）：

| platform | 最低系统要求 |
|---|---|
| `darwin/amd64` | macOS 10.13+ |
| `darwin/arm64` | macOS 11.0+ |
| `darwin/universal` | macOS 10.13+ |
| `windows/amd64` | Windows 10/11 |
| `windows/arm64` | Windows 10/11 |
| `linux/amd64` | Linux amd64 |
| `linux/arm64` | Linux arm64 |

### 6.2 各平台构建方式

| 目标 | 构建位置 | 依赖 | 命令要点 |
|---|---|---|---|
| macOS | 本机或 macOS CI | Xcode CLT | `wails build -platform darwin/universal` |
| Windows | Windows CI | WebView2 运行时 | `wails build -platform windows/amd64 -nsis` |
| Linux | Linux 容器 | `libwebkit2gtk-4.0-dev` 或 `4.1-dev` + gcc | 见下方 tag 注意事项 |

**Linux 的 webkit2gtk 版本坑（官方文档明确提示）**：

> If you are using a Linux distribution that does not have webkit2gtk-4.0 (such as Ubuntu 24.04), you will need to add `-tags webkit2_41`.

即：Wails v2 默认链接 `libwebkit2gtk-4.0`，而 Ubuntu 24.04 等新发行版已不再提供 4.0，只提供 4.1。**Linux 构建必须显式加 `-tags webkit2_41`**：

```bash
wails build -platform linux/amd64 -tags webkit2_41
```

构建容器统一用 Ubuntu 24.04 + `libwebkit2gtk-4.1-dev`，固定走 4.1 这条路，避免两套依赖。

### 6.3 macOS 最低版本

默认发布目标为 macOS 10.13+。若要提高可用系统的下限（例如只支持 macOS 12+），通过环境变量调整：

```bash
CGO_CFLAGS=-mmacosx-version-min=12.0 CGO_LDFLAGS=-mmacosx-version-min=12.0 wails build
```

---

## 7. 打包矩阵

**Wails v2 CLI 只内置了 Windows 的 NSIS 安装包**，其余平台的安装包需要外部工具：

| 平台 | 产物 | 工具 |
|---|---|---|
| Windows | 便携 `.exe` | `wails build` |
| Windows | `.exe` + NSIS 安装包 | `wails build -nsis` |
| macOS | `.app` 包 | `wails build`（自动打 Info.plist） |
| macOS | `.dmg` | 外部工具（`create-dmg` / `appdmg` / GoReleaser 等） |
| Linux | 单文件二进制 | `wails build` |
| Linux | `.deb` / `.rpm` / AppImage | GoReleaser（v2.18.3）等外部工具 |

GoReleaser（v2.18.3，2026-10-08）负责 deb/rpm/AppImage/dmg 这类多平台打包，把 Wails 的构建输出交给它做二次封装。

**不建议开 UPX 压缩**：官方文档提示 UPX 在 Apple Silicon 上有问题，且压缩后的二进制常被杀毒软件误报。对一个要分发给开发者的工具，误报成本高于体积收益。

---

## 8. Windows 的 WebView2 策略

Windows 10 不自带 WebView2，需要处理。Wails v2 的 `-webview2` 策略：

| 取值 | 行为 |
|---|---|
| `download`（默认） | 运行时缺 WebView2 时，联网下载 Evergreen Bootstrapper 安装 |
| `embed` | 把离线安装包嵌进产物，目标机完全离线也能装上 |
| `browser` | 只提示用户自行下载 |
| `error` | 检测不到就报错退出 |

建议：默认 `download`；若要支持完全离线的企业内网分发，改用 `embed`（产物体积会增加）。

---

## 9. 开发体验

`wails dev` 会：

- 启动前端开发服务器（Vite），改前端代码只刷新页面，不重编译 Go
- 监听 Go 文件变化并自动重编译重启
- 在 `http://localhost:34115` 暴露整个应用，可以用浏览器打开、用浏览器开发者工具调试

配合 `-browser` 参数，调试时能直接用浏览器 DevTools 查前端问题，这在 Web 技术栈下是实打实的效率优势。

`wails doctor` 会在开发前检查系统依赖（WebView2 是否装、Node 版本、Linux 的 GTK/WebKit 库），缺失时直接给出对应发行版的安装命令 —— CI 里应当先跑它做预检。

---

## 10. 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| Linux webkit2gtk 版本分裂 | 4.0 与 4.1 API 有差异 | 构建容器固定 Ubuntu 24.04 + `-tags webkit2_41`，只维护一条路径 |
| Windows WebView2 缺失 | Win10 用户打不开程序 | 默认 `download` 策略自动引导安装；离线场景用 `embed` |
| 三平台 WebView 渲染差异 | 滚动性能、动画表现不一致 | 每轮迭代在三平台实机验证；优先用 CSS 基础特性，避免依赖新 API |
| 前端包体积膨胀 | 违背「轻快」定位 | 表格用无头方案（TanStack）而非 AG Grid；编辑器用 CodeMirror 而非 Monaco；构建产物做体积检查 |
| Linux 发行版碎片化 | AppImage 之外还需 deb | 主推 AppImage + deb，Flatpak 视需求再上 |
| WebView 安全边界 | 前端是 JS 环境 | 后端绑定只暴露必要方法，敏感操作不放在前端；不要把凭据下发到前端 |

---

## 11. 待定项

- **前端框架**：React / Vue / Svelte —— 取决于团队熟悉度
- **设计体系**：自建轻量组件集，还是引入现成 UI 库（Ant Design / Naive UI / shadcn）
- **主题**：深色为主还是深浅双主题
- **图标与字体**：是否内置字体（影响产物体积），还是依赖系统字体
