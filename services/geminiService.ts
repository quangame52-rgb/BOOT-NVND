import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GeminiBot } from "../types";

export const generateBotResponse = async (
  bot: GeminiBot,
  prompt: string,
  images: string[] = [], // Mảng các chuỗi base64
  apiKey: string // Bắt buộc truyền API Key từ phía người dùng
): Promise<{ text: string; sources?: any[] }> => {
  try {
    if (!apiKey) {
      throw new Error("Chưa có API Key. Vui lòng đăng nhập/nhập Key.");
    }

    // Initialize with the user provided key
    const ai = new GoogleGenAI({ apiKey });
    
    const parts: any[] = [{ text: prompt }];
    
    // Thêm các phần hình ảnh vào request
    images.forEach(base64 => {
      const mimeType = base64.split(';')[0].split(':')[1];
      const data = base64.split(',')[1];
      parts.push({
        inlineData: {
          mimeType,
          data
        }
      });
    });

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: bot.model || 'gemini-2.5-flash', // Sử dụng model từ config bot hoặc default
      contents: { parts },
      config: {
        systemInstruction: bot.systemInstruction || "Bạn là một trợ lý hữu ích.",
        temperature: 0.8,
      },
    });

    const text = response.text || "Bot không có phản hồi.";
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks;

    return { text, sources };
  } catch (error: any) {
    console.error(`Error for bot ${bot.name}:`, error);
    // Return clean error message
    throw new Error(error.message || "Lỗi kết nối API.");
  }
};