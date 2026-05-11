const socket = io({
    transports: ['polling', 'websocket'],
    upgrade: true
});

const taskGrid = document.getElementById('task-grid');
const historyGrid = document.getElementById('history-grid');
const videoUrlInput = document.getElementById('video-url');
const heroPreview = document.getElementById('hero-preview');
const socketStatus = document.getElementById('socket-status');

let activeTasks = new Map();
let currentVideoInfo = null;

// --- SOCKET.IO EVENTS ---
socket.on('connect', () => {
    socketStatus.innerText = 'Pipeline Ativo';
    document.querySelector('.status-dot').style.background = '#4ade80';
    document.querySelector('.status-dot').style.boxShadow = '0 0 15px #4ade80';
    logEvent("System: Socket Pipeline Established. Node.js Engine Linked.");
});

socket.on('disconnect', () => {
    socketStatus.innerText = 'Pipeline Offline';
    document.querySelector('.status-dot').style.background = '#ef4444';
    document.querySelector('.status-dot').style.boxShadow = '0 0 15px #ef4444';
    logEvent("CRITICAL: Connection Lost. Attempting Reconnection...");
});

socket.on('log', (data) => {
    const typeTag = data.type === 'error' ? '[ERROR]' : (data.type === 'warn' ? '[WARN]' : '[INFO]');
    const color = data.type === 'error' ? '#ef4444' : (data.type === 'warn' ? '#fbbf24' : '#4ade80');
    logEvent(`<span style="color: ${color}">${typeTag}</span> ${data.msg}`);
});

socket.on('progress', (data) => {
    updateTaskUI(data);
});

// --- ENGINE LOGIC ---

videoUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyzeVideo();
});

async function analyzeVideo() {
    const url = videoUrlInput.value.trim();
    if (!url) return;

    videoUrlInput.disabled = true;
    videoUrlInput.placeholder = "Analisando...";

    try {
        const res = await fetch('/api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        currentVideoInfo = data;
        showHero(data);
    } catch (err) {
        alert("Erro: " + err.message);
    } finally {
        videoUrlInput.disabled = false;
        videoUrlInput.placeholder = "Cole o link do YouTube aqui e prima Enter...";
    }
}

function showHero(data) {
    heroPreview.style.display = 'block';
    document.getElementById('hero-img').src = data.thumbnail;
    document.getElementById('hero-title').innerText = data.title;
    document.getElementById('hero-channel').innerText = data.channel;
    
    // Renderizar capítulos se existirem
    if (data.chapters && data.chapters.length > 0) {
        renderChapters(data.chapters);
    } else {
        document.getElementById('chapters-section').style.display = 'none';
    }

    // Renderizar playlist se existirem entradas
    if (data.entries && data.entries.length > 0) {
        renderPlaylist(data.entries);
    } else {
        document.getElementById('playlist-section').style.display = 'none';
    }
    
    heroPreview.scrollIntoView({ behavior: 'smooth' });
}

function renderChapters(chapters) {
    const section = document.getElementById('chapters-section');
    const list = document.getElementById('chapters-list');
    section.style.display = 'block';
    list.innerHTML = '';

    chapters.forEach(ch => {
        const card = document.createElement('div');
        card.className = 'chapter-card';
        card.innerHTML = `
            <div class="chapter-time">${formatTime(ch.start_time)} - ${formatTime(ch.end_time)}</div>
            <div class="chapter-title">${ch.title}</div>
            <button class="btn btn-primary btn-small" onclick="downloadSection(${ch.start_time}, ${ch.end_time}, '${ch.title.replace(/'/g, "\\'")}')">
                <i class="fa-solid fa-scissors"></i> Recortar Cena
            </button>
        `;
        list.appendChild(card);
    });
}

function renderPlaylist(entries) {
    const section = document.getElementById('playlist-section');
    const grid = document.getElementById('playlist-grid');
    section.style.display = 'block';
    grid.innerHTML = '';
    
    // Armazenar para uso no download selecionado
    currentVideoInfo.entries = entries;

    entries.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'playlist-item';
        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem; width: 100%;">
                <input type="checkbox" class="playlist-checkbox" data-index="${index}" checked style="width: 20px; height: 20px; accent-color: var(--netflix-red); cursor: pointer;">
                <div class="thumb-wrapper" style="width: 100px; min-width: 100px;">
                    <img src="${item.thumbnail}" alt="" style="width: 100px;">
                </div>
                <div class="playlist-info" style="flex: 1;">
                    <div class="chapter-title" style="font-size: 0.9rem; margin-bottom: 5px;">${item.title}</div>
                    <div style="font-size: 0.7rem; color: #777;">${item.channel || ''}</div>
                </div>
                <button class="btn btn-secondary btn-small" onclick="analyzeVideoUrl('${item.url}')" title="Analisar este vídeo individualmente">
                    <i class="fa-solid fa-magnifying-glass"></i>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function downloadSection(start, end, title) {
    if (!currentVideoInfo) return;
    try {
        await fetch('/api/download-section', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentVideoInfo.url,
                id: currentVideoInfo.id,
                start, end, title
            })
        });
        sendNotification("Recorte Iniciado", `A processar: ${title}`);
    } catch (err) {
        console.error("Section download fail:", err);
    }
}

