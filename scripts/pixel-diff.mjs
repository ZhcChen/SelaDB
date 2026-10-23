#!/usr/bin/env node
/**
 * 按像素比对两张 PNG。
 *
 * 为什么不用 `git diff` 看截图:Chromium 的 PNG 编码器在同一张图上会产出
 * 字节不同但**像素完全相同**的文件(压缩流的 filter 选择有微小随机性)。
 * 直接比字节,每次提交都会冒出几张「变了」的截图,真改动反而被淹没。
 *
 * 用法:
 *   node scripts/pixel-diff.mjs a.png b.png
 *   相同 → 退出码 0,打印「像素相同」
 *   不同 → 退出码 1,打印差异像素数与前若干处位置
 */
import { readFile } from "node:fs/promises";
import { chromium } from "/Users/chen/code/SelaDB/ui/node_modules/playwright/index.mjs";

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error("用法: node scripts/pixel-diff.mjs <a.png> <b.png>");
  process.exit(2);
}

const b64 = async (p) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<body></body>");

const result = await page.evaluate(
  async ([aSrc, bSrc]) => {
    const load = (src) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(new Error("图片加载失败"));
        img.src = src;
      });
    const [ia, ib] = await Promise.all([load(aSrc), load(bSrc)]);
    if (ia.width !== ib.width || ia.height !== ib.height) {
      return { sizeMismatch: true, aw: ia.width, ah: ia.height, bw: ib.width, bh: ib.height };
    }
    const toData = (img) => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      return g.getImageData(0, 0, img.width, img.height).data;
    };
    const da = toData(ia);
    const db = toData(ib);
    let n = 0;
    const sample = [];
    for (let i = 0; i < da.length; i += 4) {
      const d =
        Math.abs(da[i] - db[i]) +
        Math.abs(da[i + 1] - db[i + 1]) +
        Math.abs(da[i + 2] - db[i + 2]);
      if (d > 6) {
        n += 1;
        if (sample.length < 12) {
          const p = i / 4;
          sample.push({
            x: p % ia.width,
            y: Math.floor(p / ia.width),
            a: [da[i], da[i + 1], da[i + 2]],
            b: [db[i], db[i + 1], db[i + 2]],
          });
        }
      }
    }
    return { w: ia.width, h: ia.height, n, sample };
  },
  [await b64(aPath), await b64(bPath)],
);

await browser.close();

if (result.sizeMismatch) {
  console.log(
    `尺寸不同: ${result.aw}×${result.ah} vs ${result.bw}×${result.bh}`,
  );
  process.exit(1);
}
if (result.n === 0) {
  console.log(`像素相同 (${result.w}×${result.h})`);
  process.exit(0);
}
console.log(`差异 ${result.n} 个像素 (${result.w}×${result.h}):`);
for (const s of result.sample) {
  console.log(`  (${s.x},${s.y})  rgb(${s.a.join(",")}) → rgb(${s.b.join(",")})`);
}
process.exit(1);
