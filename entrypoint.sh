#!/bin/bash

PORT=${PORT:-8080}
UUID=${UUID:-$(cat /proc/sys/kernel/random/uuid)}

echo "============================================"
echo "  纯净 VLESS 服务启动中 (nginx + xray)"
echo "  对外端口: ${PORT}"
echo "  UUID: ${UUID}"
echo "============================================"

mkdir -p /etc/xray /run/nginx /var/www

# 健康检查页面
echo "OK" > /var/www/index.html

# ===== 生成 nginx 配置 =====
# nginx 监听主端口，处理两件事：
#   1. 普通 HTTP 请求 → 返回 200 OK（健康检查）
#   2. WebSocket 请求 → 转发到 xray（VLESS）
cat > /etc/nginx/http.d/default.conf << NGINXEOF
server {
    listen ${PORT};
    server_name _;

    # 健康检查 - 返回 200
    location / {
        root /var/www;
        index index.html;
    }

    # VLESS WebSocket 路径 - 转发到 xray
    location /${UUID} {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINXEOF

echo "✅ nginx 配置已生成"

# ===== 生成 xray 配置 =====
# xray 只监听内部端口，由 nginx 转发过来
cat > /etc/xray/config.json << XEOF
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 8081,
      "protocol": "vless",
      "settings": {
        "clients": [
          {"id": "${UUID}"}
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "ws",
        "wsSettings": {
          "path": "/${UUID}"
        }
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    }
  ]
}
XEOF

echo "✅ xray 配置已生成"

# ===== 启动服务 =====
# 先启动 xray（后台）
/usr/local/xray/xray run -config /etc/xray/config.json &
XRAY_PID=$!
sleep 1

if ! kill -0 $XRAY_PID 2>/dev/null; then
    echo "❌ xray 启动失败！"
    exit 1
fi
echo "✅ xray 已启动 (PID: ${XRAY_PID}, 内部端口: 8081)"

# 启动 nginx（前台，作为主进程）
echo "✅ nginx 已启动 (端口: ${PORT})"
echo "============================================"
echo "  所有服务就绪，等待连接..."
echo "============================================"
exec nginx -g "daemon off;"
