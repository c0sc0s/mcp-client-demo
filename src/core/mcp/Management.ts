import MCPClient from "./McpClient.js";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages";

// 管理所有 MCP
class MCPManagement {
  private mcpClients: MCPClient[];
  private isProcessing: boolean = false;
  private tools: Tool[] = [];

  constructor(mcpClients: MCPClient[]) {
    this.mcpClients = mcpClients;
  }

  public getMCPClient(toolName: string): MCPClient[] {
    return this.mcpClients.filter((client) => client.hasToolWithName(toolName));
  }

  public getTools() {
    return this.tools;
  }

  public listTools() {
    if (!this.isProcessing) {
      return [];
    }
    return this.tools;
  }

  async start() {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    await Promise.all(this.mcpClients.map((i) => i.init()));
    this.tools = this.mcpClients.flatMap((mcpClient) => mcpClient.getTools());
  }

  async close() {
    await Promise.all(this.mcpClients.map((i) => i.close));
  }
}

export default MCPManagement;