function analyzeVideoUrl(url) {
    videoUrlInput.value = url;
    analyzeVideo();
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s].map(v => v.toString().padStart(2, '0')).filter((v, i) => v !== '00' || i > 0).join(':');
}

async function startDownload(format = 'mp4') {
    if (!currentVideoInfo) return;
    try {
        await fetch('/api/download-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: currentVideoInfo.url,
                id: currentVideoInfo.id,
                format: format,
                title: currentVideoInfo.title,
                thumbnail: currentVideoInfo.thumbnail,
                channel: currentVideoInfo.channel
            })
        });
        sendNotification("Download Iniciado", currentVideoInfo.title);
    } catch (err) {
        console.error("Download fail:", err);
    }
}

async function downloadPlaylist() {
    if (!currentVideoInfo || !currentVideoInfo.entries) return;
    
    // Obter índices selecionados
    const checkboxes = document.querySelectorAll('.playlist-checkbox');
    const selectedIndices = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => parseInt(cb.dataset.index));

    if (selectedIndices.length === 0) {
        alert("Por favor, selecione pelo menos um vídeo para baixar.");
        return;
    }

    const playlistTitle = currentVideoInfo.title || "Playlist";
    sendNotification("Playlist Iniciada", `A processar ${selectedIndices.length} vídeos selecionados...`);
    logEvent(`Starting selective playlist download: ${selectedIndices.length} items.`);

    for (const index of selectedIndices) {
        const entry = currentVideoInfo.entries[index];
        try {
            await fetch('/api/download-single', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: entry.url,
                    id: entry.id,
                    format: 'mp4',
                    title: entry.title,
                    thumbnail: entry.thumbnail,
                    channel: entry.channel,
                    playlist_title: playlistTitle
                })
            });
        } catch (err) {
            console.error("Playlist item download fail:", err);
            logEvent(`ERROR: Failed to queue ${entry.title}`);
        }
    }
}

function togglePlaylistSelection() {
    const checkboxes = document.querySelectorAll('.playlist-checkbox');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
    logEvent(allChecked ? "All items deselected." : "All items selected.");
}

function updateTaskUI(data) {
    let card = document.getElementById(`task-${data.id}`);
    
    if (!card) {
        card = createTaskCard(data);
        taskGrid.prepend(card);
    }

    const fill = card.querySelector('.progress-fill');
    const badge = card.querySelector('.task-badge');
    const speed = card.querySelector('.task-speed');
    const eta = card.querySelector('.task-eta');

    fill.style.width = `${data.percent}%`;
    badge.innerText = `${data.percent}%`;
    
    if (data.speed) speed.innerText = data.speed;
    if (data.eta) eta.innerText = `ETA: ${data.eta}`;

    if (data.status === 'finished') {
        sendNotification("Concluído", "O seu ficheiro está pronto!");
        setTimeout(() => {
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                loadHistory();
            }, 500);
        }, 2000);
    } else if (data.status === 'error') {
        fill.style.backgroundColor = '#ef4444';
        badge.innerText = 'ERRO';
        
        const errorMsg = data.error || "Falha no processamento.";
        card.querySelector('.task-title').innerText = errorMsg;
        card.querySelector('.task-title').style.color = '#ef4444';
        logEvent(`ERROR: ${errorMsg}`);
    }
}

