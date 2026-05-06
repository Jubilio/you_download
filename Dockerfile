# Use a imagem oficial do Python
FROM python:3.11-slim

# Evita que o Python gere arquivos .pyc e permite logs em tempo real
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Instalar dependências do sistema (FFmpeg é essencial)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Definir diretório de trabalho
WORKDIR /app

# Copiar apenas os requisitos primeiro para aproveitar o cache do Docker
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar o restante do código do projeto
COPY . .

# Criar pasta de downloads e garantir permissões
RUN mkdir -p /app/downloads && chmod 777 /app/downloads

# Expor a porta que o Flask usa
EXPOSE 5000

# Comando para rodar a aplicação
# Usamos o host 0.0.0.0 para que o container seja acessível externamente
CMD ["python", "app.py"]
