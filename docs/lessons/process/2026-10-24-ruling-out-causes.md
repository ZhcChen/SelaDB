# 排除法：别把并发出现的警告当根因

## 背景

调研 AUI（C++20 声明式 UI 框架）时，它的无头测试在 macOS 上不通过：
**10 个用例失败 + 1 个段错误**。

第一眼看到的线索是每次失败前都有一条警告：

```
[Font][WARN]: Could not read fallback font /System/Library/Fonts/PingFang.ttc:
  unable to open ... No such file or directory
[Font][WARN]: Could not load fallback font: /System/Library/Fonts/PingFang.ttc
```

字体加载失败 → 文字宽度算不对 → 断言「文字画得比 label 还宽」失败 → 布局期解引用
无效字体 → 段错误。**一条线串得特别顺**，差点就当成结论写了。

## edits

| 组件 | 改了什么 | 观察到的差异 | 判定 |
|---|---|---|---|
| `aui.core/.../AFontManagerImpl.cpp` | 把稳定路径的 `STHeiti Light.ttc` 提到候选**第一位**（急加载） | 日志出现 `Loaded CJK fallback font`（加载成功），但 10 个失败**一个不少** | hurt |
| 同上 | 把 `STHeiti` 放在**延迟**候选位 | 从未被加载（日志无 `Loaded CJK`），失败不变 | no observed effect |
| `build-llvm/` | 整个项目用 Homebrew **LLVM 21**（自带 libc++，非 Apple 的）重建 | **同样 10 失败 + 同样段错误** | hurt |
| 崩溃分析 | 读 `~/Library/Logs/DiagnosticReports/Tests-*.ips` | `EXC_BAD_ACCESS at 0x4c0`，栈在 `View::onLayout` | helped |
| 断言定位 | `grep -rn 'size.x <= width()'` | 断言在 `aui.image/.../AImageView::cropped()`，是**字形图集裁剪**，不是文字度量 | helped |

## lesson

- **cue**:一个失败现象旁边同时出现了一条警告，看起来能串成因果链
- **lesson**:
  **警告与失败同时出现，不等于警告是原因。** 排除法要在**能证伪的方向**上做 ——
  这次做了两轮：① 把可疑依赖换成另一条来源（编译器：Apple clang → Homebrew LLVM），
  ② 让可疑条件变成「确认成立」（字体：提到急加载位并确认日志里出现加载成功）。
  两轮都显示「原因被消除，失败仍在」，才排除了这两个嫌疑。
  做完这两轮，真正的根因才露出来：**软件渲染路径的字形图集裁剪越界**
  （`AImageView::cropped()`），跟字体、跟编译器都没关系。
- **evidence**:上面五行 edits
- **confidence**:high —— 两轮排除都做了「让嫌疑真的消失」的验证，不是「试了没用」就下结论

## 附带的两条

1. **grep 定位断言比读代码快。** 断言文本 `position.x + size.x <= width()`
   在 AUI 里有 7000 多行 C++，全读不可能。`grep -rn` 一条命令就把位置钉死在
   `aui.image/src/AUI/Image/AImage.cpp:64` —— 而且**文件所在模块**
   （aui.image 而不是 aui.views）直接告诉了我们这是图像路径不是文本路径。
2. **系统崩溃报告比 lldb 好用。** macOS 上 lldb 附加进程会被系统拦
   （`attach failed (attached to process, but could not pause execution)`），
   但 `~/Library/Logs/DiagnosticReports/*.ips` 里已经有完整的
   异常类型、触发线程和调用栈。
