import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GeminiBot } from "../types";

// KEY HỆ THỐNG MẶC ĐỊNH (Hardcoded theo yêu cầu)
const SYSTEM_API_KEY = "AIzaSyDNjJsScJCwqX97nmlLExgMbexx7T79cYg";

export const generateBotResponse = async (
  bot: GeminiBot,
  prompt: string,
  images: string[] = [], 
  userPersonalApiKey?: string // Key riêng được Admin gán cho User
): Promise<{ text: string; sources?: any[] }> => {
  try {
    // Thứ tự ưu tiên: 
    // 1. Key riêng của User (do Admin cấp)
    // 2. Key hệ thống mặc định
    // 3. Fallback sang biến môi trường (nếu có)
    const apiKey = userPersonalApiKey || SYSTEM_API_KEY || process.env.API_KEY;

    if (!apiKey) {
      throw new Error("Hệ thống chưa có API Key khả dụng.");
    }

    // Initialize with the resolved key
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
      model: bot.model || 'gemini-2.5-flash', 
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
    throw new Error(error.message || "Lỗi kết nối API hoặc Key không hợp lệ.");
  }
};