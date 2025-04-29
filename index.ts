import "dotenv/config";
import { createServer } from "./src/api/server.js";

// 定义服务器端口
const PORT = process.env.PORT || 3001;

async function main() {
  try {
    const app = createServer();

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
}

// 执行主函数
main().catch((err) => {
  console.error("Uncaught error:", err);
  process.exit(1);
});
