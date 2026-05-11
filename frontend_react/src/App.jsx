import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { 
  Download, Search, History as HistoryIcon, Settings as SettingsIcon, 
  Play, X, AlertCircle, CheckCircle, Clock, Zap, Terminal as TerminalIcon, 
  ChevronRight, Trash2, RefreshCw, FolderOpen, FileCheck, Scissors, Music,
  Bookmark, ListVideo
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
  const logEndRef = useRef(null);

  const [showCut, setShowCut] = useState(false);
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
      alert(err.response?.data?.error || "Erro ao analisar URL");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = async (format = 'mp4') => {
    if (!videoInfo) return;
    try {
      await axios.post(`${API_BASE}/api/download-single`, { 
        url: videoInfo.url || videoInfo.webpage_url,
        id: videoInfo.id,
        format,
        title: videoInfo.title,
        thumbnail: videoInfo.thumbnail,
        channel: videoInfo.channel || videoInfo.uploader
      });
    } catch (err) {
      alert("Erro ao iniciar download");
    }
  };

  const processCut = async () => {
    const toSeconds = (s) => s.split(':').reverse().reduce((acc, val, i) => acc + parseInt(val) * Math.pow(60, i), 0);
    const start = toSeconds(cutStart);
    const end = toSeconds(cutEnd);
    if(isNaN(start) || isNaN(end) || end <= start) return alert("Tempos inválidos!");
    
    try {
      await axios.post(`${API_BASE}/api/download-section`, {
        url: videoInfo.url || videoInfo.webpage_url,
        id: videoInfo.id,
        start, end, title: cutName
      });
      setShowCut(false);
    } catch (e) {
      alert("Erro ao cortar vídeo.");
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
      alert("Erro ao cortar vídeo.");
    }
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
      alert(err.response?.data?.error || "Erro ao analisar URL");
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
    if (selectedIndices.length === 0) return alert("Selecione pelo menos um vídeo.");
    
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
          playlist_title: playlistTitle
        });
      } catch (err) {}
    }
  };

  return (
    <div className="flex h-screen bg-netflix-black text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <nav className="w-20 lg:w-64 bg-black flex flex-col border-r border-white/10">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-netflix-red rounded-lg flex items-center justify-center font-bold text-xl">Y</div>
          <span className="hidden lg:block text-2xl font-black tracking-tighter">YOU<span className="text-netflix-red">DOWN</span></span>
        </div>
        
        <div className="flex-1 px-4 py-8 space-y-4">
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Play size={24} />} label="Dashboard" />
          <NavItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<HistoryIcon size={24} />} label="Histórico" />
          <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<SettingsIcon size={24} />} label="Definições" />
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-[#141414] relative">
        <header className="sticky top-0 z-50 p-6 flex justify-between items-center bg-gradient-to-b from-[#141414] to-transparent">
          <div className="flex-1 max-w-2xl relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-netflix-red transition-colors" />
            <input 
              type="text" placeholder="Cole o link do YouTube aqui..." 
              value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-netflix-red focus:bg-white/10 transition-all placeholder:text-white/20"
            />
            {analyzing && <div className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin rounded-full h-5 w-5 border-2 border-netflix-red border-t-transparent"></div>}
          </div>
        </header>

        <div className="px-8 pb-12">
          {activeTab === 'dashboard' && (
            <>
              <AnimatePresence mode="wait">
                {videoInfo && (
                  <motion.section 
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                    className="mb-12 relative rounded-3xl overflow-hidden netflix-shadow group min-h-[400px]"
                  >
                    <img src={videoInfo.thumbnail} className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent"></div>
                    <div className="absolute bottom-0 left-0 p-8 md:p-12 w-full max-w-4xl z-10">
                      <span className="bg-netflix-red/20 text-netflix-red border border-netflix-red/30 px-3 py-1 rounded text-xs font-bold mb-4 inline-block">YOUTUBE CONTENT</span>
                      <h1 className="text-3xl md:text-5xl font-black mb-4 leading-tight">{videoInfo.title}</h1>
                      <div className="flex flex-wrap items-center gap-4">
                        <button onClick={() => handleDownload('mp4')} className="bg-white text-black px-6 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-white/90 transition-colors">
                          <Play fill="currentColor" size={20} /> VÍDEO
                        </button>
                        <button onClick={() => handleDownload('mp3')} className="bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-lg font-bold border border-white/20 hover:bg-white/20 transition-colors flex items-center gap-2">
                          <Music size={20} /> ÁUDIO
                        </button>
                        <button onClick={() => setShowCut(!showCut)} className="bg-white/10 backdrop-blur-md text-white px-6 py-3 rounded-lg font-bold border border-white/20 hover:bg-white/20 transition-colors flex items-center gap-2">
                          <Scissors size={20} /> RECORTE
                        </button>
                      </div>

                      <AnimatePresence>
                        {showCut && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-6 glass p-6 rounded-2xl flex flex-wrap gap-4 items-end">
                            <div className="flex-1 min-w-[150px]">
                              <label className="block text-xs font-bold text-white/50 mb-2">INÍCIO</label>
                              <input type="text" value={cutStart} onChange={e => setCutStart(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:border-netflix-red outline-none font-mono" />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                              <label className="block text-xs font-bold text-white/50 mb-2">FIM</label>
                              <input type="text" value={cutEnd} onChange={e => setCutEnd(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:border-netflix-red outline-none font-mono" />
                            </div>
                            <div className="flex-2 min-w-[200px]">
                              <label className="block text-xs font-bold text-white/50 mb-2">NOME</label>
                              <input type="text" value={cutName} onChange={e => setCutName(e.target.value)} className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-2 focus:border-netflix-red outline-none" />
                            </div>
                            <button onClick={processCut} className="bg-netflix-red text-white px-6 py-2 rounded-lg font-bold hover:bg-red-600 transition-colors h-[42px] flex items-center gap-2">
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
                  <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><Bookmark className="text-netflix-red" /> CENAS DETETADAS</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {videoInfo.chapters.map((ch, i) => (
                      <div key={i} className="glass rounded-2xl p-6 flex flex-col justify-between">
                        <div>
                          <p className="text-netflix-red font-mono text-sm mb-2">{formatTime(ch.start_time)} - {formatTime(ch.end_time)}</p>
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
                    <h2 className="text-2xl font-bold flex items-center gap-3"><ListVideo className="text-netflix-red" /> VÍDEOS DA PLAYLIST</h2>
                    <div className="flex gap-4">
                      <button onClick={() => {
                        if (selectedPlaylist.size === videoInfo.entries.length) setSelectedPlaylist(new Set());
                        else setSelectedPlaylist(new Set(videoInfo.entries.map((_, i) => i)));
                      }} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-bold text-sm transition-colors">
                        Selecionar Tudo
                      </button>
                      <button onClick={downloadPlaylist} className="bg-netflix-red hover:bg-red-600 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors">
                        <Download size={16} /> Baixar Selecionados
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {videoInfo.entries.map((entry, i) => (
                      <div key={i} className="glass rounded-xl p-4 flex items-center gap-4">
                        <input type="checkbox" checked={selectedPlaylist.has(i)} onChange={() => {
                          const next = new Set(selectedPlaylist);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          setSelectedPlaylist(next);
                        }} className="w-5 h-5 accent-netflix-red shrink-0" />
                        <img src={entry.thumbnail || '/favicon.png'} className="w-20 h-14 object-cover rounded-lg shrink-0" />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold truncate text-sm">{entry.title}</h4>
                          <p className="text-xs text-white/50 truncate">{entry.channel}</p>
                        </div>
                        <button onClick={() => analyzeUrl(entry.url)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors shrink-0" title="Analisar este vídeo">
                          <Search size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="mb-12">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3"><Zap className="text-netflix-red" /> TRANSFERÊNCIAS EM CURSO</h2>
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

          {activeTab === 'history' && <HistoryView />}
          {activeTab === 'settings' && <SettingsView />}

        </div>
      </main>
    </div>
  );
}

function HistoryView() {
  const [history, setHistory] = useState([]);
  useEffect(() => { fetchHistory(); }, []);

  const fetchHistory = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/history`);
      setHistory(res.data.files || []);
    } catch (e) { console.error(e); }
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
        <h2 className="text-3xl font-bold flex items-center gap-3"><HistoryIcon className="text-netflix-red" /> Histórico de Downloads</h2>
        <button onClick={clearHistory} className="bg-red-500/20 text-red-500 px-4 py-2 rounded-lg font-bold hover:bg-red-500/30 transition-colors flex items-center gap-2">
          <Trash2 size={18} /> Limpar
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {history.map(item => (
          <div key={item.id} className="glass rounded-xl overflow-hidden group">
            <div className="relative aspect-video">
              <img src={item.thumbnail || '/favicon.png'} className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 bg-black/80 px-2 py-1 rounded text-[10px] font-bold uppercase border border-white/10">{item.format}</div>
            </div>
            <div className="p-4 flex justify-between items-start">
              <div className="pr-2">
                <h4 className="font-bold line-clamp-2 mb-1 text-sm">{item.title}</h4>
                <p className="text-[10px] text-white/50">{item.channel} • {item.date}</p>
              </div>
              <button onClick={() => deleteItem(item.id)} className="text-white/30 hover:text-red-500 transition-colors p-1">
                <X size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function SettingsView() {
  const [loading, setLoading] = useState(null);

  const syncCookies = async () => {
    setLoading('cookies');
    try {
      const res = await axios.post(`${API_BASE}/api/sync-cookies`);
      alert(res.data.success ? `Sucesso! Sincronizado com ${res.data.browser}.` : "Falha na sincronização. É provável que precise de executar o terminal como Administrador.");
    } catch { alert("Erro de comunicação."); }
    setLoading(null);
  };

  const [cookieText, setCookieText] = useState('');
  const saveManualCookies = async () => {
    if (!cookieText.trim()) return alert("Cole o texto dos cookies primeiro!");
    setLoading('manual');
    try {
      const res = await axios.post(`${API_BASE}/api/save-cookies`, { cookies: cookieText });
      if (res.data.success) {
        alert("Cookies guardados com sucesso!");
        setCookieText('');
      } else alert("Erro ao guardar.");
    } catch { alert("Erro de comunicação."); }
    setLoading(null);
  };

  const updateEngine = async () => {
    setLoading('engine');
    try {
      const res = await axios.post(`${API_BASE}/api/update-engine`);
      alert(res.data.message);
    } catch { alert("Erro ao atualizar."); }
    setLoading(null);
  };

  const openFolder = () => axios.post(`${API_BASE}/api/open-folder`);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-8">
      <h2 className="text-3xl font-bold mb-10 flex items-center gap-3"><SettingsIcon className="text-netflix-red" /> Definições de Sistema</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass p-8 rounded-2xl">
          <div className="w-12 h-12 bg-netflix-red/10 rounded-xl flex items-center justify-center mb-6">
            <FileCheck className="text-netflix-red" size={24} />
          </div>
          <h3 className="text-xl font-bold mb-2">Autenticação (YouTube)</h3>
          <p className="text-white/50 mb-6 text-sm">Sincronize com o seu navegador principal para fazer bypass aos bloqueios anti-bot (n challenge).</p>
          <button onClick={syncCookies} disabled={loading === 'cookies'} className="bg-netflix-red text-white w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-600 transition-colors disabled:opacity-50 mb-4">
            {loading === 'cookies' ? <RefreshCw className="animate-spin" size={18} /> : <RefreshCw size={18} />} Sincronização Automática
          </button>
          
          <div className="pt-4 border-t border-white/10">
            <p className="text-[10px] text-white/40 uppercase font-bold mb-2 tracking-widest">Ou colar manualmente (cookies.txt)</p>
            <textarea value={cookieText} onChange={e => setCookieText(e.target.value)} placeholder="Cole o conteúdo do seu cookies.txt aqui..." className="w-full h-20 bg-black/50 border border-white/10 rounded-lg p-3 text-xs font-mono text-white/70 focus:border-netflix-red outline-none resize-none mb-3"></textarea>
            <button onClick={saveManualCookies} disabled={loading === 'manual'} className="bg-white/10 border border-white/10 text-white w-full py-2 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors disabled:opacity-50 text-sm">
              Guardar Cookies Manuais
            </button>
          </div>
        </div>

        <div className="glass p-8 rounded-2xl">
           <div className="w-12 h-12 bg-netflix-red/10 rounded-xl flex items-center justify-center mb-6">
            <Zap className="text-netflix-red" size={24} />
          </div>
          <h3 className="text-xl font-bold mb-2">Motor yt-dlp</h3>
          <p className="text-white/50 mb-8 text-sm">Mantenha a engine de extração atualizada para evitar falhas de assinatura.</p>
          <button onClick={updateEngine} disabled={loading === 'engine'} className="bg-white/10 border border-white/10 text-white w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors disabled:opacity-50">
            {loading === 'engine' ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />} Atualizar Motor
          </button>
        </div>

        <div className="glass p-8 rounded-2xl md:col-span-2 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl font-bold mb-2 flex items-center gap-2"><FolderOpen className="text-netflix-red" /> Pasta de Output</h3>
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
    <button onClick={onClick} className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${active ? 'bg-netflix-red text-white shadow-lg shadow-netflix-red/20' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}>
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
    <motion.div layout initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-2xl p-6 relative overflow-hidden">
      {isFinished && <div className="absolute inset-0 bg-green-500/10 pointer-events-none"></div>}
      {isError && <div className="absolute inset-0 bg-red-500/10 pointer-events-none"></div>}

      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 pr-4">
          <p className="text-[10px] text-white/40 mb-1 tracking-wider uppercase">ID: {task.id.substring(0, 8)}</p>
          <h3 className="font-bold truncate text-sm">{isError ? (task.error || "Erro de Processamento") : "Processando Stream..."}</h3>
        </div>
        {isFinished ? <CheckCircle className="text-green-500" /> : isError ? <AlertCircle className="text-red-500" /> : <Clock className="text-netflix-red animate-pulse-slow" />}
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="font-bold text-lg">{task.percent}%</span>
          <span className="opacity-50">{task.speed || '---'}</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${task.percent}%` }} className={`h-full rounded-full ${isError ? 'bg-red-500' : isFinished ? 'bg-green-500' : 'bg-netflix-red'}`} />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-xs space-y-1">
          <p className="flex items-center gap-2"><Zap size={12} className="text-netflix-red" /> {task.eta || '--:--'}</p>
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
