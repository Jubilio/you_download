# 🚀 Guia de Instalação e Build: YouDown Pro

Este guia explica como transformar o YouDown Pro numa aplicação Desktop nativa (.exe no Windows ou binário no Linux).

## 1. Pré-requisitos
*   **Python 3.10+**
*   **Node.js & NPM** (apenas para o primeiro build do frontend)
*   **FFmpeg** (Instalado automaticamente no Windows pelo app)

## 2. Instalação de Dependências
Abra o seu terminal na pasta raiz do projeto e execute:
```bash
pip install -r requirements.txt
```

## 3. Preparação do Frontend (React)
Para que o executável contenha a interface, precisa de gerar o build:
1. Entre na pasta `frontend_react`: `cd frontend_react`
2. Instale as dependências: `npm install`
3. Gere o build: `npm run build`
4. Volte à raiz: `cd ..`

## 4. Execução em Modo Desktop (Desenvolvimento)
Para rodar a app como uma janela nativa sem precisar de abrir o browser:
```bash
python app.py
```
*Se o `pywebview` estiver instalado, ele abrirá uma janela automática.*

## 5. Gerar o Executável (.exe ou Binário Linux)
Para criar o ficheiro final que pode enviar para outros computadores:
```bash
python build.py
```
O ficheiro final estará na pasta `dist/`.

---
### 🐧 Notas para Linux
No Linux, pode ser necessário instalar bibliotecas adicionais para o `pywebview`:
*   **Ubuntu/Debian:** `sudo apt install python3-gi python3-gi-cairo gir1.2-gtk-3.0 gir1.2-webkit2-4.0`
*   Certifique-se de que o `xdg-open` está disponível para abrir pastas e vídeos.

---
**NexoVibe Official** - *YouDown Pro v4.0*
