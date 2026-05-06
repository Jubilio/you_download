# Guia de Configuração Detalhado - YouDown

Este guia ajuda-o a configurar o ambiente para garantir que os downloads funcionam sem bloqueios do YouTube.

## 1. Requisitos do Sistema
- Python 3.9 ou superior.
- Navegador moderno (Edge, Chrome ou Firefox).
- Conexão à internet estável.

## 2. Como evitar o erro "403 Forbidden"
O YouTube bloqueia frequentemente ferramentas de download. O YouDown usa três camadas de proteção:
1. **User-Agent Real:** Simula um navegador Chrome.
2. **Player Client:** Usa o cliente web oficial.
3. **Cookies (O mais importante):**

### Como exportar cookies corretamente:
1. Instale a extensão [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc).
2. Abra o YouTube e certifique-se de que a página carregou.
3. Clique no ícone da extensão (parece uma peça de puzzle ou um cookie).
4. Clique em **Export**.
5. Salve o arquivo como `cookies.txt` dentro da pasta `you_down` (ao lado do arquivo `app.py`).

## 3. Estrutura de Pastas de Download
- **Vídeos Individuais:** Salvos diretamente na pasta `downloads/`.
- **Playlists:** Criam uma subpasta com o nome da playlist. No frontend, você receberá um arquivo `.zip` contendo todos os vídeos.

## 4. Troubleshooting Comum
- **O servidor não inicia:** Verifique se outra aplicação está a usar a porta 5000.
- **O download para no meio:** Verifique se o seu disco tem espaço suficiente.
- **Erro de "nsig extraction":** Isso significa que o seu `yt-dlp` está desatualizado. O script `setup.bat` tenta atualizar automaticamente, mas você pode forçar com `pip install --upgrade yt-dlp`.
