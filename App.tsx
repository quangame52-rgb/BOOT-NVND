
import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, Send, RefreshCw, Trash2, Settings2, Bot, 
  X, Zap, Cpu, ArrowLeft, RotateCcw,
  CloudDownload, Save, CheckCircle2, Home, ArrowRight, Eye, AlertCircle,
  User, Crown, ShieldAlert, Power, Image as ImageIcon
} from 'lucide-react';
import { GeminiBot, HistoryItem, BotResponse } from './types';
import { generateBotResponse } from './services/geminiService';
import { fetchBotsFromGoogleSheet, appendBotToSheet, deleteBotFromSheet } from './services/googleSheetService';

const DEFAULT_BOTS: GeminiBot[] = [
  {
    id: 'dt-ha-thao',
    name: 'ĐÔNG TRÙNG HẠ THẢO',
    description: 'Chuyên gia tư vấn về công dụng và cách dùng Đông Trùng Hạ Thảo.',
    systemInstruction: 'Bạn là chuyên gia về Đông Trùng Hạ Thảo. Hãy tư vấn chi tiết về nguồn gốc, thành phần saponin, cordycepin và cách chế biến tối ưu.',
    userInstructions: 'Hỏi về cách phân biệt thật giả hoặc liều lượng dùng mỗi ngày.',
    model: 'gemini-3-pro-preview',
    color: 'bg-orange-600',
    isActive: true,
  }
];

const PASSWORDS = {
  USER: 'nhomvianghindon',
  VIP: 'daugo',
  ADMIN: '791522Mm@123'
};

const formatImageUrl = (url: string) => {
  if (!url) return '';
  if (!url.includes('drive.google.com')) return url;
  const driveMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }
  return url;
};

type UserRole = 'NONE' | 'USER' | 'VIP' | 'ADMIN';

