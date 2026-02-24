#!/bin/bash

PORT=${PORT:-8080}
UUID=${UUID:-$(cat /proc/sys/kernel/random/uuid)}

echo "============================================"
echo "  纯净 VLESS 服务启动中"
echo "  端口: ${PORT}"
echo "  UUID: ${UUID}"
echo "============================================"

# 创建健康检查页面
cat > /var/www/index.html << 'HTMLEOF'
<!DOCTYPE html>
<html><head><title>Service Status</title></head>
<body><h1>OK</h1><p>Service is running.</p></body>
</html>
HTMLEOF

# 生成 xray 配置
# 使用 fallback 机制：VLESS WebSocket 走 xray，普通 HTTP 请求走 busybox httpd（健康检查）
cat > /etc/xray/config.json << XEOF
{
  "log": {
    "loglevel": "warning"
  },
  "inbounds": [
    {
      "port": ${PORT},
      "protocol": "vless",
      "settings": {
        "clients": [
          {"id": "${UUID}"}
        ],
        "decryption": "none",
        "fallbacks": [
          {"dest": 8081}
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

# 启动 busybox httpd 作为健康检查服务（端口 8081，作为 xray 的 fallback）
httpd -f -p 8081 -h /var/www &
HTTPD_PID=$!
echo "✅ 健康检查服务已启动 (PID: ${HTTPD_PID}, 端口: 8081)"

# 启动 xray
echo "✅ 启动 xray VLESS 服务..."
exec /usr/local/xray/xray run -config /etc/xray/config.json
