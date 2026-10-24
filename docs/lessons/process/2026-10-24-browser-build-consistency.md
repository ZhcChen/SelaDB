# 截图的浏览器构建要统一

## 背景

全局 AGENTS.md 写着「无头实例一律用独立构建（完整 Chromium + `channel: "chromium"` +
`--disable-blink-features=AutomationControlled`）」，并把「用 headless shell 抓取
（缺 `window.chrome`、`plugins=0`）」列为禁令。

但仓库里 4 处 `chromium.launch()` 全是**裸调用**。Playwright 1.49 起，裸调用在
`headless: true` 下走的是 `chromium_headless_shell`，不是完整 Chromium。
实测指纹差异：

| | headless shell | 完整 Chromium |
|---|---|---|
| `window.chrome` | **false** | **true** |
| `navigator.plugins.length` | **0** | **5** |

**而且两种构建渲染出的像素不一样** —— 同一张工作台截图差 2695 个像素
（2880×1800 的 0.052%），分布在 345 行上，最大单像素通道差 242/765。
字体光栅化的抗锯齿策略不同。

## edits

| 组件 | 改了什么 | 观察到的差异 | 判定 |
|---|---|---|---|
| `ui/tests/browser.mjs` | 新增：启动配置的唯一来源 | 4 处不再各写各的 | helped |
| `ui/tests/smoke.mjs` | 裸 `launch()` → `launchBrowser()` | — | helped |
| `ui/tests/contrast.mjs` | 同上 | — | helped |
| `ui/tests/review.mjs` | 同上 | — | helped |
| `scripts/pixel-diff.mjs` | 同上 | — | helped |
| `ui/tests/screenshots/*.png` | 用完整 Chromium 重生成 15 张 | — | helped |
| `ui/tests/baseline/*.png` | 同步刷新 | 基线与截图像素相同 | helped |

## lesson

- **cue**:仓库里有个 Playwright 脚本在截图，评审或像素比对开始报出满屏差异
- **lesson**:
  **Playwright 的裸 `chromium.launch()` 不是「完整 Chromium 的无头模式」**，
  它走 `chromium_headless_shell`，两者指纹与**渲染像素**都不同。
  截图与基准图必须来自**同一个构建**，否则像素比对全是假差异。
  全仓库只保留一处启动配置（`ui/tests/browser.mjs` 的 `launchBrowser()`），
  不要在别处再写裸 `launch()`。
- **evidence**:上面七行 edits。改之前基线（旧构建）与新截图（完整 Chromium）
  差 2229 个像素；改之后基线与截图「像素相同」。
- **confidence**:high —— 指纹差异与像素差异都实测过，机制清楚

## 附带的一条

**「仓库里现成的做法」不等于「符合全局规则」。** 这次的违规是仓库原有的
（`smoke.mjs` / `review.mjs`），我照抄了现状而不是回头核对规则。
用任何工具前先看全局规则里对它有没有专门条款，别拿仓库现状当默认值。
