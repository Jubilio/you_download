from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import yt_dlp
import os
import threading
import time
import subprocess
import tkinter as tk
from tkinter import filedialog
import re
import traceback
import browser_cookie3
import http.cookiejar
import platform
import shutil
import json
import sys
import queue
import sqlite3
from concurrent.futures import ThreadPoolExecutor

# --- INJEÇÃO DE DEPENDÊNCIAS (WINDOWS) ---
if platform.system() == 'Windows':
    # Tenta localizar o Node.js em locais comuns
    node_paths = [
        r"C:\Program Files\nodejs", 
        r"C:\Program Files (x86)\nodejs",
        os.path.join(os.environ.get('APPDATA', ''), 'npm')
    ]
    for p in node_paths:
        if os.path.exists(p) and p not in os.environ.get('PATH', ''):
            os.environ['PATH'] = f"{p}{os.pathsep}{os.environ.get('PATH', '')}"
            print(f"[System] Node.js injetado no PATH: {p}")

DB_PATH = os.path.join(os.getcwd(), 'history.db')

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT,
            title TEXT,
            channel TEXT,
            thumbnail TEXT,
            filename TEXT,
            file_path TEXT,
            date TEXT,
            format TEXT
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def get_resource_path(relative_path):
    """Retorna o caminho absoluto para recursos, funcionando em dev e em exe (PyInstaller)."""
    if getattr(sys, 'frozen', False):
        base_path = sys._MEIPASS
    else:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def open_path(path):
    """Abre um ficheiro ou pasta de forma multiplataforma."""
    try:
        if platform.system() == 'Windows':
            os.startfile(path)
        elif platform.system() == 'Darwin': # macOS
            subprocess.Popen(['open', path])
        else: # Linux e outros
            subprocess.Popen(['xdg-open', path])
        return True
    except Exception as e:
        print(f"[System Error] Erro ao abrir caminho: {str(e)}")
        return False

def get_static_path():
    return get_resource_path('frontend_react/dist')

app = Flask(__name__, static_folder=get_static_path(), static_url_path='')
CORS(app)

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.errorhandler(404)
def page_not_found(e):
    return app.send_static_file('index.html')

# Usando async_mode='threading' para eliminar dependência do Eventlet (deprecated)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Executor para downloads simultâneos (3 ao mesmo tempo)
executor = ThreadPoolExecutor(max_workers=3)

def show_notification(title, message):
    """Mostra uma notificação nativa se possível."""
    try:
        if platform.system() == 'Windows':
            # Comando PowerShell para toast notification simples
            clean_msg = message.replace("'", "")
            cmd = f'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(\'{clean_msg}\', \'{title}\')"'
            # Para não bloquear, usamos Popen
            subprocess.Popen(cmd, shell=True)
        else:
            print(f"[Notificação] {title}: {message}")
    except: pass

DOWNLOAD_FOLDER = os.path.join(os.path.expanduser("~"), "Downloads")
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

COOKIES_FILE = os.path.join(os.getcwd(), 'cookies.txt')
ARCHIVE_FILE = os.path.join(os.getcwd(), 'downloaded_history.txt')
NODE_PATH = r'C:\Program Files\nodejs\node.exe'
# Adicionar diretório do Node ao PATH para que o yt-dlp o encontre automaticamente
NODE_DIR = os.path.dirname(NODE_PATH)
if os.path.exists(NODE_DIR) and NODE_DIR not in os.environ['PATH']:
    os.environ['PATH'] = NODE_DIR + os.pathsep + os.environ['PATH']
    print(f"[Engine] Node.js injetado no PATH: {NODE_DIR}")

progress_store = {}
cancelled_tasks = set()

class DownloadCancelled(Exception): pass

def check_ffmpeg():
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except:
        return False

HAS_FFMPEG = check_ffmpeg()
print(f"[System] FFmpeg detetado: {HAS_FFMPEG}")

def clean_ansi(text):
    if not text: return ""
    return re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', text)

