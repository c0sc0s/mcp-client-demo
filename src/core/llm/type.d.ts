interface LLMConfig {
  modelId: string;
  tools: Tool[];
  systemPrompt: string;
  context?: string;
}

type ChatMessageRole =
  | "function"
  | "user"
  | "assistant"
  | "system"
  | "tool"
  | "developer";

interface ChatMessage {
  role: ChatMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
}

interface ChatResponse {
  content: string;
  toolCalls: ChatCompletionMessageToolCall[];
}

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
    parsed_arguments: Record<string, any>;
  };
}
