import OpenAI from "openai";
import "dotenv/config";
import { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { Stream } from "openai/streaming.mjs";
import clg from "../../../utils/log.js";
import {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from "openai/resources/chat/completions.mjs";

interface LLMConfig {
  modelId: string;
  tools: Tool[];
  systemPrompt?: string;
  context?: string;
  streamHandler?: (chunk: any) => void;
}

class LLM {
  private llm: OpenAI;
  private modelId: string;
  private toolsValue: Tool[];
  private context?: string;
  private systemPrompt?: string;
  private messages: ChatCompletionMessageParam[] = [];
  private streamHandler?: (chunk: any) => void;

  constructor({
    modelId,
    tools,
    systemPrompt,
    context,
    streamHandler,
  }: LLMConfig) {
    this.llm = new OpenAI({
      apiKey: process.env.ARK_API_KEY,
      baseURL: process.env.ARK_BASE_URL,
    });
    this.modelId = modelId;
    this.toolsValue = tools;
    this.systemPrompt = systemPrompt;
    this.context = context;
    this.streamHandler = streamHandler;

    if (this.systemPrompt) {
      this.addSystemMessage(this.systemPrompt);
    }

    if (this.context) {
      this.addUserMessage(this.context);
    }
  }

  private _addMessage(
    message: OpenAI.Chat.Completions.ChatCompletionMessageParam
  ) {
    this.messages.push(message);
  }

  addUserMessage(content: string) {
    this._addMessage({
      role: "user",
      content,
    });
  }

  addToolCallsReqMessage(
    content: string,
    tool_calls: ChatCompletionMessageToolCall[]
  ) {
    this._addMessage({
      role: "assistant",
      content,
      tool_calls,
    });
  }

  addAssistantMessage(content: string) {
    this._addMessage({
      role: "assistant",
      content,
    });
  }

  addSystemMessage(content: string) {
    this._addMessage({
      role: "system",
      content,
    });
  }

  addToolMessage(content: string, tool_call_id: string) {
    this._addMessage({
      role: "tool",
      content,
      tool_call_id,
    });
  }

  private _listMessages() {
    return this.messages;
  }

  //Chat
  private async _chat(): Promise<ChatResponse> {
    try {
      clg("chat", this._listMessages());
      const stream = await this.llm.chat.completions
        .create({
          model: this.modelId,
          messages: this._listMessages(),
          tools: this.getToolsForOpenAI(),
          stream: true,
        })
        .catch((err) => {
          console.log(err);
          return err;
        });

      return await this._handleStream(stream);
    } catch (error) {
      throw error;
    }
  }

  // 流式输出的聊天方法
  private async _chatStream(): Promise<ChatResponse> {
    try {
      const stream = await this.llm.chat.completions
        .create({
          model: this.modelId,
          messages: this._listMessages(),
          tools: this.getToolsForOpenAI(),
          stream: true,
        })
        .catch((err) => {
          console.log(err);
          return err;
        });

      return await this._handleStreamWithCallback(stream);
    } catch (error) {
      throw error;
    }
  }

  private async _handleStream(res: Stream<any>) {
    let content = "";
    let toolCalls: ToolCall[] = [];

    // 用于累积未完成的工具调用数据
    let accumulatedToolCalls: any[] = [];

    for await (const chunk of res) {
      // 拼接完整的 content
      if (chunk.choices[0].delta.content) {
        content += chunk.choices[0].delta.content;
      }

      // 处理工具调用
      if (chunk.choices[0].delta.tool_calls?.length) {
        const toolCallDeltas = chunk.choices[0].delta.tool_calls;
        for (const toolCallDelta of toolCallDeltas) {
          const { index, function: fn } = toolCallDelta;

          // 确保有对应索引的工具调用累积对象
          if (!accumulatedToolCalls[index]) {
            accumulatedToolCalls[index] = {
              type: "function",
              id: toolCallDelta.id || `call_${index}`,
              function: { name: "", arguments: "" },
            };
          }

          // 累积函数名
          if (fn?.name) {
            accumulatedToolCalls[index].function.name += fn.name;
          }

          // 累积函数参数
          if (fn?.arguments) {
            accumulatedToolCalls[index].function.arguments += fn.arguments;
          }
        }
      }
    }

    // 整理最终的工具调用列表
    toolCalls = accumulatedToolCalls.filter(Boolean).map((tc) => {
      // 尝试解析函数参数为 JSON
      let parsedArgs = {};
      try {
        if (tc.function.arguments) {
          parsedArgs = JSON.parse(tc.function.arguments);
        }
      } catch (err) {
        // 解析错误，不打印日志
        clg(">>> parse args err <<<", err);
      }

      return {
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
          parsed_arguments: parsedArgs,
        },
      };
    });

    return {
      content,
      toolCalls,
    };
  }

  // 使用回调的流处理，用于流式输出
  private async _handleStreamWithCallback(res: Stream<any>) {
    let content = "";
    let toolCalls: ToolCall[] = [];

    // 用于累积未完成的工具调用数据
    let accumulatedToolCalls: any[] = [];

    for await (const chunk of res) {
      // 拼接完整的 content
      if (chunk.choices[0].delta.content) {
        const deltaContent = chunk.choices[0].delta.content;
        content += deltaContent;

        // 调用流处理函数
        if (this.streamHandler) {
          this.streamHandler({
            type: "content",
            data: deltaContent,
          });
        }
      }

      // 处理工具调用
      if (chunk.choices[0].delta.tool_calls?.length) {
        const toolCallDeltas = chunk.choices[0].delta.tool_calls;
        for (const toolCallDelta of toolCallDeltas) {
          const { index, function: fn } = toolCallDelta;

          // 确保有对应索引的工具调用累积对象
          if (!accumulatedToolCalls[index]) {
            accumulatedToolCalls[index] = {
              type: "function",
              id: toolCallDelta.id || `call_${index}`,
              function: { name: "", arguments: "" },
            };
          }

          // 累积函数名
          if (fn?.name) {
            accumulatedToolCalls[index].function.name += fn.name;
          }

          // 累积函数参数
          if (fn?.arguments) {
            accumulatedToolCalls[index].function.arguments += fn.arguments;
          }

          // 工具调用变化的流输出
          if (this.streamHandler && (fn?.name || fn?.arguments)) {
            this.streamHandler({
              type: "tool_call_delta",
              data: {
                index,
                id: toolCallDelta.id,
                name: fn?.name || "",
                arguments: fn?.arguments || "",
              },
            });
          }
        }
      }
    }

    // 整理最终的工具调用列表
    toolCalls = accumulatedToolCalls.filter(Boolean).map((tc) => {
      // 尝试解析函数参数为 JSON
      let parsedArgs = {};
      try {
        if (tc.function.arguments) {
          parsedArgs = JSON.parse(tc.function.arguments);
        }
      } catch (err) {
        // 解析错误，不打印日志
        clg(">>> parse args err <<<", err);
      }

      return {
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
          parsed_arguments: parsedArgs,
        },
      };
    });

    // 最终结果的流输出
    if (this.streamHandler) {
      this.streamHandler({
        type: "complete",
        data: { content, toolCalls },
      });
    }

    return {
      content,
      toolCalls,
    };
  }

  async loopChat() {
    return this._chat();
  }

  async loopChatStream() {
    return this._chatStream();
  }

  listMessages() {
    return this.messages;
  }

  async userChat(prompt: string): Promise<ChatResponse> {
    this.addUserMessage(prompt);
    return this._chat();
  }

  async userChatStream(prompt: string): Promise<ChatResponse> {
    this.addUserMessage(prompt);
    return this._chatStream();
  }

  async assistantChat(prompt: string): Promise<ChatResponse> {
    this.addAssistantMessage(prompt);
    return this._chat();
  }

  async systemChat(prompt: string): Promise<ChatResponse> {
    this.addSystemMessage(prompt);
    return this._chat();
  }

  async toolChat(res: ToolCallResult[]): Promise<ChatResponse> {
    res.forEach((i) => {
      this.addToolMessage(i.content, i.id);
    });
    return this._chat();
  }

  //Tools
  getToolsForOpenAI() {
    return this.toolsValue.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    }));
  }

  addTool(tool: Tool) {
    this.toolsValue.push(tool);
  }

  setTools(tools: Tool[]) {
    this.toolsValue = tools;
  }
}

export default LLM;
