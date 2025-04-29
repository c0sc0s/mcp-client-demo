import express from "express";
import cors from "cors";
import Agent from "../core/agent/Agent.js";
import MCPClient from "../core/mcp/McpClient.js";
import "dotenv/config";

export const createServer = () => {
  const app = express();

  // 配置中间件
  app.use(cors());
  app.use(express.json());

  // 创建 Agent 实例
  const agentConfig = {
    model: process.env.ARK_MODEL_ID!,
    mcpClients: [
      new MCPClient({
        name: "amap-maps",
        command: "npx",
        args: ["-y", "@amap/amap-maps-mcp-server"],
        env: {
          AMAP_MAPS_API_KEY: process.env.AMAP_MAPS_API_KEY!,
        },
      }),
    ],
    systemPrompt: "你是一个有帮助的AI助手。",
  };

  // 初始化 Agent
  const agent = new Agent(agentConfig);
  let agentInitialized = false;

  // 初始化 Agent
  const initAgent = async () => {
    if (!agentInitialized) {
      try {
        await agent.init();
        agentInitialized = true;
        console.log("Agent initialized successfully");
      } catch (error) {
        console.error("Failed to initialize agent:", error);
      }
    }
  };

  // 开始初始化
  initAgent();

  // 聊天接口 - JSON 响应
  app.post("/api/chat", async (req, res) => {
    try {
      if (!agentInitialized) {
        return res.status(503).json({
          error: "Agent is still initializing. Please try again shortly.",
        });
      }

      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      console.log(
        `Received chat request: "${message.substring(0, 50)}${
          message.length > 50 ? "..." : ""
        }"`
      );

      const startTime = Date.now();
      const response = await agent.invoke(message);
      const endTime = Date.now();

      console.log(`Chat request completed in ${(endTime - startTime) / 1000}s`);

      if (!response) {
        return res.status(500).json({
          error: "Failed to generate response",
          response: {
            content:
              "Sorry, I'm having trouble generating a response. Please try again.",
            toolCalls: [],
          },
        });
      }

      res.json({ response });
    } catch (error) {
      console.error("Error in chat endpoint:", error);
      res.status(500).json({
        error: "Internal server error",
        response: {
          content:
            "An error occurred while processing your request. Please try again later.",
          toolCalls: [],
        },
      });
    }
  });

  // 健康检查
  app.get("/health", (req, res) => {
    res.json({ status: "ok", initialized: agentInitialized });
  });

  return app;
};
