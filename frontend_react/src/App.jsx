import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { 
  Download, 
  Search, 
  History, 
  Settings, 
  Play, 
  X, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Zap,
  Terminal as TerminalIcon,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://localhost:5000';
const socket = io(API_BASE, { transports: ['websocket'] });

export default function App() {
  const [url, setUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [videoInfo, setVideoInfo] = useState(null);
  const [tasks, setTasks] = useState({});
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const logEndRef = useRef(null);

  useEffect(() => {
    socket.on('progress', (data) => {
      setTasks(prev => ({ ...prev, [data.id]: data }));
    });

    socket.on('log', (data) => {
      setLogs(prev => [...prev.slice(-100), data]);
    });

    return () => {
      socket.off('progress');
      socket.off('log');
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleAnalyze = async () => {
    if (!url) return;
    setAnalyzing(true);
    setVideoInfo(null);
    try {
      const res = await axios.post(`${API_BASE}/api/info`, { url });
      setVideoInfo(res.data);
    } catch (err) {
      alert("Erro ao analisar URL");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDownload = async () => {
    if (!videoInfo) return;
    try {
      await axios.post(`${API_BASE}/api/download`, { 
        url: videoInfo.webpage_url,
        format: 'mp4'
      });
      // A tarefa será adicionada via socket 'progress'
    } catch (err) {
      alert("Erro ao iniciar download");
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
          <NavItem active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={24} />} label="Histórico" />
          <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={24} />} label="Definições" />
        </div>

        <div className="p-4">
          <div className="glass rounded-xl p-4 hidden lg:block">
            <p className="text-xs text-white/50 mb-2">STORAGE</p>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-netflix-red w-3/4"></div>
            </div>
            <p className="text-xs mt-2 font-medium">12.4 GB / 20 GB</p>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-y-auto bg-[#141414] relative">
        {/* Header / Search */}
        <header className="sticky top-0 z-50 p-6 flex justify-between items-center bg-gradient-to-b from-[#141414] to-transparent">
          <div className="flex-1 max-w-2xl relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-netflix-red transition-colors" />
            <input 
              type="text" 
              placeholder="Cole o link do YouTube aqui..." 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
              className="w-full bg-white/5 border border-white/10 rounded-full py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-netflix-red focus:bg-white/10 transition-all placeholder:text-white/20"
            />
            {analyzing && <div className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin rounded-full h-5 w-5 border-2 border-netflix-red border-t-transparent"></div>}
          </div>
          
          <div className="flex items-center gap-4 ml-6">
            <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-bold border border-green-500/20">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              ONLINE
            </div>
            <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" className="w-10 h-10 rounded-full border border-white/10" />
          </div>
        </header>

        <div className="px-8 pb-12">
          {/* Hero Section (When video analyzed) */}
          <AnimatePresence mode="wait">
            {videoInfo && (
              <motion.section 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-12 relative rounded-3xl overflow-hidden aspect-[21/9] netflix-shadow group"
              >
                <img src={videoInfo.thumbnail} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                <div className="absolute inset-0 gradient-overlay"></div>
                <div className="absolute bottom-0 left-0 p-12 w-full max-w-4xl">
                  <span className="bg-netflix-red/20 text-netflix-red border border-netflix-red/30 px-3 py-1 rounded text-xs font-bold mb-4 inline-block">YOUTUBE CONTENT</span>
                  <h1 className="text-5xl font-black mb-4 leading-tight">{videoInfo.title}</h1>
                  <p className="text-white/60 text-lg mb-8 line-clamp-2">{videoInfo.description}</p>
                  <div className="flex items-center gap-4">
                    <button onClick={handleDownload} className="bg-white text-black px-8 py-3 rounded-lg font-bold flex items-center gap-2 hover:bg-white/90 transition-colors">
                      <Download size={20} /> DESCARREGAR AGORA
                    </button>
                    <button className="bg-white/10 backdrop-blur-md text-white px-8 py-3 rounded-lg font-bold border border-white/20 hover:bg-white/20 transition-colors">
                      VER DETALHES
                    </button>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {/* Active Downloads Grid */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
              <Zap className="text-netflix-red" /> TRANSFERÊNCIAS EM CURSO
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.values(tasks).length === 0 && (
                <div className="col-span-full border border-dashed border-white/10 rounded-2xl py-12 flex flex-col items-center justify-center text-white/20">
                  <Download size={48} className="mb-4" />
                  <p className="text-lg">Nenhum download ativo no momento.</p>
                </div>
              )}
              {Object.values(tasks).map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </section>

          {/* Log Console (Simplified) */}
          <section>
             <h2 className="text-xl font-bold mb-4 flex items-center gap-3 opacity-50">
              <TerminalIcon size={20} /> ENGINE CONSOLE
            </h2>
            <div className="bg-black/50 rounded-2xl border border-white/10 p-6 h-64 overflow-y-auto font-mono text-sm">
              {logs.length === 0 && <p className="text-white/20 italic">Aguardando sinais do motor...</p>}
              {logs.map((log, i) => (
                <div key={i} className={`mb-1 ${log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-yellow-400' : 'text-white/60'}`}>
                  <span className="text-white/20">[{new Date().toLocaleTimeString()}]</span> <span className="opacity-80">[{log.level?.toUpperCase()}]</span> {log.message}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${active ? 'bg-netflix-red text-white shadow-lg shadow-netflix-red/20' : 'text-white/50 hover:bg-white/5 hover:text-white'}`}
    >
      {icon}
      <span className="hidden lg:block font-bold">{label}</span>
      {active && <div className="ml-auto hidden lg:block"><ChevronRight size={16} /></div>}
    </button>
  );
}

function TaskCard({ task }) {
  const isFinished = task.status === 'finished';
  const isError = task.status === 'error';

  return (
    <motion.div 
      layout
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="glass rounded-2xl p-6 relative overflow-hidden"
    >
      {isFinished && <div className="absolute inset-0 bg-green-500/10 pointer-events-none"></div>}
      {isError && <div className="absolute inset-0 bg-red-500/10 pointer-events-none"></div>}

      <div className="flex justify-between items-start mb-4">
        <div className="flex-1 pr-4">
          <p className="text-xs text-white/40 mb-1">TASK ID: {task.id.substring(0, 8)}</p>
          <h3 className="font-bold truncate text-lg">Processando Media Stream</h3>
        </div>
        {isFinished ? <CheckCircle className="text-green-500" /> : isError ? <AlertCircle className="text-red-500" /> : <Clock className="text-netflix-red animate-pulse-slow" />}
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-xs mb-2">
          <span className="font-bold">{task.percent}%</span>
          <span className="opacity-50">{task.speed || '---'}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${task.percent}%` }}
            className={`h-full rounded-full ${isError ? 'bg-red-500' : isFinished ? 'bg-green-500' : 'bg-netflix-red'}`}
          />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div className="text-xs space-y-1">
          <p className="flex items-center gap-2"><Zap size={12} className="text-netflix-red" /> {task.eta || '--:--'}</p>
          <p className="opacity-50 uppercase tracking-widest text-[10px]">{task.status}</p>
        </div>
        {!isFinished && !isError && (
          <button className="p-2 hover:bg-white/10 rounded-lg text-white/30 hover:text-white transition-all">
            <X size={18} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
