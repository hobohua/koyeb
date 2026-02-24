const http = require("http");
const os = require("os");
const { setupWebSocketServer } = require("./wsHandler");

const UUID = process.env.UUID || "";
const PORT = process.env.PORT || "8080";
const NAME = process.env.NAME || os.hostname();

if (!UUID || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(UUID)) {
  console.error("[ERROR] 缺少有效的 UUID 环境变量");
  process.exit(1);
}

// 生成 VLESS 连接信息（在访问 /{UUID} 时返回）
function generateVlessInfo(uuid, host, name) {
  const path = encodeURIComponent(`/${uuid}`);
  return `vless://${uuid}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=${path}#${name}`;
}

const server = http.createServer((req, res) => {
  try {
    if (req.url === "/") {
      // 健康检查 - 返回 200
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("OK\n");
    } else if (req.url === `/${UUID}`) {
      // 返回 VLESS 连接链接
      const host = req.headers.host || "localhost";
      const vlessURL = generateVlessInfo(UUID, host, NAME);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(vlessURL + "\n");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found\n");
    }
  } catch (err) {
    console.error("[ERROR] HTTP 请求处理错误:", err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error\n");
  }
});

server.listen(Number(PORT), () => {
  console.log(`[INFO] 纯净 VLESS 服务已启动 - 端口: ${PORT}`);
  console.log(`[INFO] UUID: ${UUID}`);
  console.log(`[INFO] 健康检查: http://localhost:${PORT}/`);
});

// 在同一个 HTTP 服务器上挂载 WebSocket（VLESS 协议）
setupWebSocketServer(server, UUID.replace(/-/g, ""));

process.on("uncaughtException", (err) => {
  console.error("[FATAL] 未捕获异常:", err.message);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] Promise 异常:", reason);
  process.exit(1);
});
