import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Send, RefreshCw, Trash2, Settings2, Bot, 
  X, Zap, Cpu, ArrowLeft, RotateCcw,
  CloudDownload, Save, CheckCircle2, Home, ArrowRight, Eye, AlertCircle,
  User, Crown, ShieldAlert, Power, Image as ImageIcon, Link as LinkIcon, Terminal,
  MessageSquare, ExternalLink, Key, LogIn, Lock, Globe, UserPlus, FileKey, Mail, MessageCircle,
  Users, Edit3, AlertTriangle, Phone
} from 'lucide-react';
import { GeminiBot, HistoryItem, BotResponse } from './types';
import { generateBotResponse } from './services/geminiService';
import { fetchBotsFromGoogleSheet, appendBotToSheet, deleteBotFromSheet, loginUser, registerUser, incrementUserUsage, fetchAllUsers, updateUserUsageInSheet, UserData } from './services/googleSheetService';

const ADMIN_PASSWORD = '791522Mm@123';
const TRIAL_LIMIT = 3;
const ZALO_GROUP_URL = "https://zalo.me/g/vqwndd990";

const DEFAULT_BOTS: GeminiBot[] = [
  {
    id: 'dt-ha-thao',
    name: 'ĐÔNG TRÙNG HẠ THẢO',
    description: 'Chuyên gia tư vấn về công dụng và cách dùng Đông Trùng Hạ Thảo.',
    systemInstruction: 'Bạn là chuyên gia về Đông Trùng Hạ Thảo. Hãy tư vấn chi tiết về nguồn gốc, thành phần saponin, cordycepin và cách chế biến tối ưu.',
    userInstructions: 'Hỏi về cách phân biệt thật giả hoặc liều lượng dùng mỗi ngày.',
    model: 'gemini-2.5-flash',
    color: 'bg-orange-600',
    isActive: true,
  }
];

const formatImageUrl = (url: string) => {
  if (!url) return '';
  if (!url.includes('drive.google.com')) return url;
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  return url;
};

// Định nghĩa Auth Mode
type AuthMode = 'LOGIN' | 'REGISTER' | 'API_KEY';