class YDLProgressLogger:
    def __init__(self, task_id):
        self.task_id = task_id

    def debug(self, msg):
        # O FFmpeg envia o progresso através do log de debug/info
        if '[download]' in msg and '%' in msg:
            try:
                parts = msg.split()
                for p in parts:
                    if '%' in p:
                        percent = float(p.replace('%', ''))
                        socketio.emit('progress', {'id': self.task_id, 'percent': percent, 'status': 'downloading'})
                        break
            except: pass
        
        # Enviar logs gerais para o terminal do frontend
        if not any(x in msg for x in ['%', 'ETA']):
            socketio.emit('log', {'id': self.task_id, 'msg': msg, 'type': 'info'})
        print(f"DEBUG [{self.task_id}]: {msg}")

    def info(self, msg): self.debug(msg)
    def warning(self, msg): 
        socketio.emit('log', {'id': self.task_id, 'msg': msg, 'type': 'warn'})
        print(f"WARN [{self.task_id}]: {msg}")
    def error(self, msg): 
        clean_msg = clean_ansi(msg)
        if 'Sign in to confirm you’re not a bot' in clean_msg:
            socketio.emit('log', {'id': self.task_id, 'msg': '🛑 YouTube bloqueou o acesso. Por favor, vá às Definições e clique em "Sincronizar Cookies".', 'type': 'error'})
        else:
            socketio.emit('log', {'id': self.task_id, 'msg': clean_msg, 'type': 'error'})
        print(f"ERROR [{self.task_id}]: {msg}")

def make_progress_hook(task_id):
    def hook(d):
        if task_id in cancelled_tasks:
            raise DownloadCancelled("Interrompido")

        status = d.get('status')
        print(f">>> [HOOK {task_id}] Status: {status}")

        if status == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            
            if not total and 'fragment_count' in d:
                total = d.get('fragment_count', 0)
                downloaded = d.get('fragment_index', 0)

            percent = (downloaded / total * 100) if total > 0 else 0
            
            speed = clean_ansi(d.get('_speed_str', 'N/A'))
            eta = clean_ansi(d.get('_eta_str', 'N/A'))
            
            socketio.emit('progress', {
                'id': task_id,
                'percent': round(percent, 1),
                'speed': speed,
                'eta': eta,
                'status': 'downloading'
            })
        elif status == 'finished':
            socketio.emit('progress', {'id': task_id, 'percent': 100, 'status': 'processing'})
    return hook

def get_common_opts():
    """Configuração de Nível Industrial para Estabilidade Máxima."""
    # Localizar Node.js automaticamente para resolver o n-challenge
    possible_paths = [
        r'C:\Program Files\nodejs\node.exe', 
        r'C:\Program Files (x86)\nodejs\node.exe',
        os.path.join(os.environ.get('APPDATA', ''), 'nvm', 'v20.11.0', 'node.exe'), # Exemplo NVM
    ]
    node_found = None
    for p in possible_paths:
        if os.path.exists(p):
            node_found = os.path.dirname(p)
            break
            
    if node_found and node_found not in os.environ['PATH']:
        os.environ['PATH'] = node_found + os.pathsep + os.environ['PATH']
        print(f"[Sistema] Node.js injetado no PATH: {node_found}")

    opts = {
        'ignoreconfig': True,
        'no_warnings': False,
        'download_archive': ARCHIVE_FILE,
        'retries': 20,
        'fragment_retries': 20,
        'socket_timeout': 60,
        'ignoreerrors': False, # Queremos ver os erros para tratar
        
        # 🔥 A SOLUÇÃO DEFINITIVA PARA O CODEC (Adeus AV1/Freeze)
        # Prioriza H.264 até 720p, mas tem fallback total para qualquer formato disponível
        'format': 'bestvideo[height<=720][vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/bestvideo+bestaudio/best',
        'merge_output_format': 'mp4',
        
        # 🔥 SOLUÇÃO PARA "n challenge" e PLAYER JS
        # O yt-dlp deteta o node/deno automaticamente se estiver no PATH
        'extractor_args': {
            'youtube': {
                # Prioriza clientes que SUPORTAM cookies para evitar bloqueio de bot
                'player_client': ['web', 'web_creator', 'mweb', 'tv'],
                'player_skip': ['webpage', 'configs']
            }
        },
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-us,en;q=0.5',
            'Sec-Fetch-Mode': 'navigate',
        },
        
        # 🔥 ANTI-FREEZE FFmpeg
        'postprocessor_args': {
            'merger': [
                '-threads', '0', 
                '-c:v', 'copy', 
                '-c:a', 'aac', 
                '-movflags', '+faststart'
            ]
        },
        
        'concurrent_fragment_downloads': 5, # Aumentado para maior velocidade
        'nocheckcertificate': True,
        'geo_bypass': True,
        'hls_prefer_native': True,
        
        # 🔥 EMBED METADATA (Dá o aspeto Pro aos ficheiros)
        'writethumbnail': True,
        'postprocessors': [
            {'key': 'FFmpegMetadata', 'add_chapters': True, 'add_metadata': True},
            {'key': 'EmbedThumbnail', 'already_have_thumbnail': False},
        ],
        
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'continuedl': False, # Resolve o erro 416: Requested range not satisfiable (força reiniciar em vez de falhar no resume)
    }
    
    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
        opts['cookiefile'] = COOKIES_FILE
    return opts

