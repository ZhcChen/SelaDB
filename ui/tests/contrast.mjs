/**
 * 对比度回归检查。
 *
 * 功能断言验不了「看不看得清」,这道检查验的就是看得清:
 * 把每个页面的每个文本节点拿出来,找它实际待着的底色,算 WCAG 对比度。
 *
 * 两个关键点:
 *
 * 1. **底色要往上找,不能只看直接父级。** 浮层里的文字直接父级是透明的,
 *    一路往上找到第一个不透明的底色才是它真正的底。
 * 2. **每个主题单独渲染。** 不能在渲染完成后去改 data-theme —— 应用会按
 *    自己的偏好重新应用,量出来的是深浅混色(会算出 1.05 这种荒谬值)。
 *
 * 口径:
 *   - 正文(< 18.66px,或 < 24px 的粗体)要 4.5:1
 *   - 图标与非文本要 3:1 —— 图标类的 --fg-subtle 就是按这条定的
 *   - disabled 态豁免(但仍然会被报出来,人工看一眼是不是读不出来)
 *
 * 用法:node tests/contrast.mjs
 */
import { launchBrowser } from "./browser.mjs";

const ROUTES = [
  ["#/design", "工作台"],
  ["#/connect", "连接向导"],
  ["#/spec", "设计规范"],
  ["#/entry", "入口页"],
];

const browser = await launchBrowser();
let failures = 0;

for (const [route, label] of ROUTES) {
  console.log(`\n${"=".repeat(74)}\n${label}  (${route})`);
  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`file:///Users/chen/code/SelaDB/ui/index.html${route}`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(700);

    const rows = await page.evaluate(() => {
      const parse = (c) => {
        const m = c.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/);
        if (!m) return null;
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
      };
      const over = (fg, bg) => ({
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
        a: 1,
      });
      const lum = (c) => {
        const f = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      };
      const ratio = (a, b) => {
        const l1 = lum(a);
        const l2 = lum(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      };
      const opaqueBg = (el) => {
        const stack = [];
        let node = el;
        while (node && node !== document.documentElement) {
          const c = parse(getComputedStyle(node).backgroundColor);
          if (c && c.a > 0) {
            stack.push(c);
            if (c.a === 1) break;
          }
          node = node.parentElement;
        }
        let base = { r: 255, g: 255, b: 255, a: 1 };
        for (let i = stack.length - 1; i >= 0; i -= 1) base = over(stack[i], base);
        return base;
      };

      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll("*")) {
        const text = [...el.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join("")
          .trim();
        if (!text) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
        // 装饰性字形(aria-hidden)按非文本标准 3:1 判,不是正文 4.5
        const decorative = el.getAttribute("aria-hidden") === "true";
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        const fg = parse(cs.color);
        if (!fg) continue;
        const bg = opaqueBg(el);
        const cr = ratio(over(fg, bg), bg);
        const size = parseFloat(cs.fontSize);
        const key = `${cs.color}|${size}|${text.slice(0, 12)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          text: text.slice(0, 22),
          cls: (el.className || el.tagName).toString().slice(0, 30),
          color: cs.color,
          size,
          cr: +cr.toFixed(2),
          need: decorative ? 3 : size >= 24 ? 3 : 4.5,
        });
      }
      return out;
    });

    const bad = rows.filter((r) => r.cr < r.need);
    console.log(`  【${theme}】${rows.length} 个文本节点,不达标 ${bad.length}`);
    for (const r of bad.sort((a, b) => a.cr - b.cr).slice(0, 10)) {
      console.log(
        `      ✗ ${String(r.cr).padStart(5)} (需 ${r.need}) ${String(r.size).padStart(4)}px ` +
          `${r.color.padEnd(20)} ${r.cls.padEnd(24)} "${r.text}"`,
      );
      failures += 1;
    }
    await page.close();
  }
}

await browser.close();

if (failures) {
  console.log(`\n${failures} 处不达标。`);
  process.exit(1);
}
console.log("\n全部达标。");
