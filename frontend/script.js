const urlInput = document.getElementById('url-input');
const fetchBtn = document.getElementById('fetch-btn');
const loader = document.getElementById('loader');
const previewSection = document.getElementById('preview-section');
const videoThumbnail = document.getElementById('video-thumbnail');
const videoTitle = document.getElementById('video-title');
const videoChannel = document.getElementById('video-channel');
const downloadAllBtn = document.getElementById('download-all-btn');
const downloadSelectedBtn = document.getElementById('download-selected-btn');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const formatSelect = document.getElementById('format-select');
const downloadQueue = document.getElementById('download-queue');
const queueCount = document.getElementById('queue-count');
const historyList = document.getElementById('history-list');
const currentPathDisplay = document.getElementById('current-path');
const resourcesSection = document.getElementById('resources-section');
const resourcesList = document.getElementById('resources-list');
const videoDescription = document.getElementById('video-description');
const toggleDescBtn = document.getElementById('toggle-desc');
const downloadDescBtn = document.getElementById('download-desc-btn');
const chaptersSection = document.getElementById('chapters-section');
const chaptersList = document.getElementById('chapters-list');
const customClipSection = document.getElementById('custom-clip-section');
const clipStartInput = document.getElementById('clip-start');
const clipEndInput = document.getElementById('clip-end');
const btnCustomCut = document.getElementById('btn-custom-cut');
const bulkClipSection = document.getElementById('bulk-clip-section');
const tocInput = document.getElementById('toc-input');
const btnProcessToc = document.getElementById('btn-process-toc');

// Elementos do Modal de Cookies
const settingsBtn = document.getElementById('settings-btn');
const cookiesModal = document.getElementById('cookies-modal');
const closeModal = document.getElementById('close-modal');
const saveCookiesBtn = document.getElementById('save-cookies-btn');
const syncCookiesBtn = document.getElementById('sync-cookies-btn');
const cookiesInput = document.getElementById('cookies-input');
const dropZone = document.getElementById('drop-zone');
const infoBtn = document.getElementById('info-btn');
const helpModal = document.getElementById('help-modal');
const closeHelp = document.getElementById('close-help');
const closeHelpX = document.getElementById('close-help-x');

const historySearch = document.getElementById('history-search');
const notifySound = document.getElementById('notify-sound');
const ambientOverlay = document.getElementById('ambient-overlay');

