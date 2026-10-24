/**
 * 视觉评审。
 *
 * 冒烟验收验的是「功能对不对」,验不了「好不好看」。这道评审补的是后一半:
 * 把黄金截图交给多模态模型,按固定 rubric 打分,输出可定位的问题清单。
 *
 * 思路借自 wandb/openui 的 `backend/openui/eval/evaluate.py` —— 它用
 * GPT-4-vision 给生成的 UI 按「媒体质量 / 对比度 / 相关性」三条 1–5 分。
 * 这里把三条改写成适配桌面数据工具的版本,并把「媒体质量」换成
 * 「布局与信息密度」:我们要的是专业工具的紧凑与层级,不是响应式。
 *
 * 用法:
 *   node tests/review.mjs                 # 全部截图
 *   node tests/review.mjs 02-grid 12-ddl # 只评指定几张
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { launchBrowser } from "./browser.mjs";

const exec = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const shotDir = join(here, "screenshots");
const reportPath = join(here, "review-report.md");

/**
 * 每张图是什么界面。
 *
 * 评审模型不知道 SelaDB 是什么,不给它上下文的话,评出来的会是
 * 「一个通用的表格界面好不好看」,而不是「这个数据库工具好不好看」。
 */
const SCREENSHOT_CONTEXT = {
  "01-workbench-light": "SelaDB 主工作台(浅色主题):左侧对象树 + 右侧空白工作区,顶部标题栏与工具栏,底部状态栏。",
  "02-grid": "SelaDB 的数据网格:左侧对象树,右侧是 PostgreSQL 的 users 表,含虚拟滚动的数据行、粘性表头、类型着色、NULL 样式。",
  "03-nosql": "SelaDB 的 Redis 键列表:左侧对象树展开到 db0 与类型分组,右侧是键值表格。",
  "04-workbench-dark": "SelaDB 主工作台(深色主题):左侧对象树 + 右侧空白工作区。",
  "05-spec": "SelaDB 的设计规范页:展示设计 token 色板(主题色、数据类型色板、引擎品牌色)与组件清单表格。",
  "06-entry": "SelaDB 设计源的总入口页,两张卡片分别通向规范页与产品预览。",
  "07-query": "SelaDB 的 SQL 查询编辑器:上方是可编辑并带语法高亮的 SQL,下方是执行结果的数据网格。",
  "08-query-error": "SelaDB 的 SQL 查询错误状态:编辑器里出错的表名被标红波浪线,下方是红色错误提示条与错误详情区。",
  "09-palette": "SelaDB 的命令面板(⌘K):居中弹层,输入框加模糊匹配的结果列表。",
  "10-document-tree": "SelaDB 的 MongoDB 文档视图:可折叠的 BSON 树,按字段名与值分列。",
  "11-structure": "SelaDB 的表结构视图:列 / 索引 / 约束 / 外键四个子标签,下面是列定义表格。",
  "12-ddl": "SelaDB 的 DDL 预览:按引擎方言生成的建表语句,带 SQL 语法高亮。",
  "13-context-menu": "SelaDB 对象树上的右键菜单,浮在数据网格之上。",
  "14-value-editor": "SelaDB 的 Redis 键值编辑器:右侧抽屉里是元信息与按类型渲染的值编辑区。",
  "15-connect": "SelaDB 的新建连接向导:引擎卡片网格加参数表单。",
};

