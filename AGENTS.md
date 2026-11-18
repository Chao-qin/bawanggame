# Repository Agent Instructions

## Worktree Workflow

每项开发任务都应使用独立的 Git worktree、分支和 PR。主工作树只用于稳定分支、分支管理和最终检查；任务的编辑、依赖安装、构建、测试和冲突处理都在任务 worktree 中完成。

### 创建任务 worktree

在主工作树创建同级目录的 worktree，不要把 worktree 放在仓库目录内部：

```bash
cd ~/work/project/xiaochao-bawang
git status --short
git fetch origin
git switch main
git pull --ff-only origin main
git worktree add -b <branch-name> \
  ~/work/project/xiaochao-bawang-wt-<task-name> origin/main
cd ~/work/project/xiaochao-bawang-wt-<task-name>
```

所有任务文件和生成文件都在这个目录中处理。每个任务只能由一个 worktree 检出对应分支；使用 `git worktree list` 检查现有 worktree。

### 提交和 PR

提交前在任务 worktree 中运行：

```bash
git diff --check
git status --short
git add <changed-files>
git commit -m "<type>: <summary>"
git push -u origin <branch-name>
```

一个任务对应一个 PR。后续修改继续在同一个 worktree 和分支中提交并推送，以更新同一个 PR。不要为了同一任务拆出多个 PR。

### 同步主分支

PR 进行中需要同步主分支时，只在任务 worktree 中操作：

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

同步前必须先提交本地改动。冲突只在任务 worktree 中解决，不要在主工作树临时修改任务文件。

### 清理

PR 合并后在主工作树清理：

```bash
cd ~/work/project/xiaochao-bawang
git worktree remove ~/work/project/xiaochao-bawang-wt-<task-name>
git branch -d <branch-name>
git worktree prune
git fetch --prune origin
```

有未提交改动时不要强制删除 worktree；先提交、转移或明确处理这些改动。

## GitHub Operations

涉及 GitHub issue、PR、评论、分支或审查的操作必须使用 GitHub MCP。除非用户明确要求，不使用 `gh` CLI，也不绕过 MCP 直接调用 GitHub API。

创建 issue 或 PR 前先通过 MCP 搜索已有内容，避免重复；创建后通过 MCP 验证标题、正文、分支和关联关系。

## Documentation Placement

- `docs/superpowers/specs/`：产品或技术方案，说明目标、架构、接口、实施阶段和验收标准。
- `docs/superpowers/plans/`：按任务拆分的实现计划。
- `AGENTS.md`：agent 和开发协作必须遵守的仓库级规则。

## Task Contract

开始修改前，先把用户需求整理成四项：目标行为、修改范围、不可破坏的现有行为、验收标准。需求涉及多个平台时，明确每个平台的验证方式；需求不明确但可以安全推进时，采用最小范围假设并在交付报告中写明。

一个任务只能有一个交付分支和一个 PR。不要把无关修复、生成物或其他任务的改动带入当前 PR。若发现当前 worktree 不属于任务分支，先停止编辑并检查 `git worktree list`。

## Verification And Evidence

构建成功不等于功能验证成功。交付前至少完成与风险匹配的验证，并记录命令和结果：

- Web 功能：运行构建和对应的浏览器或 Node 服务冒烟验证。
- Android 功能：验证 APK 安装和启动，并检查 APK 内关键资源。
- 真机相关行为：区分桌面、模拟器和真实设备结果；没有真实设备时必须明确标注未完成真机验证。
- 性能问题：记录设备、运行时长、平均帧间隔或 FPS、P95 和异常帧；不能用静态检查代替性能结论。
- 网络功能：分别验证权限、请求地址、CORS/预检、接口响应和离线失败提示。

不能把“构建成功”“代码看起来正确”或单个平台结果描述为“已完全修复”。未验证的场景必须列入残余风险。

## Review Workflow

每个包含代码、配置或运行时行为的 PR 都必须经过冷启动 review。reviewer 不继承实现者的聊天上下文，只接收任务摘要、`AGENTS.md`、spec、验收标准、`origin/main...HEAD` diff、改动文件的相关调用链和验证结果。

按当前会话的全局 Agent 协作规则选择审查模型。优先使用经核实对当前账号或工作区免费、且有剩余额度的 OpenCode 模型。每次审查记录实际使用的 `provider/model`，并遵守全局规则对付费调用、证据范围与权限隔离的要求。

1. 普通改动启动一个独立 reviewer。模型支持时使用低 reasoning，审查上下文遵守模型限制且最多 300k tokens。
2. 涉及 Android、WebView、网络、性能、全屏、旋转或跨模块生命周期时，再启动一个独立的 validation reviewer。由 reviewer 在受限环境中执行实际验证，或由主 Agent 执行 reviewer 指定的命令并返还结果供其判断。
3. 初始顺序固定为：先完成 diff review，再完成 feature audit；需要平台或外部系统验证时才执行 validation review。必须完成全部适用的 review pass 并先汇总 findings，才能启动 fixer；不能只完成 diff review 就启动 fixer。发现 P0/P1/P2 后启动 fixer；P0 也必须进入 fixer，若无法安全修复则立即升级并停止交付。fixer 修改任务 worktree，不能由 reviewer 直接改代码。

reviewer 默认只读，必须按 `docs/review-matrix.md` 检查，并使用 `docs/review-report-template.md` 输出 findings。每条 finding 必须包含触发条件、调用路径、错误结果、影响场景和修复建议。没有证据的猜测不能作为阻塞项。

修复后必须重新冷启动 diff review 和 feature audit；只有原流程需要 validation，或修复触及其覆盖范围时，才重新执行 validation。每次复审都由新的 reviewer 依据当前 diff 和验证证据判断，不能由原上下文自行确认修复。

轮次从 `R1` 开始：`R1` 是初始 review，`R2` 和 `R3` 是修复后的复审；每轮都按上述顺序执行并记录 round。P0/P1 findings 在完成该轮全部适用 pass 后先触发 fixer。若 P0/P1 无法安全修复，必须立即升级并停止交付；若在允许的修复/复审周期后仍存在，则 `blocked` 并停止交付。P2：默认修复，`R3` 后仍存在只有在授权负责人以可追踪 artifact/issue ID 记录风险接受、后续负责人和到期或目标日期后才可 `pass`，否则 `blocked`；P3：记录后可 `pass`，无需继续轮次。`R3` 结束后不得开启第四轮。没有 findings 也必须报告未验证的平台和残余风险。

## Generated Artifacts

构建生成的 `public/`、`site-deploy/`、`apps/mobile/web/`、Android assets staging、APK、临时浏览器 profile 和测试日志不应提交，除非任务明确要求提交它们。完成验证后回收临时资源；保留可复用的依赖缓存和仓库要求的外部运行时资源。

## Delivery Report

最终报告必须包含：

- 分支名、commit 和 PR 地址及状态。
- 实际修改的核心文件和行为变化。
- 已执行的验证命令及关键结果。
- 构建产物的绝对路径（如果生成）。
- 未验证场景、环境限制和残余风险。
