# javdb115

JavDB 演员订阅和 115 离线下载自动化工具。

这个项目是一个移动端优先的 Web 工具。它可以订阅 JavDB 演员，按标签发现新作品，按规则筛选磁力链接，提交到 115 离线下载，并在下载完成后自动整理 115 网盘目录。

## 功能

- 带登录保护的 Web 管理面板。
- JavDB 发现页：最新作品、搜索、演员详情、作品详情、预览图、评论、相似作品和排行榜。
- 演员订阅：支持有码、无码、可播放、含磁链、含字幕、单体作品等 JavDB 标签过滤。
- 磁力筛选规则：支持最小体积、必须包含关键词、排除关键词。
- 作品详情手动提交离线下载，重复作品会弹确认，确认后可强制重新提交。
- 磁力名称可点击 `magnet:` 链接，可唤起本机下载工具，不强绑定 115。
- 每分钟只轮询未完成的 115 离线任务，避免大量调用 115。
- 下载完成后自动整理 115 文件：重命名主视频、保留字幕、保留番号后缀 `-C`、`-U`、`-UC`、删除广告文件，并删除原始离线下载目录。
- 任务状态机和任务事件记录，可在作品详情里查看任务历史。
- 最近任务列表显示演员、海报、状态、磁力、错误信息和整理后的目录名称。
- 115 扫码登录，支持选择登录设备类型，并自动保存 Cookie。
- 115 目录选择器，用于配置下载临时目录和整理完成目录。
- Telegram 通知，设置页提供连接检查，自动写入 Bot 命令菜单，支持 `/start` 绑定通知会话。
- Docker 健康检查接口：`/api/health`。

## 技术栈

- 后端：Python 3.12+、FastAPI、Pydantic、SQLite。
- 前端：React 19、TypeScript、Vite、Tailwind CSS。
- JavDB App API：使用签名请求直接访问移动端接口。
- 部署：Docker 多阶段构建、Docker Compose。

## 主要第三方库

后端：

- `fastapi`：HTTP API。
- `uvicorn[standard]`：ASGI 服务。
- `pydantic`：接口契约和配置校验。
- `httpx`：HTTP 客户端。
- `p115client`：115 网盘 API、离线任务和扫码登录。
- `beautifulsoup4`：必要时解析 JavDB 返回内容。
- `croniter`：Cron 表达式调度。
- `pytest`、`ruff`、`mypy`：测试、Lint 和类型检查。

前端：

- `react`、`react-dom`：UI 运行时。
- `vite`：开发服务器和生产构建。
- `typescript`：静态类型。
- `tailwindcss`、`postcss`、`autoprefixer`：样式构建。
- `lucide-react`：图标。
- `eslint`、`typescript-eslint`、`eslint-plugin-react-hooks`：前端检查。

## 目录结构

```text
backend/
  app/
    adapters/       # JavDB、115、Telegram 适配器
    api/            # FastAPI 路由
    repositories/   # SQLite 持久化
    services/       # 业务流程
    schema.sql      # SQLite 表结构
  tests/            # 后端测试
frontend/
  src/
    components/     # 可复用 UI 组件
    pages/          # 页面和底部 Tab
    lib/            # 前端辅助函数
Dockerfile
docker-compose.yml
.env.example
```

## 配置

Docker Compose 部署时，可以复制 `.env.example` 为 `.env`；本地运行时也可以直接导出环境变量。

必填：

- `APP_ADMIN_PASSWORD`：Web 登录密码。
- `APP_SECRET_KEY`：登录 Token 签名密钥。

可选：

- `APP_ADMIN_USERNAME`：Web 登录用户名，默认 `admin`。
- `APP_DATABASE_PATH`：SQLite 数据库路径，默认 `data/app.sqlite3`；Docker 中使用 `/data/app.sqlite3`。
- `APP_SESSION_TTL_HOURS`：登录有效期，默认 `24` 小时。
- `APP_ACTOR_MOVIE_CHECK_LIMIT`：每次订阅检查读取演员作品的数量，默认 `3`。

Web 设置页里的运行时配置：

- `p115_cookie`：115 Cookie，可手动填写，也可通过扫码登录自动写入。
- `p115_download_dir_id`：115 离线下载临时目录。
- `p115_completed_dir_id`：115 整理完成目录。
- `check_cron`：演员订阅检查 Cron，默认 `0 */6 * * *`。
- `filter_rules`：磁力筛选规则 JSON。
- `telegram_bot_token`：Telegram Bot Token，发送 Telegram 通知和配置 Bot 菜单时必填。
- `telegram_chat_id`：Telegram Chat ID，可手动填写，也可在 Telegram 里向 Bot 发送 `/start` 自动绑定。
- Telegram 连接检查：校验已保存的 `telegram_bot_token` 是否可用，并自动写入 `/start`、`/help`、`/status`、`/check` 命令菜单。

不要提交 `.env`、SQLite 数据库、日志、截图、构建产物或 115 Cookie。项目 `.gitignore` 已经排除了常见运行态文件。

## 本地开发

后端：

```bash
cd backend
uv venv .venv --python python3.13
uv pip install --python .venv/bin/python -e ".[dev]"
APP_ADMIN_PASSWORD=change-me \
APP_SECRET_KEY=dev-secret \
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

前端：

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

打开：

```text
http://127.0.0.1:5173
```

Vite 开发服务器会把 `/api` 代理到 `http://127.0.0.1:8080`。

## Docker 部署

创建 `.env`：

```bash
cp .env.example .env
```

至少修改：

```dotenv
APP_ADMIN_PASSWORD=replace-with-a-strong-password
APP_SECRET_KEY=replace-with-a-long-random-secret
```

构建并启动：

```bash
docker compose up -d --build
```

访问：

```text
http://<server-ip>:8080
```

`docker-compose.yml` 会把持久化数据保存到宿主机的 `./data` 目录。

常用命令：

```bash
docker compose logs -f
docker compose ps
docker compose down
```

健康检查：

```bash
curl http://127.0.0.1:8080/api/health
```

## 校验

后端：

```bash
backend/.venv/bin/ruff check backend/app backend/tests
backend/.venv/bin/mypy backend/app
backend/.venv/bin/python -m compileall -q backend/app backend/tests
backend/.venv/bin/python -m pytest backend/tests -q
```

前端：

```bash
cd frontend
npm run lint
npm run build
```