/** 评分口径。三条各 1–5 分,每条都要给出问题清单。 */
const RUBRIC = `
你在评审一个**跨平台数据库管理工具 SelaDB** 的界面截图。它的定位是专业工具:
使用者是开发者与 DBA,一天要在里面待几个小时,密集地看表结构、翻数据、写 SQL。
参考对象是 TablePlus、DBeaver、Beekeeper Studio、Navicat 这类工具,不是 Linear、Notion、
Vercel Dashboard 这类通用 SaaS 后台。

请按下面三条各打 1–5 分(5 = 优秀,3 = 及格但有明显可改进处,1 = 不可接受),
并给出**具体、可定位**的问题清单:

1. layout —— 布局与信息密度
   - 层级是否清楚(哪些是导航、哪些是内容、哪些是状态)
   - 密度是否适合专业数据库工具(同一屏能看到多少行/多少列)
   - 留白与紧凑是否失衡;面板比例是否合理
   - 有没有视觉噪音(多余的分隔线、装饰、对不齐的间距)

2. contrast —— 对比度与类型可辨识
   - 正文、表格数字、表头、注释、次要文字是否都读得清
   - 数据类型着色(整数/浮点/布尔/时间/NULL/JSON/UUID)彼此是否分得开;
     同色系的不同类型(例如浅青蓝与深蓝)会不会混淆
   - 明暗两种主题下是否有对比度不足的地方
   - 语义色是否成对(成功/警告/危险)且不只靠颜色区分

3. professionalism —— 专业观感
   - 像不像成熟商业数据库工具,还是像通用后台模板 / SaaS 页面
   - 有没有"网页表单"式的观感(大按钮、圆角过度、装饰性图标)
   - 密集数据区域与操作控件的视觉权重是否平衡

最后给出 top_fixes:按影响从大到小排 3–6 条**具体到能直接动手**的修改建议
(例:"把表头类型注解的字号从 11px 提到 12px 并加深到 --fg-muted",
"布尔值 true/false 改成一绿一灰",而不是"提升可读性")。

只返回 JSON,不要多余文字:
{
  "layout": {"score": 0, "reason": "", "issues": [""]},
  "contrast": {"score": 0, "reason": "", "issues": [""]},
  "professionalism": {"score": 0, "reason": "", "issues": [""]},
  "top_fixes": [""]
}`;

/** 调 mcode-tools 上传本地文件,拿临时 URL。 */
async function upload(filePath) {
  const { stdout } = await exec("mcode-tools", ["upload_temp_url", filePath]);
  return JSON.parse(stdout).temp_url;
}

/** 调多模态模型评一张图。 */
async function review(filePath, context) {
  const url = await upload(filePath);
  const prompt = `${context}\n\n${RUBRIC}`;
  const args = {
    image_info: [{ url, mime_type: "image/png", prompt }],
  };
  const argsFile = join("/tmp", `seladb-review-${process.pid}-${Date.now()}.json`);
  await writeFile(argsFile, JSON.stringify(args), "utf8");

  const { stdout } = await exec("mcode-tools", [
    "connector",
    "call",
    "connector__matrix__describe_images",
    "--args-file",
    argsFile,
  ]);
  const payload = JSON.parse(stdout);
  const description = payload?.results?.[0]?.description ?? "";

  // 模型返回的是 ```json 包裹的文本
  const match = description.match(/```json\s*([\s\S]*?)```/);
  const text = match ? match[1] : description;
  return JSON.parse(text);
}

/**
 * 把两张截图拼成一张对照图。
 *
 * 多模态工具一次只吃一张图,所以「A 和 B 哪个好」得靠拼接实现。
 * 借用 Playwright 渲染一段 HTML 再截图,不引入图像处理库。
 *
 * **必须带放大行。** 1440px 宽的截图塞进 790px 的栏里会缩到 55%,
 * 1px 的结构分隔线被缩成半像素后抗锯齿掉 —— 模型看不见那条线,
 * 只看得到「灰色块变少了」,于是把「底色差改成 1px 线」误判成
 * 「容器感变弱、界面单薄」。上半给全景比布局,下半给 2 倍放大的角落
 * 比细节(侧栏分界线、输入框边框)。
 *
 * **必须带差异掩码。** 光靠两张图,模型经常连「哪里变了」都读不出来:
 * 加了一条 1px 线,它会判成「改动后移除了分隔线」,方向完全反了。
 * 掩码是逐像素算出来的客观事实 —— 品红 = 有差异,灰 = 没变,
 * 拿它当锚点,判断才落得到具体位置上。
 */
