# Contributing

感谢参与 javdb115。

## 开发流程

1. Fork 仓库并从最新 `master` 创建功能分支。
2. 保持改动聚焦，一个 Pull Request 尽量只解决一类问题。
3. 修改代码时同步补充或更新测试。
4. 提交前执行后端、前端和必要的 Docker 构建检查。
5. PR 描述中说明问题、实现方式、验证结果和潜在兼容性影响。

推荐分支命名：

- `feat/<name>`：新功能
- `fix/<name>`：问题修复
- `refactor/<name>`：重构
- `docs/<name>`：文档
- `chore/<name>`：工程化或维护

## 仓库治理与合并策略

- `master` 是项目默认分支。当前文档、CI 与发布流程统一以 `master` 为基准，不为分支命名本身额外迁移到 `main`。
- 默认分支的改动应通过 Pull Request 合并，不直接绕过 CI 推送失败代码。
- 合并方式统一使用 **Squash merge**，保持 `master` 历史一项改动对应一个清晰提交。
- PR 标题使用 Conventional Commits 风格，例如 `feat: ...`、`fix: ...`、`docs: ...`、`chore: ...`；Squash 后以 PR 标题作为主提交标题。
- 合并前必须通过核心 CI：Python 3.12 / 3.13 后端检查、Frontend、Mobile browser interactions、Web E2E smoke，以及 Docker security + build。
- 默认分支禁止 force push 和删除。
- 当前由单维护者管理，不强制设置审批人数或 CODEOWNERS 审批；代码所有权仍由 `.github/CODEOWNERS` 明确。
- 不强制 PR 分支始终手动更新到最新 `master`；当默认分支变化导致检查失效或冲突时，再更新分支并重新验证，避免无意义重复构建。

## Backend

```bash
cd backend
uv venv .venv --python python3.13
uv pip install --python .venv/bin/python -e ".[dev]"
```

检查：

```bash
.venv/bin/ruff check app tests
.venv/bin/mypy app
.venv/bin/python -m compileall -q app tests
.venv/bin/python -m pytest tests -q
```

## Frontend

```bash
cd frontend
npm ci
npm run lint
npm run build
```

## Commit 建议

推荐使用清晰的 Conventional Commits 风格：

```text
feat: add xxx
fix: handle xxx
refactor: simplify xxx
docs: update xxx
ci: add xxx
chore: maintain xxx
```

## Pull Request

PR 应至少包含：

- 背景和目标。
- 主要改动。
- 验证方式与结果。
- 是否包含配置、数据库结构或行为兼容性变化。
- 对应 Issue（如有）。

不要在 Issue、PR、日志或测试数据中提交真实的 115 Cookie、Telegram Token、管理员密码、数据库文件或其他敏感信息。