def get_browser_cookie_path(browser_name):
    """Localiza o caminho do banco de dados de cookies para diferentes navegadores e perfis."""
    appdata = os.getenv('LOCALAPPDATA')
    paths = {
        'chrome': os.path.join(appdata, 'Google/Chrome/User Data'),
        'brave': os.path.join(appdata, 'BraveSoftware/Brave-Browser/User Data'),
        'edge': os.path.join(appdata, 'Microsoft/Edge/User Data')
    }
    
    if browser_name not in paths: return None
    
    base_path = paths[browser_name]
    # Tenta perfis comuns: Default, Profile 1, Profile 2...
    profiles = ['Default', 'Profile 1', 'Profile 2', 'Profile 3']
    for profile in profiles:
        cookie_path = os.path.join(base_path, profile, 'Network', 'Cookies')
        if os.path.exists(cookie_path):
            return cookie_path
    return None

LAST_SYNC_TIME = 0
@app.route('/api/sync-cookies', methods=['POST'])
def sync_cookies():
    """Sincroniza cookies com cache para evitar múltiplas tentativas falhadas. 
    Usa CoInitialize para evitar erros de COM em threads no Windows."""
    global LAST_SYNC_TIME
    now = time.time()
    
    # Importação local para evitar erros em sistemas não-Windows ou sem pywin32
    try:
        import pythoncom
        pythoncom.CoInitialize()
    except:
        pass

    try:
        if now - LAST_SYNC_TIME < 300: # Cache de 5 minutos
            has_cookies = os.path.exists(COOKIES_FILE)
            return jsonify({'success': has_cookies, 'browser': 'Cache' if has_cookies else '', 'message': 'Operação em cooldown de 5 min.' if not has_cookies else ''})
        
        LAST_SYNC_TIME = now
        success_browser = None
        
        # Lista de funções de extração do browser-cookie3
        extraction_methods = [
            ('edge', browser_cookie3.edge),
            ('chrome', browser_cookie3.chrome),
            ('brave', browser_cookie3.brave),
            ('firefox', browser_cookie3.firefox),
            ('opera', browser_cookie3.opera)
        ]
        
        for name, method in extraction_methods:
            try:
                print(f"[Sync] Tentando extrair cookies do {name}...")
                # Extrai cookies filtrando apenas para youtube.com
                cj = method(domain_name='youtube.com')
                
                if cj:
                    # Salva no formato Netscape (o que o yt-dlp gosta)
                    with open(COOKIES_FILE, 'w', encoding='utf-8') as f:
                        f.write("# Netscape HTTP Cookie File\n")
                        f.write("# http://curl.haxx.se/rfc/cookie_spec.html\n")
                        f.write("# This is a generated file!  Do not edit.\n\n")
                        
                        for cookie in cj:
                            # Formato: domain, flag, path, secure, expiration, name, value
                            domain = cookie.domain
                            flag = "TRUE" if domain.startswith('.') else "FALSE"
                            path = cookie.path
                            secure = "TRUE" if cookie.secure else "FALSE"
                            expires = str(cookie.expires) if cookie.expires else "0"
                            name_val = cookie.name
                            value = cookie.value
                            
                            f.write(f"{domain}\t{flag}\t{path}\t{secure}\t{expires}\t{name_val}\t{value}\n")
                    
                    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 100:
                        success_browser = name
                        break
            except Exception as e:
                print(f"[Sync] Falha no {name}: {str(e)}")
                continue

        if success_browser:
            return jsonify({'success': True, 'browser': success_browser.capitalize()})
            
    except Exception as e:
        print(f"[Sync Critical Error] {str(e)}")
        return jsonify({'success': False, 'message': f'Erro crítico na sincronização: {str(e)}'}), 500
    finally:
        try:
            import pythoncom
            pythoncom.CoUninitialize()
        except:
            pass

    return jsonify({
        'success': False, 
        'message': 'Não foi possível encontrar cookies ativos. Certifique-se de que o YouTube está aberto no navegador e tente novamente.'
    })

