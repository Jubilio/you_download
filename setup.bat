@echo off
echo ==========================================
echo    YouDown - Instalador Automatico
echo ==========================================
echo.

echo [1/3] Criando ambiente virtual...
python -m venv .env

echo [2/3] Instalando dependencias...
call .env\Scripts\activate.bat
pip install -r requirements.txt
pip install --upgrade yt-dlp browser_cookie3

echo [3/4] Configurando diretorios...
if not exist downloads mkdir downloads

echo [4/4] Compilando frontend...
cd frontend_react
call npm install
call npm run build
cd ..

echo.
echo ==========================================
echo    Instalacao concluida com sucesso!
echo    Iniciando o servidor...
echo ==========================================
echo.

python app.py
pause
