# Review Report

## Context

- PR:
- Base SHA:
- Head SHA:
- Reviewer model: actual `provider/model`
- Reasoning: actual setting, if supported
- Context budget: actual limit
- Review round: `R1` / `R2` / `R3`
- Review pass: `diff` / `feature-audit` / `validation` (validation only when required)

## Findings

填写每条问题，按严重程度排序：

```md
### [P1] 标题 — path/to/file:line

Trigger -> call path/state -> incorrect result -> affected scenario.

Fix: concrete change or required evidence.
```

没有问题时填写：`No findings.`

## Verification

- Commands:
- Device/runtime:
- Result:

## Residual Risk

- 未验证的平台或场景：
- 外部依赖：
- 仍需人工确认：

### P2 Risk Acceptance (required only when P2 remains after R3)

- Authorized owner:
- Traceable artifact/issue ID:
- Follow-up owner:
- Expiry or target date:
- Risk acceptance record/link:

## Decision

- `pass`
- `fix_required`
- `blocked`

`blocked` applies to any unresolved P0/P1, an unsafe or unavailable P0 fix, or an unresolved P2 after `R3` without the authorized-owner risk acceptance fields above. Do not start `R4`.
