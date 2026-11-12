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