function showToast(title, msg, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    
    const icon = type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-bell');
    
    toast.innerHTML = `
        <i class="fa-solid ${icon}" style="font-size: 1.2rem; margin-top: 0.2rem; color: ${type === 'success' ? '#4ade80' : (type === 'error' ? '#ef4444' : 'var(--netflix-red)')}"></i>
        <div class="toast-content">
            <h4>${title.toUpperCase()}</h4>
            <p>${msg}</p>
        </div>
    `;
    
    container.appendChild(toast);
    logEvent(`${title}: ${msg}`);

    setTimeout(() => {
        toast.style.animation = 'toastFadeOut 0.5s forwards';
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

function sendNotification(title, body) {
    showToast(title, body, 'info');
    // Manter a notificação do browser como secundária
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.png' });
    }
}

function createTaskCard(data) {
    const card = document.createElement('div');
    card.id = `task-${data.id}`;
    card.className = 'task-card';
    card.innerHTML = `
        <div class="task-header">
            <div class="task-title">${data.id}</div>
            <div class="task-badge" style="font-size: 10px; font-weight: 900; color: #E50914;">0%</div>
        </div>
        <div class="progress-container">
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
        </div>
        <div class="task-footer">
            <span class="task-speed">Calculando...</span>
            <span class="task-eta">--:--</span>
        </div>
    `;
    return card;
}

// --- MANUAL CUT LOGIC ---

function toggleManualCut() {
    const panel = document.getElementById('manual-cut-panel');
    const actions = document.getElementById('hero-actions');
    const isHidden = panel.style.display === 'none';
    
    panel.style.display = isHidden ? 'flex' : 'none';
    
    if (isHidden && currentVideoInfo) {
        document.getElementById('cut-end').value = formatTime(currentVideoInfo.duration || 10);
    }
}

function timeToSeconds(timeStr) {
    const parts = timeStr.split(':').reverse();
    let seconds = 0;
    for (let i = 0; i < parts.length; i++) {
        seconds += parseInt(parts[i]) * Math.pow(60, i);
    }
    return seconds;
}

async function processManualCut() {
    const startStr = document.getElementById('cut-start').value;
    const endStr = document.getElementById('cut-end').value;
    const name = document.getElementById('cut-name').value;
    
    const start = timeToSeconds(startStr);
    const end = timeToSeconds(endStr);
    
    if (isNaN(start) || isNaN(end) || end <= start) {
        alert("Tempos inválidos! Use o formato 00:00:00 e garanta que o fim é maior que o início.");
        return;
    }
    
    await downloadSection(start, end, name);
    toggleManualCut();
}

// --- HISTORY SEARCH ---

document.getElementById('history-search').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const cards = historyGrid.querySelectorAll('.history-card');
    
    cards.forEach(card => {
        const title = card.querySelector('h4').innerText.toLowerCase();
        card.style.display = title.includes(term) ? 'block' : 'none';
    });
});

