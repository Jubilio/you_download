import os
import subprocess
import sys
import shutil

def build():
    print("==========================================")
    print("   YouDown - Compilador para Executável   ")
    print("==========================================")
    
    # 1. Garantir que o PyInstaller está instalado
    try:
        import PyInstaller
    except ImportError:
        print("[!] PyInstaller não encontrado. Instalando...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # 2. Definir o comando
    # --onefile: um único .exe
    # --windowed: sem janela de terminal (substitua por --console se quiser ver logs)
    # --add-data: inclui a pasta frontend
    # --hidden-import: garante que dependências dinâmicas sejam incluídas
    
    separator = ";" if os.name == 'nt' else ":"
    
    cmd = [
        "pyinstaller",
        "--noconfirm",
        "--onefile",
        "--windowed",
        "--icon", "youdown_logo_icon.ico", # Certifique-se de converter o PNG para .ico
        "--name", "YouDown_NexoVibe",
        f"--add-data=frontend{separator}frontend",
        "--hidden-import=browser_cookie3",
        "--hidden-import=yt_dlp",
        "app.py"
    ]

    print(f"\n[2/3] Iniciando compilação (isso pode demorar alguns minutos)...")
    try:
        subprocess.check_call(cmd)
        print("\n==========================================")
        print("   Compilação concluída com sucesso!     ")
        print(f"   O executável está em: {os.path.join(os.getcwd(), 'dist')}")
        print("==========================================")
    except Exception as e:
        print(f"\n[!] Erro durante a compilação: {e}")

if __name__ == "__main__":
    build()
