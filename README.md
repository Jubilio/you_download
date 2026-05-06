# 📥 YouDown - Media Dashboard Premium

[![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/)
[![Flask](https://img.shields.io/badge/Flask-3.0-green.svg)](https://flask.palletsprojects.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Estável-brightgreen.svg)]()

Um dashboard desktop-like de última geração para download de mídia do YouTube. Projetado com estética **Glassmorphism 2.0**, o YouDown oferece uma experiência premium, rápida e intuitiva para usuários que buscam qualidade e praticidade.

---

## ✨ Características de Elite

- 🚀 **Performance Turbo**: Baixe vídeos e playlists completas com o poder do `yt-dlp`.
- 🎨 **Interface Futurista**: Design responsivo com efeitos de desfoque, gradientes vibrantes e micro-animações.
- 🍪 **Smart Cookie Sync**: Sincronização em um clique com cookies do navegador Edge para evitar bloqueios.
- 📦 **Smart Bundling**: Playlists são automaticamente compactadas em arquivos `.zip` organizados.
- 🔗 **Resource Extraction**: Identifica e extrai links úteis (Drive, PDF, Mega) diretamente da descrição do vídeo.
- ✂️ **Smart Clipping**: Deteta automaticamente capítulos em vídeos longos e permite baixar apenas o trecho que lhe interessa.
- 🔔 **Notificações Modernas**: Alertas elegantes estilo "Toast" e suporte a notificações nativas do sistema.
- 📂 **Gerenciador de Arquivos**: Visualize, abra pastas e apague downloads diretamente pelo dashboard.

---

## 🛠️ Tecnologias

- **Backend**: Python 3.11+, Flask, yt-dlp, browser_cookie3.
- **Frontend**: Vanilla JavaScript (ES6+), CSS Moderno (Variables, Flexbox, Grid), FontAwesome 6.
- **Segurança e Ética**:
    - 🛡️ **Consentimento Explícito**: O YouDown nunca extrai cookies silenciosamente. Toda sincronização exige autorização manual do usuário.
    - 🔒 **Abordagem Híbrida**: Além da sincronização automática local, o app suporta importação manual via extensão do browser para total controle e privacidade.
    - 🍪 **Foco em Domínio**: Apenas cookies relacionados ao `youtube.com` são processados.

---

## 🚀 Como Começar (Windows)

### ⚡ Método Automático (Recomendado)

O script de setup cuida de tudo: cria o ambiente virtual, instala as dependências e inicia o servidor.

1. Baixe o repositório.
2. Dê um duplo clique em `setup.bat`.
3. O servidor abrirá automaticamente em `http://127.0.0.1:5000`.

### 🛠️ Método Manual

```bash
# 1. Preparar ambiente
python -m venv .env
source .env/Scripts/activate

# 2. Instalar dependências
pip install -r requirements.txt

# 3. Rodar aplicação
python app.py
```

---

## 🍪 Configuração de Autenticação

Para vídeos restritos ou para evitar o erro `403 Forbidden`, você pode ativar os cookies de duas formas no Dashboard:

1. **Sincronização Automática**: Clique no ícone de engrenagem e selecione "Sincronizar com Edge". (Certifique-se de que o navegador esteja fechado).
2. **Drag & Drop**: Arraste seu arquivo `cookies.txt` diretamente para a zona de upload no modal de configurações.

---

## 📋 Estrutura do Projeto

```text
you_down/
├── app.py                 # Core Backend (Flask API)
├── manage_cookies.py      # Utilitário de extração de cookies
├── frontend/              # Interface do Usuário
│   ├── index.html         # Layout Base
│   ├── style.css          # Estilos Glassmorphism
│   └── script.js          # Lógica Reativa
├── downloads/             # Pasta padrão de saída (Ignorada pelo Git)
├── .gitignore             # Configurações de exclusão de repositório
├── requirements.txt       # Lista de dependências
└── setup.bat              # Script de automação total
```

---

## 🎯 Dicas de Uso

- **MP3 de Alta Qualidade**: O sistema extrai o áudio na melhor qualidade disponível automaticamente ao selecionar o formato MP3.
- **Troca de Pasta**: Você pode alterar o diretório de download a qualquer momento usando o botão "Alterar Pasta" no dashboard.
- **Privacidade**: Todos os seus cookies e histórico são armazenados localmente e nunca saem da sua máquina.

---

**Última atualização:** Maio 2026  
**Desenvolvido com ❤️ para a comunidade.**
