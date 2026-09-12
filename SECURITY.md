# Security Policy

## Supported versions

项目目前处于早期阶段，只维护默认分支上的最新版本。安全修复不会保证回移到历史提交或旧镜像。

## Reporting a vulnerability

请不要在公开 Issue 中提交可直接利用的漏洞细节、真实 Cookie、Token、密码、数据库文件或其他敏感信息。

优先使用 GitHub Security Advisory 的私密漏洞报告能力（如果仓库已启用）。如果该能力不可用，请先创建一个不包含敏感细节的 Issue，说明“需要私密沟通安全问题”，维护者会继续处理。

报告建议包含：

- 受影响的版本或提交。
- 问题类型与影响范围。
- 最小复现步骤（去除真实凭据）。
- 建议修复方向（如有）。

## Security considerations

本项目会接触以下敏感信息：

- Web 管理员密码与会话 Token。
- 115 Cookie 与扫码登录信息。
- Telegram Bot Token / Chat ID。
- 本地 SQLite 数据库中的运行配置和任务数据。

部署时请避免直接暴露到不可信公网，使用强密码和高熵 `APP_SECRET_KEY`，并妥善保护 `.env` 与数据目录。