export default function App() {
  const [bots, setBots] = useState<GeminiBot[]>(() => {
    const saved = localStorage.getItem('gemini_hub_bots');
    try { return saved ? JSON.parse(saved) : DEFAULT_BOTS; } catch { return DEFAULT_BOTS; }
  });

  // --- AUTH STATE ---
  const [authMode, setAuthMode] = useState<AuthMode>('LOGIN');
  
  // 1. Registered User State
  const [currentUser, setCurrentUser] = useState<{username: string, usage: number} | null>(() => {
    const saved = localStorage.getItem('gemini_current_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  // 2. Direct API Key State
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_user_api_key') || '');
  
  // Login/Register Form Inputs
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [emailInput, setEmailInput] = useState(''); // Thêm state cho Email
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  // Admin State
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState('');
  
  // Admin User Management State
  const [showUserPanel, setShowUserPanel] = useState(false);
  const [userList, setUserList] = useState<UserData[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // App UI State
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [userInput, setUserInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [editingBot, setEditingBot] = useState<GeminiBot | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);
  
  // Modal State
  const [showLimitModal, setShowLimitModal] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistence
  useEffect(() => { localStorage.setItem('gemini_hub_bots', JSON.stringify(bots)); }, [bots]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);
  useEffect(() => {
    if (editingBot) setFormImageUrl(editingBot.imageUrl || '');
    else setFormImageUrl('');
  }, [editingBot, showConfig]);

  // Auth Persistence
  useEffect(() => {
    if (currentUser) localStorage.setItem('gemini_current_user', JSON.stringify(currentUser));
    else localStorage.removeItem('gemini_current_user');
  }, [currentUser]);

  // Sync Sheet on Login (User or Key)
  useEffect(() => {
    if (currentUser || apiKey) handleSyncSheet();
  }, [currentUser, apiKey]);
  
  // Load Users when User Panel opens
  useEffect(() => {
      if (showUserPanel && isAdmin) {
          handleLoadUsers();
      }
  }, [showUserPanel, isAdmin]);

  // Helper: Reset inputs when switching modes
  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthError('');
    setUsernameInput('');
    setPasswordInput('');
    setEmailInput('');
  };

  // Helper: Email Validation Regex
  const isValidEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  // --- AUTH HANDLERS ---

  const handleRegister = async () => {
    if (!usernameInput.trim() || !passwordInput.trim() || !emailInput.trim()) { 
      setAuthError('Vui lòng nhập đầy đủ thông tin (User, Email, Password).'); 
      return; 
    }
    
    if (!isValidEmail(emailInput)) {
      setAuthError('Định dạng Email không hợp lệ.');
      return;
    }

    setAuthLoading(true); setAuthError('');
    const res = await registerUser(usernameInput, emailInput, passwordInput);
    setAuthLoading(false);
    
    if (res.success) {
      alert("Đăng ký thành công! Vui lòng đăng nhập.");
      switchAuthMode('LOGIN');
    } else {
      setAuthError(res.message || "Lỗi đăng ký.");
    }
  };

  const handleLogin = async () => {
    if (!usernameInput.trim() || !passwordInput.trim()) { setAuthError('Vui lòng nhập đầy đủ thông tin.'); return; }
    setAuthLoading(true); setAuthError('');
    const res = await loginUser(usernameInput, passwordInput);
    setAuthLoading(false);
    if (res.success) {
      setCurrentUser({ username: usernameInput, usage: res.usage || 0 });
      // Clear API Key mode if active
      setApiKey(''); localStorage.removeItem('gemini_user_api_key');
      // CRITICAL FIX: Ensure Admin mode is OFF
      setIsAdmin(false);
    } else {
      setAuthError(res.message || "Lỗi đăng nhập.");
    }
  };

  const handleSaveApiKey = () => {
    const key = apiKeyInput.trim();
    if (!key) return;
    localStorage.setItem('gemini_user_api_key', key);
    setApiKey(key);
    // Clear User mode if active
    setCurrentUser(null);
    // CRITICAL FIX: Ensure Admin mode is OFF when using API Key
    setIsAdmin(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setApiKey('');
    localStorage.removeItem('gemini_user_api_key');
    localStorage.removeItem('gemini_current_user');
    setIsAdmin(false);
    setActiveBotId(null);
    setHistory([]);
  };

  const handleAdminLogin = () => {
    if (adminPassInput === ADMIN_PASSWORD) {
      setIsAdmin(true); setShowAdminLogin(false); setAdminPassInput(''); triggerSuccessToast();
    } else { alert("Sai mật khẩu Admin!"); }
  };
  
  // --- USER MANAGEMENT HANDLERS ---
  const handleLoadUsers = async () => {
      setLoadingUsers(true);
      const users = await fetchAllUsers();
      setUserList(users);
      setLoadingUsers(false);
  };
  
  const handleUsageChange = (index: number, newUsage: number) => {
      const newList = [...userList];
      newList[index].usage = newUsage;
      setUserList(newList);
  };
  
  const handleSaveUserUsage = async (user: UserData) => {
      const success = await updateUserUsageInSheet(user.username, user.usage);
      if (success) {
          triggerSuccessToast();
      } else {
          alert("Lỗi khi cập nhật!");
      }
  };

  // --- BOT ACTIONS ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => { setSelectedImages(prev => [...prev, reader.result as string]); };
      reader.readAsDataURL(file);
    });
    e.target.value = ''; 
  };

  const removeSelectedImage = (index: number) => { setSelectedImages(prev => prev.filter((_, i) => i !== index)); };

  const handleRunCommand = async () => {
    if (!activeBot || (!userInput.trim() && selectedImages.length === 0) || isProcessing) return;

    // RULE: User Check Limit
    if (currentUser && !apiKey && !isAdmin) {
      if (currentUser.usage >= TRIAL_LIMIT) {
        setShowLimitModal(true); // Show custom modal instead of alert
        return;
      }
    }

    setIsProcessing(true);
    const historyId = Date.now().toString();
    const currentInput = userInput;
    const currentImages = [...selectedImages];
    
    setUserInput(''); setSelectedImages([]);

    const initialResponse: BotResponse = { botId: activeBot.id, content: '', status: 'loading', timestamp: Date.now() };

    setHistory(prev => [{ id: historyId, userInput: currentInput, images: currentImages, responses: [initialResponse], timestamp: Date.now() }, ...prev]);

    try {
      // Logic: Nếu có Key riêng -> Dùng Key đó. Nếu không -> Dùng Key hệ thống (Service sẽ tự fallback)
      const result = await generateBotResponse(activeBot, currentInput, currentImages, apiKey);
      
      updateHistoryStatus(historyId, activeBot.id, result.text, 'success', result.sources);

      // Increment usage for Account Mode
      if (currentUser && !apiKey) {
        const newUsage = currentUser.usage + 1;
        setCurrentUser({ ...currentUser, usage: newUsage });
        incrementUserUsage(currentUser.username); // Async background update
      }

    } catch (err: any) {
      updateHistoryStatus(historyId, activeBot.id, `Lỗi: ${err.message}`, 'error');
    }
    setIsProcessing(false);
  };

  const updateHistoryStatus = (historyId: string, botId: string, content: string, status: BotResponse['status'], sources?: any[]) => {
    setHistory(prev => prev.map(item => {
      if (item.id === historyId) {
        return { ...item, responses: item.responses.map(resp => resp.botId === botId ? { ...resp, content, status, timestamp: Date.now(), sources } : resp) };
      }
      return item;
    }));
  };

  const handleSyncSheet = async (force: boolean = false) => {
    if (isSyncing) return;
    setIsSyncing(true); setSyncError(null);
    try {
      const sheetBots = await fetchBotsFromGoogleSheet();
      if (sheetBots && sheetBots.length > 0) {
        setBots(sheetBots);
        if (force) triggerSuccessToast();
      } else { setSyncError("Không tìm thấy dữ liệu bot trên Google Sheet."); }
    } catch (err) { setSyncError("Lỗi kết nối Server."); } finally { setIsSyncing(false); }
  };

  const triggerSuccessToast = () => { setShowSuccessToast(true); setTimeout(() => setShowSuccessToast(false), 2000); };

  const saveBot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAdmin) return;
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const rawName = (formData.get('name') as string || '').trim().toUpperCase();
    
    if (!rawName) { alert("Vui lòng nhập Tên Bot!"); setIsSaving(false); return; }

    const botData: GeminiBot = {
      id: editingBot?.id || `bot-${Date.now()}`,
      name: rawName,
      description: (formData.get('description') as string || '').trim(),
      systemInstruction: (formData.get('systemInstruction') as string || '').trim(),
      userInstructions: (formData.get('userInstructions') as string || '').trim(),
      color: (formData.get('color') as string || 'bg-indigo-600'),
      imageUrl: (formData.get('imageUrl') as string || '').trim(),
      gemLink: (formData.get('gemLink') as string || '').trim(),
      model: (formData.get('model') as string || 'gemini-2.5-flash'),
      isActive: true
    };

    try {
      if (editingBot) setBots(prev => prev.map(b => b.id === editingBot.id ? botData : b));
      else setBots(prev => [botData, ...prev]);
      await appendBotToSheet(botData);
      setShowConfig(false); setEditingBot(null); triggerSuccessToast();
    } catch (err) { alert("Lỗi khi lưu."); } finally { setIsSaving(false); }
  };

  const deleteBot = async (e: React.MouseEvent, bot: GeminiBot) => {
    e.preventDefault(); e.stopPropagation();
    if (!isAdmin) return;
    if (confirm(`Xóa Bot: ${bot.name}?`)) {
      const newBots = bots.filter(b => b.id !== bot.id);
      setBots(newBots); localStorage.setItem('gemini_hub_bots', JSON.stringify(newBots));
      if (activeBotId === bot.id) setActiveBotId(null);
      deleteBotFromSheet(bot.name).catch(console.error);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.classList.add('hidden');
    const parent = e.currentTarget.parentElement;
    if (parent && !parent.querySelector('.img-error-placeholder')) {
      const placeholder = document.createElement('div');
      placeholder.className = "img-error-placeholder w-full h-full flex items-center justify-center bg-slate-800 text-slate-600";
      placeholder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/></svg>`;
      parent.appendChild(placeholder);
    }
  };

  // --- VIEW: LOGIN / REGISTER / API KEY ---
  // Allow access if logged in as user OR has API key OR is Admin
  const isLoggedIn = !!currentUser || !!apiKey || isAdmin;

  if (!isLoggedIn) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black/95 p-4 relative overflow-hidden">
        {/* Nút Admin Login ở góc */}
        <button 
          onClick={() => setShowAdminLogin(true)} 
          className="absolute top-6 right-6 p-2 text-slate-700 hover:text-white transition-colors z-20 hover:bg-white/5 rounded-lg"
          title="Admin Login"
        >
          <ShieldAlert className="w-5 h-5" />
        </button>

        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600 rounded-full blur-[150px] animate-pulse"></div>
           <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[150px] animate-pulse"></div>
        </div>
        
        <div className="glass-card rounded-[2.5rem] p-8 md:p-10 w-full max-w-[450px] shadow-3xl space-y-6 text-center border-white/10 relative z-10 animate-in fade-in zoom-in">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-2xl flex items-center justify-center shadow-2xl rotate-3">
               {authMode === 'API_KEY' ? <Key className="text-white w-8 h-8"/> : <User className="text-white w-8 h-8"/>}
            </div>
          </div>
          
          <div className="space-y-1">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter italic">
              {authMode === 'LOGIN' && 'ĐĂNG NHẬP'}
              {authMode === 'REGISTER' && 'ĐĂNG KÝ'}
              {authMode === 'API_KEY' && 'SỬ DỤNG KEY'}
            </h2>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">GEMINI AI HUB</p>
            <a href={ZALO_GROUP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider transition-colors mt-2 bg-blue-500/10 px-3 py-1.5 rounded-full border border-blue-500/20">
               <MessageCircle className="w-3 h-3" /> Tham gia nhóm Zalo
            </a>
          </div>

          {/* Tab Switcher */}
          <div className="flex p-1 bg-white/5 rounded-xl">
             <button onClick={() => switchAuthMode('LOGIN')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${authMode === 'LOGIN' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Đăng nhập</button>
             <button onClick={() => switchAuthMode('REGISTER')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${authMode === 'REGISTER' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>Đăng ký</button>
             <button onClick={() => switchAuthMode('API_KEY')} className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition-all ${authMode === 'API_KEY' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>API Key</button>
          </div>

          {/* Forms */}
          <div className="space-y-4">
             {authError && <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-xs font-bold">{authError}</div>}

             {authMode === 'LOGIN' && (
               <>
                 <div className="space-y-3">
                    <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Tên tài khoản (User)..." className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-5 text-sm focus:border-indigo-500 outline-none text-white transition-all" />
                    <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Mật khẩu..." className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-5 text-sm focus:border-indigo-500 outline-none text-white transition-all" />
                 </div>
                 <button onClick={handleLogin} disabled={authLoading} className="w-full py-4 bg-white text-black hover:bg-slate-200 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
                   {authLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <LogIn className="w-4 h-4"/>}
                   BẮT ĐẦU
                 </button>
               </>
             )}

             {authMode === 'REGISTER' && (
                <>
                  <div className="space-y-3">
                     <div className="relative">
                       <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                       <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} placeholder="Tên tài khoản..." className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-5 text-sm focus:border-indigo-500 outline-none text-white transition-all" />
                     </div>
                     <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input value={emailInput} onChange={(e) => setEmailInput(e.target.value)} placeholder="Địa chỉ Email..." type="email" className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-5 text-sm focus:border-indigo-500 outline-none text-white transition-all" />
                     </div>
                     <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="password" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} placeholder="Mật khẩu..." className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-5 text-sm focus:border-indigo-500 outline-none text-white transition-all" />
                     </div>
                  </div>
                  <button onClick={handleRegister} disabled={authLoading} className="w-full py-4 bg-white text-black hover:bg-slate-200 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2">
                    {authLoading ? <RefreshCw className="w-4 h-4 animate-spin"/> : <UserPlus className="w-4 h-4"/>}
                    TẠO TÀI KHOẢN
                  </button>
                  <p className="text-[10px] text-slate-500">* Tài khoản mới được miễn phí 3 lần chat.</p>
                </>
             )}

             {authMode === 'API_KEY' && (
                <>
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 text-left flex items-center gap-3">
                     <div className="p-2 bg-indigo-600 rounded-lg text-white"><Globe className="w-4 h-4" /></div>
                     <div className="flex-1">
                       <p className="text-[10px] text-slate-400">Không giới hạn sử dụng với Key riêng.</p>
                       <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-xs font-bold text-indigo-400 hover:text-white uppercase">Lấy Key tại Google AI Studio</a>
                     </div>
                  </div>
                  <input type="password" value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="Dán API Key vào đây..." className="w-full bg-black/40 border border-white/10 rounded-xl py-4 px-5 text-sm focus:border-indigo-500 outline-none text-white font-mono text-center transition-all" />
                  <button onClick={handleSaveApiKey} disabled={!apiKeyInput.trim()} className="w-full py-4 bg-white text-black hover:bg-slate-200 rounded-xl font-black uppercase text-xs tracking-widest shadow-xl transition-all active:scale-95">
                    KẾT NỐI
                  </button>
                </>
             )}
          </div>
        </div>

        {/* ADMIN LOGIN MODAL ON LANDING PAGE */}
        {showAdminLogin && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 animate-in fade-in">
            <div className="glass-card rounded-2xl p-6 w-full max-w-sm space-y-4 border-red-500/20 shadow-red-900/20">
              <h3 className="text-lg font-black text-red-500 uppercase flex items-center gap-2"><ShieldAlert className="w-5 h-5"/> Admin Access</h3>
              <p className="text-xs text-slate-400">Nhập mật khẩu để mở quyền chỉnh sửa Bot.</p>
              <input type="password" value={adminPassInput} onChange={(e) => setAdminPassInput(e.target.value)} placeholder="Mật mã quản trị..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setShowAdminLogin(false)} className="flex-1 py-3 bg-slate-800 rounded-xl text-xs font-bold uppercase text-slate-400">Hủy</button>
                <button onClick={handleAdminLogin} className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-bold uppercase text-white shadow-lg">Xác nhận</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- MAIN APP UI ---
  const activeBot = bots.find(b => b.id === activeBotId);

  // Home Screen (Bot Selection)
  if (!activeBotId) {
    return (
      <div className="h-screen w-full flex flex-col p-4 md:p-8 overflow-hidden bg-[#020617] relative z-10">
        {showSuccessToast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-300">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-bold uppercase text-[10px] tracking-widest">THÀNH CÔNG</span>
          </div>
        )}

        <header className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xl"><Cpu className="text-white w-6 h-6" /></div>
             <div>
               <h1 className="text-xl font-black text-white tracking-tighter uppercase italic leading-none">AI HUB</h1>
               <div className="flex items-center gap-2 mt-1">
                 {currentUser ? (
                   <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${currentUser.usage >= TRIAL_LIMIT ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      USER: {currentUser.username} (Còn lại: {Math.max(0, TRIAL_LIMIT - currentUser.usage)} lượt)
                   </span>
                 ) : isAdmin ? (
                     <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-red-500/20 text-red-400 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" /> ADMINISTRATOR
                     </span>
                 ) : (
                   <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 flex items-center gap-1">
                      <Key className="w-3 h-3" /> API KEY MODE
                   </span>
                 )}
               </div>
             </div>
          </div>
          
          <div className="flex items-center gap-3">
             <a href={ZALO_GROUP_URL} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-blue-600/10 border border-blue-600/20 rounded-xl text-blue-500 hover:bg-blue-600 hover:text-white transition-all flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest group">
                <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" /> <span className="hidden sm:inline">Nhóm Zalo</span>
             </a>

             {!isAdmin && (
                <button onClick={() => setShowAdminLogin(true)} className="px-3 py-2 text-[10px] font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Admin
                </button>
             )}
             
             {isAdmin && (
                 <button onClick={() => setShowUserPanel(true)} className="px-3 py-2 bg-indigo-600/10 border border-indigo-600/20 rounded-xl text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2 font-bold text-[10px] uppercase tracking-widest">
                     <Users className="w-4 h-4" /> <span className="hidden sm:inline">Quản lý User</span>
                 </button>
             )}
             
             <button onClick={() => handleSyncSheet(true)} disabled={isSyncing} className="p-3 bg-emerald-600/10 border border-emerald-600/20 rounded-xl text-emerald-500 hover:bg-emerald-600/20 transition-all">
               <CloudDownload className={`w-5 h-5 ${isSyncing ? 'animate-bounce' : ''}`} />
             </button>
             
             <button onClick={handleLogout} className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-white shadow-lg transition-all flex items-center gap-2 font-black text-[10px] uppercase border border-white/5">
               <Power className="w-4 h-4 text-rose-500" />
             </button>
          </div>
        </header>

        {syncError && (
          <div className="max-w-6xl mx-auto w-full mb-4 bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-center gap-3 text-red-400 text-[10px] font-bold uppercase tracking-widest">
            <AlertCircle className="w-4 h-4" /> {syncError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-6xl mx-auto w-full">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 pb-12">
              {bots.map((bot) => (
                <div key={bot.id} onClick={() => setActiveBotId(bot.id)} className="group relative aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden border border-white/5 cursor-pointer hover:border-indigo-500/50 transition-all shadow-xl hover:-translate-y-1">
                  <div className="absolute inset-0 z-0">
                    {bot.imageUrl ? (
                      <img src={formatImageUrl(bot.imageUrl)} onError={handleImageError} className="w-full h-full object-cover opacity-30 group-hover:opacity-60 transition-all duration-500" alt={bot.name} />
                    ) : ( <div className={`w-full h-full ${bot.color} opacity-20`}></div> )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent"></div>
                  </div>
                  
                  <div className="absolute top-2 right-2 z-[60] flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {bot.gemLink && (
                        <a href={bot.gemLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="p-2 bg-emerald-600 rounded-lg text-white shadow-lg hover:bg-emerald-500 transition-colors" title="Mở Bot Gemini">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                    )}
                    {isAdmin && (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); setEditingBot(bot); setShowConfig(true); }} className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg"><Settings2 className="w-4 h-4" /></button>
                        <button onClick={(e) => deleteBot(e, bot)} className="p-2 bg-red-600 rounded-lg text-white shadow-lg"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>

                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 pb-12 z-10">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-800 border-2 border-white/10 group-hover:border-indigo-500/40 transition-all overflow-hidden shadow-2xl">
                      {bot.imageUrl ? <img src={formatImageUrl(bot.imageUrl)} onError={handleImageError} className="w-full h-full object-cover" alt="Bot" /> : <Bot className="w-10 h-10 text-white/50 m-auto mt-5 md:mt-7" />}
                    </div>
                    <div className="mt-4 text-center px-2">
                       <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">AGENT AI</p>
                       <p className="text-xs text-slate-300 font-bold line-clamp-2 leading-tight italic">"{bot.description || 'Chuyên gia hỗ trợ'}"</p>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-[#800000] py-3 text-center border-t border-white/10 group-hover:bg-[#a00000] transition-colors z-20">
                    <h3 className="text-white font-black text-xs tracking-widest uppercase truncate px-2">{bot.name}</h3>
                  </div>
                </div>
              ))}
              {isAdmin && (
                <div onClick={() => { setEditingBot(null); setShowConfig(true); }} className="group relative aspect-[3/4] bg-white/5 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all">
                  <Plus className="w-8 h-8 text-slate-700 group-hover:text-indigo-500 transition-colors" />
                  <p className="mt-2 text-[10px] font-black uppercase text-slate-500 tracking-widest group-hover:text-indigo-500 transition-colors">THÊM BOT</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ADMIN LOGIN MODAL */}
        {showAdminLogin && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 animate-in fade-in">
            <div className="glass-card rounded-2xl p-6 w-full max-w-sm space-y-4 border-red-500/20 shadow-red-900/20">
              <h3 className="text-lg font-black text-red-500 uppercase flex items-center gap-2"><ShieldAlert className="w-5 h-5"/> Admin Access</h3>
              <p className="text-sm text-slate-400">Nhập mật khẩu để mở quyền chỉnh sửa Bot.</p>
              <input type="password" value={adminPassInput} onChange={(e) => setAdminPassInput(e.target.value)} placeholder="Mật mã quản trị..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500/50" autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setShowAdminLogin(false)} className="flex-1 py-3 bg-slate-800 rounded-xl text-xs font-bold uppercase text-slate-400">Hủy</button>
                <button onClick={handleAdminLogin} className="flex-1 py-3 bg-red-600 hover:bg-red-500 rounded-xl text-xs font-bold uppercase text-white shadow-lg">Xác nhận</button>
              </div>
            </div>
          </div>
        )}
        
        {/* USER MANAGEMENT MODAL */}
        {showUserPanel && isAdmin && (
           <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/95 p-4 animate-in fade-in">
            <div className="glass-card rounded-[2rem] p-8 w-full max-w-4xl h-[80vh] flex flex-col border-white/10 shadow-3xl">
               <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-black text-indigo-400 uppercase italic flex items-center gap-2">
                       <Users className="w-6 h-6"/> Quản lý User
                   </h3>
                   <div className="flex items-center gap-2">
                       <button onClick={handleLoadUsers} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><RefreshCw className={`w-5 h-5 ${loadingUsers ? 'animate-spin' : ''}`}/></button>
                       <button onClick={() => setShowUserPanel(false)} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><X className="w-6 h-6"/></button>
                   </div>
               </div>
               
               <div className="flex-1 overflow-auto custom-scrollbar bg-black/20 rounded-xl border border-white/5">
                   <table className="w-full text-left border-collapse">
                       <thead className="bg-white/5 sticky top-0 backdrop-blur-md z-10">
                           <tr>
                               <th className="p-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-white/10">Username</th>
                               <th className="p-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-white/10">Email</th>
                               <th className="p-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-white/10">Lượt còn lại</th>
                               <th className="p-4 text-[10px] uppercase tracking-widest text-slate-400 font-bold border-b border-white/10 text-right">Hành động</th>
                           </tr>
                       </thead>
                       <tbody>
                           {loadingUsers ? (
                               <tr><td colSpan={4} className="p-8 text-center text-slate-500 italic text-xs">Đang tải dữ liệu...</td></tr>
                           ) : userList.length === 0 ? (
                               <tr><td colSpan={4} className="p-8 text-center text-slate-500 italic text-xs">Chưa có user nào.</td></tr>
                           ) : (
                               userList.map((user, index) => (
                                   <tr key={index} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                       <td className="p-4 text-sm font-bold text-white">{user.username}</td>
                                       <td className="p-4 text-xs text-slate-300 font-mono">{user.email || 'N/A'}</td>
                                       <td className="p-4">
                                           <div className="flex items-center gap-2">
                                               <input 
                                                  type="number" 
                                                  // Logic: Hiển thị số lượt còn lại = (Giới hạn gốc 3 - Số đã dùng).
                                                  // Ví dụ: Đã dùng -97 => Còn lại 100.
                                                  value={TRIAL_LIMIT - user.usage} 
                                                  onChange={(e) => {
                                                      const remaining = parseInt(e.target.value) || 0;
                                                      // Logic ngược: Nếu muốn còn 100 lượt, thì usage = 3 - 100 = -97
                                                      const newUsage = TRIAL_LIMIT - remaining;
                                                      handleUsageChange(index, newUsage);
                                                  }}
                                                  className="w-20 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-center text-emerald-400 font-mono text-sm focus:border-indigo-500 outline-none"
                                               />
                                               <span className="text-slate-500 text-xs">(Gốc: 3)</span>
                                           </div>
                                       </td>
                                       <td className="p-4 text-right">
                                           <button onClick={() => handleSaveUserUsage(user)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-lg transition-all active:scale-95">
                                               Lưu
                                           </button>
                                       </td>
                                   </tr>
                               ))
                           )}
                       </tbody>
                   </table>
               </div>
               <div className="mt-4 text-[10px] text-slate-500 text-center italic">
                   * Nhập số lượng lượt muốn cấp cho user vào ô (ví dụ: 100) và nhấn "Lưu".
               </div>
            </div>
           </div>
        )}
      </div>
    );
  }

  // Chat Screen
  return (
    <div className="h-screen w-full relative bg-[#020617] flex flex-col overflow-hidden">
      {activeBot?.imageUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden opacity-5 pointer-events-none">
           <img src={formatImageUrl(activeBot.imageUrl)} className="w-full h-full object-cover blur-3xl scale-125" alt="" />
        </div>
      )}

      <header className="px-4 md:px-8 py-3 flex items-center justify-between backdrop-blur-3xl border-b border-white/5 bg-black/40 z-50 shrink-0">
         <div className="flex items-center gap-4">
           <button onClick={() => setActiveBotId(null)} className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all group"><ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white" /></button>
           <div className="flex items-center gap-3">
             <div className={`w-10 h-10 rounded-xl ${activeBot?.color} flex items-center justify-center shadow-2xl border border-white/20 overflow-hidden`}>
               {activeBot?.imageUrl ? <img src={formatImageUrl(activeBot.imageUrl)} onError={handleImageError} className="w-full h-full object-cover" /> : <Bot className="w-5 h-5 text-white" />}
             </div>
             <div>
               <h2 className="text-sm font-black text-white uppercase tracking-tight leading-none">{activeBot?.name}</h2>
               <div className="flex gap-2">
                  <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">AI ASSISTANT</p>
                  {currentUser && !apiKey && (
                    <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest mt-1">
                      (Còn lại: {Math.max(0, TRIAL_LIMIT - currentUser.usage)} lượt)
                    </span>
                  )}
               </div>
             </div>
           </div>
         </div>
         <div className="flex gap-2">
            <button onClick={handleLogout} className="p-3 bg-rose-600/10 border border-rose-600/20 rounded-xl text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Power className="w-4 h-4" /></button>
         </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 z-10">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4 opacity-80">
            <div className={`w-16 h-16 rounded-2xl ${activeBot?.color} flex items-center justify-center shadow-3xl border-2 border-white/10 animate-pulse`}>
                 {activeBot?.imageUrl ? <img src={formatImageUrl(activeBot.imageUrl)} className="w-full h-full object-cover rounded-2xl" /> : <Bot className="w-8 h-8 text-white" />}
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-black text-white uppercase italic">SẴN SÀNG HỖ TRỢ</h3>
              <p className="text-slate-300 text-sm italic leading-relaxed border border-white/5 p-4 rounded-xl bg-white/5">"{activeBot?.userInstructions || 'Nhập câu hỏi để bắt đầu.'}"</p>
            </div>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full space-y-4">
              <div className="flex flex-col items-end gap-2">
                 <div className="bg-indigo-600 px-4 py-3 rounded-2xl rounded-tr-none max-w-[85%] shadow-lg">
                    <p className="text-white text-sm font-medium leading-relaxed">{item.userInput}</p>
                 </div>
                 {item.images && item.images.length > 0 && (
                   <div className="flex flex-wrap gap-1.5 justify-end">
                     {item.images.map((img, i) => (
                       <img key={i} src={img} className="w-14 h-14 object-cover rounded-lg border border-white/10 shadow-sm" alt="input" />
                     ))}
                   </div>
                 )}
              </div>
              {item.responses.map(resp => (
                <div key={resp.botId} className="flex gap-2.5 items-start">
                  <div className={`w-8 h-8 rounded-lg ${activeBot?.color} flex items-center justify-center shrink-0 border border-white/20 overflow-hidden shadow-md mt-1`}>
                    {activeBot?.imageUrl ? <img src={formatImageUrl(activeBot.imageUrl)} className="w-full h-full object-cover" /> : <Bot className="w-4 h-4 text-white" />}
                  </div>
                  <div className="bg-slate-900/90 border border-white/5 px-5 py-4 rounded-2xl rounded-tl-none max-w-[92%] shadow-md backdrop-blur-xl">
                    {resp.status === 'loading' ? ( <div className="flex gap-1 py-1.5"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-.3s]"></div></div> ) : (
                      <div className="text-slate-100 text-sm leading-relaxed whitespace-pre-wrap">{resp.content}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="absolute bottom-4 left-0 right-0 px-4 md:px-8 z-50 shrink-0">
        <div className="max-w-4xl mx-auto space-y-2">
          {selectedImages.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 bg-slate-900/90 rounded-2xl border border-white/10 backdrop-blur-xl shadow-2xl">
              {selectedImages.map((img, i) => (
                <div key={i} className="relative w-12 h-12">
                  <img src={img} className="w-full h-full object-cover rounded-lg" alt="" />
                  <button onClick={() => removeSelectedImage(i)} className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full p-0.5 text-white shadow-lg"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="glass-card rounded-2xl p-2.5 flex items-end gap-2.5 shadow-2xl border-white/10 bg-slate-900/95">
             <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
             <button onClick={() => fileInputRef.current?.click()} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 transition-all shrink-0"><ImageIcon className="w-5.5 h-5.5" /></button>
             <textarea value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleRunCommand())} placeholder={`Nhập lệnh cho ${activeBot?.name}...`} className="flex-1 bg-transparent border-none focus:ring-0 py-2 px-3 text-white placeholder-slate-700 resize-none h-[45px] custom-scrollbar text-base font-bold" />
             <button onClick={handleRunCommand} disabled={isProcessing || (!userInput.trim() && selectedImages.length === 0)} className={`p-3 rounded-xl transition-all shadow-lg ${isProcessing || (!userInput.trim() && selectedImages.length === 0) ? 'bg-white/5 text-slate-800' : 'bg-indigo-600 text-white hover:scale-105 active:scale-95 shadow-indigo-600/20'}`}>
               {isProcessing ? <RefreshCw className="w-5.5 h-5.5 animate-spin" /> : <Send className="w-5.5 h-5.5" />}
             </button>
          </div>
        </div>
      </div>
      
      {/* LIMIT REACHED MODAL */}
      {showLimitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-4 animate-in fade-in">
             <div className="glass-card rounded-2xl p-6 w-full max-w-sm text-center space-y-4 border-amber-500/20 shadow-amber-900/20">
                 <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-2">
                     <AlertTriangle className="w-8 h-8 text-amber-500" />
                 </div>
                 <div>
                    <h3 className="text-lg font-black text-amber-500 uppercase">HẾT LƯỢT SỬ DỤNG</h3>
                    <p className="text-sm text-slate-300 mt-2">Bạn đã sử dụng hết <strong className="text-white">{TRIAL_LIMIT}</strong> lượt miễn phí.</p>
                    <p className="text-xs text-slate-400 mt-1">Vui lòng liên hệ Admin để mở thêm lượt sử dụng hoặc sử dụng API Key riêng.</p>
                 </div>
                 
                 <div className="flex gap-2 pt-2">
                     <button onClick={() => setShowLimitModal(false)} className="flex-1 py-3 bg-slate-800 rounded-xl text-xs font-bold uppercase text-slate-400 hover:bg-slate-700">Đóng</button>
                     <a href={ZALO_GROUP_URL} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold uppercase text-white shadow-lg flex items-center justify-center gap-2">
                         <MessageCircle className="w-4 h-4" /> Liên hệ
                     </a>
                 </div>
             </div>
        </div>
      )}

      {showConfig && isAdmin && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4">
          <div className="glass-card rounded-[2.5rem] w-full max-w-2xl p-8 space-y-6 border-white/10 overflow-y-auto max-h-[90vh] shadow-3xl animate-in zoom-in">
             <div className="flex justify-between items-center border-b border-white/5 pb-4"><h2 className="text-xl font-black text-white uppercase italic">CẤU HÌNH BOT</h2><button onClick={() => setShowConfig(false)} className="p-2 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button></div>
             <form className="space-y-6" onSubmit={saveBot}>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-2">Tên Bot</label>
                    <input name="name" defaultValue={editingBot?.name || ''} required placeholder="VD: CHUYÊN GIA DƯỢC..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white font-black uppercase text-sm outline-none focus:border-indigo-500/50" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-2">Model</label>
                    <select name="model" defaultValue={editingBot?.model || 'gemini-2.5-flash'} className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white text-sm outline-none focus:border-indigo-500/50 appearance-none">
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Nhanh - Khuyên dùng)</option>
                      <option value="gemini-2.5-flash-lite-latest">Gemini 2.5 Flash Lite (Tiết kiệm)</option>
                      <option value="gemini-3-pro-preview">Gemini 2.0 Pro (Thông minh - Dễ hết lượt)</option>
                    </select>
                  </div>
               </div>
               
               <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-2">Mô tả ngắn</label>
                  <input name="description" defaultValue={editingBot?.description || ''} required placeholder="Mô tả chức năng..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white text-sm outline-none focus:border-indigo-500/50" />
               </div>
               
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                     <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-2 flex items-center gap-1"><ImageIcon className="w-3 h-3"/> Link Ảnh (Tùy chọn)</label>
                     <input name="imageUrl" value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="https://..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white text-xs outline-none focus:border-indigo-500/50" />
                  </div>
                  <div className="space-y-1">
                     <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-2 flex items-center gap-1"><LinkIcon className="w-3 h-3"/> Link Bot Gemini</label>
                     <input name="gemLink" defaultValue={editingBot?.gemLink || ''} placeholder="https://gemini.google.com/..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-emerald-400 text-xs outline-none focus:border-emerald-500/50" />
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest ml-2 flex items-center gap-1"><Terminal className="w-3 h-3"/> Dòng lệnh hệ thống (System Instruction)</label>
                  <div className="relative">
                    <textarea 
                      name="systemInstruction" 
                      defaultValue={editingBot?.systemInstruction || ''} 
                      required 
                      rows={8} 
                      placeholder="> Nhập kịch bản hoạt động của bot..." 
                      className="w-full bg-[#0f172a] border border-white/10 rounded-2xl p-5 text-emerald-400 text-sm resize-none outline-none focus:border-indigo-500/50 font-mono shadow-inner leading-relaxed" 
                      spellCheck={false}
                    />
                    <div className="absolute bottom-3 right-4 pointer-events-none opacity-50">
                        <span className="text-[10px] text-slate-500 font-mono">CMD MODE</span>
                    </div>
                  </div>
               </div>

               <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-widest ml-2 flex items-center gap-1"><MessageSquare className="w-3 h-3"/> Gợi ý cho người dùng (User Prompt)</label>
                  <input name="userInstructions" defaultValue={editingBot?.userInstructions || ''} placeholder="VD: Hỏi về công dụng..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-slate-300 text-xs outline-none focus:border-indigo-500/50" />
               </div>

               <button type="submit" disabled={isSaving} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all shadow-xl">
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-5 h-5" />} LƯU CẤU HÌNH
               </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}