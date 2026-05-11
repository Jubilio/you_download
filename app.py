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

# --- FORÇAR RECONHECIMENTO DO NODE.JS ---
# Se o Node.js foi instalado mas o terminal não foi reiniciado, isto injeta-o no PATH para o yt-dlp o encontrar
node_paths = [
    r"C:\Program Files\nodejs",
    r"C:\Program Files (x86)\nodejs"
]
current_path = os.environ.get('PATH', '')
for p in node_paths:
    if os.path.exists(p) and p not in current_path:
        os.environ['PATH'] = f"{p};{current_path}"
        print(f"[System] Node.js adicionado ao PATH: {p}")

import sys
import queue
import sqlite3

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

def get_static_path():
    return get_resource_path('frontend')

app = Flask(__name__, static_folder=get_static_path(), static_url_path='')
CORS(app)
# Usando async_mode='threading' para eliminar dependência do Eventlet (deprecated)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Fila de tarefas para controlo de concorrência
task_queue = queue.Queue()

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
        socketio.emit('log', {'id': self.task_id, 'msg': msg, 'type': 'error'})
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
    node_path = 'node'
    possible_paths = [r'C:\Program Files\nodejs\node.exe', r'C:\Program Files (x86)\nodejs\node.exe']
    for p in possible_paths:
        if os.path.exists(p):
            node_path = p
            break

    opts = {
        'ignoreconfig': True,
        'no_warnings': False,
        'download_archive': ARCHIVE_FILE,
        'retries': 20,
        'fragment_retries': 20,
        'socket_timeout': 60,
        'ignoreerrors': False, # Queremos ver os erros para tratar
        
        # 🔥 A SOLUÇÃO DEFINITIVA PARA O CODEC (Adeus AV1/Freeze)
        # Prioriza H.264 (avc1) e Áudio M4A (AAC) para compatibilidade total e sem travamentos
        'format': 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        'merge_output_format': 'mp4',
        
        # 🔥 SOLUÇÃO PARA "n challenge" e PLAYER JS
        # O yt-dlp detecta o node/deno automaticamente se estiver no PATH
        'extractor_args': {
            'youtube': {
                'player_client': ['ios', 'android', 'web_creator', 'mweb']
            }
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
        
        'concurrent_fragment_downloads': 2,
        'nocheckcertificate': True,
        'geo_bypass': True,
        'hls_prefer_native': True,
        'user_agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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
    """Sincroniza cookies com cache para evitar múltiplas tentativas falhadas."""
    global LAST_SYNC_TIME
    now = time.time()
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
        if not data:
            return jsonify({'error': 'JSON inválido ou ausente.'}), 400
        
        url = data.get('url')
        if not url:
            return jsonify({'error': 'URL é obrigatória.'}), 400
            
        print(f"[Analise] Processando URL: {url}")
        
        opts = get_common_opts()
        opts.pop('format', None) # Remove filtro estrito para apenas analisar metadata
        opts.update({
            'extract_flat': 'in_playlist',
            'noplaylist': False, # Permitir analisar playlists
            'extract_chapters': True,
        })
        
        with yt_dlp.YoutubeDL(opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
            except Exception as e:
                error_msg = str(e)
                user_friendly_error = "Erro ao analisar o link."
                
                if "confirm you're not a bot" in error_msg:
                    user_friendly_error = "YouTube bloqueou o acesso (Bot). Use a Sincronização de Cookies nas Definições."
                elif "Requested format is not available" in error_msg or "Only images are available" in error_msg:
                    user_friendly_error = "O YouTube bloqueou o vídeo (Proteção Bot). Por favor, vá às Definições e faça Sincronização de Cookies."
                elif "copyright claim" in error_msg.lower():
                    user_friendly_error = "Vídeo removido por direitos de autor."
                elif "Video unavailable" in error_msg:
                    user_friendly_error = "Vídeo indisponível ou privado."
                
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

            return jsonify({
                'id': info.get('id'), 'title': info.get('title'), 'thumbnail': main_thumbnail,
                'channel': info.get('uploader') or info.get('channel'), 'description': info.get('description', ''),
                'url': url, 'is_playlist': False, 'entries': entries, 'current_path': DOWNLOAD_FOLDER,
                'chapters': info.get('chapters', []), 'duration': info.get('duration', 0)
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

@app.route('/api/download-single', methods=['POST'])
def download_single():
    data = request.json
    url, video_id, format_type, playlist_title = data.get('url'), data.get('id'), data.get('format', 'mp4'), data.get('playlist_title', '')
    # Metadados adicionais passados pelo frontend para o DB
    title_hint = data.get('title', 'Vídeo')
    channel_hint = data.get('channel', 'Canal')
    thumb_hint = data.get('thumbnail', '')

    def run_download():
        try:
            socketio.emit('progress', {'id': video_id, 'percent': 0, 'status': 'starting'})
            
            # Sanitização e criação de subpasta para playlists
            subfolder = ""
            if playlist_title:
                # Remove caracteres inválidos para pastas no Windows
                clean_title = re.sub(r'[\\/*?:"<>|]', "", playlist_title).strip()
                subfolder = f"{clean_title}/"
                os.makedirs(os.path.join(DOWNLOAD_FOLDER, clean_title), exist_ok=True)

            out_tmpl = os.path.join(DOWNLOAD_FOLDER, f"{subfolder}%(playlist_index&{{:02d}} - |)s%(title)s.%(ext)s")
            
            # Engine Robusta Definitiva: bv*[ext=mp4]+ba[ext=m4a]/b
            # Prioriza H.264 e AAC para compatibilidade total
            format_str = 'bv*[ext=mp4]+ba[ext=m4a]/b' if format_type == 'mp4' else 'ba/b'
            
            ydl_opts = {
                **get_common_opts(), 
                'format': format_str, 
                'outtmpl': out_tmpl, 
                'merge_output_format': 'mp4' if format_type == 'mp4' else None, 
                'nopart': True, 
                'restrictfilenames': True,
                'progress_hooks': [make_progress_hook(video_id)],
                'logger': YDLProgressLogger(video_id),
                # 🔥 Fallback automático se falhar
            }
            
            info = None
            final_filename = None
            
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
                    if info:
                        final_filename = ydl.prepare_filename(info)
            except Exception as e:
                if "Requested format is not available" in str(e):
                    print("[Engine] Fallback para 'best' genérico...")
                    ydl_opts['format'] = 'best'
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(url, download=True)
                        if info:
                            final_filename = ydl.prepare_filename(info)
                else:
                    raise e

            if not info:
                # Se info for None, o yt-dlp provavelmente saltou o download (já no archive)
                socketio.emit('progress', {'id': video_id, 'percent': 100, 'status': 'finished'})
                return

            if final_filename:
                # O merge_output_format pode mudar a extensão, vamos garantir o nome real
                if format_type == 'mp4' and not final_filename.endswith('.mp4'):
                    final_filename = os.path.splitext(final_filename)[0] + '.mp4'
                
                # Salvar no Banco de Dados
                add_to_history_db(
                    video_id, 
                    info.get('title', title_hint), 
                    info.get('uploader', channel_hint), 
                    info.get('thumbnail', thumb_hint),
                    os.path.basename(final_filename),
                    final_filename,
                    format_type
                )
            socketio.emit('progress', {'id': video_id, 'percent': 100, 'status': 'finished'})
        except DownloadCancelled:
            socketio.emit('progress', {'id': video_id, 'percent': 0, 'status': 'cancelled'})
        except Exception as e:
            error_msg = str(e)
            user_friendly_error = "Erro no processamento."
            
            if "copyright claim" in error_msg.lower():
                user_friendly_error = "Vídeo removido por direitos de autor (Copyright)."
            elif "Requested format is not available" in error_msg:
                user_friendly_error = "Formato indisponível. Tente MP3 ou atualize o motor."
            elif "Sign in to confirm you’re not a bot" in error_msg:
                user_friendly_error = "YouTube bloqueou o acesso (Bot). Use Cookies."
            elif "Video unavailable" in error_msg:
                user_friendly_error = "Vídeo indisponível ou privado."
            
            print(f"Download error: {error_msg}")
            socketio.emit('progress', {'id': video_id, 'status': 'error', 'error': user_friendly_error})
        finally:
            if video_id in cancelled_tasks: cancelled_tasks.remove(video_id)
    
    task_queue.put((run_download, ()))
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
    try:
        # Usa o comando nativo do Windows (Winget) para instalar o FFmpeg
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
            socketio.emit('progress', {'id': section_id, 'percent': 0, 'status': 'starting'})
            out_tmpl = os.path.join(DOWNLOAD_FOLDER, f"%(title)s - {title}.%(ext)s")
            
            # Engine Robusta Definitiva: bv*[ext=mp4]+ba[ext=m4a]/b
            ydl_opts = {
                **get_common_opts(), 
                'download_archive': None, 
                'outtmpl': out_tmpl, 
                'force_keyframes_at_cuts': True,
                'nopart': True,
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
                'format': row['format'] if 'format' in row_keys else 'mp4'
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

@app.route('/api/open-folder', methods=['POST'])
def open_folder(): subprocess.Popen(f'explorer "{DOWNLOAD_FOLDER}"'); return jsonify({'success': True})

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

@app.route('/')
def index(): return app.send_static_file('index.html')

def task_worker():
    """Worker que processa a fila de downloads de forma controlada."""
    print("[Sistema] Worker de downloads iniciado.")
    while True:
        task = task_queue.get()
        if task is None: break
        
        func, args = task
        try:
            func(*args)
        except Exception as e:
            print(f"[Erro Fila] Erro ao processar tarefa: {str(e)}")
        finally:
            task_queue.task_done()

if __name__ == '__main__':
    # Iniciar worker em background
    threading.Thread(target=task_worker, daemon=True).start()

    # Configuração de Host: 127.0.0.1 para local (seguro), 0.0.0.0 para Docker/Nuvem
    is_frozen = getattr(sys, 'frozen', False)
    host_addr = '127.0.0.1' if is_frozen else '0.0.0.0'
    
    # Abrir o browser automaticamente apenas se estiver no modo executável
    if is_frozen:
        import webbrowser
        from threading import Timer
        def open_browser():
            webbrowser.open("http://127.0.0.1:5000/installer")
        Timer(2.5, open_browser).start()
        
    # Desativar debug para evitar que o Flask reinicie e mate as tarefas de download
    socketio.run(app, debug=False, host=host_addr, port=5000)
