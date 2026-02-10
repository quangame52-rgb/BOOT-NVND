
import { GeminiBot } from "../types";

const SHEET_ID = '1eEWtn9Sw8zMCbq_BXVkFPr48I9rf25nAElAmHA5b03M';
const SHEET_NAME = 'BOT ALL';
// Cập nhật URL để lấy dữ liệu thô mượt hơn
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyLFlygap5Kl1FgmUeJzLa9_bqovi3YUoPjgQGDDkmPebqL03zKFW6bh_S6Uv2irk3p3A/exec'; 

export const fetchBotsFromGoogleSheet = async (): Promise<GeminiBot[]> => {
  try {
    const response = await fetch(READ_URL);
    if (!response.ok) throw new Error("Không thể truy cập Google Sheet. Hãy kiểm tra quyền chia sẻ (Bất kỳ ai có liên kết đều có thể xem).");
    
    const text = await response.text();
    // Phân tích JSON từ phản hồi gviz
    const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const json = JSON.parse(jsonString);
    
    const rows = json.table.rows;
    if (!rows || rows.length <= 1) return []; // Bỏ qua header

    // Bắt đầu từ hàng index 1 để bỏ qua tiêu đề cột
    return rows.slice(1).map((row: any, index: number) => {
      const cols = row.c;
      if (!cols || !cols[0]?.v) return null;
      
      const botName = cols[0]?.v?.toString().toUpperCase() || 'BOT CHƯA ĐẶT TÊN';
      const systemInstruction = cols[1]?.v?.toString() || '';
      const imageUrl = cols[4]?.v?.toString() || '';
      
      return {
        id: `sheet-bot-${index}-${Date.now()}`, 
        name: botName,
        systemInstruction: systemInstruction,
        userInstructions: cols[2]?.v?.toString() || 'Hỏi chuyên gia về dược liệu này.',
        gemLink: cols[3]?.v?.toString() || '',
        imageUrl: imageUrl.startsWith('http') ? imageUrl : '',
        description: cols[2]?.v?.toString().substring(0, 100) || 'Dữ liệu từ hệ thống đám mây',
        model: 'gemini-3-pro-preview',
        color: getRandomColor(index),
        isActive: true
      };
    }).filter((bot: any) => bot !== null && bot.name && bot.systemInstruction);
  } catch (error) {
    console.error("Lỗi khi đồng bộ Google Sheet:", error);
    throw error;
  }
};

export const appendBotToSheet = async (bot: Partial<GeminiBot>): Promise<boolean> => {
  try {
    const payload = {
      action: 'add',
      name: bot.name,
      systemInstruction: bot.systemInstruction,
      userInstructions: bot.userInstructions || '',
      gemLink: bot.gemLink || '',
      imageUrl: bot.imageUrl || ''
    };

    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return true; 
  } catch (error) {
    console.error("Lỗi khi ghi vào Sheet:", error);
    return false;
  }
};

export const deleteBotFromSheet = async (botName: string): Promise<boolean> => {
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete',
        name: botName
      }),
    });
    return true;
  } catch (error) {
    return false;
  }
};

const getRandomColor = (index: number) => {
  const colors = [
    'bg-indigo-600', 'bg-red-800', 'bg-amber-600', 
    'bg-emerald-600', 'bg-slate-900', 'bg-orange-600',
    'bg-rose-600', 'bg-cyan-600', 'bg-purple-600'
  ];
  return colors[index % colors.length];
};
