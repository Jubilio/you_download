from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
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

app = Flask(__name__, static_folder='frontend', static_url_path='')
CORS(app)

DOWNLOAD_FOLDER = os.path.join(os.path.expanduser("~"), "Downloads")
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

COOKIES_FILE = os.path.join(os.getcwd(), 'cookies.txt')
ARCHIVE_FILE = os.path.join(os.getcwd(), 'downloaded_history.txt')
NODE_PATH = r'C:\Program Files\nodejs\node.exe'

progress_store = {}

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

def progress_hook(d):
    video_id = d.get('info_dict', {}).get('id')
    if not video_id: return
    if d['status'] == 'downloading':
        downloaded = d.get('downloaded_bytes', 0)
        total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
        percent = (downloaded / total * 100) if total > 0 else 0
        progress_store[video_id] = {
            'percent': round(percent, 1),
            'speed': clean_ansi(d.get('_speed_str', '0B/s')),
            'eta': clean_ansi(d.get('_eta_str', '00:00')),
            'status': 'downloading'
        }
    elif d['status'] == 'finished':
        progress_store[video_id] = {'percent': 100, 'status': 'finished'}

def get_common_opts():
    opts = {
        'ignoreconfig': True, 'quiet': True, 'no_warnings': True, 
        'download_archive': ARCHIVE_FILE, 'progress_hooks': [progress_hook],
        'nocheckcertificate': True
    }
    if os.path.exists(COOKIES_FILE) and os.path.getsize(COOKIES_FILE) > 0:
        opts['cookiefile'] = COOKIES_FILE
    if os.path.exists(NODE_PATH):
        opts['javascript_interpreter'] = NODE_PATH
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

