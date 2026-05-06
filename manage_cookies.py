#!/usr/bin/env python3
"""
Gerador de Cookies para YouDown
Este script ajuda a gerar/validar cookies do YouTube
"""

import os
import json
import subprocess
from pathlib import Path

def print_header():
    print("\n" + "="*50)
    print("  🍪 Gerenciador de Cookies YouDown")
    print("="*50 + "\n")

def menu():
    print("Opções disponíveis:\n")
    print("1. Verificar status dos cookies")
    print("2. Tentar gerar cookies automaticamente (Edge)")
    print("3. Deletar cookies atuais")
    print("4. Criar arquivo vazio (sem cookies)")
    print("5. Ver conteúdo dos cookies")
    print("0. Sair\n")

def check_cookies():
    """Verifica status dos cookies"""
    cookies_path = "cookies.txt"
    
    if not os.path.exists(cookies_path):
        print("❌ Arquivo cookies.txt não encontrado")
        return False
    
    size = os.path.getsize(cookies_path)
    
    if size == 0:
        print("⚠️  Arquivo cookies.txt vazio (sem cookies)")
        print("   O app funcionará com limitações")
        return False
    
    print(f"✓ Arquivo cookies.txt existe ({size} bytes)")
    
    # Verificar se é um arquivo de cookies válido
    try:
        with open(cookies_path, 'r') as f:
            content = f.read()
            if 'youtube' in content.lower() or '#' in content:
                print("✓ Parece ser um arquivo de cookies válido")
                return True
            else:
                print("⚠️  Arquivo pode não ser um arquivo de cookies válido")
                return False
    except:
        print("❌ Erro ao ler arquivo de cookies")
        return False

def generate_cookies():
    """Tenta gerar cookies do Edge/Chrome"""
    print("\nTentando gerar cookies do navegador...\n")
    
    try:
        print("Abrindo YouTube...")
        # Comando para extrair cookies usando yt-dlp nativo e salvar em cookies.txt
        result = subprocess.run(
            ['yt-dlp', '--cookies-from-browser', 'edge', 
             '--cookies', 'cookies.txt', 'https://www.youtube.com', '--stop-on-video', '--quiet'],
            capture_output=True,
            text=True,
            timeout=15
        )
        
        if os.path.exists("cookies.txt") and os.path.getsize("cookies.txt") > 0:
            print("✓ Cookies gerados com sucesso!")
            print("  Localizados em: cookies.txt")
            return True
        else:
            print("❌ Falha ao gerar cookies:")
            print(result.stderr[:200] if result.stderr else "Nenhum dado capturado do browser.")
            return False
    
    except FileNotFoundError:
        print("❌ yt-dlp não encontrado")
        print("   Execute: pip install yt-dlp")
        return False
    except subprocess.TimeoutExpired:
        print("❌ Operação expirou")
        return False
    except Exception as e:
        print(f"❌ Erro: {str(e)}")
        return False

def delete_cookies():
    """Deleta arquivo de cookies"""
    if os.path.exists("cookies.txt"):
        try:
            os.remove("cookies.txt")
            print("✓ Arquivo de cookies deletado")
            return True
        except:
            print("❌ Erro ao deletar arquivo")
            return False
    else:
        print("ℹ️  Arquivo cookies.txt não encontrado")
        return False

def create_empty_cookies():
    """Cria arquivo vazio"""
    try:
        with open("cookies.txt", "w") as f:
            f.write("")
        print("✓ Arquivo cookies.txt vazio criado")
        print("  (O app funcionará com limitações)")
        return True
    except:
        print("❌ Erro ao criar arquivo")
        return False

def view_cookies():
    """Mostra conteúdo dos cookies"""
    if not os.path.exists("cookies.txt"):
        print("❌ Arquivo cookies.txt não encontrado")
        return
    
    try:
        with open("cookies.txt", "r") as f:
            content = f.read()
        
        if not content.strip():
            print("⚠️  Arquivo vazio")
            return
        
        # Mostrar primeiras linhas (por segurança, não mostra tudo)
        lines = content.split('\n')[:5]
        print(f"\nConteúdo de cookies.txt (primeiras {len(lines)} linhas):\n")
        for i, line in enumerate(lines, 1):
            if line.strip():
                # Truncar linhas muito longas
                if len(line) > 80:
                    print(f"{i}. {line[:77]}...")
                else:
                    print(f"{i}. {line}")
        
        total_lines = len([l for l in content.split('\n') if l.strip()])
        print(f"\nTotal: {total_lines} linhas\n")
    
    except Exception as e:
        print(f"❌ Erro ao ler arquivo: {str(e)}")

def main():
    while True:
        print_header()
        menu()
        
        try:
            choice = input("Escolha uma opção (0-5): ").strip()
            
            if choice == "1":
                print()
                check_cookies()
            
            elif choice == "2":
                generate_cookies()
            
            elif choice == "3":
                if delete_cookies():
                    input("\nPressione Enter para continuar...")
            
            elif choice == "4":
                if create_empty_cookies():
                    input("\nPressione Enter para continuar...")
            
            elif choice == "5":
                print()
                view_cookies()
                input("Pressione Enter para continuar...")
            
            elif choice == "0":
                print("\nAté logo! 👋\n")
                break
            
            else:
                print("❌ Opção inválida")
        
        except KeyboardInterrupt:
            print("\n\nAté logo! 👋\n")
            break
        except Exception as e:
            print(f"❌ Erro: {str(e)}")

if __name__ == "__main__":
    main()
