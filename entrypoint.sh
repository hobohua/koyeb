#!/bin/bash

PORT=${PORT:-8080}
UUID=${UUID:-$(cat /proc/sys/kernel/random/uuid)}

echo "============================================"
echo "  纯净 VLESS 服务启动中"
echo "  端口: ${PORT}"
echo "  UUID: ${UUID}"
echo "============================================"

mkdir -p /etc/xray /var/www
echo "OK" > /var/www/index.html

# 生成 xray 配置
# fallback: 非 WebSocket 请求（如健康检查）转发到 8081 端口的 HTTP 服务
cat > /etc/xray/config.json << XEOF
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": ${PORT},
      "protocol": "vless",
      "settings": {
        "clients": [
          {"id": "${UUID}"}
        ],
        "decryption": "none",
        "fallbacks": [
          {"dest": 8081, "xver": 0}
        ]
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

# 启动 Python HTTP 健康检查服务（端口 8081，作为 fallback 目标）
python3 -m http.server 8081 --directory /var/www --bind 127.0.0.1 &
HEALTH_PID=$!
echo "✅ 健康检查服务已启动 (PID: ${HEALTH_PID}, 端口: 8081)"

# 等一下确保健康检查服务就绪
sleep 1

# 启动 xray
echo "✅ 启动 xray VLESS 服务 (端口: ${PORT})..."
exec /usr/local/xray/xray run -config /etc/xray/config.json
