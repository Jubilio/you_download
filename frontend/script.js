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
    socketStatus.innerText = 'Conectado';
    socketStatus.style.color = '#4ade80';
});

socket.on('disconnect', () => {
    socketStatus.innerText = 'Desconectado';
    socketStatus.style.color = '#E50914';
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

    entries.forEach(item => {
        const card = document.createElement('div');
        card.className = 'playlist-item';
        card.innerHTML = `
            <div class="thumb-wrapper">
                <img src="${item.thumbnail}" alt="">
            </div>
            <div class="chapter-title" style="font-size: 0.8rem;">${item.title}</div>
            <button class="btn btn-secondary btn-small" onclick="analyzeVideoUrl('${item.url}')">
                <i class="fa-solid fa-magnifying-glass"></i> Analisar
            </button>
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
    }
}

function sendNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.png' });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission();
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

async function syncCookies() {
    const btn = event.currentTarget;
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
            document.getElementById('current-folder-display').innerText = `Pasta atual: ${data.path}`;
        }
    } catch (err) {
        console.error("Select folder error:", err);
    }
}

async function openFolder() {
    fetch('/api/open-folder', { method: 'POST' });
}

async function updateEngine() {
    const btn = event.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Atualizando...';
    try {
        const res = await fetch('/api/update-engine', { method: 'POST' });
        const data = await res.json();
        alert(data.message);
    } catch (err) {
        alert("Erro ao atualizar motor.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-bolt"></i> Atualizar Motor';
    }
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
    try {
        const res = await fetch('/api/save-cookies', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cookies: text })
        });
        const data = await res.json();
        if (data.success) {
            alert("Cookies importados com sucesso!");
        } else {
            alert("Erro ao salvar cookies.");
        }
    } catch (err) {
        alert("Erro na conexão.");
    }
}

// Inicializar
handleRouting();
loadHistory();
