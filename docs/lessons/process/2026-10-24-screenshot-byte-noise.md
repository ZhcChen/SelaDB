# 截图的字节差异是假的

## edits

| 组件 | 改了什么 | 观察到的差异 | 判定 |
|---|---|---|---|
| `scripts/pixel-diff.mjs` | 新增:按像素比对两张 PNG | 字节差 1B 的截图被正确判为「像素相同」 | helped |
| `ui/tests/screenshots/*` | 保持 HEAD 版本,不提交字节噪声 | diff 里不再出现假变更 | helped |

## lesson

- **cue**:同一张界面重新截图,文件大小变了几个字节,`git diff` 说它变了
- **lesson**:
  Chromium 的 PNG 编码器对**像素完全相同**的图也会产出字节不同的文件
  (压缩流的 filter 选择有微小差异)。**比对截图要按像素,不要按字节。**
  用 `node scripts/pixel-diff.mjs a.png b.png` —— 退出码 0 表示像素相同。
- **evidence**:上面两行 edits。现场:12-ddl / 13-context-menu / 15-connect 三张
  在没改任何设计源的情况下「变了」,逐像素比对差异是 **0 个像素**。
- **confidence**:high —— 三张独立复现,差异全部落在最后一个 IDAT chunk 的长度上

## 为什么要紧

字节噪声的真正代价不是那几 KB,是**它会训练我们忽略截图 diff**。
真改动混在假变更里,就会被跳过。所以视觉评审之前先跑一次像素比对,
确认「这次真的改了界面」,再去看评审说了什么。
