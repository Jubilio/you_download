import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { 
  Download, Search, History as HistoryIcon, Settings as SettingsIcon, 
  Play, X, AlertCircle, CheckCircle, Clock, Zap, Terminal as TerminalIcon, 
  ChevronRight, Trash2, RefreshCw, FolderOpen, FileCheck, Scissors, Music,
  Bookmark, ListVideo, Info, ExternalLink, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:5000';
const socket = io(API_BASE, { transports: ['polling'] });

export default function App() {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [tasks, setTasks] = useState({});
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [toasts, setToasts] = useState([]);
  const logEndRef = useRef(null);

  const notify = (title, msg, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  const [showCut, setShowCut] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState('720');
  const [cutStart, setCutStart] = useState('00:00:00');
  const [cutEnd, setCutEnd] = useState('00:00:10');
  const [cutName, setCutName] = useState('Meu Recorte');

  useEffect(() => {
    socket.on('progress', (data) => setTasks(prev => ({ ...prev, [data.id]: data })));
    socket.on('log', (data) => setLogs(prev => [...prev.slice(-100), data]));
    return () => {
      socket.off('progress');
      socket.off('log');
    };
  }, []);

  useEffect(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [logs]);

  const handleAnalyze = async () => {
    if (!url) return;
    setAnalyzing(true);
    setVideoInfo(null);
    setShowCut(false);
    try {
      const res = await axios.post(`${API_BASE}/api/info`, { url });
      setVideoInfo(res.data);
    } catch (err) {
      notify("Erro", err.response?.data?.error || "Erro ao analisar URL", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = async (format_type = 'mp4') => {
    if (!videoInfo) return;
    const video_id = videoInfo.id;
    setTasks(prev => ({ ...prev, [video_id]: { id: video_id, title: videoInfo.title, status: 'starting', percent: 0, thumbnail: videoInfo.thumbnail } }));
    try {
      await axios.post(`${API_BASE}/api/download-single`, {
        url: videoInfo.url || videoInfo.webpage_url,
        id: video_id,
        format: format_type,
        quality: selectedQuality,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        channel: videoInfo.channel || videoInfo.uploader
      });
    } catch (err) {
      notify("Erro", "Falha ao iniciar download", "error");
    }
  };

  const processCut = async () => {
    const toSeconds = (s) => s.split(':').reverse().reduce((acc, val, i) => acc + parseInt(val) * Math.pow(60, i), 0);
    const start = toSeconds(cutStart);
    const end = toSeconds(cutEnd);
    if(isNaN(start) || isNaN(end) || end <= start) return notify("Aviso", "Tempos inválidos!", "warn");
    
    try {
      await axios.post(`${API_BASE}/api/download-section`, {
        url: videoInfo.url || videoInfo.webpage_url,
        id: videoInfo.id,
        start, end, title: cutName
      });
      setShowCut(false);
    } catch (e) {
      notify("Erro", "Erro ao cortar vídeo.", "error");
    }
  };

  const formatTime = (seconds) => {
    if (!seconds) return '00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).filter((v, i) => v !== '00' || i > 0).join(':');
  };

  const processChapterCut = async (start, end, name) => {
    try {
      await axios.post(`${API_BASE}/api/download-section`, {
        url: videoInfo.url || videoInfo.webpage_url,
        id: videoInfo.id,
        start, end, title: name
      });
    } catch (e) {
      notify("Erro", "Erro ao cortar vídeo.", "error");
    }
  };

  const extractResources = (text) => {
    const links = [];
    const patterns = [
      { type: 'Google Drive', icon: 'fa-brands fa-google-drive', regex: /https?:\/\/drive\.google\.com\/[^\s]+/g },
      { type: 'Mega', icon: 'fa-solid fa-cloud', regex: /https?:\/\/mega\.nz\/[^\s]+/g },
      { type: 'PDF / Documento', icon: 'fa-solid fa-file-pdf', regex: /https?:\/\/[^\s]+\.pdf[^\s]*/g },
      { type: 'MediaFire', icon: 'fa-solid fa-fire', regex: /https?:\/\/www\.mediafire\.com\/[^\s]+/g }
    ];
    patterns.forEach(p => {
      const matches = text.match(p.regex);
      if (matches) matches.forEach(url => links.push({ type: p.type, icon: p.icon, url }));
    });
    return links;
  };

  const renderDescription = (text) => {
    if (!text) return "Sem descrição disponível.";
    // Regex para detetar URLs de forma segura
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a 
            key={i} 
            href={part} 
            target="_blank" 
            rel="noreferrer" 
            className="text-yd-primary hover:text-yd-primary/80 hover:underline transition-all break-all"
          >
            {part}
          </a>
        );
      }
      return part;
    });
  };

  const analyzeUrl = async (targetUrl) => {
    setUrl(targetUrl);
    setAnalyzing(true);
    setVideoInfo(null);
    setShowCut(false);
    try {
      const res = await axios.post(`${API_BASE}/api/info`, { url: targetUrl });
      setVideoInfo(res.data);
    } catch (err) {
      notify("Erro", err.response?.data?.error || "Erro ao analisar URL", "error");
    } finally {
      setAnalyzing(false);
    }
  };

  const [selectedPlaylist, setSelectedPlaylist] = useState(new Set());
  
  useEffect(() => {
    if (videoInfo && videoInfo.entries) {
      setSelectedPlaylist(new Set(videoInfo.entries.map((_, i) => i)));
    } else {
      setSelectedPlaylist(new Set());
    }
  }, [videoInfo]);

  const downloadPlaylist = async () => {
    if (!videoInfo || !videoInfo.entries) return;
    const playlistTitle = videoInfo.title || "Playlist";
    const selectedIndices = Array.from(selectedPlaylist);
    if (selectedIndices.length === 0) return notify("Aviso", "Selecione pelo menos um vídeo.", "warn");
    
    for (const index of selectedIndices) {
      const entry = videoInfo.entries[index];
      try {
        await axios.post(`${API_BASE}/api/download-single`, {
          url: entry.url,
          id: entry.id,
          format: 'mp4',
          title: entry.title,
          thumbnail: entry.thumbnail,
          channel: entry.channel,
          playlist_title: playlistTitle,
          index: index + 1
        });
      } catch (err) {}
    }
  };

  const downloadSinglePlaylistEntry = async (entry, format, index) => {
    try {
      await axios.post(`${API_BASE}/api/download-single`, {
        url: entry.url,
        id: entry.id,
        format,
        title: entry.title,
        thumbnail: entry.thumbnail,
        channel: entry.channel,
        playlist_title: videoInfo?.title,
        index: index !== undefined ? index + 1 : undefined
      });
    } catch (err) {
      notify("Erro", "Erro ao iniciar download", "error");
    }
  };

  return (
    <div className="flex h-screen bg-yd-black text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <nav className="w-20 lg:w-64 bg-black flex flex-col border-r border-white/10">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-yd-primary rounded-lg flex items-center justify-center font-bold text-xl">Y</div>
          <span className="hidden lg:block text-2xl font-black tracking-tighter">YOU<span className="text-yd-primary">DOWN</span></span>
        </div>
        
        <div className="flex-1 px-4 py-8 space-y-4">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Play size={24} />} label="Dashboard" />
          <NavItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<HistoryIcon size={24} />} label="Histórico" />
          <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={24} />} label="Definições" />
          <NavItem active={activeTab === 'vision'} onClick={() => setActiveTab('vision')} icon={<Zap size={24} className="text-yd-primary" />} label="Manifesto" />
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-[#141414] relative">
        <header className="sticky top-0 z-50 p-6 flex justify-between items-center bg-gradient-to-b from-[#141414] to-transparent">
          <div className="flex-1 max-w-2xl relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-yd-primary transition-colors" />
            <input 
              type="text" placeholder="Cole o link do YouTube aqui..." 
              value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-yd-primary focus:bg-white/10 transition-all placeholder:text-white/20"
            />
            {analyzing && <div className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin rounded-full h-5 w-5 border-2 border-yd-primary border-t-transparent"></div>}
          </div>
        </header>

        <div className="px-8 pb-12">
          {activeTab === 'dashboard' && (
            <>
              <AnimatePresence mode="wait">
                {videoInfo && (
                  <motion.section 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                    className="mb-12 relative rounded-3xl overflow-hidden yd-shadow group min-h-[400px]"
                  >
                    <img src={videoInfo.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
                    <div className="absolute bottom-0 left-0 p-8 md:p-12 w-full max-w-4xl z-10">
                      <span className="bg-yd-primary/20 text-yd-primary border border-yd-primary/30 px-3 py-1 rounded text-xs font-bold mb-4 inline-block">YOUDOWN PRO</span>
                      <h1 className="text-3xl md:text-5xl font-black mb-4 leading-tight">{videoInfo.title}</h1>
                      <div className="flex flex-wrap items-center gap-4">
                        <button onClick={() => handleDownload('mp4')} className="bg-yd-primary text-white px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-red-600 transition-colors shadow-lg shadow-yd-primary/20">
                          <Play fill="currentColor" size={20} /> VÍDEO
                        </button>
                        
                        {videoInfo.formats?.length > 0 && (
                          <select 
                            value={selectedQuality} 
                            onChange={(e) => setSelectedQuality(e.target.value)}
                            className="bg-white/10 backdrop-blur-md text-white px-4 py-3 rounded-lg font-bold border border-white/20 outline-none cursor-pointer hover:bg-white/20 transition-colors text-sm"
                          >
                            {videoInfo.formats.map(f => (
                              <option key={f.height} value={f.height} className="bg-[#1a1a1a]">{f.label}</option>
                            ))}
                            <option value="best" className="bg-[#1a1a1a]">Máxima Disponível</option>
                          </select>
                        )}

                        <button onClick={() => handleDownload('mp3')} className="bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-lg font-bold border border-white/20 hover:bg-white/20 transition-colors flex items-center gap-2">
                          <Music size={20} /> ÁUDIO
                        </button>
                        <button onClick={() => setShowCut(!showCut)} className="bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-lg font-bold border border-white/20 hover:bg-white/20 transition-colors flex items-center gap-2">
                          <Scissors size={20} /> RECORTE
                        </button>
                        <button onClick={() => setShowDetails(true)} className="bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-lg font-bold border border-white/20 hover:bg-white/20 transition-colors flex items-center gap-2">
                          <Info size={20} /> DETALHES
                        </button>
                      </div>

                      <AnimatePresence>
                        {showCut && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 glass p-6 rounded-2xl flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[150px]">
                              <label className="block text-xs font-bold text-white/50 mb-2">INÃCIO</label>
                              <input type="text" value={cutStart} onChange={e => setCutStart(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:border-yd-primary outline-none font-mono" />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                              <label className="block text-xs font-bold text-white/50 mb-2">FIM</label>
                              <input type="text" value={cutEnd} onChange={e => setCutEnd(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:border-yd-primary outline-none font-mono" />
                            </div>
                            <div className="flex-2 min-w-[200px]">
                              <label className="block text-xs font-bold text-white/50 mb-2">NOME</label>
                              <input type="text" value={cutName} onChange={e => setCutName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:border-yd-primary outline-none" />
                            </div>
                            <button onClick={processCut} className="bg-yd-primary text-white px-6 py-2 rounded-lg font-bold hover:bg-red-600 transition-colors h-[42px] flex items-center gap-2">
                              <Scissors size={18} /> CORTAR
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.section>
                )}
              </AnimatePresence>

              {videoInfo?.chapters?.length > 0 && (
                <section className="mb-12">
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><Bookmark className="text-yd-primary" /> CENAS DETETADAS</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {videoInfo.chapters.map((ch, i) => (
                      <div key={i} className="glass rounded-2xl p-6 flex flex-col justify-between">
                        <div>
                          <p className="text-yd-primary font-mono text-sm mb-2">{formatTime(ch.start_time)} - {formatTime(ch.end_time)}</p>
                          <h3 className="font-bold text-lg mb-4">{ch.title}</h3>
                        </div>
                        <button onClick={() => processChapterCut(ch.start_time, ch.end_time, ch.title)} className="bg-white/10 hover:bg-white/20 text-white w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors mt-4">
                          <Scissors size={18} /> RECORTAR CENA
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {videoInfo?.entries?.length > 0 && (
                <section className="mb-12">
                  <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                    <h2 className="text-2xl font-bold flex items-center gap-3"><ListVideo className="text-yd-primary" /> VÃDEOS DA PLAYLIST</h2>
                    <div className="flex gap-4">
                      <button onClick={() => {
                        if (selectedPlaylist.size === videoInfo.entries.length) setSelectedPlaylist(new Set());
                        else setSelectedPlaylist(new Set(videoInfo.entries.map((_, i) => i)));
                      }} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                        Selecionar Tudo
                      </button>
                      <button onClick={downloadPlaylist} className="bg-yd-primary hover:bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
                        <Download size={16} /> Baixar Selecionados
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {videoInfo.entries.map((entry, i) => (
                      <div key={i} className="glass rounded-xl p-4 flex flex-col gap-4">
                        <div className="flex items-center gap-4">
                          <input type="checkbox" checked={selectedPlaylist.has(i)} onChange={() => {
                            const next = new Set(selectedPlaylist);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            setSelectedPlaylist(next);
                          }} className="w-5 h-5 accent-yd-primary shrink-0" />
                          <img src={entry.thumbnail || '/favicon.png'} className="w-20 h-14 object-cover rounded-lg shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold truncate text-sm">{entry.title}</h4>
                            <p className="text-xs text-white/50 truncate">{entry.channel}</p>
                          </div>
                          <button onClick={() => analyzeUrl(entry.url)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors shrink-0" title="Analisar este vídeo">
                            <Search size={18} />
                          </button>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-white/10">
                          <button onClick={() => downloadSinglePlaylistEntry(entry, 'mp4', i)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                            <Play size={14} /> MP4
                          </button>
                          <button onClick={() => downloadSinglePlaylistEntry(entry, 'mp3', i)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                            <Music size={14} /> MP3
                          </button>
                          <a href={entry.url} target="_blank" rel="noreferrer" className="flex-1 bg-white/10 hover:bg-white/20 text-white py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2">
                            <Search size={14} /> Link
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="mb-12">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><Zap className="text-yd-primary" /> TRANSFERÊNCIAS EM CURSO</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Object.values(tasks).length === 0 && (
                    <div className="col-span-full border border-dashed border-white/10 rounded-2xl py-12 flex flex-col items-center justify-center text-white/20">
                      <Download size={48} className="mb-4" />
                      <p className="text-lg">Nenhum download ativo no momento.</p>
                    </div>
                  )}
                  {Object.values(tasks).map(task => <TaskCard key={task.id} task={task} setTasks={setTasks} />)}
                </div>
              </section>

              <section>
                 <h2 className="text-xl font-bold mb-4 flex items-center gap-3 opacity-50"><TerminalIcon size={20} /> ENGINE CONSOLE</h2>
                <div className="bg-black/50 rounded-2xl border border-white/10 p-6 h-64 overflow-y-auto font-mono text-sm">
                  {logs.length === 0 && <p className="text-white/20 italic">Aguardando sinais do motor...</p>}
                  {logs.map((log, i) => (
                    <div key={i} className={`mb-1 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-white/60'}`}>
                      <span className="text-white/20">[{new Date().toLocaleTimeString()}]</span> <span className="opacity-80">[{log.level?.toUpperCase()}]</span> {log.message || log.msg}
                    </div>
                  ))}
                  <div ref={logEndRef} />
                </div>
              </section>
            </>
          )}

          {activeTab === 'history' && <HistoryView notify={notify} />}
          {activeTab === 'settings' && <SettingsView notify={notify} />}
          {activeTab === 'vision' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto py-16 px-8">
              <div className="text-center mb-20 relative">
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-yd-primary/20 blur-[100px] rounded-full"></div>
                <h1 className="text-6xl md:text-8xl font-black mb-6 tracking-tighter leading-none bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                  THE<br />VISION
                </h1>
                <p className="text-yd-primary font-black uppercase tracking-[0.3em] text-sm">IA Agêntica & SaaS Componível</p>
              </div>
              
              <div className="grid grid-cols-1 gap-12">
                <div className="glass p-12 rounded-[40px] border-l-8 border-yd-primary relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 text-white/5 font-black text-9xl select-none group-hover:text-yd-primary/5 transition-colors">01</div>
                  <h2 className="text-4xl font-black mb-8 tracking-tight">O Problema do SaaS Tradicional</h2>
                  <p className="text-white/60 leading-relaxed text-xl font-medium">
                    O SaaS tradicional resolveu a eficiência, mas não a transformação. Moveu sistemas isolados para a nuvem, recriando silos. 
                    <br /><br />
                    Na era da IA, a eficiência é o básico. O verdadeiro diferencial competitivo é o <span className="text-white border-b-2 border-yd-primary/50">Contexto Operacional Proprietário</span>.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="glass p-10 rounded-[40px] border border-white/5 hover:border-yd-primary/30 transition-all duration-500">
                    <div className="w-12 h-12 bg-yd-primary rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-yd-primary/20">
                      <Sparkles className="text-white" size={24} />
                    </div>
                    <h3 className="text-2xl font-black mb-6 uppercase tracking-tight">A Muralha do Contexto</h3>
                    <p className="text-white/50 leading-relaxed">
                      Quando a IA se torna uma commodity, a capacidade de capturar contexto end-to-end e modularizá-lo em ferramentas governáveis para agentes torna-se o seu único diferencial.
                    </p>
                  </div>

                  <div className="glass p-10 rounded-[40px] border border-white/5 bg-gradient-to-br from-yd-primary/10 to-transparent">
                    <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mb-8">
                      <Zap className="text-black" size={24} />
                    </div>
                    <h3 className="text-2xl font-black mb-6 uppercase tracking-tight">Arquitetura Componível</h3>
                    <p className="text-white/50 leading-relaxed">
                      Abstrair sistemas heterogéneos através de arquiteturas neutras, harmonizando dados e contexto para permitir orquestração agêntica de nível empresarial.
                    </p>
                  </div>
                </div>

                <div className="glass p-12 rounded-[40px] text-center border border-white/10">
                  <p className="text-white/30 text-sm uppercase font-black tracking-widest mb-4 italic">"The path forward isn't abandoning SaaS—it's abstracting it."</p>
                  <div className="h-[1px] w-20 bg-yd-primary mx-auto mb-8"></div>
                  <p className="text-white/60 text-lg">
                    O YouDown Pro é construído sobre estes princípios: <span className="text-yd-primary font-bold">neutralidade de vendor</span>, <span className="text-white font-bold">preservação de contexto</span> e <span className="text-white font-bold">preparação agêntica</span>.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {showDetails && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDetails(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm"></motion.div>
                <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="relative bg-[#1a1a1a] border border-white/10 w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-3xl flex flex-col">
                  <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h3 className="text-xl font-bold flex items-center gap-3"><Info className="text-yd-primary" /> Detalhes do Vídeo</h3>
                    <button onClick={() => setShowDetails(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-8">
                    {extractResources(videoInfo?.description || "").length > 0 && (
                      <section>
                        <h4 className="text-sm font-bold text-yd-primary uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ExternalLink size={16} /> Recursos Encontrados
                        </h4>
                        <div className="space-y-3">
                          {extractResources(videoInfo.description).map((res, i) => (
                            <div key={i} className="glass p-4 rounded-xl flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <span className="bg-yd-primary/10 p-2 rounded-lg text-yd-primary"><Search size={18} /></span>
                                <span className="font-bold text-sm">{res.type}</span>
                              </div>
                              <a href={res.url} target="_blank" rel="noreferrer" className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-xs font-bold transition-colors">Aceder</a>
                            </div>
                          ))}
                        </div>
                      </section>
                    )}
                    <section>
                      <h4 className="text-sm font-bold text-yd-primary uppercase tracking-widest mb-4">Descrição</h4>
                      <div className="bg-black/50 border border-white/10 p-6 rounded-2xl text-sm text-white/70 leading-relaxed whitespace-pre-wrap font-sans">
                        {renderDescription(videoInfo?.description)}
                      </div>
                    </section>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Toast Notifications */}
      <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-4 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.9 }}
              className="glass p-4 rounded-2xl w-80 shadow-2xl border border-white/10 flex items-start gap-4 pointer-events-auto overflow-hidden relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-yd-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className={`mt-1 p-2 rounded-lg ${toast.type === 'error' ? 'bg-red-500/20 text-red-500' : toast.type === 'success' ? 'bg-green-500/20 text-green-500' : 'bg-yd-primary/20 text-yd-primary'}`}>
                {toast.type === 'error' ? <AlertCircle size={20} /> : toast.type === 'success' ? <CheckCircle size={20} /> : <Zap size={20} />}
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-sm mb-1">{toast.title}</h4>
                <p className="text-xs text-white/50">{toast.msg}</p>
              </div>
              <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="text-white/20 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function HistoryView({ notify }) {
  const [history, setHistory] = useState([]);
  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/history`);
      setHistory(res.data.files || []);
    } catch (e) { console.error(e); }
  };

  const playVideo = async (file_path) => {
    try {
      const res = await axios.post(`${API_BASE}/api/execute-play`, { file_path });
      if (!res.data.success) notify("Erro", res.data.message || "Não foi possível abrir o vídeo.", "error");
    } catch (e) {
      notify("Erro", "Erro ao tentar abrir o ficheiro.", "error");
    }
  };

  const deleteItem = async (id) => {
    if (!window.confirm("Remover este item?")) return;
    await axios.post(`${API_BASE}/api/delete`, { id });
    fetchHistory();
  };

  const clearHistory = async () => {
    if (!window.confirm("Limpar todo o histórico?")) return;
    await axios.post(`${API_BASE}/api/clear-history`);
    fetchHistory();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold flex items-center gap-3"><HistoryIcon className="text-yd-primary" /> Histórico de Downloads</h2>
        <button onClick={clearHistory} className="bg-red-500/20 text-red-500 px-4 py-2 rounded-lg font-bold hover:bg-red-500/30 transition-colors flex items-center gap-2">
          <Trash2 size={18} /> Limpar
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {history.map(item => (
          <div key={item.id} className="glass rounded-xl overflow-hidden group/card shadow-lg hover:shadow-yd-primary/10 transition-all border border-white/5">
            <div className="relative aspect-video group/thumb cursor-pointer overflow-hidden" onClick={() => playVideo(item.file_path)}>
              <img src={item.thumbnail || '/favicon.png'} className="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-700" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                <div className="bg-yd-primary p-4 rounded-full shadow-2xl scale-75 group-hover/thumb:scale-100 transition-transform">
                  <Play className="text-white ml-1" fill="white" size={32} />
                </div>
              </div>
              <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] font-bold uppercase border border-white/10 backdrop-blur-md">{item.format}</div>
            </div>
            <div className="p-4 flex justify-between items-start bg-white/5">
              <div className="pr-2 min-w-0">
                <h4 className="font-bold truncate mb-1 text-sm text-white/90">{item.title}</h4>
                <p className="text-[10px] text-white/40 font-medium">{item.channel} • {item.date}</p>
              </div>
              <button onClick={() => deleteItem(item.id)} className="text-white/20 hover:text-red-500 transition-colors p-1 flex-shrink-0">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function SettingsView({ notify }) {
  const [loading, setLoading] = useState(null);

  const syncCookies = async () => {
    setLoading('cookies');
    try {
      const res = await axios.post(`${API_BASE}/api/sync-cookies`);
      if (res.data.success) notify("Sucesso", `Sincronizado com ${res.data.browser}.`, "success");
      else notify("Aviso", "Falha na sincronização. É provável que precise de executar o terminal como Administrador.", "warn");
    } catch { notify("Erro", "Erro de comunicação.", "error"); }
    setLoading(null);
  };

  const [cookieText, setCookieText] = useState('');
  const saveManualCookies = async () => {
    if (!cookieText.trim()) return notify("Aviso", "Cole o texto dos cookies primeiro!", "warn");
    setLoading('manual');
    try {
      const res = await axios.post(`${API_BASE}/api/save-cookies`, { cookies: cookieText });
      if (res.data.success) {
        notify("Sucesso", "Cookies guardados com sucesso!", "success");
        setCookieText('');
      } else notify("Erro", "Erro ao guardar.", "error");
    } catch { notify("Erro", "Erro de comunicação.", "error"); }
    setLoading(null);
  };

  const updateEngine = async () => {
    setLoading('engine');
    try {
      const res = await axios.post(`${API_BASE}/api/update-engine`);
      notify("Motor", res.data.message, "success");
    } catch { notify("Erro", "Erro ao atualizar.", "error"); }
    setLoading(null);
  };

  const openFolder = () => axios.post(`${API_BASE}/api/open-folder`);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-8">
      <h2 className="text-3xl font-bold mb-10 flex items-center gap-3"><SettingsIcon className="text-yd-primary" /> Definições de Sistema</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-8 rounded-2xl">
          <div className="w-12 h-12 bg-yd-primary/10 rounded-xl flex items-center justify-center mb-6">
            <FileCheck className="text-yd-primary" size={24} />
          </div>
          <h3 className="text-xl font-bold mb-2">Autenticação (YouTube)</h3>
          <p className="text-white/50 mb-6 text-sm">Sincronize com o seu navegador principal para fazer bypass aos bloqueios anti-bot (n challenge).</p>
          <button onClick={syncCookies} disabled={loading === 'cookies'} className="bg-yd-primary text-white w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-600 transition-colors disabled:opacity-50 mb-4">
            {loading === 'cookies' ? <RefreshCw className="animate-spin" size={18} /> : <RefreshCw size={18} />} Sincronização Automática
          </button>
          
          <div className="pt-4 border-t border-white/10">
            <p className="text-[10px] text-white/40 uppercase font-bold mb-2 tracking-widest">Ou colar manualmente (cookies.txt)</p>
            <textarea value={cookieText} onChange={e => setCookieText(e.target.value)} placeholder="Cole o conteúdo do seu cookies.txt aqui..." className="w-full h-20 bg-black/50 border border-white/10 rounded-lg p-3 text-xs font-mono text-white/70 focus:border-yd-primary outline-none resize-none mb-3"></textarea>
            <button onClick={saveManualCookies} disabled={loading === 'manual'} className="bg-white/10 border border-white/10 text-white w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors disabled:opacity-50 text-sm">
              Guardar Cookies Manuais
            </button>
          </div>
        </div>

        <div className="glass p-8 rounded-2xl">
           <div className="w-12 h-12 bg-yd-primary/10 rounded-xl flex items-center justify-center mb-6">
            <Zap className="text-yd-primary" size={24} />
          </div>
          <h3 className="text-xl font-bold mb-2">Motor yt-dlp</h3>
          <p className="text-white/50 mb-8 text-sm">Mantenha a engine de extração atualizada para evitar falhas de assinatura.</p>
          <button onClick={updateEngine} disabled={loading === 'engine'} className="bg-white/10 border border-white/10 text-white w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors disabled:opacity-50">
            {loading === 'engine' ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />} Atualizar Motor
          </button>
        </div>

        <div className="glass p-8 rounded-2xl md:col-span-2 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2"><FolderOpen className="text-yd-primary" /> Pasta de Output</h3>
            <p className="text-white/50 text-sm">Aceda rapidamente à raiz onde os ficheiros MP4 e MP3 são guardados.</p>
          </div>
          <button onClick={openFolder} className="bg-white text-black px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/90 transition-colors whitespace-nowrap">
            <FolderOpen size={18} /> Abrir Diretório
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function NavItem({ active, icon, label, onClick }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${active ? 'bg-yd-primary text-white shadow-lg shadow-yd-primary/20' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
      {icon}
      <span className="hidden lg:block font-bold">{label}</span>
      {active && <div className="ml-auto hidden lg:block"><ChevronRight size={16} /></div>}
    </button>
  );
}

function TaskCard({ task, setTasks }) {
  const isFinished = task.status === 'finished';
  const isError = task.status === 'error';

  const removeTask = () => setTasks(prev => {
    const next = {...prev};
    delete next[task.id];
    return next;
  });

  return (
    <motion.div layout initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-2xl overflow-hidden relative group">
      {isFinished && <div className="absolute inset-0 bg-green-500/10 pointer-events-none"></div>}
      {isError && <div className="absolute inset-0 bg-red-500/10 pointer-events-none"></div>}

      <div className="flex gap-4 p-5">
        {task.thumbnail && (
          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 shadow-lg">
            <img src={task.thumbnail} className="w-full h-full object-cover" alt="" />
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-bold truncate text-sm text-white/90">{task.title || (isError ? (task.error || "Erro") : "Processando...")}</h3>
            {isFinished ? <CheckCircle className="text-green-400 flex-shrink-0 ml-2" size={18} /> : isError ? <AlertCircle className="text-red-400 flex-shrink-0 ml-2" size={18} /> : <Clock className="text-yd-primary animate-pulse flex-shrink-0 ml-2" size={18} />}
          </div>
          <p className="text-[10px] text-white/30 tracking-wider uppercase font-mono">ID: {task.id.substring(0, 8)}</p>
        </div>
      </div>

      <div className="px-5 pb-5">
        <div className="flex justify-between text-xs mb-2">
          <span className="font-bold text-lg">{task.percent}%</span>
          <span className="opacity-50">{task.speed || '---'}</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${task.percent}%` }} className={`h-full rounded-full ${isError ? 'bg-red-500' : isFinished ? 'bg-green-500' : 'bg-yd-primary'}`} />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-xs space-y-1">
          <p className="flex items-center gap-2"><Zap size={12} className="text-yd-primary" /> {task.eta || '--:--'}</p>
          <p className="opacity-50 uppercase tracking-widest text-[10px] font-bold">{task.status}</p>
        </div>
        {(isFinished || isError) && (
          <button onClick={removeTask} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all">
            <X size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
