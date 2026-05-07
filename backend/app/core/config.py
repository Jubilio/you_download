import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    DOWNLOAD_PATH = os.getenv('DOWNLOAD_PATH', os.path.join(os.getcwd(), 'downloads'))
    COOKIES_PATH = os.path.join(os.getcwd(), 'cookies.txt')
    NODE_PATH = os.getenv('NODE_PATH', 'node')
    API_PORT = int(os.getenv('API_PORT', 5000))
    API_HOST = os.getenv('API_HOST', '0.0.0.0')

config = Config()