export default function App() {
  const [bots, setBots] = useState<GeminiBot[]>(() => {
    const saved = localStorage.getItem('gemini_hub_bots');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.length > 0 ? parsed : DEFAULT_BOTS;
      } catch {
        return DEFAULT_BOTS;
      }
    }
    return DEFAULT_BOTS;
  });
  
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole>(() => {
    return (localStorage.getItem('gemini_hub_role') as UserRole) || 'NONE';
  });
  const [usageCount, setUsageCount] = useState(() => {
    return parseInt(localStorage.getItem('gemini_hub_usage') || '0');
  });

  const [userInput, setUserInput] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [passInput, setPassInput] = useState('');
  const [editingBot, setEditingBot] = useState<GeminiBot | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [formImageUrl, setFormImageUrl] = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('gemini_hub_bots', JSON.stringify(bots));
    localStorage.setItem('gemini_hub_role', userRole);
    localStorage.setItem('gemini_hub_usage', usageCount.toString());
  }, [bots, userRole, usageCount]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  useEffect(() => {
    if (editingBot) setFormImageUrl(editingBot.imageUrl || '');
    else setFormImageUrl('');
  }, [editingBot, showConfig]);

  const activeBot = bots.find(b => b.id === activeBotId);
  const isLocked = userRole !== 'ADMIN';
  const remainingUses = userRole === 'USER' ? Math.max(0, 3 - usageCount) : Infinity;

  const handleLogin = () => {
    const input = passInput.trim();
    if (!input) return;
    if (input === PASSWORDS.ADMIN) { setUserRole('ADMIN'); setPassInput(''); }
    else if (input === PASSWORDS.VIP) { setUserRole('VIP'); setPassInput(''); }
    else if (input === PASSWORDS.USER) { setUserRole('USER'); setPassInput(''); }
    else { alert('Mật khẩu không chính xác!'); }
  };

  const handleLogout = () => {
    setUserRole('NONE');
    setActiveBotId(null);
    setPassInput('');
    setHistory([]);
    localStorage.setItem('gemini_hub_role', 'NONE');
  };

  const handleResetUsage = () => {
    if (userRole === 'ADMIN' && confirm("Reset lượt dùng?")) {
      setUsageCount(0);
      triggerSuccessToast();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = ''; // Reset input
  };

  const removeSelectedImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleRunCommand = async () => {
    if (userRole === 'USER' && usageCount >= 3) {
      alert("Bạn đã hết lượt dùng thử (3/3).");
      return;
    }
    if (!activeBot || (!userInput.trim() && selectedImages.length === 0) || isProcessing) return;

    setIsProcessing(true);
    const historyId = Date.now().toString();
    const currentInput = userInput;
    const currentImages = [...selectedImages];
    
    setUserInput('');
    setSelectedImages([]);

    const initialResponse: BotResponse = {
      botId: activeBot.id,
      content: '',
      status: 'loading',
      timestamp: Date.now()
    };

    setHistory(prev => [{
      id: historyId,
      userInput: currentInput,
      images: currentImages,
      responses: [initialResponse],
      timestamp: Date.now()
    }, ...prev]);

    try {
      const result = await generateBotResponse(activeBot, currentInput, currentImages);
      updateHistoryStatus(historyId, activeBot.id, result.text, 'success', result.sources);
      if (userRole === 'USER') setUsageCount(prev => prev + 1);
    } catch (err: any) {
      updateHistoryStatus(historyId, activeBot.id, `Lỗi: ${err.message}`, 'error');
    }
    setIsProcessing(false);
  };

  const updateHistoryStatus = (historyId: string, botId: string, content: string, status: BotResponse['status'], sources?: any[]) => {
    setHistory(prev => prev.map(item => {
      if (item.id === historyId) {
        return {
          ...item,
          responses: item.responses.map(resp => 
            resp.botId === botId ? { ...resp, content, status, timestamp: Date.now(), sources } : resp
          )
        };
      }
      return item;
    }));
  };

  const handleSyncSheet = async (force: boolean = false) => {
    if (isSyncing || isLocked) return;
    setIsSyncing(true);
    setSyncError(null);
    try {
      const sheetBots = await fetchBotsFromGoogleSheet();
      if (sheetBots && sheetBots.length > 0) {
        if (force) setBots(sheetBots);
        else {
          setBots(prev => {
            const existingNames = new Set(prev.map(b => b.name));
            const newBots = sheetBots.filter(b => !existingNames.has(b.name));
            return [...prev, ...newBots];
          });
        }
        triggerSuccessToast();
      } else {
        setSyncError("Không tìm thấy dữ liệu bot trên Google Sheet.");
      }
    } catch (err) {
      setSyncError("Lỗi kết nối hoặc Sheet chưa được công khai.");
    } finally {
      setIsSyncing(false);
    }
  };

  const triggerSuccessToast = () => {
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 2000);
  };

  const saveBot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLocked) return;
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const rawName = (formData.get('name') as string || '').trim().toUpperCase();
    const rawImageUrl = (formData.get('imageUrl') as string || '').trim();
    const systemInstruction = (formData.get('systemInstruction') as string || '').trim();
    
    if (!rawName || !systemInstruction) {
      alert("Vui lòng nhập đầy đủ Tên Bot và Kịch bản!");
      setIsSaving(false);
      return;
    }

    const botData: GeminiBot = {
      id: editingBot?.id || `bot-${Date.now()}`,
      name: rawName,
      description: (formData.get('description') as string || '').trim(),
      systemInstruction,
      userInstructions: (formData.get('userInstructions') as string || '').trim(),
      color: (formData.get('color') as string || 'bg-indigo-600'),
      imageUrl: rawImageUrl,
      gemLink: (formData.get('gemLink') as string || '').trim(),
      model: 'gemini-3-pro-preview',
      isActive: true
    };

    try {
      if (editingBot) setBots(prev => prev.map(b => b.id === editingBot.id ? botData : b));
      else setBots(prev => [botData, ...prev]);
      await appendBotToSheet(botData);
      setShowConfig(false);
      setEditingBot(null);
      triggerSuccessToast();
    } catch (err) {
      setShowConfig(false);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteBot = async (e: React.MouseEvent, bot: GeminiBot) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLocked) return;
    if (confirm(`Xóa Bot: ${bot.name}?`)) {
      const newBots = bots.filter(b => b.id !== bot.id);
      setBots(newBots);
      localStorage.setItem('gemini_hub_bots', JSON.stringify(newBots));
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

  if (userRole === 'NONE') {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-black/95 p-4 relative overflow-hidden">
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
           <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600 rounded-full blur-[150px] animate-pulse"></div>
           <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[150px] animate-pulse"></div>
        </div>
        <div className="glass-card rounded-[3rem] p-8 md:p-12 w-full max-w-[440px] shadow-3xl space-y-8 text-center border-white/10 relative z-10 animate-in fade-in zoom-in">
          <div className="w-20 h-20 bg-gradient-to-tr from-indigo-600 to-purple-500 rounded-3xl flex items-center justify-center shadow-2xl mx-auto rotate-6">
             <ShieldAlert className="text-white w-10 h-10" />
          </div>
          <div className="space-y-3">
            <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter italic">AI CENTER</h2>
            <p className="text-[9px] uppercase tracking-[0.4em] text-slate-500 font-bold">NHÓM VÍA NGHÌN ĐƠN</p>
          </div>
          <div className="space-y-4">
             <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)} placeholder="NHẬP MẬT MÃ..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 px-6 text-center text-xl focus:ring-4 focus:ring-indigo-500/20 outline-none text-white font-black placeholder-slate-800 transition-all uppercase" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleLogin()} />
            <button onClick={handleLogin} className="w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase text-sm tracking-[0.2em] shadow-xl transition-all active:scale-95">KÍCH HOẠT</button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeBotId) {
    return (
      <div className="h-screen w-full flex flex-col p-4 md:p-8 overflow-hidden bg-[#020617] relative z-10">
        {showSuccessToast && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-emerald-500 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-2 animate-in slide-in-from-top-4 duration-300">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-bold uppercase text-[10px] tracking-widest">ĐÃ CẬP NHẬT</span>
          </div>
        )}

        <header className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 shrink-0">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xl"><Cpu className="text-white w-6 h-6" /></div>
             <div>
               <h1 className="text-xl font-black text-white tracking-tighter uppercase italic leading-none">AI HUB</h1>
               <p className="text-[7px] uppercase tracking-[0.2em] text-indigo-400 font-bold mt-1">SESSION: {userRole}</p>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3">
               {userRole === 'ADMIN' ? (
                 <div className="flex items-center gap-2 text-red-500 font-black text-[9px] uppercase tracking-widest">
                   <ShieldAlert className="w-4 h-4" /> ADMIN
                   <button onClick={handleResetUsage} className="ml-1 p-1 bg-red-500/10 rounded hover:bg-red-500/20"><RotateCcw className="w-3 h-3" /></button>
                 </div>
               ) : userRole === 'VIP' ? (
                 <div className="flex items-center gap-2 text-amber-500 font-black text-[9px] uppercase tracking-widest"><Crown className="w-4 h-4" /> VIP</div>
               ) : (
                 <div className="flex flex-col items-end">
                    <div className="flex items-center gap-1 text-emerald-500 font-black text-[9px] uppercase tracking-widest"><User className="w-3 h-3" /> GUEST</div>
                    <p className="text-[7px] text-slate-500 font-bold">Lượt: {usageCount}/3</p>
                 </div>
               )}
            </div>
            {!isLocked && (
              <button onClick={() => handleSyncSheet(false)} disabled={isSyncing} className="p-3 bg-emerald-600/10 border border-emerald-600/20 rounded-xl text-emerald-500 hover:bg-emerald-600/20 transition-all">
                <CloudDownload className={`w-5 h-5 ${isSyncing ? 'animate-bounce' : ''}`} />
              </button>
            )}
            <button onClick={handleLogout} className="p-3 bg-rose-600 hover:bg-rose-500 rounded-xl text-white shadow-lg transition-all flex items-center gap-2 font-black text-[9px] uppercase">
              <Power className="w-4 h-4" /> <span className="hidden sm:inline">THOÁT</span>
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
            {userRole === 'USER' && (
              <div className="mb-6">
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
                   <div className={`h-full transition-all duration-1000 ${usageCount >= 3 ? 'bg-red-600' : 'bg-indigo-600'}`} style={{ width: `${(usageCount / 3) * 100}%` }}></div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 pb-12">
              {bots.map((bot) => (
                <div key={bot.id} onClick={() => setActiveBotId(bot.id)} className="group relative aspect-[3/4] bg-slate-900 rounded-2xl overflow-hidden border border-white/5 cursor-pointer hover:border-indigo-500/50 transition-all shadow-xl hover:-translate-y-1">
                  <div className="absolute inset-0 z-0">
                    {bot.imageUrl ? (
                      <img src={formatImageUrl(bot.imageUrl)} onError={handleImageError} className="w-full h-full object-cover opacity-30 group-hover:opacity-60 transition-all duration-500" alt={bot.name} />
                    ) : ( <div className={`w-full h-full ${bot.color} opacity-20`}></div> )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent"></div>
                  </div>
                  {!isLocked && (
                    <div className="absolute top-2 right-2 z-[60] flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setEditingBot(bot); setShowConfig(true); }} className="p-2 bg-indigo-600 rounded-lg text-white shadow-lg"><Settings2 className="w-4 h-4" /></button>
                      <button onClick={(e) => deleteBot(e, bot)} className="p-2 bg-red-600 rounded-lg text-white shadow-lg"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 pb-12 z-10">
                    <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-slate-800 border-2 border-white/10 group-hover:border-indigo-500/40 transition-all overflow-hidden shadow-2xl">
                      {bot.imageUrl ? <img src={formatImageUrl(bot.imageUrl)} onError={handleImageError} className="w-full h-full object-cover" alt="Bot" /> : <Bot className="w-10 h-10 text-white/50 m-auto mt-5 md:mt-7" />}
                    </div>
                    <div className="mt-4 text-center px-2">
                       <p className="text-[7px] font-black text-indigo-500 uppercase tracking-widest mb-1">AGENT AI</p>
                       <p className="text-[10px] text-slate-300 font-bold line-clamp-2 leading-tight italic">"{bot.description || 'Chuyên gia hỗ trợ'}"</p>
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-[#800000] py-3 text-center border-t border-white/10 group-hover:bg-[#a00000] transition-colors z-20">
                    <h3 className="text-white font-black text-[10px] tracking-widest uppercase truncate px-2">{bot.name}</h3>
                  </div>
                </div>
              ))}
              {!isLocked && (
                <div onClick={() => { setEditingBot(null); setShowConfig(true); }} className="group relative aspect-[3/4] bg-white/5 rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all">
                  <Plus className="w-8 h-8 text-slate-700 group-hover:text-indigo-500 transition-colors" />
                  <p className="mt-2 text-[8px] font-black uppercase text-slate-500 tracking-widest group-hover:text-indigo-500 transition-colors">THÊM BOT</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative bg-[#020617] flex flex-col overflow-hidden">
      {activeBot.imageUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden opacity-5 pointer-events-none">
           <img src={formatImageUrl(activeBot.imageUrl)} className="w-full h-full object-cover blur-3xl scale-125" alt="" />
        </div>
      )}

      <header className="px-4 md:px-8 py-3 flex items-center justify-between backdrop-blur-3xl border-b border-white/5 bg-black/40 z-50 shrink-0">
         <div className="flex items-center gap-4">
           <button onClick={() => setActiveBotId(null)} className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-all group"><ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white" /></button>
           <div className="flex items-center gap-3">
             <div className={`w-10 h-10 rounded-xl ${activeBot.color} flex items-center justify-center shadow-2xl border border-white/20 overflow-hidden`}>
               {activeBot.imageUrl ? <img src={formatImageUrl(activeBot.imageUrl)} onError={handleImageError} className="w-full h-full object-cover" /> : <Bot className="w-5 h-5 text-white" />}
             </div>
             <div>
               <h2 className="text-sm font-black text-white uppercase tracking-tight leading-none">{activeBot.name}</h2>
               <p className="text-[7px] font-bold text-indigo-400 uppercase tracking-widest mt-1">{userRole === 'USER' ? `Lượt: ${remainingUses}/3` : 'VÔ HẠN VIP'}</p>
             </div>
           </div>
         </div>
         <button onClick={handleLogout} className="p-3 bg-rose-600/10 border border-rose-600/20 rounded-xl text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Power className="w-4 h-4" /></button>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 pb-28 z-10">
        {history.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto space-y-4 opacity-80">
            <div className={`w-16 h-16 rounded-2xl ${activeBot.color} flex items-center justify-center shadow-3xl border-2 border-white/10 animate-pulse`}>
                 {activeBot.imageUrl ? <img src={formatImageUrl(activeBot.imageUrl)} className="w-full h-full object-cover rounded-2xl" /> : <Bot className="w-8 h-8 text-white" />}
            </div>
            <div className="space-y-3">
              <h3 className="text-lg font-black text-white uppercase italic">SẴN SÀNG HỖ TRỢ</h3>
              <p className="text-slate-300 text-xs italic leading-relaxed border border-white/5 p-4 rounded-xl bg-white/5">"{activeBot.userInstructions || 'Nhập câu hỏi để bắt đầu.'}"</p>
            </div>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 w-full space-y-4">
              <div className="flex flex-col items-end gap-2">
                 <div className="bg-indigo-600 px-4 py-2 rounded-xl rounded-tr-none max-w-[85%] shadow-lg">
                    <p className="text-white text-sm font-bold">{item.userInput}</p>
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
                  <div className={`w-7 h-7 rounded-lg ${activeBot.color} flex items-center justify-center shrink-0 border border-white/20 overflow-hidden shadow-md`}>
                    {activeBot.imageUrl ? <img src={formatImageUrl(activeBot.imageUrl)} className="w-full h-full object-cover" /> : <Bot className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="bg-slate-900/90 border border-white/5 px-4 py-3 rounded-xl rounded-tl-none max-w-[92%] shadow-md backdrop-blur-xl">
                    {resp.status === 'loading' ? ( <div className="flex gap-1 py-1.5"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce [animation-delay:-.3s]"></div></div> ) : (
                      <div className="text-slate-100 text-[13px] leading-relaxed whitespace-pre-wrap font-medium font-serif italic">{resp.content}</div>
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
             <textarea value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleRunCommand())} disabled={userRole === 'USER' && usageCount >= 3} placeholder={userRole === 'USER' && usageCount >= 3 ? "HẾT LƯỢT DÙNG!" : `Hỏi ${activeBot.name}...`} className="flex-1 bg-transparent border-none focus:ring-0 py-2 px-3 text-white placeholder-slate-700 resize-none h-[45px] custom-scrollbar text-base font-bold" />
             <button onClick={handleRunCommand} disabled={isProcessing || (!userInput.trim() && selectedImages.length === 0) || (userRole === 'USER' && usageCount >= 3)} className={`p-3 rounded-xl transition-all shadow-lg ${isProcessing || (!userInput.trim() && selectedImages.length === 0) || (userRole === 'USER' && usageCount >= 3) ? 'bg-white/5 text-slate-800' : 'bg-indigo-600 text-white hover:scale-105 active:scale-95 shadow-indigo-600/20'}`}>
               {isProcessing ? <RefreshCw className="w-5.5 h-5.5 animate-spin" /> : <Send className="w-5.5 h-5.5" />}
             </button>
          </div>
        </div>
      </div>

      {showConfig && !isLocked && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4">
          <div className="glass-card rounded-[2.5rem] w-full max-w-2xl p-8 space-y-6 border-white/10 overflow-y-auto max-h-[90vh] shadow-3xl animate-in zoom-in">
             <div className="flex justify-between items-center border-b border-white/5 pb-4"><h2 className="text-xl font-black text-white uppercase italic">CẤU HÌNH BOT</h2><button onClick={() => setShowConfig(false)} className="p-2 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button></div>
             <form className="space-y-6" onSubmit={saveBot}>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><input name="name" defaultValue={editingBot?.name || ''} required placeholder="TÊN BOT..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white font-black uppercase text-xs outline-none focus:border-indigo-500/50" /><input name="description" defaultValue={editingBot?.description || ''} required placeholder="MÔ TẢ..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white text-xs outline-none focus:border-indigo-500/50" /></div>
               <div className="space-y-2"><input name="imageUrl" value={formImageUrl} onChange={(e) => setFormImageUrl(e.target.value)} placeholder="LINK ẢNH MINH HỌA..." className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-white text-[10px] outline-none focus:border-indigo-500/50" /></div>
               <textarea name="systemInstruction" defaultValue={editingBot?.systemInstruction || ''} required rows={4} placeholder="KỊCH BẢN AI (System Instruction)..." className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-slate-300 text-xs resize-none outline-none focus:border-indigo-500/50" />
               <button type="submit" disabled={isSaving} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-500 transition-all shadow-xl">
                  {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-5 h-5" />} LƯU CẤU HÌNH
               </button>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