// Elementos de Notificação e Confirm
const notificationContainer = document.getElementById('notification-container');
const confirmOverlay = document.getElementById('confirm-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmText = document.getElementById('confirm-text');
const confirmOk = document.getElementById('confirm-ok');
const confirmCancel = document.getElementById('confirm-cancel');
const closeXBtn = document.getElementById('close-modal-x');
const playerModal = document.getElementById('player-modal');
const videoPlayer = document.getElementById('video-player');
const audioPlayer = document.getElementById('audio-player');
const playerTitle = document.getElementById('player-title');
const closePlayerBtn = document.getElementById('close-player');
const closePlayerX = document.getElementById('close-player-x');
const downloadPlayerBtn = document.getElementById('download-player-btn');

let activeTasks = new Set();
let currentPlaylistTitle = "";

// Inicializa Socket.IO
const socket = io("http://" + window.location.hostname + ":5000");

socket.on('progress', (progress) => {
    const { id, percent, status } = progress;
    const item = document.querySelector(`.queue-item[data-id="${id}"]`);
    if (!item) return;

    const fill = item.querySelector('.item-progress-fill');
    const badge = item.querySelector('.status-badge');
    
    if (status === 'downloading') { 
        fill.style.width = `${percent}%`; 
        badge.innerText = `${percent}%`; 
    } else if (status === 'processing') {
        badge.innerText = "Processando...";
        fill.style.width = "50%";
        fill.classList.add('processing');
    } else if (progress.status === 'starting') {
        badge.innerText = "Iniciando...";
    } else if (status === 'finished') { 
        fill.style.width = "100%"; 
        fill.classList.remove('processing');
        fill.classList.add('finished'); 
        badge.innerText = "Concluído"; 
        item.dataset.status = "finished"; 
        item.querySelector('.control-btn i').className = "fa-solid fa-check"; 
        activeTasks.delete(id); 
        Notify.show("Concluído", "Download finalizado!", "success"); 
        sendBrowserNotification("Download Concluído", "Ficheiro salvo."); 
        loadHistory(); 
    } else if (status === 'error') {
        badge.innerText = "Erro!";
        item.dataset.status = "error";
        activeTasks.delete(id);
    } else if (status === 'cancelled') {
        badge.innerText = "Cancelado";
        item.dataset.status = "cancelled";
        activeTasks.delete(id);
    }
});

const placeholder = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='45' viewBox='0 0 80 45'%3E%3Crect width='100%25' height='100%25' fill='%231e293b'/%3E%3C/svg%3E";

// --- SISTEMA DE NOTIFICAÇÕES ---

const Notify = {
    show: (title, message, type = 'info') => {
        const id = Date.now();
        const icons = { success: 'fa-circle-check', error: 'fa-circle-xmark', info: 'fa-circle-info' };
        
        const html = `
            <div class="notification ${type}" id="notif-${id}">
                <i class="fa-solid ${icons[type]}"></i>
                <div class="notification-content">
                    <div class="notification-title">${title}</div>
                    <div class="notification-message">${message}</div>
                </div>
                <div class="notif-progress">
                    <div class="notif-progress-inner"></div>
                </div>
            </div>
        `;
        
        notificationContainer.insertAdjacentHTML('afterbegin', html);
        const el = document.getElementById(`notif-${id}`);
        setTimeout(() => el.classList.add('show'), 10);
        
        // Auto-remove
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 500);
        }, 4000);

        if (type === 'success' && notifySound) {
            notifySound.currentTime = 0;
            notifySound.play().catch(e => console.log("Áudio bloqueado"));
        }
    }
};

historySearch.addEventListener('input', () => loadHistory());

function applyAmbientGlow(imgUrl) {
    if (!imgUrl) return;
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = imgUrl;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1; canvas.height = 1;
        ctx.drawImage(img, 0, 0, 1, 1);
        const data = ctx.getImageData(0, 0, 1, 1).data;
        document.documentElement.style.setProperty('--ambient-color', `rgb(${data[0]}, ${data[1]}, ${data[2]})`);
        ambientOverlay.style.opacity = '0.3';
    };
}

function showConfirm(title, text) {
    return new Promise((resolve) => {
        confirmTitle.innerText = title; confirmText.innerText = text;
        confirmOverlay.classList.add('active');
        const handleOk = () => { confirmOverlay.classList.remove('active'); cleanup(); resolve(true); };
        const handleCancel = () => { confirmOverlay.classList.remove('active'); cleanup(); resolve(false); };
        const cleanup = () => { confirmOk.removeEventListener('click', handleOk); confirmCancel.removeEventListener('click', handleCancel); };
        confirmOk.addEventListener('click', handleOk);
        confirmCancel.addEventListener('click', handleCancel);
    });
}

// --- LOGICA DE DRAG & DROP ---

if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        dropZone.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });

    dropZone.addEventListener('dragover', () => dropZone.classList.add('dragover'));
    ['dragleave', 'drop'].forEach(evt => dropZone.addEventListener(evt, () => dropZone.classList.remove('dragover')));

    dropZone.addEventListener('drop', e => {
        const file = e.dataTransfer.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                cookiesInput.value = e.target.result;
                Notify.show("Ficheiro Lido", "Conteúdo do cookies.txt importado!", "success");
            };
            reader.readAsText(file);
        }
    });
}

// --- LOGICA DO APP ---

