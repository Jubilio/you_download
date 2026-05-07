import os
from celery import Celery
from ..core.downloader import Downloader
import socketio

# Configuração do Celery
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
app = Celery('youdown', broker=REDIS_URL, backend=REDIS_URL)

# Configuração do Socket.IO Client para reportar progresso do worker para a API
# A API então fará o broadcast para os clientes web
sio = socketio.Client()

def get_sio():
    if not sio.connected:
        try:
            sio.connect('http://api:5000', transports=['websocket'])
        except:
            pass
    return sio

@app.task(bind=True, name='download_video')
def download_video(self, url: str, task_id: str, format_type: str = 'mp4'):
    download_path = os.getenv('DOWNLOAD_PATH', os.path.join(os.getcwd(), 'downloads'))
    cookies_path = os.path.join(os.getcwd(), 'cookies.txt')
    
    downloader = Downloader(download_path, cookies_path)
    
    def progress_hook(d):
        status = d.get('status')
        if status == 'downloading':
            downloaded = d.get('downloaded_bytes', 0)
            total = d.get('total_bytes') or d.get('total_bytes_estimate', 0)
            percent = (downloaded / total * 100) if total > 0 else 0
            
            payload = {
                'id': task_id,
                'percent': round(percent, 1),
                'speed': d.get('_speed_str', 'N/A'),
                'eta': d.get('_eta_str', 'N/A'),
                'status': 'downloading'
            }
            # Envia progresso via Socket.IO
            try:
                client = get_sio()
                if client.connected:
                    client.emit('worker_progress', payload)
            except:
                pass

    def socket_log(tid, level, msg):
        try:
            client = get_sio()
            if client.connected:
                client.emit('worker_log', {'id': tid, 'level': level, 'message': msg})
        except:
            pass

    try:
        downloader.download(url, task_id, progress_hook, socket_log)
        
        # Reportar sucesso final
        client = get_sio()
        if client.connected:
            client.emit('worker_progress', {'id': task_id, 'percent': 100, 'status': 'finished'})
        
        return {'status': 'success', 'task_id': task_id}
    except Exception as e:
        client = get_sio()
        if client.connected:
            client.emit('worker_progress', {'id': task_id, 'status': 'error', 'error': str(e)})
        raise e

@app.task(bind=True, name='download_section')
def download_section(self, url: str, task_id: str, start: float, end: float):
    download_path = os.getenv('DOWNLOAD_PATH', 'downloads')
    cookies_path = os.path.join(os.getcwd(), 'cookies.txt')
    
    downloader = Downloader(download_path, cookies_path)
    
    def progress_hook(d):
        if d.get('status') == 'downloading':
            client = get_sio()
            if client.connected:
                client.emit('worker_progress', {
                    'id': task_id,
                    'percent': round((d.get('downloaded_bytes', 0) / (d.get('total_bytes') or 1) * 100), 1),
                    'status': 'downloading'
                })

    try:
        downloader.download_section(url, task_id, start, end, progress_hook)
        client = get_sio()
        if client.connected:
            client.emit('worker_progress', {'id': task_id, 'percent': 100, 'status': 'finished'})
    except Exception as e:
        client = get_sio()
        if client.connected:
            client.emit('worker_progress', {'id': task_id, 'status': 'error', 'error': str(e)})
        raise e
