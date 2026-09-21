# javdb115

[![CI](https://github.com/huhengbo/javdb115/actions/workflows/ci.yml/badge.svg)](https://github.com/huhengbo/javdb115/actions/workflows/ci.yml)
[![Docker Release](https://github.com/huhengbo/javdb115/actions/workflows/docker-release.yml/badge.svg)](https://github.com/huhengbo/javdb115/actions/workflows/docker-release.yml)

一个移动端优先的 JavDB 演员订阅与 115 离线下载自动化工具。项目提供 Web 管理界面，可完成作品发现、演员订阅、磁力筛选、115 离线任务提交、下载状态跟踪、媒体整理与 Telegram 通知。

> [!IMPORTANT]
> 本项目只提供自动化工具，不提供、托管或分发媒体内容。请在使用前确认你的使用方式符合所在地区法律法规、目标网站服务条款以及相关平台规则。

## 功能特性

- JavDB 最新作品、搜索、演员详情、作品详情、评论、相似作品，以及作品 / 热播 / 演员 / TOP250 排行（公开接口，无需 JavDB 登录）。
- 演员订阅与标签筛选，支持有码、无码、可播放、磁链、字幕和单体作品等条件。
- 演员作品支持触底加载，切换排序或标签后重新分页，加载失败可重试。
- 磁力筛选规则：最小体积、包含关键词、排除关键词。
- 手动或自动提交 115 离线下载，并跟踪任务状态和事件历史。
- 任务卡片支持长按或“更多操作”删除本地记录，确认后移除；不会取消 115 离线任务或删除网盘文件，已开始的下载或整理不会撤销。
- 下载完成后自动整理文件、字幕和封面，生成 Emby 兼容 NFO。
- 115 扫码登录和目录选择。
- Telegram 通知与 Bot 命令。
- HttpOnly Cookie Web 会话、登录失败限流和基础安全响应头。
- SQLite 版本化迁移、备份与恢复工具。
- Docker / Docker Compose 部署，官方 GHCR 镜像同时支持 `linux/amd64` 与 `linux/arm64`。

## 技术栈

| 层 | 技术 |
| --- | --- |
| Backend | Python 3.12+、FastAPI、Pydantic、SQLite、httpx |
| Frontend | React 19、TypeScript、Vite、Tailwind CSS |
| Quality | pytest、ruff、mypy、ESLint、TypeScript、Node test、E2E smoke |
| Deployment | Docker Buildx、Docker Compose、GHCR、amd64 + arm64 |

## 快速开始

### 方式一：使用 GHCR 预构建镜像

正式版本镜像发布到：

```text
ghcr.io/huhengbo/javdb115
```

支持平台：

- `linux/amd64`：常见 Intel / AMD x86_64 服务器、NAS。
- `linux/arm64`：Apple Silicon Linux VM、ARM NAS、ARM64 服务器等。

准备配置：

```bash
git clone https://github.com/huhengbo/javdb115.git
cd javdb115
cp .env.example .env
```

至少修改：

```dotenv
APP_ADMIN_PASSWORD=replace-with-a-strong-password
APP_SECRET_KEY=replace-with-a-long-random-secret
JAVDB115_IMAGE=ghcr.io/huhengbo/javdb115:latest
```

启动预构建镜像：

```bash
docker compose pull
docker compose up -d --no-build
```

### 方式二：从源码构建

```bash
git clone https://github.com/huhengbo/javdb115.git
cd javdb115
cp .env.example .env
# 修改 APP_ADMIN_PASSWORD / APP_SECRET_KEY
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

## Docker 镜像标签

发布流水线会推送以下标签：

| 场景 | 示例 |
| --- | --- |
| 默认分支最新构建 | `edge` |
| Commit 可追踪版本 | `sha-<commit>` |
| 正式版本 | `0.1.0` |
| Major.Minor | `0.1` |
| 最新正式版本 | `latest` |

正式 Tag 必须与仓库根目录 `VERSION` 一致，例如 `VERSION=0.1.0` 对应 Git Tag `v0.1.0`。

镜像在发布前会执行：漏洞扫描、健康检查、非 root 用户检查；最终通过 Buildx 同时构建 `linux/amd64` 和 `linux/arm64`，并附带 SBOM 与 provenance。

## 配置

环境变量：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `APP_ADMIN_USERNAME` | 否 | `admin` | Web 管理员用户名 |
| `APP_ADMIN_PASSWORD` | 是 | - | Web 管理员密码 |
| `APP_SECRET_KEY` | 是 | - | Session 安全与敏感设置加密密钥；首次使用后必须保持稳定，生产环境请使用长随机值 |
| `APP_DATABASE_PATH` | 否 | `data/app.sqlite3` | SQLite 数据库路径；Docker 中固定为 `/data/app.sqlite3` |
| `APP_SESSION_TTL_HOURS` | 否 | `24` | 登录有效期（小时） |
| `APP_SESSION_COOKIE_SECURE` | 否 | `false` | 使用 HTTPS 时建议设为 `true`，使 Session Cookie 只通过 HTTPS 发送 |
| `APP_ACTOR_MOVIE_CHECK_LIMIT` | 否 | `3` | 单次演员订阅检查读取作品数量 |
| `APP_HTTP_PORT` | 否 | `8080` | Docker Compose 暴露端口 |
| `APP_UID` / `APP_GID` | 否 | `1000` | 本地构建镜像时应用进程 UID / GID |
| `JAVDB115_IMAGE` | 否 | `javdb115:local` | Compose 使用的镜像；可设为 GHCR 正式镜像 |

运行后可在 Web 设置页配置：

- 115 Cookie、下载临时目录、整理完成目录。
- 演员订阅检查 Cron。
- 磁力筛选规则。
- Telegram Bot Token 与 Chat ID。

115 Cookie 和 Telegram Bot Token 属于敏感设置。API 不会回显原值；Web 表单留空保存表示保持原值，只有重新输入时才会覆盖。敏感值会使用由 `APP_SECRET_KEY` 派生的密钥通过 AES-GCM 认证加密后保存到 SQLite；升级旧数据库时会在启动阶段自动把已知明文敏感值迁移为密文。

> [!IMPORTANT]
> 请把 `APP_SECRET_KEY` 与数据库备份作为同一套恢复材料长期保存。更换或丢失该密钥后，历史加密的 115 Cookie / Telegram Bot Token 将无法解密，需要重新录入。

## 从旧容器升级

新版镜像使用非 root 用户运行。Docker Compose 默认 UID/GID 为 `1000:1000`。如果已有 `./data` 是由旧版 root 容器创建，升级前请确认目录可写：

```bash
sudo chown -R 1000:1000 ./data
```

如果需要使用其他宿主机 UID/GID，在 `.env` 中修改 `APP_UID` / `APP_GID` 后从源码重新构建镜像。

升级前建议先备份数据库。

## 数据库迁移、备份与恢复

数据库启动时会按 `schema_migrations` 顺序执行版本化迁移。迁移具有幂等检查，升级失败会阻止应用继续以不一致结构运行。

创建一致性 SQLite 备份：

```bash
cd backend
python -m app.db_admin backup \
  --database ../data/app.sqlite3 \
  --output ../backup/app.sqlite3
```

恢复备份会覆盖目标数据库，因此必须显式传入 `--yes`：

```bash
cd backend
python -m app.db_admin restore \
  --database ../data/app.sqlite3 \
  --input ../backup/app.sqlite3 \
  --yes
```

Docker 部署也可以在停止容器后备份整个 `./data` 目录。恢复包含敏感设置的数据库时，还必须同时使用原来的 `APP_SECRET_KEY`。

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
├── .github/                 # Actions、Issue / PR 模板、Dependabot、CODEOWNERS
├── backend/
│   ├── app/
│   │   ├── adapters/        # JavDB、115、Telegram 外部适配器
│   │   ├── api/             # FastAPI 路由
│   │   ├── repositories/    # SQLite 数据访问
│   │   ├── services/        # 核心业务流程
│   │   ├── migrations.py    # SQLite 顺序迁移
│   │   ├── secret_store.py  # 敏感设置 AES-GCM 加解密
│   │   ├── db_admin.py      # 备份 / 恢复 CLI
│   │   └── schema.sql       # 最新 SQLite 表结构
│   ├── tests/               # 后端测试
│   ├── pyproject.toml
│   └── uv.lock
├── frontend/
│   ├── src/
│   ├── tests/
│   ├── package.json
│   └── package-lock.json
├── scripts/check_version.py
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── VERSION
├── LICENSE
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## 质量检查

Backend：

```bash
backend/.venv/bin/ruff check backend/app backend/tests scripts
backend/.venv/bin/mypy backend/app
backend/.venv/bin/python -m compileall -q backend/app backend/tests scripts
backend/.venv/bin/python -m pytest backend/tests -q
python scripts/check_version.py
```

Frontend：

```bash
cd frontend
npm ci
npm run lint
npm test
npm run build
```

GitHub Actions 对 PR / `master` 自动执行：

1. Python 3.12 / 3.13 后端检查与测试。
2. 前端 lint、测试与生产构建。
3. 启动完整 Web 应用并验证 HttpOnly Cookie 登录流程。
4. 使用 QEMU + Buildx 验证 `linux/amd64`、`linux/arm64` 两个平台的 Docker 构建。

## 发布流程

项目使用 SemVer。当前版本保存在根目录 `VERSION`，并由 CI 校验与 `backend/pyproject.toml`、`frontend/package.json` 一致。

- 合并到 `master`：发布 `edge` 与 `sha-*` GHCR 镜像。
- 推送 `vX.Y.Z` Tag：验证版本一致后发布 `X.Y.Z`、`X.Y`、`latest`、`sha-*`，并创建 GitHub Release。
- 变更摘要维护在 [CHANGELOG.md](CHANGELOG.md)。

## 安全

- 浏览器登录使用 `HttpOnly`、`SameSite=Lax` Session Cookie，不再把 Session Token 保存到 `localStorage`。
- 登录连续失败会触发临时限流/锁定。
- 115 Cookie 和 Telegram Bot Token 不通过设置 API 回显。
- 敏感键由服务端固定 allowlist 判定，不信任前端传入的 `is_secret`。
- 115 Cookie 与 Telegram Bot Token 在 SQLite 中使用 AES-GCM 认证加密保存。
- Docker 运行进程为非 root，并启用 `no-new-privileges`。

> [!WARNING]
> 应用层加密降低了 SQLite 或备份文件被单独读取时的凭据暴露风险，但 `APP_SECRET_KEY` 与数据库同时泄露时无法提供同等保护。请限制 `data/`、备份文件和运行环境配置的访问权限，不要把这些材料同步到不可信位置。

如果发现安全问题，请不要直接提交包含利用细节、Cookie、Token 或其他敏感信息的公开 Issue。处理方式见 [SECURITY.md](SECURITY.md)。

## 参与贡献

欢迎提交 Issue 和 Pull Request。开发环境、分支与提交建议见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Roadmap / Issues

已知问题、工程化改进和后续计划统一维护在 [GitHub Issues](https://github.com/huhengbo/javdb115/issues)。

## License

本项目采用 [MIT License](LICENSE)。