async function loadHistory() {
    try {
        const res = await fetch('/api/history');
        const data = await res.json();
        
        historyGrid.innerHTML = '';
        
        if (!data.files || data.files.length === 0) {
            historyGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-dim);">
                    <i class="fa-solid fa-folder-open" style="font-size: 3rem; margin-bottom: 1rem; display: block; opacity: 0.2;"></i>
                    <p>O seu histórico está vazio.</p>
                </div>
            `;
            return;
        }

        data.files.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card';
            card.innerHTML = `
                <div class="thumb-wrapper">
                    <img src="${item.thumbnail || 'favicon.png'}" alt="" onerror="this.src='favicon.png'">
                    <div class="history-badge">${item.format.toUpperCase()}</div>
                </div>
                <div class="history-info">
                    <h4>${item.title}</h4>
                    <p>${item.channel} • ${item.date}</p>
                </div>
                <div class="history-actions">
                    <button onclick="deleteHistoryItem(${item.id})" class="btn-icon" title="Remover"><i class="fa-solid fa-xmark"></i></button>
                </div>
            `;
            historyGrid.appendChild(card);
        });
    } catch (err) {
        console.error("History load error:", err);
        historyGrid.innerHTML = '<p style="color: #ef4444;">Erro ao carregar histórico.</p>';
    }
}

async function deleteHistoryItem(id) {
    if (!confirm("Remover este item do histórico?")) return;
    try {
        await fetch('/api/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        loadHistory();
    } catch (err) {
        console.error("Delete error:", err);
    }
}

// --- NAVIGATION & ROUTING ---

function handleRouting() {
    const hash = window.location.hash || '#dashboard';
    
    if (hash === '#settings') {
        openSettings();
        // Manter a secção anterior visível por baixo do modal ou voltar para dashboard
        if (document.getElementById('history-section').style.display === 'none') {
            showSection('dashboard');
        }
        return;
    }

    const section = hash.replace('#', '');
    showSection(section);
}

function showSection(section) {
    const dashboard = document.getElementById('dashboard-section');
    const history = document.getElementById('history-section');
    const navDashboard = document.getElementById('nav-dashboard');
    const navHistory = document.getElementById('nav-history');

    // Reset
    dashboard.style.display = 'none';
    history.style.display = 'none';
    navDashboard.classList.remove('active');
    navHistory.classList.remove('active');

    if (section === 'history') {
        history.style.display = 'block';
        navHistory.classList.add('active');
        loadHistory();
    } else {
        dashboard.style.display = 'block';
        navDashboard.classList.add('active');
    }
}

window.addEventListener('hashchange', handleRouting);

function openSettings() {
    document.getElementById('settings-modal').style.display = 'flex';
    fetch('/api/history').then(res => res.json()).then(data => {
        document.getElementById('current-folder-display').innerText = `Pasta atual: ${data.current_path || 'Não definida'}`;
    });
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
    // Reset hash para a secção ativa sem disparar o handleRouting novamente de forma recursiva
    const currentSection = document.getElementById('history-section').style.display === 'block' ? 'history' : 'dashboard';
    if (window.location.hash === '#settings') {
        history.replaceState(null, null, `#${currentSection}`);
    }
}

