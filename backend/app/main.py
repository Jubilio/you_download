import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import socketio
from .tasks.worker import download_video, download_section
from .core.downloader import Downloader
import uuid

# Configuração do FastAPI
app = FastAPI(title="YouDown Pro API")

# Configuração do Socket.IO (Servidor)
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
socket_app = socketio.ASGIApp(sio, app)

# Middleware CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Store global para progresso
progress_data = {}

# --- EVENTOS SOCKET.IO ---

@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.on('worker_progress')
async def handle_worker_progress(sid, data):
    """Recebe progresso do Celery worker e repassa para os clientes web."""
    task_id = data.get('id')
    progress_data[task_id] = data
    await sio.emit('progress', data)

@sio.on('worker_log')
async def handle_worker_log(sid, data):
    """Recebe logs do worker e repassa para os clientes."""
    await sio.emit('log', data)

# --- ENDPOINTS API ---

@app.post("/api/info")
async def get_info(request: Request):
    data = await request.json()
    url = data.get('url')
    
    download_path = os.getenv('DOWNLOAD_PATH', 'downloads')
    cookies_path = os.path.join(os.getcwd(), 'cookies.txt')
    
    downloader = Downloader(download_path, cookies_path)
    try:
        info = downloader.extract_info(url)
        return info
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": str(e)})

@app.post("/api/download")
async def start_download(request: Request):
    data = await request.json()
    url = data.get('url')
    format_type = data.get('format', 'mp4')
    
    task_id = str(uuid.uuid4())
    download_video.delay(url, task_id, format_type)
    return {"success": True, "task_id": task_id}

@app.post("/api/download-section")
async def start_download_section(request: Request):
    data = await request.json()
    url = data.get('url')
    start = data.get('start')
    end = data.get('end')
    
    task_id = str(uuid.uuid4())
    download_section.delay(url, task_id, start, end)
    return {"success": True, "task_id": task_id}

@app.get("/api/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(socket_app, host="0.0.0.0", port=5000)
