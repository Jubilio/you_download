# 📥 YouDown Pro - The Ultimate Media Pipeline
by **[NexoVibe](https://nexovibe.netlify.app/)**

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![React](https://img.shields.io/badge/React-18-61dafb.svg)
![Status](https://img.shields.io/badge/Status-Production--Ready-brightgreen.svg)

**YouDown Pro** is a high-performance, professional-grade media extraction engine designed for the age of **Agentic AI**. Built with a futuristic **Glassmorphism 2.0** interface, it transforms media consumption into a structured, governed, and high-speed data pipeline.

---

## 🏛️ The Vision
In a world moving towards **Agentic AI**, your proprietary operational context is your only moat. YouDown Pro is designed to be more than a downloader; it is a **Composable Architecture** layer that:
- **Abstracts SaaS Silos**: Uses vendor-neutral engines (yt-dlp) to ensure data sovereignty.
- **Preserves Context**: Maintains rich metadata, chapters, and history for AI-driven analysis.
- **Modularizes Logic**: Separates extraction, processing, and UI for seamless evolution.

*Read more in our [Manifesto](VISION.md).*

---

## ✨ Elite Features

- 🏎️ **Parallel Download Engine**: Multi-threaded execution via `ThreadPoolExecutor` allowing up to 3 concurrent downloads.
- 🎯 **Dynamic Quality Selector**: Auto-detects available resolutions (1080p, 4K, 2K) and allows surgical selection before download.
- ✂️ **Surgical Clipping**: High-precision FFmpeg range extraction—download only what you need, even from 10-hour videos.
- 🖼️ **Pro Metadata Embedding**: Automatically embeds video thumbnails, chapters, and tags into the final MP4/MP3 files.
- 🍪 **Smart Cookie Sync**: One-click synchronization with local browsers (Edge, Chrome) to bypass bot detection and access private content.
- 🔔 **Native Notifications**: Real-time desktop alerts when tasks are completed or require attention.
- 🔗 **Resource Auto-Extraction**: Automatically identifies Drive, Mega, and PDF links in video descriptions.

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Tailwind CSS, Framer Motion (Glassmorphism 2.0).
- **Backend**: Python 3.12, Flask, Flask-SocketIO (Real-time progress).
- **Engine**: yt-dlp (Custom production-grade configuration).
- **Media Processing**: FFmpeg (Atomic clipping and metadata merging).

---

## 🚀 Installation & Setup

### Quick Start (Windows)
1. Ensure you have [Node.js](https://nodejs.org/) installed (required for YouTube challenge solving).
2. Run `setup.bat`. This will:
   - Create a virtual environment (`.env`).
   - Install all Python dependencies.
   - Start the backend server.
3. Access the dashboard at [http://127.0.0.1:5000](http://127.0.0.1:5000).

### Manual Setup
```bash
# 1. Environment
python -m venv .env
.\.env\Scripts\activate

# 2. Dependencies
pip install -r requirements.txt

# 3. FFmpeg (Essential for clipping)
winget install ffmpeg

# 4. Run
python app.py
```

---

## 📋 Project Structure
```text
you_down/
├── app.py                 # Industrial Backend (API & WebSocket)
├── VISION.md              # Architectural Manifesto
├── frontend_react/        # Modern React Dashboard Source
│   ├── src/               # UI Components & Logic
│   └── dist/              # Production Build (Served by Flask)
├── downloads/             # Standard Media Output
├── history.db             # Local SQLite Context Storage
└── requirements.txt       # Project Dependencies
```

---

## 🎯 Tips for Pro Users
- **IPv4 Enforcement**: YouDown Pro forces IPv4 to bypass IP mismatch blocks common in IPv6 environments.
- **Node.js Integration**: Always keep Node.js updated to ensure the `n-challenge` solver works correctly.
- **Privacy First**: All history, cookies, and files are stored locally. Your data never leaves your machine.

---

**Last Update:** May 2026  
**Developed with ❤️ by [NexoVibe](https://nexovibe.netlify.app/)**
