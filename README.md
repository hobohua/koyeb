# Pure VLESS Docker

轻量级纯 VLESS 代理容器，专为 PaaS 平台（Koyeb 等）设计。

## 特性
- 仅包含 xray-core，无 cloudflared
- 自动健康检查（busybox httpd fallback）
- 环境变量配置，即开即用

## 环境变量
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `UUID` | VLESS 用户 ID | 随机生成 |
| `PORT` | 监听端口 | 8080 |

## 部署到 Koyeb
1. Fork 本仓库
2. 等待 GitHub Actions 构建完成
3. 在 Koyeb 上使用镜像: `ghcr.io/你的用户名/仓库名:latest`
