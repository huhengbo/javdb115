# javdb115

[![CI](https://github.com/huhengbo/javdb115/actions/workflows/ci.yml/badge.svg)](https://github.com/huhengbo/javdb115/actions/workflows/ci.yml)

一个移动端优先的 JavDB 演员订阅与 115 离线下载自动化工具。项目提供 Web 管理界面，可完成作品发现、演员订阅、磁力筛选、115 离线任务提交、下载状态跟踪、媒体整理与 Telegram 通知。

> [!IMPORTANT]
> 本项目只提供自动化工具，不提供、托管或分发媒体内容。请在使用前确认你的使用方式符合所在地区法律法规、目标网站服务条款以及相关平台规则。

## 功能特性

- JavDB 最新作品、搜索、演员详情、作品详情、评论、相似作品与排行榜。
- 演员订阅与标签筛选，支持有码、无码、可播放、磁链、字幕和单体作品等条件。
- 磁力筛选规则：最小体积、包含关键词、排除关键词。
- 手动或自动提交 115 离线下载，并跟踪任务状态和事件历史。
- 下载完成后自动整理文件、字幕和封面，生成 Emby 兼容 NFO。
- 115 扫码登录和目录选择。
- Telegram 通知与 Bot 命令。
- Web 登录保护和 `/api/health` 健康检查。
- Docker / Docker Compose 部署。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Backend | Python 3.12+、FastAPI、Pydantic、SQLite、httpx |
| Frontend | React 19、TypeScript、Vite、Tailwind CSS |
| Quality | pytest、ruff、mypy、ESLint、TypeScript |
| Deployment | Docker 多阶段构建、Docker Compose |

## 快速开始

### Docker Compose

要求：Docker 与 Docker Compose v2。

```bash
git clone https://github.com/huhengbo/javdb115.git
cd javdb115
cp .env.example .env
```

至少修改以下配置：

```dotenv
APP_ADMIN_PASSWORD=replace-with-a-strong-password
APP_SECRET_KEY=replace-with-a-long-random-secret
```

启动：

```bash
docker compose up -d --build
```

默认访问：`http://127.0.0.1:8080`。

检查状态：

```bash
docker compose ps
curl http://127.0.0.1:8080/api/health
```

查看日志：

```bash
docker compose logs -f
```

升级代码后重新构建：

```bash
git pull
docker compose up -d --build
```

## 配置

环境变量：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `APP_ADMIN_USERNAME` | 否 | `admin` | Web 管理员用户名 |
| `APP_ADMIN_PASSWORD` | 是 | - | Web 管理员密码 |
| `APP_SECRET_KEY` | 是 | - | 会话 Token 签名密钥 |
| `APP_DATABASE_PATH` | 否 | `data/app.sqlite3` | SQLite 数据库路径；Docker 中固定为 `/data/app.sqlite3` |
| `APP_SESSION_TTL_HOURS` | 否 | `24` | 登录有效期（小时） |
| `APP_ACTOR_MOVIE_CHECK_LIMIT` | 否 | `3` | 单次演员订阅检查读取作品数量 |
| `APP_HTTP_PORT` | 否 | `8080` | Docker Compose 暴露端口 |

运行后可在 Web 设置页配置：

- 115 Cookie、下载临时目录、整理完成目录。
- 演员订阅检查 Cron。
- 磁力筛选规则。
- Telegram Bot Token 与 Chat ID。

不要提交 `.env`、SQLite 数据库、日志、截图、构建产物、115 Cookie 或 Telegram Token。

## 本地开发

### Backend

推荐使用 `uv`：

```bash
cd backend
uv venv .venv --python python3.13
uv pip install --python .venv/bin/python -e ".[dev]"
APP_ADMIN_PASSWORD=change-me \
APP_SECRET_KEY=dev-secret \
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

### Frontend

```bash
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

开发服务器默认运行在 `http://127.0.0.1:5173`，并将 `/api` 代理到 `http://127.0.0.1:8080`。

## 项目结构

```text
javdb115/
├── .github/                 # GitHub Actions、Issue / PR 模板、Dependabot
├── backend/
│   ├── app/
│   │   ├── adapters/        # JavDB、115、Telegram 外部适配器
│   │   ├── api/             # FastAPI 路由
│   │   ├── repositories/    # SQLite 数据访问
│   │   ├── services/        # 核心业务流程
│   │   └── schema.sql       # SQLite 表结构
│   ├── tests/               # 后端测试
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── lib/
│   │   └── pages/
│   ├── package.json
│   └── package-lock.json
├── CONTRIBUTING.md
├── SECURITY.md
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 质量检查

提交 PR 前建议运行完整检查。

Backend：

```bash
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/mypy backend/app
backend/.venv/bin/python -m compileall -q backend/app backend/tests
backend/.venv/bin/python -m pytest backend/tests -q
```

Frontend：

```bash
cd frontend
npm run lint
npm run build
```

GitHub Actions 会在 push 与 pull request 上执行同等检查，并验证 Docker 镜像能够成功构建。

## 数据与备份

Docker Compose 默认将运行数据持久化到仓库目录下的 `./data`。升级或迁移前建议先备份该目录，尤其是 `app.sqlite3`。

## 安全

如果发现安全问题，请不要直接提交包含利用细节、Cookie、Token 或其他敏感信息的公开 Issue。处理方式见 [SECURITY.md](SECURITY.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。开发环境、分支与提交建议见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Roadmap / Issues

已知问题、工程化改进和后续计划统一维护在 [GitHub Issues](https://github.com/huhengbo/javdb115/issues)。

## License

仓库目前尚未声明开源许可证。在许可证明确之前，代码默认受版权保护；相关决策会通过 GitHub Issue 跟踪。