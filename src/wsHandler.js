// 原版 wsHandler.js - VLESS 协议核心（完全复用，不做任何改动）
const { WebSocketServer, createWebSocketStream } = require("ws");
const net = require("net");
const { pipeline } = require("stream");

const SUCCESS_RESPONSE = Buffer.from([0x00, 0x00]);

const CONNECTION_CONFIG = { timeout: 5000, keepAlive: true, keepAliveInitialDelay: 10000, noDelay: true };
const RETRY_CONFIG = { maxRetries: 2, retryDelay: 1000 };

function createUUIDValidator(uuid) {
    const uuidBytes = Buffer.from(uuid.replace(/-/g, ""), "hex");
    return (id) => id.equals(uuidBytes);
}

function parseHost(msg, startIndex) {
    let ATYP = msg[startIndex];
    let host = null;
    let endIndex = startIndex;

    switch (ATYP) {
        case 1: // IPv4
            host = msg.slice(startIndex + 1, startIndex + 5).join(".");
            endIndex = startIndex + 5;
            break;
        case 2: // Domain
            const domainLength = msg[startIndex + 1];
            host = new TextDecoder().decode(msg.slice(startIndex + 2, startIndex + 2 + domainLength));
            endIndex = startIndex + 2 + domainLength;
            break;
        case 3: // IPv6
            const ipv6Bytes = msg.slice(startIndex + 1, startIndex + 17);
            host = Array.from(ipv6Bytes)
                .map((byte, i) => {
                    if (i % 2 === 0) {
                        return byte.toString(16).padStart(2, "0") + ipv6Bytes[i + 1].toString(16).padStart(2, "0");
                    } else {
                        return "";
                    }
                })
                .filter(s => s !== "")
                .join(":");
            endIndex = startIndex + 17;
            break;
        default:
            console.error("[ERROR] 无效的地址类型");
            return { host: null, endIndex: startIndex };
    }

    return { host, endIndex };
}

function setupWebSocketServer(server, uuid) {
    const wss = new WebSocketServer({ server });
    const validateUUID = createUUIDValidator(uuid);

    wss.on("connection", (ws) => {
        let connectionTimeout = setTimeout(() => {
            console.warn("[WARN] 连接超时");
            ws.close();
        }, 30000);

        ws.once("message", async (msg) => {
            clearTimeout(connectionTimeout);

            try {
                const id = msg.slice(1, 17);
                if (!validateUUID(id)) {
                    console.warn("[WARN] 无效的 UUID 连接");
                    ws.close();
                    return;
                }

                let i = msg.readUInt8(17) + 19;
                const port = msg.readUInt16BE(i);
                i += 2;

                const { host, endIndex } = parseHost(msg, i);
                if (!host) {
                    console.error("[ERROR] 无法解析目标主机");
                    ws.close();
                    return;
                }
                i = endIndex;

                const payload = msg.slice(i);

                ws.send(SUCCESS_RESPONSE);
                const wsStream = createWebSocketStream(ws);

                let retries = 0;

                const connect = () => {
                    const socket = net.connect({ host, port, ...CONNECTION_CONFIG }, () => {
                        socket.setMaxListeners(5);
                        socket.write(payload);
                    });

                    pipeline(wsStream, socket, (err) => {
                        if (err && err.code !== 'ECONNRESET' && err.code !== 'ETIMEDOUT') {
                            console.error("[ERROR] WebSocket -> TCP 传输错误:", err.message);
                        }
                        socket.destroy();
                    });

                    pipeline(socket, wsStream, (err) => {
                        if (err) console.error("[ERROR] TCP -> WebSocket 传输错误");
                        ws.close();
                    });

                    socket.on("error", (err) => {
                        console.error("[ERROR] TCP 连接错误");
                        if (retries < RETRY_CONFIG.maxRetries) {
                            retries++;
                            console.log(`[INFO] 重试连接 (${retries}/${RETRY_CONFIG.maxRetries})`);
                            setTimeout(connect, RETRY_CONFIG.retryDelay);
                        } else {
                            console.error("[ERROR] 达到最大重试次数");
                            ws.close();
                        }
                    });

                    socket.on("close", () => {
                        socket.removeAllListeners();
                        ws.close();
                    });
                };

                connect();
            } catch (err) {
                console.error("[ERROR] WebSocket 消息处理错误");
                ws.close();
            }
        });

        ws.on("close", () => {
            clearTimeout(connectionTimeout);
        });

        ws.on("error", (err) => {
            console.error("[ERROR] WebSocket 连接错误:", err.message);
            ws.close();
        });
    });
}

module.exports = { setupWebSocketServer };
