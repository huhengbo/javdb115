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