async function syncCookies(e) {
    const btn = (e && e.currentTarget) ? e.currentTarget : document.activeElement;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';

    try {
        const res = await fetch('/api/sync-cookies', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert(`Sucesso! Cookies sincronizados com o ${data.browser}.`);
        } else {
            alert(data.message || "Erro ao sincronizar cookies.");
        }
    } catch (err) {
        alert("Erro de conexão com o servidor.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function selectFolder() {
    try {
        const res = await fetch('/api/select-folder', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast("Sucesso", "Pasta de downloads alterada.", "success");
            document.getElementById('current-folder-display').innerText = `Pasta atual: ${data.path}`;
        }
    } catch (err) {
        showToast("Erro", "Não foi possível alterar a pasta.", "error");
    }
}

async function openFolder() {
    fetch('/api/open-folder', { method: 'POST' });
}

async function updateEngine(e) {
    const btn = (e && e.currentTarget) ? e.currentTarget : document.activeElement;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...';
    try {
        const res = await fetch('/api/update-engine', { method: 'POST' });
        const data = await res.json();
        showToast("Motor", data.message, "success");
    } catch (err) {
        showToast("Erro", "Erro ao atualizar motor.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Atualizar Motor';
    }
}

// --- VIDEO DETAILS & RESOURCES ---

function showVideoDetails() {
    if (!currentVideoInfo) return;
    
    const modal = document.getElementById('details-modal');
    const desc = document.getElementById('video-description');
    const resSection = document.getElementById('resources-section');
    const resList = document.getElementById('resources-list');
    
    desc.innerText = currentVideoInfo.description || "Sem descrição disponível.";
    
    // Extração de recursos (Links Úteis)
    const links = extractResources(currentVideoInfo.description || "");
    
    if (links.length > 0) {
        resSection.style.display = 'block';
        resList.innerHTML = '';
        links.forEach(link => {
            const item = document.createElement('div');
            item.className = 'playlist-item';
            item.style.flexDirection = 'row';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <i class="${link.icon}" style="color: var(--primary); font-size: 1.2rem;"></i>
                    <span style="font-size: 0.9rem; font-weight: bold;">${link.type}</span>
                </div>
                <a href="${link.url}" target="_blank" class="btn btn-secondary btn-small">
                    <i class="fa-solid fa-external-link"></i> Aceder
                </a>
            `;
            resList.appendChild(item);
        });
    } else {
        resSection.style.display = 'none';
    }
    
    modal.style.display = 'flex';
}

function closeDetails() {
    document.getElementById('details-modal').style.display = 'none';
}

function extractResources(text) {
    const links = [];
    const patterns = [
        { type: 'Google Drive', icon: 'fa-brands fa-google-drive', regex: /https?:\/\/drive\.google\.com\/[^\s]+/g },
        { type: 'Mega', icon: 'fa-solid fa-cloud', regex: /https?:\/\/mega\.nz\/[^\s]+/g },
        { type: 'PDF / Documento', icon: 'fa-solid fa-file-pdf', regex: /https?:\/\/[^\s]+\.pdf[^\s]*/g },
        { type: 'MediaFire', icon: 'fa-solid fa-fire', regex: /https?:\/\/www\.mediafire\.com\/[^\s]+/g }
    ];

    patterns.forEach(p => {
        const matches = text.match(p.regex);
        if (matches) {
            matches.forEach(url => {
                links.push({ type: p.type, icon: p.icon, url: url });
            });
        }
    });

    return links;
}

async function clearHistory() {
    if (!confirm("Tem a certeza que deseja limpar todo o histórico de downloads?")) return;
    try {
        const res = await fetch('/api/clear-history', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            loadHistory();
            alert("Histórico limpo com sucesso.");
        }
    } catch (err) {
        alert("Erro ao limpar histórico.");
    }
}

// --- COOKIE MANUAL IMPORT ---

const dropZone = document.getElementById('cookie-drop-zone');
if (dropZone) {
    dropZone.onclick = () => document.getElementById('cookie-file-input').click();
    
    dropZone.ondragover = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#E50914';
    };
    
    dropZone.ondragleave = () => {
        dropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    };
    
    dropZone.ondrop = (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        const file = e.dataTransfer.files[0];
        if (file) uploadCookieFile(file);
    };
}

function handleCookieUpload(event) {
    const file = event.target.files[0];
    if (file) uploadCookieFile(file);
}

async function uploadCookieFile(file) {
    const text = await file.text();
    submitCookies(text);
}

function savePastedCookies() {
    const text = document.getElementById('cookie-paste-area').value;
    if (!text.trim()) {
        showToast("Aviso", "Por favor, cole o conteúdo dos cookies primeiro.", "error");
        return;
    }
    submitCookies(text);
}

async function submitCookies(text) {
    try {
        const res = await fetch('/api/save-cookies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookies: text })
        });
        const data = await res.json();
        if (data.success) {
            showToast("Cookies", "Cookies guardados com sucesso!", "success");
            document.getElementById('cookie-paste-area').value = '';
        } else {
            showToast("Erro", "Erro ao salvar cookies.", "error");
        }
    } catch (err) {
        showToast("Erro", "Erro na conexão.", "error");
    }
}

// --- SYSTEM LOG CONSOLE ---

function logEvent(msg) {
    const terminal = document.getElementById('system-terminal');
    if (!terminal) return;
    
    const time = new Date().toLocaleTimeString('pt-PT', { hour12: false });
    const line = document.createElement('div');
    line.className = 'terminal-line';
    line.innerHTML = `<span style="color: #777;">[${time}]</span> > ${msg}`;
    
    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;
    
    // Limitar número de linhas para performance
    if (terminal.childNodes.length > 100) {
        terminal.removeChild(terminal.firstChild);
    }
}

// Hookar eventos existentes
const originalAnalyze = analyzeVideoUrl;
analyzeVideoUrl = function(url) {
    logEvent(`Analysing request: ${url.substring(0, 50)}...`);
    return originalAnalyze.apply(this, arguments);
};

const originalDownload = startDownload;
startDownload = function(format) {
    logEvent(`Initiating ${format.toUpperCase()} download sequence...`);
    return originalDownload.apply(this, arguments);
};

// Inicializar
handleRouting();
loadHistory();
logEvent("NexoVibe Dashboard Ready.");
logEvent("Waiting for user input...");
