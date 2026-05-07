import os
import yt_dlp
import logging
import time
import re
import sys
from typing import Callable, Optional, Dict, Any

# Configuração de Logging Estruturado
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("YouDown.Downloader")

class YDLPLogger:
    def __init__(self, task_id: str, socket_callback: Optional[Callable] = None):
        self.task_id = task_id
        self.socket_callback = socket_callback

    def debug(self, msg):
        if msg.startswith('[debug] '): pass
        else: self.info(msg)

    def info(self, msg):
        logger.info(f"[{self.task_id}] {msg}")
        if self.socket_callback:
            self.socket_callback(self.task_id, 'log', msg)

    def warning(self, msg):
        logger.warning(f"[{self.task_id}] {msg}")
        if self.socket_callback:
            self.socket_callback(self.task_id, 'warn', msg)

    def error(self, msg):
        logger.error(f"[{self.task_id}] {msg}")
        if self.socket_callback:
            self.socket_callback(self.task_id, 'error', msg)

class Downloader:
    def __init__(self, download_path: str, cookies_path: Optional[str] = None):
        self.download_path = download_path
        self.cookies_path = cookies_path
        self.node_path = self._find_node()

    def _find_node(self) -> str:
        """Localiza o Node.js para garantir que o n-challenge seja resolvido."""
        # Tenta caminhos comuns no Windows
        paths = [
            r'C:\Program Files\nodejs\node.exe',
            r'C:\Program Files (x86)\nodejs\node.exe',
            'node' # Fallback para o PATH
        ]
        for p in paths:
            if p == 'node' or os.path.exists(p):
                return p
        return 'node'

    def get_opts(self, task_id: str, progress_hook: Callable, socket_callback: Optional[Callable] = None) -> Dict[str, Any]:
        """Gera as opções de nível industrial para o yt-dlp."""
        return {
            # 🔥 Configuração de Formato: Prioriza H.264/AAC e ignora AV1
            'format': 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            'merge_output_format': 'mp4',
            
            # 🔥 Localização e Naming
            'outtmpl': os.path.join(self.download_path, '%(title)s.%(ext)s'),
            'restrictfilenames': True,
            'windowsfilenames': True,
            
            # 🔥 JS Runtime (Crucial para n-challenge)
            'javascript_runtime': self.node_path,
            
            # 🔥 Estratégia de Extrator (Anti-Blocking)
            'extractor_args': {
                'youtube': {
                    'player_client': ['web', 'ios'], # 'web' resolve a maioria, 'ios' é fallback estável
                    'player_skip': ['webpage', 'configs'],
                }
            },
            
            # 🔥 Resiliência e Redes
            'retries': 15,
            'fragment_retries': 15,
            'retry_sleep_functions': {'http': lambda n: 5 * (2**n)}, # Backoff exponencial
            'socket_timeout': 30,
            'ignoreerrors': False,
            'nocheckcertificate': True,
            
            # 🔥 Autenticação
            'cookiefile': self.cookies_path if self.cookies_path and os.path.exists(self.cookies_path) else None,
            
            # 🔥 Hooks e Logging
            'progress_hooks': [progress_hook],
            'logger': YDLPLogger(task_id, socket_callback),
            
            # 🔥 FFmpeg Hooks (Prevenção de Freezes)
            'postprocessor_args': {
                'merger': [
                    '-threads', '0', 
                    '-c:v', 'copy', 
                    '-c:a', 'aac', 
                    '-movflags', '+faststart'
                ]
            },
            
            # 🔥 Performance
            'concurrent_fragment_downloads': 3, # Mais que isso pode causar ban de IP temporário
        }

    def extract_info(self, url: str) -> Dict[str, Any]:
        """Extrai metadados sem baixar."""
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',
            'cookiefile': self.cookies_path if self.cookies_path and os.path.exists(self.cookies_path) else None,
            'javascript_runtime': self.node_path,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False)

    def download(self, url: str, task_id: str, progress_hook: Callable, socket_callback: Optional[Callable] = None):
        """Executa o download com retries inteligentes e fallbacks."""
        opts = self.get_opts(task_id, progress_hook, socket_callback)
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
        except Exception as e:
            error_str = str(e)
            logger.error(f"Download failed for {task_id}: {error_str}")
            
            # Fallback Estratégia: Se falhar por causa do formato, tenta o 'best' genérico
            if "Requested format is not available" in error_str:
                logger.info(f"Retrying with legacy formats for {task_id}")
                opts['format'] = 'best'
                with yt_dlp.YoutubeDL(opts) as ydl:
                    ydl.download([url])
            else:
                raise e

    def download_section(self, url: str, task_id: str, start: float, end: float, progress_hook: Callable, socket_callback: Optional[Callable] = None):
        """Baixa apenas uma seção do vídeo usando ffmpeg para seek preciso."""
        opts = self.get_opts(task_id, progress_hook, socket_callback)
        
        # Configuração para Range Download
        opts.update({
            'download_ranges': lambda info, ydl: [{
                'start_time': start,
                'end_time': end
            }],
            'force_keyframes_at_cuts': True,
        })
        
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl.download([url])
        except Exception as e:
            logger.error(f"Section download failed for {task_id}: {str(e)}")
            raise e

def clean_ansi(text):
    if not text: return ""
    return re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)