const closeModalFunc = () => {
    cookiesModal.classList.add('hidden');
};

const closeHelpFunc = () => {
    helpModal.classList.add('hidden');
};

document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
    setInterval(updateAllProgress, 1000);
    if (Notification.permission !== 'granted') Notification.requestPermission();
});

// Eventos do Modal
settingsBtn.addEventListener('click', () => cookiesModal.classList.remove('hidden'));
closeModal.addEventListener('click', closeModalFunc);
closeXBtn.addEventListener('click', closeModalFunc);

infoBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
closeHelp.addEventListener('click', closeHelpFunc);
closeHelpX.addEventListener('click', closeHelpFunc);

window.addEventListener('click', (e) => {
    if (e.target === cookiesModal) closeModalFunc();
    if (e.target === helpModal) closeHelpFunc();
    if (e.target === playerModal) closePlayerFunc();
});

document.getElementById('update-engine-btn').onclick = async () => {
    const btn = document.getElementById('update-engine-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...';
    try {
        const res = await fetch('/api/update-engine', { method: 'POST' });
        const data = await res.json();
        if (data.success) Notify.show("Sucesso", data.message, "success");
        else Notify.show("Erro", data.message, "error");
    } catch (err) { Notify.show("Erro", err.message, "error"); }
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-sync"></i> Atualizar Motor';
};

saveCookiesBtn.onclick = async () => {
    const cookies = cookiesInput.value.trim();
    if (!cookies) return Notify.show("Aviso", "Cole o conteúdo ou arraste o ficheiro.", "error");
    
    saveCookiesBtn.disabled = true;
    saveCookiesBtn.innerText = "A Processar...";
    
    try {
        const res = await fetch('/api/save-cookies', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ cookies }) 
        });
        
        if (res.ok) { 
            Notify.show("Sucesso", "Autenticação ativada!", "success");
            closeModalFunc();
            cookiesInput.value = ""; 
        } else {
            Notify.show("Erro", "Falha ao processar cookies.", "error");
        }
    } catch (err) { 
        Notify.show("Erro", "Falha de conexão.", "error"); 
    } finally { 
        saveCookiesBtn.disabled = false;
        saveCookiesBtn.innerText = "Ativar Cookies";
    }
};

syncCookiesBtn.onclick = async () => {
    const confirmed = await showConfirm(
        "Autorizar Sincronização?", 
        "O YouDown tentará ler os cookies de sessão do YouTube nos seus navegadores instalados para permitir downloads de vídeos restritos. Deseja continuar?"
    );
    
    if (!confirmed) return;

    syncCookiesBtn.disabled = true;
    syncCookiesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> A Sincronizar...';
    try {
        const res = await fetch('/api/sync-cookies', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            Notify.show("Sincronizado", `Conectado ao ${data.browser}`, "success");
            cookiesModal.classList.add('hidden');
        } else { Notify.show("Falha", data.message, "error"); }
    } catch (err) { Notify.show("Erro", "Erro na sincronização.", "error"); }
    finally {
        syncCookiesBtn.disabled = false;
        syncCookiesBtn.innerHTML = '<i class="fa-solid fa-sync"></i> Tentativa Automática (Recomendado)';
    }
};

fetchBtn.addEventListener('click', fetchInfo);
urlInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') fetchInfo(); });

downloadAllBtn.addEventListener('click', () => {
    const items = document.querySelectorAll('.queue-item[data-status="waiting"]');
    if (items.length === 0) return Notify.show("Fila Vazia", "Não há vídeos para baixar.", "info");
    items.forEach(item => startDownloadItem(item.dataset.id));
});

downloadSelectedBtn.addEventListener('click', () => {
    const checkedItems = document.querySelectorAll('.queue-item[data-status="waiting"] .item-checkbox:checked');
    if (checkedItems.length === 0) return Notify.show("Aviso", "Selecione pelo menos um vídeo!", "error");
    checkedItems.forEach(cb => startDownloadItem(cb.closest('.queue-item').dataset.id));
});

