FROM alpine:latest

# 安装 xray
RUN apk add --no-cache ca-certificates wget unzip bash busybox-extras && \
    wget -qO /tmp/xray.zip "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip" && \
    mkdir -p /usr/local/xray && \
    unzip /tmp/xray.zip -d /usr/local/xray && \
    chmod +x /usr/local/xray/xray && \
    rm /tmp/xray.zip && \
    mkdir -p /etc/xray /var/www

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
CMD ["/entrypoint.sh"]