async function makeComposite(beforePath, afterPath, outPath) {
  const before = (await readFile(beforePath)).toString("base64");
  const after = (await readFile(afterPath)).toString("base64");

  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1460, height: 1400 } });

  // 逐像素差异掩码:有差异处填品红,无差异处压成灰度
  const mask = await page.evaluate(
    async ([a, b]) => {
      const load = (src) =>
        new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res(img);
          img.onerror = () => rej(new Error("差异掩码:底图加载失败"));
          // 传进来的是裸 base64,必须补上 data URL 前缀才能加载
          img.src = `data:image/png;base64,${src}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const W = Math.min(ia.width, ib.width);
      const H = Math.min(ia.height, ib.height);
      const draw = (img) => {
        const c = document.createElement("canvas");
        c.width = W;
        c.height = H;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, W, H).data;
      };
      const da = draw(ia);
      const db = draw(ib);
      const out = document.createElement("canvas");
      out.width = W;
      out.height = H;
      const ctx = out.getContext("2d");
      const img = ctx.createImageData(W, H);
      let changed = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d =
          Math.abs(da[i] - db[i]) +
          Math.abs(da[i + 1] - db[i + 1]) +
          Math.abs(da[i + 2] - db[i + 2]);
        if (d > 12) {
          changed++;
          img.data[i] = 255;
          img.data[i + 1] = 0;
          img.data[i + 2] = 190;
        } else {
          const g = (da[i] * 0.3 + da[i + 1] * 0.5 + da[i + 2] * 0.2) * 0.45 + 190;
          img.data[i] = g;
          img.data[i + 1] = g;
          img.data[i + 2] = g;
        }
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const pct = ((changed / (W * H)) * 100).toFixed(2);
      return { url: out.toDataURL("image/png"), pct, changed, W, H };
    },
    [before, after],
  );

  await page.setContent(`<!DOCTYPE html>
<html><body style="margin:0;background:#dfe3e9;font:600 13px/1.6 -apple-system,'PingFang SC',sans-serif;color:#1c2230">
  <div style="display:flex;gap:10px;padding:10px">
    <figure style="margin:0;flex:1">
      <figcaption style="padding:4px 2px">改动前</figcaption>
      <img src="data:image/png;base64,${before}" style="width:100%;display:block;border:1px solid #b8c0cd">
    </figure>
    <figure style="margin:0;flex:1">
      <figcaption style="padding:4px 2px">改动后</figcaption>
      <img src="data:image/png;base64,${after}" style="width:100%;display:block;border:1px solid #b8c0cd">
    </figure>
  </div>
  <div style="display:flex;gap:10px;padding:0 10px 8px">
    <figure style="margin:0;flex:1">
      <figcaption style="padding:4px 2px">改动前 · 左上 2×(侧栏顶部 / 搜索框 / 分界线)</figcaption>
      <div style="width:100%;height:446px;overflow:hidden;position:relative;border:1px solid #b8c0cd">
        <img src="data:image/png;base64,${before}" style="position:absolute;top:0;left:0;width:1440px;height:900px;transform-origin:0 0;transform:scale(2)">
      </div>
    </figure>
    <figure style="margin:0;flex:1">
      <figcaption style="padding:4px 2px">改动后 · 左上 2×</figcaption>
      <div style="width:100%;height:446px;overflow:hidden;position:relative;border:1px solid #b8c0cd">
        <img src="data:image/png;base64,${after}" style="position:absolute;top:0;left:0;width:1440px;height:900px;transform-origin:0 0;transform:scale(2)">
      </div>
    </figure>
  </div>
  <div style="display:flex;gap:10px;padding:0 10px 8px">
    <figure style="margin:0;flex:1">
      <figcaption style="padding:4px 2px">改动前 · 右上 2×(顶栏搜索框)</figcaption>
      <div style="width:100%;height:446px;overflow:hidden;position:relative;border:1px solid #b8c0cd">
        <img src="data:image/png;base64,${before}" style="position:absolute;top:0;right:0;width:1440px;height:900px;transform-origin:100% 0;transform:scale(2)">
      </div>
    </figure>
    <figure style="margin:0;flex:1">
      <figcaption style="padding:4px 2px">改动后 · 右上 2×</figcaption>
      <div style="width:100%;height:446px;overflow:hidden;position:relative;border:1px solid #b8c0cd">
        <img src="data:image/png;base64,${after}" style="position:absolute;top:0;right:0;width:1440px;height:900px;transform-origin:100% 0;transform:scale(2)">
      </div>
    </figure>
  </div>
  <div style="padding:0 10px 10px">
    <figure style="margin:0">
      <figcaption style="padding:4px 2px">逐像素差异掩码 —— 品红 = 改动过的像素,灰 = 没变(共 ${mask.pct}%)</figcaption>
      <img src="${mask.url}" style="width:100%;display:block;border:1px solid #b8c0cd">
    </figure>
  </div>
</body></html>`);
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
}

/**
 * 成对比较:把改动前后的两张图一起给模型,问哪个更好。
 *
 * 绝对打分不可靠 —— 同一张图连续评两次,每个维度能差 1 分,总分能差 1.5。
 * 成对比较问的是「A 和 B 哪个更好」,相对判断稳定得多。
 *
 * 基线截图放在 tests/baseline/:
 *   git show <基线commit>:ui/tests/screenshots/02-grid.png > tests/baseline/02-grid.png
 */
async function compare(beforePath, afterPath, context) {
  // 工具的 image_info 是「批量独立问答」,一次只给一张图,没法多图同框。
  // 所以先用浏览器把两张图拼成一张,再问「左边和右边哪个好」。
  const compositePath = join("/tmp", `seladb-pair-${process.pid}-${Date.now()}.png`);
  await makeComposite(beforePath, afterPath, compositePath);

  const url = await upload(compositePath);
  const prompt = `这是一张对照图,界面是:
${context}

对照图分四层:
- 第一行:两张全窗口缩略图,左边改动前、右边改动后,比整体分块与信息层级
- 第二、三行:左上角与右上角的 2 倍放大图,比细节(分隔线、输入框边框、底色差)
- 最下面一行:**逐像素差异掩码**。品红 = 这一处像素跟改动前不一样,灰 = 没变。
  这行是客观事实,先看它 —— 它直接告诉你改动到底落在哪些位置上。

**判断顺序:先看差异掩码确定改动落在哪,再去放大图上看那个位置长什么样。**
不要凭印象说「哪里变了」,也不要猜反了方向(改动前有、改动后没,
或者反过来,掩码上一目了然)。

**理由必须与掩码一致。** 掩码上没变化的地方(灰色)不要写成有变化 ——
添加一个原本不存在的控件、调整某处的内边距、调整个模块的居中,
如果掩码上没有对应的品红区域,那就是你编的,不要写。

请只比较视觉与信息表达,不看功能是否实现。回答:
1. 哪一边更好?给出 "before" 或 "after"
2. 好在哪,差在哪(各 1–2 句)。**必须点名掩码上具体变了哪几处**
3. 改动后有没有引入新的问题

硬规矩:**只报告你能在图上明确指认的差异**。1px 级别的结构线请以放大行为依据;
如果你无法确认某处到底有没有变化,就把该处从结论里去掉,不要凭印象补一个"看起来像"的问题。
说不出具体位置的问题不要写。

只返回 JSON:{"better": "before"|"after", "why": "", "regression": ""}`;

  const args = {
    image_info: [{ url, mime_type: "image/png", prompt }],
  };
  const argsFile = join("/tmp", `seladb-cmp-${process.pid}-${Date.now()}.json`);
  await writeFile(argsFile, JSON.stringify(args), "utf8");

  const { stdout } = await exec("mcode-tools", [
    "connector",
    "call",
    "connector__matrix__describe_images",
    "--args-file",
    argsFile,
  ]);
  const payload = JSON.parse(stdout);
  const description = payload?.results?.[0]?.description ?? "";
  const match = description.match(/```json\s*([\s\S]*?)```/);
  return JSON.parse(match ? match[1] : description);
}

// ---- 主流程 ----

const argv = process.argv.slice(2);
const compareMode = argv.includes("--compare");
const baselineDir = join(here, "baseline");
const wanted = argv.filter((arg) => !arg.startsWith("--"));
const all = (await readdir(shotDir)).filter((name) => name.endsWith(".png")).sort();
const targets = wanted.length
  ? all.filter((name) => wanted.some((key) => name.startsWith(key)))
  : all;

if (compareMode) {
  await runCompare(targets, baselineDir);
  process.exit(0);
}

console.log(`待评审 ${targets.length} 张截图\n`);

const results = [];
for (const name of targets) {
  const key = name.replace(/\.png$/, "");
  const context = SCREENSHOT_CONTEXT[key] ?? "SelaDB 的一个界面截图。";
  process.stdout.write(`  ${key} … `);
  try {
    const score = await review(join(shotDir, name), context);
    const total = score.layout.score + score.contrast.score + score.professionalism.score;
    console.log(
      `布局 ${score.layout.score} / 对比 ${score.contrast.score} / 专业 ${score.professionalism.score}  合计 ${total}/15`,
    );
    results.push({ key, name, context, ...score, total });
  } catch (error) {
    console.log(`失败: ${error.message?.split("\n")[0]}`);
    results.push({ key, name, context, error: error.message });
  }
}

const ok = results.filter((r) => !r.error);
const avg = (axis) =>
  ok.length ? (ok.reduce((sum, r) => sum + r[axis].score, 0) / ok.length).toFixed(2) : "—";

// ---- 出报告 ----

const lines = [];
lines.push("# 视觉评审报告");
lines.push("");
lines.push(
  `> 由 \`tests/review.mjs\` 生成:把黄金截图交给多模态模型,按固定 rubric 打分。`,
);
lines.push(
  "> 思路借自 wandb/openui 的 `backend/openui/eval/evaluate.py`,三条维度改写成了适配桌面数据工具的版本。",
);
lines.push("");
lines.push(
  `评审 ${ok.length} 张,平均分:布局 **${avg("layout")}** / 对比 **${avg("contrast")}** / 专业 **${avg("professionalism")}**`,
);
lines.push("");
lines.push("| 截图 | 场景 | 布局 | 对比 | 专业 | 合计 |");
lines.push("|---|---|---|---|---|---|");
for (const r of results) {
  if (r.error) {
    lines.push(`| ${r.key} | — | — | — | — | 失败 |`);
    continue;
  }
  lines.push(
    `| ${r.key} | ${r.context.slice(0, 22)}… | ${r.layout.score} | ${r.contrast.score} | ${r.professionalism.score} | **${r.total}** |`,
  );
}
lines.push("");

// 汇总所有问题,按出现频次排 —— 同一个问题被多次提到,说明是真问题
const issues = new Map();
for (const r of ok) {
  for (const axis of ["layout", "contrast", "professionalism"]) {
    for (const issue of r[axis].issues ?? []) {
      const key = issue.trim();
      if (!key) continue;
      if (!issues.has(key)) issues.set(key, { count: 0, screens: [] });
      const entry = issues.get(key);
      entry.count += 1;
      entry.screens.push(r.key);
    }
  }
}
lines.push("## 被反复提到的问题");
lines.push("");
const ranked = [...issues.entries()].sort((a, b) => b[1].count - a[1].count);
if (ranked.length === 0) {
  lines.push("(无)");
} else {
  for (const [issue, entry] of ranked) {
    lines.push(`- **${issue}**`);
    lines.push(`  - 出现 ${entry.count} 次:${entry.screens.join("、")}`);
  }
}
lines.push("");

lines.push("## 逐张详情");
lines.push("");
for (const r of results) {
  lines.push(`### ${r.key}`);
  lines.push("");
  if (r.error) {
    lines.push(`评审失败:${r.error.split("\n")[0]}`);
    lines.push("");
    continue;
  }
  lines.push(`> ${r.context}`);
  lines.push("");
  for (const axis of ["layout", "contrast", "professionalism"]) {
    const label = { layout: "布局与信息密度", contrast: "对比度与类型可辨识", professionalism: "专业观感" }[axis];
    lines.push(`**${label} — ${r[axis].score}/5**`);
    lines.push("");
    lines.push(`${r[axis].reason}`);
    lines.push("");
    for (const issue of r[axis].issues ?? []) {
      lines.push(`- ${issue}`);
    }
    if ((r[axis].issues ?? []).length) lines.push("");
  }
  if ((r.top_fixes ?? []).length) {
    lines.push("**修改建议**");
    lines.push("");
    for (const fix of r.top_fixes) {
      lines.push(`- ${fix}`);
    }
    lines.push("");
  }
}

await writeFile(reportPath, lines.join("\n"), "utf8");
console.log(`\n报告已写入 ${reportPath}`);

/** 成对比较模式。 */
async function runCompare(targets, baselineDir) {
  const results = [];
  for (const name of targets) {
    const key = name.replace(/\.png$/, "");
    const beforePath = join(baselineDir, name);
    const context = SCREENSHOT_CONTEXT[key] ?? "SelaDB 的一个界面截图。";
    process.stdout.write(`  ${key} … `);
    try {
      const verdict = await compare(beforePath, join(shotDir, name), context);
      console.log(verdict.better === "after" ? "改后更好" : "改前更好");
      results.push({ key, ...verdict });
    } catch (error) {
      console.log(`失败: ${error.message?.split("\n")[0]}`);
    }
  }

  const better = results.filter((r) => r.better === "after").length;
  console.log(`\n${better}/${results.length} 张在改动后更好`);

  const out = [];
  out.push("# 改动前后成对比较");
  out.push("");
  out.push("> 用 `node tests/review.mjs --compare` 生成。绝对打分有 ±1 分的抖动,");
  out.push("> 成对比较问的是「哪个更好」,相对判断稳定得多。");
  out.push("");
  for (const r of results) {
    const mark = r.better === "after" ? "改后更好" : "改前更好";
    out.push(`## ${r.key} —— ${mark}`);
    out.push("");
    out.push(`${r.why}`);
    out.push("");
    if (r.regression) {
      out.push(`**新引入的问题**:${r.regression}`);
      out.push("");
    }
  }
  await writeFile(join(here, "compare-report.md"), out.join("\n"), "utf8");
  console.log("报告已写入 tests/compare-report.md");
}