selectAllCheckbox.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.item-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
});

toggleDescBtn.addEventListener('click', () => {
    const isHidden = videoDescription.classList.toggle('hidden');
    toggleDescBtn.innerHTML = isHidden ? 'Ver Descrição Completa <i class="fa-solid fa-chevron-down"></i>' : 'Ocultar Descrição <i class="fa-solid fa-chevron-up"></i>';
});

downloadDescBtn.addEventListener('click', () => {
    const text = videoDescription.innerText;
    const title = videoTitle.innerText || "descricao";
    if (!text) return Notify.show("Aviso", "Analise um vídeo primeiro.", "error");
    saveTextAsFile(text, `${title}_descricao.txt`);
    Notify.show("Sucesso", "Descrição exportada!", "success");
});

function saveTextAsFile(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/[\\/:*?"<>|]/g, "");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadText(id, title) {
    const panel = document.getElementById(`details-${id}`);
    const text = panel.querySelector('.item-desc-text').innerText;
    if (text === "Carregando detalhes..." || !text) return Notify.show("Aguarde", "Carregando informações...", "info");
    saveTextAsFile(text, `${title}_descricao.txt`);
    Notify.show("Sucesso", "Descrição exportada!", "success");
}

async function fetchInfo() {
    const url = urlInput.value.trim();
    if (!url) return;
    loader.classList.remove('hidden');
    previewSection.classList.add('hidden');
    console.log('Enviando para análise:', url);
    try {
        const response = await fetch('/api/info', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        videoTitle.innerText = data.title;
        videoTitle.dataset.videoId = data.id; // Guardar ID para o recorte manual
        videoThumbnail.src = data.thumbnail || "";
        videoChannel.innerText = data.channel;
        videoDescription.innerHTML = linkify(data.description);
        
        // Aplicar Ambient Glow baseado na thumbnail
        applyAmbientGlow(data.thumbnail);

        currentPlaylistTitle = data.is_playlist ? data.title : "";
        currentPathDisplay.innerText = data.current_path;
        
        extractResources(data.description, resourcesList, resourcesSection);
        
        // Processar Capítulos
        chaptersList.innerHTML = "";
        if (data.chapters && data.chapters.length > 0) {
            chaptersSection.classList.remove('hidden');
            data.chapters.forEach(ch => {
                const item = document.createElement('div');
                item.className = 'chapter-item';
                item.innerHTML = `
                    <div class="chapter-info">
                        <span class="chapter-title">${ch.title}</span>
                        <span class="chapter-time">${formatTime(ch.start_time)} - ${formatTime(ch.end_time)}</span>
                    </div>
                    <button class="btn-cut" onclick="downloadChapter('${data.url}', '${data.id}', ${ch.start_time}, ${ch.end_time}, '${ch.title.replace(/'/g, "\\'")}')">
                        <i class="fa-solid fa-scissors"></i> Recortar
                    </button>
                `;
                chaptersList.appendChild(item);
            });
        } else {
            chaptersSection.classList.add('hidden');
        }
        
        // Mostrar sempre a secção de recorte manual se for vídeo único
        if (!data.is_playlist) {
            customClipSection.classList.remove('hidden');
            bulkClipSection.classList.remove('hidden');
            videoTitle.dataset.duration = data.duration || 0; // Guardar duração total
        } else {
            customClipSection.classList.add('hidden');
            bulkClipSection.classList.add('hidden');
        }

        downloadQueue.innerHTML = "";
        const entries = data.is_playlist ? data.entries : [{url: data.url, title: data.title, id: data.id, thumbnail: data.thumbnail, channel: data.channel}];
        entries.forEach(entry => addVideoToQueue(entry));
        
        loader.classList.add('hidden');
        previewSection.classList.remove('hidden');
        updateQueueCount();
        selectAllCheckbox.checked = true;
    } catch (err) { loader.classList.add('hidden'); Notify.show("Erro de Análise", err.message, "error"); }
}

function addClipToQueue(clip) {
    const item = document.createElement('div');
    item.className = 'queue-item clip-task';
    item.dataset.id = clip.taskId;
    item.dataset.status = 'downloading';
    item.innerHTML = `
        <div class="clip-badge"><i class="fa-solid fa-scissors"></i> Recorte</div>
        <div class="queue-content">
            <div class="queue-item-header">
                <div class="queue-item-info">
                    <div class="queue-item-title">${clip.title}</div>
                    <div class="queue-item-meta">
                        <span class="status-badge">Iniciando...</span>
                    </div>
                </div>
                <div class="queue-controls">
                    <button class="control-btn btn-danger" onclick="removeTask('${clip.taskId}')"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="item-progress-bar"><div class="item-progress-fill"></div></div>
        </div>`;
    downloadQueue.prepend(item);
    updateQueueCount();
}

function addVideoToQueue(video) {
    const item = document.createElement('div');
    item.className = 'queue-item';
    item.dataset.id = video.id;
    item.dataset.url = video.url;
    item.dataset.status = 'waiting';
    item.innerHTML = `
        <input type="checkbox" class="item-checkbox" checked>
        <img src="${video.thumbnail || placeholder}" class="queue-item-thumb" onerror="this.src='${placeholder}'">
        <div class="queue-content">
            <div class="queue-item-header">
                <div class="queue-item-info">
                    <div class="queue-item-title">${video.title}</div>
                    <div class="queue-item-meta">
                        <span class="channel-name"><i class="fa-solid fa-user"></i> ${video.channel}</span>
                        <span class="status-badge">Aguardando</span>
                        <button class="btn-info" onclick="toggleItemDetails('${video.id}')" title="Ver detalhes"><i class="fa-solid fa-circle-info"></i></button>
                    </div>
                </div>
                <div class="queue-controls">
                    <button class="control-btn" onclick="startDownloadItem('${video.id}')"><i class="fa-solid fa-play"></i></button>
                    <button class="control-btn btn-danger" onclick="removeTask('${video.id}')"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            <div class="item-details-panel hidden" id="details-${video.id}">
                <div class="item-details-header">
                    <button class="btn-text-only btn-sm" onclick="downloadText('${video.id}', '${video.title.replace(/'/g, "\\'")}')">
                        <i class="fa-solid fa-file-export"></i> Baixar Descrição
                    </button>
                </div>
                <div class="item-desc-text">Carregando detalhes...</div>
                <div class="item-resources"></div>
            </div>
            <div class="item-progress-bar"><div class="item-progress-fill"></div></div>
        </div>`;
    downloadQueue.appendChild(item);
}

async function removeTask(id) { 
    // Notifica o backend para parar o download se estiver a correr
    try {
        fetch('/api/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    } catch(e) {}

    const item = document.querySelector(`.queue-item[data-id="${id}"]`); 
    if (item) { 
        item.remove(); 
        updateQueueCount(); 
        activeTasks.delete(id);
    } 
}

async function toggleItemDetails(id) {
    const panel = document.getElementById(`details-${id}`);
    const isHidden = panel.classList.toggle('hidden');
    if (!isHidden && panel.dataset.loaded !== 'true') {
        try {
            const res = await fetch('/api/video-details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
            const data = await res.json();
            panel.querySelector('.item-desc-text').innerHTML = linkify(data.description);
            extractResources(data.description, panel.querySelector('.item-resources'), null);
            panel.dataset.loaded = 'true';
        } catch (err) { panel.querySelector('.item-desc-text').innerText = "Erro ao carregar."; }
    }
}

async function startDownloadItem(id) {
    const item = document.querySelector(`.queue-item[data-id="${id}"]`);
    if (!item || item.dataset.status === 'downloading') return;
    item.dataset.status = 'downloading';
    item.querySelector('.item-checkbox').disabled = true;
    item.querySelector('.status-badge').innerText = "Iniciando...";
    item.querySelector('.control-btn i').className = "fa-solid fa-spinner fa-spin";
    activeTasks.add(id);
    try {
        await fetch('/api/download-single', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, url: item.dataset.url, format: formatSelect.value, playlist_title: currentPlaylistTitle }) });
    } catch (err) { item.dataset.status = 'error'; item.querySelector('.status-badge').innerText = "Erro!"; activeTasks.delete(id); }
}

// Polling removido em favor do Socket.IO

function extractResources(text, container, section) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const links = text.match(urlRegex) || [];
    container.innerHTML = "";
    let foundCount = 0;
    const usefulDomains = ['drive.google', 'dropbox', 'mega.nz', 'mediafire', 'github', 'gitlab', 'pdf', 'docs.google', 't.me'];
    [...new Set(links)].forEach(link => {
        if (usefulDomains.some(domain => link.toLowerCase().includes(domain))) {
            foundCount++;
            const domain = new URL(link).hostname.replace('www.', '');
            const a = document.createElement('a'); a.className = 'resource-link'; a.href = link; a.target = '_blank';
            a.innerHTML = `<i class="fa-solid fa-link"></i> ${domain}`;
            container.appendChild(a);
        }
    });
    if (section) section.classList.toggle('hidden', foundCount === 0);
}

async function loadHistory() {
    const res = await fetch('/api/history');
    const data = await res.json();
    currentPathDisplay.innerText = data.current_path;
    historyList.innerHTML = data.files.map(f => `
        <div class="history-item">
            <div class="file-name" title="${f.name}">${f.name}</div>
            <div class="history-actions">
                ${f.name.endsWith('.zip') ? '' : `<button class="play-btn" onclick="openPlayer('${f.name}')" title="Reproduzir"><i class="fa-solid fa-play"></i></button>`}
                <button class="delete-btn" onclick="deleteHistoryFile('${f.name}')" title="Apagar"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>`).join('');
}

function openPlayer(filename) {
    const streamUrl = `/api/stream/${encodeURIComponent(filename)}`;
    playerTitle.innerText = filename;
    downloadPlayerBtn.href = streamUrl;
    
    const isAudio = filename.toLowerCase().endsWith('.mp3');
    if (isAudio) {
        videoPlayer.classList.add('hidden');
        audioPlayer.classList.remove('hidden');
        audioPlayer.src = streamUrl;
        audioPlayer.play();
    } else {
        audioPlayer.classList.add('hidden');
        videoPlayer.classList.remove('hidden');
        videoPlayer.src = streamUrl;
        videoPlayer.play();
    }
    playerModal.classList.remove('hidden');
}

const closePlayerFunc = () => {
    playerModal.classList.add('hidden');
    videoPlayer.pause();
    audioPlayer.pause();
    videoPlayer.src = "";
    audioPlayer.src = "";
};

closePlayerBtn.onclick = closePlayerFunc;
closePlayerX.onclick = closePlayerFunc;

async function deleteHistoryFile(name) {
    const confirmed = await showConfirm("Apagar Ficheiro?", `Deseja remover permanentemente "${name}"?`);
    if (confirmed) { 
        await fetch('/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }); 
        Notify.show("Apagado", "Ficheiro removido.", "info"); loadHistory(); 
    }
}

function sendBrowserNotification(title, body) { if (Notification.permission === 'granted') new Notification(title, { body }); }

function linkify(text) {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" class="desc-link">${url}</a>`);
}

btnCustomCut.addEventListener('click', () => {
    const start = clipStartInput.value.trim() || "00:00:00";
    const end = clipEndInput.value.trim();
    if (!end) return Notify.show("Erro", "Defina o tempo de fim.", "error");
    
    // Converter HH:MM:SS para segundos para a API (opcional, ou mudar a API para aceitar string)
    // Vamos mudar a API para ser mais robusta, mas por agora convertemos
    const startSec = timeToSeconds(start);
    const endSec = timeToSeconds(end);
    
    if (endSec <= startSec) return Notify.show("Erro", "O fim deve ser após o início.", "error");
    
    const url = urlInput.value.trim();
    const id = document.getElementById('video-title').dataset.videoId; // Precisamos guardar o ID
    
    downloadChapter(url, id, startSec, endSec, `Recorte_${start.replace(/:/g, '-')}`);
});

btnProcessToc.addEventListener('click', () => {
    const text = tocInput.value.trim();
    if (!text) return Notify.show("Aviso", "Cole o índice primeiro.", "info");
    
    const lines = text.split('\n');
    const parsed = [];
    // Regex para detetar tempos tipo (0:00), 12:34, 1:02:03
    const timeRegex = /\[?\(?(\d{1,2}:?\d{1,2}:?\d{1,2})\)?\]?/;
    
    lines.forEach(line => {
        const match = line.match(timeRegex);
        if (match) {
            const timeStr = match[1];
            const title = line.replace(match[0], "").replace(/^[^\w]+/, "").trim();
            parsed.push({ start: timeToSeconds(timeStr), title: title || "Aula" });
        }
    });

    if (parsed.length === 0) return Notify.show("Erro", "Nenhum timestamp válido encontrado.", "error");

    // Ordenar por tempo
    parsed.sort((a, b) => a.start - b.start);

    // Calcular o fim de cada segmento (o início do próximo ou o fim do vídeo)
    const totalDuration = parseFloat(document.getElementById('video-title').dataset.duration);
    const url = urlInput.value.trim();
    const id = document.getElementById('video-title').dataset.videoId;

    parsed.forEach((item, index) => {
        const nextStart = parsed[index + 1] ? parsed[index + 1].start : totalDuration;
        // Só adiciona se o segmento tiver duração positiva
        if (nextStart > item.start) {
            downloadChapter(url, id, item.start, nextStart, item.title);
        }
    });

    Notify.show("Bulk Iniciado", `${parsed.length} recortes adicionados à fila.`, "success");
});

function timeToSeconds(timeStr) {
    const parts = timeStr.split(':').reverse();
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
        seconds += parseInt(parts[i]) * Math.pow(60, i);
    }
    return seconds;
}

function updateQueueCount() { queueCount.innerText = `${document.querySelectorAll('.queue-item').length} itens`; }

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v < 10 ? "0" + v : v).filter((v, i) => v !== "00" || i > 0).join(":");
}

async function downloadChapter(url, id, start, end, title) {
    try {
        console.log(`[Corte] Iniciando: ${title} (${start}s - ${end}s)`);
        const res = await fetch('/api/download-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, id, start, end, title, format: formatSelect.value })
        });
        const data = await res.json();
        if (data.success) {
            Notify.show("Corte Iniciado", `A baixar: ${title}`, "info");
            addClipToQueue({ taskId: data.taskId, title: title });
            activeTasks.add(data.taskId);
        } else {
            Notify.show("Erro no Recorte", data.message || "Erro desconhecido", "error");
        }
    } catch (err) { 
        console.error("[Erro Corte]", err);
        Notify.show("Erro ao Cortar", err.message, "error"); 
    }
}

document.getElementById('open-folder-btn').onclick = () => fetch('/api/open-folder', {method: 'POST'});
document.getElementById('refresh-history').onclick = loadHistory;
document.getElementById('change-folder-btn').onclick = async () => {
    const res = await fetch('/api/select-folder', {method: 'POST'});
    const d = await res.json();
    if (d.success) { Notify.show("Pasta Alterada", "Diretório atualizado.", "success"); loadHistory(); }
};
