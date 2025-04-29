export interface ChatResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
    parsed_arguments: any;
  };
}

export interface ToolCallResult {
  id: string;
  name: string;
  content: string;
}

export interface LLMConfig {
  modelId: string;
  tools: any[];
  systemPrompt?: string;
  context?: string;
  streamHandler?: (chunk: any) => void;
}
