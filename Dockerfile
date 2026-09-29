# Use Python official image
FROM python:3.11-slim

# Environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH=/app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy and build frontend
COPY frontend_react /app/frontend_react
WORKDIR /app/frontend_react
RUN npm install && npm run build
WORKDIR /app

# Copy backend code
COPY app.py /app/app.py
COPY manage_cookies.py /app/manage_cookies.py
# Criar um cookies.txt vazio para evitar erros
RUN touch /app/cookies.txt

# Create downloads folder
RUN mkdir -p /app/downloads && chmod 777 /app/downloads

# Expose port
EXPOSE 5000

# Entry point
CMD ["python", "app.py"]
