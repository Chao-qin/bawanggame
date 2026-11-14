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

## Generated Artifacts

构建生成的 `public/`、`site-deploy/`、`apps/mobile/web/`、Android assets staging、APK、临时浏览器 profile 和测试日志不应提交，除非任务明确要求提交它们。完成验证后回收临时资源；保留可复用的依赖缓存和仓库要求的外部运行时资源。

## Delivery Report

最终报告必须包含：

- 分支名、commit 和 PR 地址及状态。
- 实际修改的核心文件和行为变化。
- 已执行的验证命令及关键结果。
- 构建产物的绝对路径（如果生成）。
- 未验证场景、环境限制和残余风险。
