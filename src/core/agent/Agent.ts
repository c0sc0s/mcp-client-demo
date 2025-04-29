import LLM from "../llm/LLM.js";
import MCPClient from "../mcp/McpClient.js";
import "dotenv/config";
import MCPManagement from "../mcp/Management.js";
import clg from "../../../utils/log.js";

interface AgentConfig {
  model: string;
  mcpClients?: MCPClient[];
  systemPrompt?: string;
  context?: string;
  streamHandler?: (chunk: any) => void;
}

export default class Agent {
  private llm: LLM | null = null;
  private mcpManagement: MCPManagement | null = null;

  private model: string;
  private systemPrompt: string;
  private context?: string;
  private mcpClients: MCPClient[];
  private streamHandler?: (chunk: any) => void;

  isOK: boolean = false;

  constructor({
    model,
    mcpClients = [],
    systemPrompt = "",
    context = "",
    streamHandler,
  }: AgentConfig) {
    this.model = model;
    this.systemPrompt = systemPrompt;
    this.context = context;
    this.mcpClients = mcpClients;
    this.streamHandler = streamHandler;
  }

  async init() {
    this.isOK = false;
    await this._initMCP();
    await this._initLLM();
    this.isOK = true;
  }

  private async _initMCP() {
    this.mcpManagement = new MCPManagement(this.mcpClients);
    await this.mcpManagement.start();
  }

  private async _initLLM() {
    this.llm = new LLM({
      modelId: this.model,
      systemPrompt: this.systemPrompt,
      context: this.context,
      tools: this.mcpManagement?.listTools() || [],
      streamHandler: this.streamHandler,
    });
  }

  async continueChat() {
    await this.llm?.assistantChat("");
  }

  async invoke(prompt: string, maxTurns = 5) {
    try {
      if (!this.llm || !this.isOK) {
        return null;
      }

      let response = await this.llm.userChat(prompt);

      while (true) {
        clg("res", response);

        if (response.toolCalls.length > 0) {
          this.llm?.addToolCallsReqMessage(
            response.content,
            response.toolCalls
          );
          await this._handleChatResponse(response);
          response = await this.llm.loopChat();
        } else {
          this.llm?.addAssistantMessage(response.content);
          break;
        }
      }

      return response;
    } catch (error) {
      return null;
    }
  }

  async invokeWithStream(prompt: string, maxTurns = 5) {
    try {
      if (!this.llm || !this.isOK) {
        return null;
      }

      let response = await this.llm.userChatStream(prompt);

      let turnCount = 0;
      while (response.toolCalls.length > 0 && turnCount < maxTurns) {
        this.llm?.addAssistantMessage(response.content);

        if (this.streamHandler) {
          this.streamHandler({
            type: "tool_calls",
            data: response.toolCalls,
          });
        }

        await this._handleChatResponse(response);

        if (this.streamHandler) {
          this.streamHandler({
            type: "tool_results",
            data: "Processing tool calls...",
          });
        }

        response = await this.llm.loopChatStream();
        turnCount++;
      }

      return response;
    } catch (error) {
      if (this.streamHandler) {
        this.streamHandler({
          type: "error",
          data: `Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        });
      }
      return null;
    }
  }

  private async _handleChatResponse(response: ChatResponse) {
    const toolCalls = response.toolCalls;
    await this._toolCallLoop(toolCalls);
  }

  private async _toolCallLoop(toolCalls: ToolCall[]) {
    for (const tc of toolCalls) {
      const res = await this._executeToolCall(tc);
      this.llm?.addToolMessage(res.content, tc.id);
    }
  }

  private async _executeToolCall(toolCall: ToolCall): Promise<ToolCallResult> {
    const { id, function: fn } = toolCall;
    const { name, parsed_arguments } = fn;

    const res: ToolCallResult = {
      id,
      name,
      content: "",
    };

    try {
      const client = this.mcpManagement?.getMCPClient(name)?.[0];

      if (!client) {
        return {
          ...res,
          content: JSON.stringify({
            error: `No MCP client found for tool: ${name}`,
          }),
        };
      }

      const result = await client.runTool(name, parsed_arguments);

      return {
        ...res,
        content: JSON.stringify(result),
      };
    } catch (error) {
      return {
        ...res,
        content: JSON.stringify({
          error: `Error executing tool call: ${name}`,
        }),
      };
    }
  }
}
