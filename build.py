import PyInstaller.__main__
import os
import shutil
import platform

def build():
    # 1. Limpar pastas anteriores
    for folder in ['build', 'dist']:
        if os.path.exists(folder):
            shutil.rmtree(folder)

    print(f"🚀 Iniciando build para {platform.system()}...")

    # 2. Configuração do PyInstaller
    # --add-data: Inclui o frontend_react/dist e outros ficheiros necessários
    # No Windows usa ; como separador, no Linux/Mac usa :
    sep = ';' if platform.system() == 'Windows' else ':'
    
    params = [
        'app.py',
        '--name=YouDownPro',
        '--onefile',
        '--windowed',
        f'--add-data=frontend_react/dist{sep}frontend_react/dist',
        f'--add-data=installer.html{sep}.',
        '--icon=frontend_react/public/favicon.png', # Pode ser .ico no windows
        '--hidden-import=engineio.async_drivers.threading',
        '--hidden-import=webview.platforms.winforms', # Para Windows
    ]

    PyInstaller.__main__.run(params)
    print("\n✅ Build concluído! O executável está na pasta 'dist'.")

if __name__ == '__main__':
    # Certifique-se de que o frontend_react/dist existe
    if not os.path.exists('frontend_react/dist'):
        print("❌ Erro: Pasta 'frontend_react/dist' não encontrada.")
        print("Execute 'npm run build' dentro de 'frontend_react' primeiro.")
    else:
        build()
