
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GeminiBot } from "../types";

export const generateBotResponse = async (
  bot: GeminiBot,
  prompt: string,
  images: string[] = [] // Mảng các chuỗi base64
): Promise<{ text: string; sources?: any[] }> => {
  try {
    // Fix: Adhere to Google GenAI guidelines for API key initialization by using process.env.API_KEY directly
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
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
      model: 'gemini-3-pro-preview', // Model Pro hỗ trợ thị giác máy tính cực tốt
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
    throw new Error(error.message || "Lỗi kết nối API.");
  }
};