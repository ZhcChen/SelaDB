# SelaDB 开发循环

这份文档定义**怎么开发 SelaDB**，跟「开发什么」无关。
产品需求在 [`ui-design-plan.md`](ui-design-plan.md)，框架方案在
[`gui-core-plan.md`](gui-core-plan.md)，这里只管过程。

## 方法来源：Google Harness²

开发循环借自 Google Research 的 [Harness²](https://github.com/google-research/harness2)
（Apache-2.0，arXiv:2610.14224）。它解决的是同一个问题：**让 agent 在没有
标准答案的领域里，靠执行结果的对比自己改进自己。**

它的一句话版本：

> Harness 是包在模型外面的那一圈东西（提示词、工具、记忆、技能、脚本、编排）。
> Harnessing 是优化这一圈的过程。
> Harness² 是**递归**地做这件事 —— agent 改进的是「让它能改进自己的那套东西」。

### 借来的四件事

| # | Harness² 的做法 | SelaDB 里的对应物 |
|---|---|---|
| 1 | **Propose–Probe–Compose**：提改动 → 跑一遍看效果 → 据效果合成 | 提实现 → 跑验收 → 按验收结果合下一版 |
| 2 | **选择不看标准答案**：候选匿名后按固定 rubric 盲选 | 改动前后**匿名**后按 rubric 比 |
| 3 | **证据纪律**：没有证据的教训不入库 | 观察记录里必须有 `observed` 字段 |
| 4 | **两层递归**：任务内改进 + 跨任务的经验库 | 本轮改进 + `docs/lessons/` 累积 |

### 不借的

Harness² 是一套 12,747 行的 Python 框架，带 benchmark 适配器、并发调度、
成本记账、产物归档。**那些是给「跑 1,143 个任务」的实验用的**，不是给日常开发用的。
我们借它的**纪律**，不借它的规模。

## 两层递归

```
第一层（任务内）：一个功能内部
  提改动 → 探(跑验收) → 看差异 → 合下一版

第二层（跨任务）：轮与轮之间
  这一轮学到什么 → 写进 docs/lessons/ → 下一轮开工前先读
```

第二层是重点。我们已经在做第一层（每轮都有验收），但**经验是散在提交信息
和我的上下文里的**，轮次一多就丢了。`docs/lessons/` 把它固定下来。

## 经验库

```
docs/lessons/
  INDEX.md              总索引:一条一行,按领域分组
  <domain>/
    <date>-<slug>.md   一轮的经验
```

一轮的经验文件长这样 —— 字段是固定的，不许自由发挥：

```markdown
# <这一轮做了什么>

## edits —— 改了哪些组件,各自产生了什么可观察的差异

| 组件 | 改了什么 | 观察到的差异 | 判定 |
|---|---|---|---|
| core/conn_url.rs | SQLite 路径不再剥前导斜杠 | 绝对路径的库连不上，报 unable to open | helped |

判定只有四种:`helped` / `hurt` / `no observed effect` / `confounded`。

**`confounded` 优先。** 一次改了好几处、或者只有一次执行能看出差别时,
用 `confounded` —— 猜错的归因会毒害后面每一轮。

## lesson —— 能迁移的那一条

- **cue**:这条教训适用的**情境形状**,不是这次的事实
- **lesson**:要做的操作,写成「能执行也能检查」的样子
- **evidence**:它站在哪几行 edits 上
- **confidence**:high / medium / low,以及为什么

三条约束:

1. **cue 写形状,不写事实。**「绝对路径的连接串」是事实;「用户给的是
   绝对路径而不是相对路径」才是形状 —— 后者能在别的事情上再次触发。
2. **太笼统没用,太具体不会再触发。** 「要仔细」没用;「费率涨到 250
   就不再触发」也没用。落在中间。
3. **没有证据就写 `NO_ENTRY`。** 只有 `confounded` 行支撑的教训是猜测 ——
   收窄到记录能支撑的范围,或者干脆不写。**采纳本身不证明某个改动有用。**

## 盲选

评审改动前后时,**不告诉模型哪边是哪边**。

Harness² 的 `select` 提示词里有这么一段(原文):

> You are choosing between ARTIFACTS. You are not told how any of them was
> produced and you cannot see the runs that made them, so judge each one on
> what it is, against the request and the source — never on how impressive
> or thorough it sounds.

它还给了固定的判断顺序:

1. **DELIVERY** —— 要求的每一项都在吗?在正确的位置吗?形式对吗?
2. **FIDELITY** —— 拿产物里的说法去对源材料核。**驳掉编出来的细节**。
   产物之间有分歧时以源材料为准;源材料没说的,选那个明说「不知道」的,
   不选那个自信填空的。
3. **INTERNAL CONSISTENCY** —— 合计对不对得上它的行?摘要里的数字跟它
   总结的那张表一致吗?计数对得上实际条目数吗?同一份产物里两个数字
   互相矛盾就是缺陷,哪怕你判断不出哪个错。
4. **OPERATIONAL FITNESS** —— 这是对的东西吗?下游的人或系统能直接用吗?
   **别拿「读起来印象深」当优点。**
5. **FINISH** —— 没有占位符、TODO、未解决的备注、断掉的引用、空的必填字段。

> Length and polish are not merits in themselves. A shorter, correct, complete,
> exactly-shaped answer beats a longer one with a gap or an embellishment.

## 评审的结论要逐条核实

评审给的**结论**经常是错的,但它指出的**具体问题**经常是对的。
规矩:

1. 评审说「引入了新问题」→ 先问「这块区域像素变了吗」。逐像素分区统计,
   变了几个百分点一目了然。
2. 评审说的每个「现象」→ 落到计算样式或具体色值上。落不上就驳回。
3. 判据用**硬标准**(对比度比值、像素栅格、字体度量),不用「看起来」。

我们自己的 UI 评审已经吃过三次亏,每次都是同一个模式:模型把「变了的
占位符文字」记成了「边框被淡化」。像素一查,边框一个字节没动。

## 验证器与被测物分离

**验证器不能是被测物的一部分。** 评审模型看不到自己的运行过程,
只看产物;验收脚本跑的是真实二进制,不是模拟。

- 单元测试:不打桩 —— 桩只能证明桩自己是对的
- 集成测试:真 SQLite 文件、真 SQL
- 验收脚本:`scripts/acceptance.sh`,走 CLI 二进制,断言具体内容

验收脚本的断言必须**按值取**,不能按子串猜。JSON 是 pretty-print 的,
值在单独一行 —— 我们自己的验收脚本第一版就因为按子串写断言而误报了两处
「失败」(代码是对的,断言是错的)。

## 成本与预算

- 每次评审会跑多模态模型,有延迟和费用。改动小的时候先跑功能验收,
  攒够一批再评审。
- 仓库根有 `Cargo.lock`,`gui-core` 依赖 wgpu,编译很重。日常开发用
  `cargo build`(默认成员只有 core 与 cli),别用 `--workspace`。

## 轮次的收尾清单

一轮做完,依次过:

- [ ] 功能验收通过(`cargo test` + `scripts/acceptance.sh`)
- [ ] 视觉改动过了视觉评审(`cd ui && node tests/review.mjs --compare`)
- [ ] 改了颜色就过对比度检查(`cd ui && bun run test:contrast`)
- [ ] 写 `docs/lessons/<domain>/<date>-<slug>.md`
- [ ] 更新 `docs/lessons/INDEX.md`
- [ ] 提交信息写清「改了什么 / 为什么 / 驳回了什么」
