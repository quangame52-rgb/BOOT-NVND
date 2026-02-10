
export interface GeminiBot {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  userInstructions?: string;
  model: string;
  color: string;
  isActive: boolean;
  gemLink?: string;
  imageUrl?: string; // Link ảnh minh họa cho dược liệu
}

export interface BotResponse {
  botId: string;
  content: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  timestamp: number;
  sources?: any[];
}

export interface HistoryItem {
  id: string;
  userInput: string;
  images?: string[];
  responses: BotResponse[];
  timestamp: number;
}
