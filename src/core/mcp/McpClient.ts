import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import dotenv from "dotenv";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

dotenv.config();

interface MCPClientConfig {
  name: string;
  version?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// 定义工具执行结果的接口
interface ToolExecutionResult {
  [key: string]: any;
}

// 一个 MCPClient 对接一个 MCPServer
class MCPClient {
  private mcp: Client;
  private transport: StdioClientTransport | null = null;
  private tools: Tool[] = [];
  private command: string = "";
  private args: string[] = [];
  private env: Record<string, string> = {};
  private name: string = "";
  private version: string = "1.0.0";
  private isConnected: boolean = false;

  constructor({
    name,
    version = "1.0.0",
    command,
    args = [],
    env = {},
  }: MCPClientConfig) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.name = name;
    this.version = version;

    this.mcp = new Client({ name: this.name, version: this.version });
  }

  getTools() {
    return this.tools;
  }

  async init() {
    await this.connectToServer();
  }

  close() {
    this.transport?.close();
  }

  // 检查客户端是否有指定名称的工具
  hasToolWithName(toolName: string): boolean {
    return this.tools.some((tool) => tool.name === toolName);
  }

  // 运行指定名称的工具
  async runTool(
    toolName: string,
    args: Record<string, any>
  ): Promise<ToolExecutionResult> {
    if (!this.hasToolWithName(toolName)) {
      throw new Error(`Tool '${toolName}' not found in this MCP client`);
    }

    if (!this.isConnected) {
      throw new Error("MCP client is not connected");
    }

    try {
      // 调用 MCP 执行工具
      const result = await this.mcp.callTool({
        name: toolName,
        arguments: args,
      });

      return result;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Error running tool '${toolName}': ${error.message}`);
      }
      throw new Error(`Unknown error running tool '${toolName}'`);
    }
  }

  private async connectToServer() {
    try {
      if (this.isConnected) {
        return;
      }

      // 与 server 交互的 stdio 传输
      this.transport = new StdioClientTransport({
        command: this.command,
        args: this.args,
        env: this.env,
      });

      this.mcp.connect(this.transport);

      // 获取 server 的工具列表
      const toolsResult = await this.mcp.listTools();

      this.tools = toolsResult.tools.map((tool) => {
        // 验证 inputSchema 是否为有效的 JSON 或对象
        let validInputSchema;
        try {
          if (typeof tool.inputSchema === "string") {
            validInputSchema = JSON.parse(tool.inputSchema);
          } else {
            validInputSchema = tool.inputSchema;
          }
        } catch (err) {
          validInputSchema = { type: "object", properties: {} };
        }

        return {
          name: tool.name,
          description: tool.description,
          input_schema: validInputSchema,
        };
      });

      this.isConnected = true;
    } catch (e) {
      throw e;
    }
  }
}

export default MCPClient;