@app.route('/api/save-cookies', methods=['POST'])
def save_cookies():
    try:
        content = request.json.get('cookies', '')
        with open(COOKIES_FILE, 'w', encoding='utf-8') as f: f.write(content)
        return jsonify({'success': True})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/info', methods=['POST'])
def get_info():
    try:
        data = request.get_json(silent=True)
        if not data or 'url' not in data:
            print(f"[Analise] Erro: Dados ausentes ou URL não fornecida. Recebido: {data}")
            return jsonify({'error': 'URL inválida ou ausente.'}), 400
        
        url = data.get('url')
        print(f"[Analise] Processando URL: {url}")
        
        opts = get_common_opts()
        opts.pop('format', None) # Remove filtro estrito para apenas analisar metadata
        opts.update({
            'extract_flat': 'in_playlist',
            'noplaylist': False, # Permitir analisar playlists
            'extract_chapters': True,
            'writethumbnail': False, # Não baixar thumbnails físicas durante análise
            'skip_download': True,
        })
        
        with yt_dlp.YoutubeDL(opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                error_msg = str(e)
                user_friendly_error = "Erro ao analisar o link."
                
                if "confirm you're not a bot" in error_msg or "Sign in to confirm" in error_msg:
                    user_friendly_error = "🛑 YouTube bloqueou o acesso (Bot). Por favor, vá às Definições e clique em 'Sincronizar Cookies'."
                elif "Requested format is not available" in error_msg or "Only images are available" in error_msg:
                    user_friendly_error = "🛑 O YouTube bloqueou este vídeo por proteção contra bots. Sincronize os Cookies nas Definições."
                elif "copyright claim" in error_msg.lower():
                    user_friendly_error = "⚠️ Vídeo removido por direitos de autor."
                elif "Video unavailable" in error_msg:
                    user_friendly_error = "⚠️ Vídeo indisponível ou privado."
                
                print(f"[Análise Erro] {error_msg}")
                return jsonify({'error': user_friendly_error}), 400
            
            if not info:
                return jsonify({'error': 'Não foi possível obter os dados do vídeo.'}), 400
                
            # Se for playlist, garantir que processamos todas as entradas válidas
            entries = []
            if 'entries' in info:
                for entry in info['entries']:
                    if entry: # Ignora entradas None (vídeos privados/removidos)
                        thumb = entry.get('thumbnail')
                        if not thumb and entry.get('thumbnails'): thumb = entry.get('thumbnails')[0].get('url')
                        entries.append({
                            'id': entry.get('id'), 'title': entry.get('title') or 'Vídeo',
                            'channel': entry.get('uploader') or entry.get('channel') or info.get('uploader') or 'Canal',
                            'url': f"https://www.youtube.com/watch?v={entry.get('id')}", 'thumbnail': thumb
                        })
            
            main_thumbnail = info.get('thumbnail')
            if not main_thumbnail and 'thumbnails' in info and info['thumbnails']: main_thumbnail = info['thumbnails'][0].get('url')
            if not main_thumbnail and entries: main_thumbnail = entries[0].get('thumbnail')

            # Extrair qualidades de vídeo disponíveis (filtradas e únicas)
            available_formats = []
            seen_heights = set()
            for f in info.get('formats', []):
                h = f.get('height')
                if h and h not in seen_heights and f.get('vcodec') != 'none':
                    # Apenas resoluções standard para manter a UI limpa
                    if h in [2160, 1440, 1080, 720, 480, 360, 240, 144]:
                        available_formats.append({
                            'height': h,
                            'label': f"{h}p" + (" (4K)" if h == 2160 else " (2K)" if h == 1440 else " (HD)" if h >= 720 else ""),
                            'ext': 'mp4'
                        })
                        seen_heights.add(h)
            
            available_formats.sort(key=lambda x: x['height'], reverse=True)

            return jsonify({
                'id': info.get('id'), 'title': info.get('title'), 'thumbnail': main_thumbnail,
                'channel': info.get('uploader') or info.get('channel'), 'description': info.get('description', ''),
                'url': url, 'is_playlist': False, 'entries': entries, 'current_path': DOWNLOAD_FOLDER,
                'chapters': info.get('chapters', []), 'duration': info.get('duration', 0),
                'formats': available_formats
            })
    except Exception as e: 
        print(f"[Error] Info Extraction: {str(e)}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/video-details', methods=['POST'])
def video_details():
    try:
        data = request.get_json(silent=True)
        video_id = data.get('id') if data else None
        
        if not video_id:
            return jsonify({'error': 'ID do vídeo em falta'}), 400
            
        url = f"https://www.youtube.com/watch?v={video_id}"
        print(f"[Detalhes] Buscando descrição para: {video_id}")
        
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': 'best',
            'ignoreerrors': True,
            'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        # Tenta usar cookies se disponíveis
        cookies = sync_cookies()
        if cookies: ydl_opts['cookiefile'] = COOKIES_FILE

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return jsonify({'description': 'Não foi possível carregar os detalhes deste vídeo.', 'id': video_id})
                
            return jsonify({
                'description': info.get('description', 'Sem descrição disponível.'),
                'id': video_id
            })
    except Exception as e:
        print(f"[Error] Falha nos detalhes: {str(e)}")
        return jsonify({'description': f'Erro: {str(e)}', 'id': video_id})

def add_to_history_db(video_id, title, channel, thumbnail, filename, file_path, format_type):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        date_str = time.strftime('%d/%m/%Y %H:%M')
        cursor.execute('''
            INSERT INTO history (video_id, title, channel, thumbnail, filename, file_path, date, format)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (video_id, title, channel, thumbnail, filename, file_path, date_str, format_type))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[DB Error] {str(e)}")

def show_notification(title, message):
    try:
        from plyer import notification
        notification.notify(title=title, message=message, app_name='YouDown Pro', timeout=5)
    except: pass

def run_download(url, video_id, format_type, title_hint, thumb_hint, channel_hint, playlist_title, playlist_index, quality):
    try:
        socketio.emit('progress', {'id': video_id, 'percent': 0, 'status': 'starting', 'title': title_hint, 'thumbnail': thumb_hint})
        subfolder = ""
        if playlist_title:
            clean_title = re.sub(r'[\\/*?:"<>|]', "", playlist_title).strip()
            subfolder = f"{clean_title}/"
            os.makedirs(os.path.join(DOWNLOAD_FOLDER, clean_title), exist_ok=True)
        out_tmpl = os.path.join(DOWNLOAD_FOLDER, f"{subfolder}{int(playlist_index):02d} - %(title)s.%(ext)s" if playlist_index else f"{subfolder}%(title)s.%(ext)s")
        if format_type == 'mp4':
            q_val = quality if quality else '720'
            format_str = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best' if q_val == 'best' else f'bestvideo[height<={q_val}][ext=mp4]+bestaudio[ext=m4a]/best[height<={q_val}][ext=mp4]/bestvideo+bestaudio/best'
        else: format_str = 'bestaudio/best'
        
        ydl_opts = {**get_common_opts(), 'format': format_str, 'outtmpl': out_tmpl, 'merge_output_format': 'mp4' if format_type == 'mp4' else None, 'restrictfilenames': True, 'progress_hooks': [make_progress_hook(video_id)], 'logger': YDLProgressLogger(video_id)}
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info:
                final_filename = ydl.prepare_filename(info)
                if format_type == 'mp4' and not final_filename.endswith('.mp4'): final_filename = os.path.splitext(final_filename)[0] + '.mp4'
                show_notification("YouDown Pro", f"Concluído: {title_hint}")
                add_to_history_db(video_id, info.get('title', title_hint), info.get('uploader', channel_hint), info.get('thumbnail', thumb_hint), os.path.basename(final_filename), final_filename, format_type)
                socketio.emit('progress', {'id': video_id, 'percent': 100, 'status': 'finished'})
    except Exception as e:
        print(f"[Download Error] {str(e)}")
        socketio.emit('progress', {'id': video_id, 'percent': 0, 'status': 'error', 'msg': str(e)})
        show_notification("Erro", f"Falha no download: {title_hint}")

@app.route('/api/download-single', methods=['POST'])
def download_single():
    data = request.json
    if not data: return jsonify({'error': 'JSON em falta'}), 400
    
    url = data.get('url')
    video_id = data.get('id')
    format_type = data.get('format', 'mp4')
    quality = data.get('quality')
    title_hint = data.get('title', 'Video')
    thumb_hint = data.get('thumbnail', '')
    channel_hint = data.get('channel', 'Unknown')
    playlist_title = data.get('playlist_title')
    playlist_index = data.get('index')

    if not url or not video_id:
        return jsonify({'error': 'URL ou ID em falta'}), 400

    # Iniciar download concorrente no ThreadPoolExecutor
    executor.submit(run_download, url, video_id, format_type, title_hint, thumb_hint, channel_hint, playlist_title, playlist_index, quality)
    print(f"[Sistema] Download iniciado em paralelo: {video_id}")
    return jsonify({'success': True})

@app.route('/api/cancel', methods=['POST'])
def cancel_download():
    video_id = request.json.get('id')
    if video_id:
        cancelled_tasks.add(video_id)
        return jsonify({'success': True})
    return jsonify({'error': 'ID em falta'}), 400

@app.route('/api/install-ffmpeg', methods=['POST'])
def install_ffmpeg():
    """Tenta instalar o FFmpeg automaticamente usando o Winget."""
    if platform.system() != 'Windows':
        return jsonify({'success': False, 'message': 'A instalação automática via winget só está disponível no Windows.'})
    try:
        subprocess.run(['winget', 'install', 'ffmpeg', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements'], check=True)
        global HAS_FFMPEG
        HAS_FFMPEG = check_ffmpeg() # Re-verifica
        return jsonify({'success': True, 'message': 'FFmpeg instalado! Reinicie o aplicativo para garantir que tudo está sincronizado.'})
    except Exception as e:
        return jsonify({'success': False, 'message': 'Não foi possível instalar automaticamente. Por favor, use o link manual.'})

@app.route('/installer')
def installer():
    return send_file(get_resource_path('installer.html'))

@app.route('/api/download-section', methods=['POST'])
def download_section():
    if not HAS_FFMPEG:
        return jsonify({
            'success': False, 
            'message': 'FFmpeg não detetado! O recorte de vídeos requer o FFmpeg instalado no sistema. Por favor, instale-o (ex: winget install ffmpeg) e reinicie o app.'
        }), 400
        
    data = request.json
    url, video_id, format_type = data.get('url'), data.get('id'), data.get('format', 'mp4')
    start, end, title = data.get('start'), data.get('end'), data.get('title', 'clip')
    
    # ID único para a task de seção
    section_id = f"{video_id}_{start}_{end}"
    
    def run_download():
        try:
            socketio.emit('progress', {
                'id': section_id, 
                'percent': 0, 
                'status': 'starting',
                'title': f"Recorte: {title}",
                'thumbnail': data.get('thumbnail', '')
            })
            out_tmpl = os.path.join(DOWNLOAD_FOLDER, f"%(title)s - {title}.%(ext)s")
            
            # Engine Robusta Definitiva: bv*[ext=mp4]+ba[ext=m4a]/b
            ydl_opts = {
                **get_common_opts(), 
                'download_archive': None, 
                'outtmpl': out_tmpl, 
                'force_keyframes_at_cuts': True,
                'download_ranges': lambda info, ydl: [{
                    'start_time': float(start),
                    'end_time': float(end)
                }],
                'progress_hooks': [make_progress_hook(section_id)],
                'logger': YDLProgressLogger(section_id),
            }
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([url])
                # Obter info para o DB
                info = ydl.extract_info(url, download=False)
                if not info:
                    raise Exception("Erro ao processar vídeo (retornou vazio).")
                    
                final_filename = ydl.prepare_filename(info)
                if not final_filename.endswith('.mp4'):
                    final_filename = os.path.splitext(final_filename)[0] + '.mp4'
                
                # Salvar no DB
                add_to_history_db(
                    section_id, 
                    f"{info.get('title', 'Vídeo')} (Corte: {title})", 
                    info.get('uploader', 'Canal'), 
                    info.get('thumbnail', ''),
                    os.path.basename(final_filename),
                    final_filename,
                    'mp4'
                )
            
            socketio.emit('progress', {'id': section_id, 'percent': 100, 'status': 'finished'})
        except DownloadCancelled:
            socketio.emit('progress', {'id': section_id, 'percent': 0, 'status': 'cancelled'})
        except Exception as e: 
            print(f"[Erro Recorte] {str(e)}")
            socketio.emit('progress', {'id': section_id, 'percent': 0, 'status': 'error'})
        finally:
            if section_id in cancelled_tasks: cancelled_tasks.remove(section_id)
            
    task_queue.put((run_download, ()))
    print(f"[Sistema] Recorte adicionado à fila: {section_id}")
    return jsonify({'success': True, 'taskId': section_id})

@app.route('/api/progress-all', methods=['POST'])
def get_all_progress():
    ids = request.json.get('ids', []); results = {}
    for vid in ids: results[vid] = progress_store.get(vid, {'percent': 0, 'status': 'waiting'})
    return jsonify(results)

@app.route('/api/history', methods=['GET'])
def get_history():
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM history ORDER BY id DESC')
        rows = cursor.fetchall()
        files = []
        for row in rows:
            row_keys = row.keys()
            files.append({
                'id': row['id'],
                'video_id': row['video_id'] if 'video_id' in row_keys else '',
                'name': row['filename'] if 'filename' in row_keys else '',
                'title': row['title'] if 'title' in row_keys else '',
                'channel': row['channel'] if 'channel' in row_keys else '',
                'thumbnail': row['thumbnail'] if 'thumbnail' in row_keys else '',
                'date': row['date'] if 'date' in row_keys else '',
                'format': row['format'] if 'format' in row_keys else 'mp4',
                'file_path': row['file_path'] if 'file_path' in row_keys else ''
            })
        conn.close()
        return jsonify({'files': files, 'current_path': DOWNLOAD_FOLDER})
    except Exception as e:
        print(f"[DB History Error] {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-engine', methods=['POST'])
def update_engine():
    """Atualiza o yt-dlp para a versão mais recente."""
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"])
        return jsonify({'success': True, 'message': 'Motor atualizado com sucesso!'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/select-folder', methods=['POST'])
def select_folder():
    global DOWNLOAD_FOLDER
    try:
        root = tk.Tk(); root.withdraw(); root.attributes('-topmost', True)
        selected_path = filedialog.askdirectory(initialdir=DOWNLOAD_FOLDER); root.destroy()
        if selected_path: DOWNLOAD_FOLDER = os.path.abspath(selected_path); return jsonify({'success': True, 'path': DOWNLOAD_FOLDER})
        return jsonify({'success': False})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/execute-play', methods=['POST'])
def play_video():
    data = request.json
    file_path = data.get('file_path')
    print(f"[DEBUG] Rota /api/execute-play chamada para: {file_path}")
    
    # 1. Tenta o caminho exato (mais rápido)
    if file_path and os.path.exists(file_path):
        if open_path(file_path):
            return jsonify({'success': True})
            
    # 2. Fallback: Se o caminho absoluto falhou (ex: pasta movida ou app reiniciado),
    # procura pelo nome do ficheiro dentro da pasta de downloads atual.
    if file_path:
        filename = os.path.basename(file_path)
        print(f"[Play] Ficheiro não encontrado no caminho original. A procurar por '{filename}' em {DOWNLOAD_FOLDER}...")
        
        for root, dirs, files in os.walk(DOWNLOAD_FOLDER):
            if filename in files:
                new_path = os.path.join(root, filename)
                print(f"[Play] Ficheiro encontrado em: {new_path}")
                if open_path(new_path):
                    return jsonify({'success': True})

    return jsonify({
        'success': False, 
        'message': f'Ficheiro não encontrado: {os.path.basename(file_path) if file_path else "---"}. Verifique se o ficheiro ainda existe na pasta de downloads.'
    }), 404

@app.route('/api/open-folder', methods=['POST'])
def open_folder(): 
    if open_path(DOWNLOAD_FOLDER):
        return jsonify({'success': True})
    return jsonify({'success': False}), 500

@app.route('/api/delete', methods=['POST'])
def delete_file():
    try:
        row_id = request.json.get('id')
        if not row_id:
            return jsonify({'error': 'ID em falta'}), 400
            
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM history WHERE id = ?', (row_id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/clear-history', methods=['POST'])
def clear_history():
    try:
        # 1. Limpar o arquivo de archive do yt-dlp
        if os.path.exists(ARCHIVE_FILE):
            with open(ARCHIVE_FILE, 'w') as f: f.write("")
            
        # 2. Limpar a tabela do SQLite em vez de deletar arquivos
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('DELETE FROM history')
        conn.commit()
        conn.close()
        
        return jsonify({'success': True})
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/stream/<path:filename>')
def stream_file(filename):
    """Serve ficheiros para o player do navegador com suporte a MIME types e busca flexível."""
    import urllib.parse
    import mimetypes
    
    decoded_name = urllib.parse.unquote(filename)
    base_name = os.path.splitext(decoded_name)[0]
    
    for root, dirs, filenames in os.walk(DOWNLOAD_FOLDER):
        target_file = None
        # 1. Procura exata
        if decoded_name in filenames:
            target_file = os.path.join(root, decoded_name)
        # 2. Procura pelo nome base
        else:
            for f in filenames:
                if os.path.splitext(f)[0] == base_name:
                    target_file = os.path.join(root, f)
                    break
        
        if target_file:
            mime_type, _ = mimetypes.guess_type(target_file)
            return send_file(target_file, mimetype=mime_type or 'video/mp4')
                
    return "Ficheiro não encontrado", 404



if __name__ == '__main__':
    is_frozen = getattr(sys, 'frozen', False)
    host_addr = '127.0.0.1'
    
    # Se estivermos no modo Desktop (com pywebview)
    try:
        import webview
        print("[Desktop] Iniciando YouDown Pro em modo nativo...")
        print("\n[DEBUG] Rotas Flask Registadas:")
        print(app.url_map)
        print("\n")
        
        t = threading.Thread(target=lambda: socketio.run(app, host=host_addr, port=5000, debug=False, use_reloader=False))
        t.daemon = True
        t.start()
        
        webview.create_window('YouDown Pro', 'http://127.0.0.1:5000', width=1280, height=800, background_color='#141414')
        webview.start()
    except ImportError:
        # Modo Fallback: Servidor Flask padrão + Browser
        print("[Server] PyWebView não instalado. Iniciando modo navegador...")
        if is_frozen:
            import webbrowser
            from threading import Timer
            Timer(2.5, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
        
        socketio.run(app, host=host_addr, port=5000, debug=not is_frozen)