@app.route('/api/sync-cookies', methods=['POST'])
def sync_cookies():
    """Sincroniza cookies usando browser-cookie3 para maior compatibilidade."""
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
        url = request.json.get('url')
        # Adicionamos ignoreerrors para não travar se um vídeo da playlist estiver privado/deletado
        # E garantimos que ele pegue todos os itens (playlist_items: 'all' é o padrão, mas reforçamos)
        ydl_opts = {**get_common_opts(), 'extract_flat': True, 'ignoreerrors': True}
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            
            # Se for uma playlist e falhou no extract_flat, tentamos novamente
            if not info:
                return jsonify({'error': 'Não foi possível obter informações do link.'}), 400
                
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
                'url': url, 'is_playlist': 'entries' in info, 'entries': entries, 'current_path': DOWNLOAD_FOLDER,
                'chapters': info.get('chapters', [])
            })
    except Exception as e: 
        print(f"[Error] Info Extraction: {str(e)}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/video-details', methods=['POST'])
def video_details():
    try:
        video_id = request.json.get('id')
        if not video_id:
            return jsonify({'error': 'ID do vídeo em falta'}), 400
            
        url = f"https://www.youtube.com/watch?v={video_id}"
        # 🔥 IMPORTANTE: Usar get_common_opts() para incluir os cookies!
        ydl_opts = {**get_common_opts(), 'extract_flat': True}
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return jsonify({
                'description': info.get('description', 'Sem descrição disponível.'),
                'id': video_id
            })
    except Exception as e:
        print(f"[Error] Falha nos detalhes: {str(e)}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/download-single', methods=['POST'])
def download_single():
    data = request.json
    url, video_id, format_type, playlist_title = data.get('url'), data.get('id'), data.get('format', 'mp4'), data.get('playlist_title', '')
    def run_download():
        try:
            progress_store[video_id] = {'percent': 0, 'status': 'starting'}
            subfolder = f"{playlist_title}/" if playlist_title else ""
            out_tmpl = os.path.join(DOWNLOAD_FOLDER, f"{subfolder}%(playlist_index&{{:02d}} - |)s%(title)s.%(ext)s")
            ydl_opts = {**get_common_opts(), 'format': 'bestvideo+bestaudio/best' if format_type == 'mp4' else 'bestaudio/best', 'outtmpl': out_tmpl, 'merge_output_format': 'mp4' if format_type == 'mp4' else None, 'nopart': True, 'restrictfilenames': True}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl: ydl.download([url])
        except: progress_store[video_id] = {'percent': 0, 'status': 'error'}
    threading.Thread(target=run_download).start()
    return jsonify({'success': True})

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
            progress_store[section_id] = {'percent': 0, 'status': 'starting'}
            out_tmpl = os.path.join(DOWNLOAD_FOLDER, f"%(title)s - {title}.%(ext)s")
            
            # Formata a seção para o yt-dlp (formato string robusto)
            # Ex: "*00:00:00-00:10:00"
            def to_time(s):
                h = int(s // 3600)
                m = int((s % 3600) // 60)
                s = int(s % 60)
                return f"{h:02d}:{m:02d}:{s:02d}"

            section_str = f"*{to_time(start)}-{to_time(end)}"
            
            ydl_opts = {
                **get_common_opts(), 
                'format': 'bestvideo+bestaudio/best' if format_type == 'mp4' else 'bestaudio/best', 
                'outtmpl': out_tmpl, 
                'download_sections': [section_str],
                'force_keyframes_at_cuts': True,
                'nopart': True,
                # Forçar o uso do ffmpeg para extrair apenas o fragmento necessário
                # Isso evita baixar o vídeo inteiro se o servidor suportar
                'concurrent_fragment_downloads': 5,
            }
            
            # Sobrescreve o progress_hook para usar o section_id
            def section_hook(d):
                if d['status'] == 'downloading':
                    downloaded = d.get('downloaded_bytes', 0)
                    total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
                    percent = (downloaded / total * 100) if total > 0 else 0
                    progress_store[section_id] = {'percent': round(percent, 1), 'status': 'downloading'}
                elif d['status'] == 'finished':
                    progress_store[section_id] = {'percent': 100, 'status': 'finished'}
            
            ydl_opts['progress_hooks'] = [section_hook]
            
            with yt_dlp.YoutubeDL(ydl_opts) as ydl: ydl.download([url])
        except Exception as e: 
            print(f"Error cutting: {str(e)}")
            progress_store[section_id] = {'percent': 0, 'status': 'error'}
            
    threading.Thread(target=run_download).start()
    return jsonify({'success': True, 'task_id': section_id})

@app.route('/api/progress-all', methods=['POST'])
def get_all_progress():
    ids = request.json.get('ids', []); results = {}
    for vid in ids: results[vid] = progress_store.get(vid, {'percent': 0, 'status': 'waiting'})
    return jsonify(results)

@app.route('/api/history', methods=['GET'])
def get_history():
    files = []
    if os.path.exists(DOWNLOAD_FOLDER):
        for root, dirs, filenames in os.walk(DOWNLOAD_FOLDER):
            for f in filenames:
                if f == "downloaded_history.txt": continue
                path = os.path.join(root, f); stats = os.stat(path)
                files.append({'name': f, 'size': f"{stats.st_size / (1024*1024):.1f} MB", 'date': time.strftime('%d/%m/%Y', time.localtime(stats.st_mtime))})
    return jsonify({'files': sorted(files, key=lambda x: x['date'], reverse=True), 'current_path': DOWNLOAD_FOLDER})

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
        filename = request.json.get('name')
        for root, dirs, filenames in os.walk(DOWNLOAD_FOLDER):
            if filename in filenames: os.remove(os.path.join(root, filename)); return jsonify({'success': True})
        return jsonify({'error': 'Não encontrado'}), 404
    except Exception as e: return jsonify({'error': str(e)}), 500

@app.route('/api/stream/<path:filename>')
def stream_file(filename):
    """Serve ficheiros para o player do navegador."""
    # Procura o ficheiro na pasta de downloads (incluindo subpastas)
    for root, dirs, filenames in os.walk(DOWNLOAD_FOLDER):
        if filename in filenames:
            return send_file(os.path.join(root, filename))
    return "Ficheiro não encontrado", 404

@app.route('/')
def index(): return app.send_static_file('index.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
