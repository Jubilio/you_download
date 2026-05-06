# 📥 YouDown - Baixador de YouTube

Um aplicativo moderno e elegante para baixar vídeos e playlists do YouTube com qualidade customizável.

## ✨ Características

- ✅ Baixa vídeos únicos e playlists inteiras
- ✅ Múltiplos formatos: MP4, MP3
- ✅ Interface moderna e responsiva (Glassmorphism)
- ✅ Preserva títulos originais dos vídeos
- ✅ Compactação automática de playlists em ZIP
- ✅ Tratamento robusto de erros e bypass de bot detection

## 🚀 Quick Start (Windows)

### Opção 1: Setup Automático (RECOMENDADO)

```bash
# 1. Abra a pasta do projeto no terminal/PowerShell

# 2. Execute:
.\setup.bat

# 3. Quando terminar, o servidor iniciará automaticamente.
```

### Opção 2: Setup Manual

```bash
# 1. Instalar Python 3.9+ de: https://www.python.org/downloads/

# 2. Abra terminal na pasta do projeto

# 3. Criar ambiente virtual:
python -m venv .env
.env\Scripts\activate

# 4. Instalar dependências:
pip install -r requirements.txt
pip install --upgrade yt-dlp browser_cookie3

# 5. Executar servidor:
python app.py
```

## 📋 Estrutura do Projeto

```
you_down/
├── app.py                 # Backend Flask
├── manage_cookies.py      # Gerenciador interativo de cookies
├── frontend/
│   ├── index.html        # Interface Principal
│   ├── style.css         # Estilização Premium
│   └── script.js         # Lógica do Frontend
├── requirements.txt      # Dependências Python
├── cookies.txt          # Cookies do YouTube (Manual ou Gerado)
├── setup.bat            # Script setup automático
└── downloads/           # Pasta de downloads (criada automaticamente)
```

## 🔧 Configuração de Cookies (Importante!)

Para evitar erros `403 Forbidden`, o app precisa de cookies. Você tem duas opções:

### Método 1: Gerenciador Integrado (Recomendado)
Execute o script interativo para tentar extrair cookies automaticamente do seu navegador Edge:
```bash
python manage_cookies.py
```
Escolha a **Opção 2**.

### Método 2: Extensão "Get cookies.txt LOCALLY"
1. Instale a extensão no seu navegador.
2. Vá ao YouTube e exporte os cookies.
3. Salve o ficheiro como `cookies.txt` na raiz da pasta `you_down`.

## 🎯 Como Usar

1. **Inicie o servidor** (`python app.py`).
2. **Abra o arquivo** `frontend/index.html` no seu navegador.
3. **Cole a URL** do YouTube.
4. **Clique em "Analisar"** para ver informações.
5. **Escolha o formato** (MP4 ou MP3).
6. **Clique em "Baixar Agora"**.
7. Se for playlist, você receberá um arquivo **ZIP** automaticamente.

---

**Versão:** 1.0  
**Última atualização:** Maio 2026  
**Status:** ✅ Estável
