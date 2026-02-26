
import { GeminiBot } from "../types";

// URL Web App của Google Apps Script (Cần update lại nếu bạn deploy script mới)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzmh3PrOJwDt35x1RwztJTNi0h52wooB6CXX5JAF0xO4wNMg5RC2nvKzyA1LHuwNjKhKQ/exec'; 

// URL để đọc dữ liệu Bot (vẫn giữ nguyên)
const SHEET_ID = '1eEWtn9Sw8zMCbq_BXVkFPr48I9rf25nAElAmHA5b03M';
const SHEET_NAME = 'BOT ALL';
const READ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(SHEET_NAME)}`;

export const fetchBotsFromGoogleSheet = async (): Promise<GeminiBot[]> => {
  try {
    const response = await fetch(READ_URL);
    if (!response.ok) throw new Error("Không thể truy cập Google Sheet.");
    
    const text = await response.text();
    const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S\w]+)\);/);
    if (!jsonMatch || !jsonMatch[1]) {
        throw new Error("Dữ liệu Sheet trả về không đúng định dạng.");
    }
    const json = JSON.parse(jsonMatch[1]);
    
    const rows = json.table.rows;
    if (!rows || rows.length <= 1) return []; // Bỏ qua header

    return rows.slice(1).map((row: any, index: number) => {
      const cols = row.c;
      if (!cols || !cols[0]?.v) return null;
      
      const botName = cols[0]?.v?.toString().toUpperCase() || 'BOT CHƯA ĐẶT TÊN';
      const systemInstruction = cols[1]?.v?.toString() || '';
      const imageUrl = cols[4]?.v?.toString() || '';
      const gemLink = cols[3]?.v?.toString() || '';
      
      return {
        id: `sheet-bot-${index}-${Date.now()}`, 
        name: botName,
        systemInstruction: systemInstruction,
        userInstructions: cols[2]?.v?.toString() || 'Hỏi chuyên gia về lĩnh vực này.',
        gemLink: gemLink,
        imageUrl: imageUrl.startsWith('http') ? imageUrl : '',
        description: cols[2]?.v?.toString().substring(0, 100) || 'Dữ liệu từ hệ thống đám mây',
        // QUAN TRỌNG: Đã đổi từ gemini-3-pro-preview sang gemini-2.5-flash để tránh lỗi 429 Quota Exceeded
        model: 'gemini-2.5-flash',
        color: getRandomColor(index),
        isActive: true
      };
    }).filter((bot: any) => bot !== null && bot.name && bot.systemInstruction);
  } catch (error) {
    console.error("Lỗi khi đồng bộ Google Sheet:", error);
    return [];
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

// --- USER AUTHENTICATION FUNCTIONS ---

export const registerUser = async (username: string, email: string, password: string): Promise<{success: boolean, message?: string}> => {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // dùng text/plain để tránh preflight check
      body: JSON.stringify({
        action: 'register',
        username,
        email,
        password
      }),
    });
    const result = await response.json();
    return { success: result.result === 'success', message: result.message };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};

export const submitPaymentInfo = async (name: string, email: string, phone: string, orderCode: string): Promise<{success: boolean, message?: string}> => {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'submit_payment',
        name,
        email,
        phone,
        orderCode
      }),
    });
    const result = await response.json();
    return { success: result.result === 'success', message: result.message };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};

export const loginUser = async (username: string, password: string): Promise<{success: boolean, message?: string, usage?: number, apiKey?: string}> => {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'login',
        username,
        password
      }),
    });
    const result = await response.json();
    if (result.result === 'success') {
        // Lưu ý: Backend GAS cần trả về field apiKey nếu có
        return { success: true, usage: result.usage, apiKey: result.apiKey || '' };
    }
    return { success: false, message: result.message };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
};

export const incrementUserUsage = async (username: string): Promise<boolean> => {
   try {
    await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Fire and forget (để nhanh hơn)
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'increment_usage',
        username
      }),
    });
    return true;
  } catch (error) {
    return false;
  }
}

// --- NEW ADMIN FUNCTIONS ---

export interface UserData {
    username: string;
    email: string;
    usage: number;
    apiKey?: string; // Field mới để chứa Key riêng
}

export const fetchAllUsers = async (): Promise<UserData[]> => {
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'get_users'
            }),
        });
        const result = await response.json();
        if (result.result === 'success') {
            return result.users;
        }
        return [];
    } catch (error) {
        console.error("Lỗi lấy danh sách user", error);
        return [];
    }
}

export const updateUserUsageInSheet = async (username: string, newUsage: number): Promise<boolean> => {
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'update_user_usage',
                username: username,
                usage: newUsage
            }),
        });
        const result = await response.json();
        return result.result === 'success';
    } catch (error) {
        return false;
    }
}

export const updateUserKeyInSheet = async (username: string, apiKey: string): Promise<boolean> => {
    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'update_user_key', // Backend GAS cần handle action này
                username: username,
                apiKey: apiKey
            }),
        });
        const result = await response.json();
        return result.result === 'success';
    } catch (error) {
        return false;
    }
}

export const checkPaymentStatus = async (orderCode: string): Promise<string> => {
  try {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'check_payment_status',
        orderCode
      }),
    });
    const result = await response.json();
    if (result.result === 'success') {
      return result.status; // 'PENDING_PAYMENT' or 'PAID'
    }
    return 'PENDING_PAYMENT';
  } catch (error) {
    console.error("Lỗi kiểm tra trạng thái thanh toán:", error);
    return 'PENDING_PAYMENT';
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
