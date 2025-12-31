# config.py
class Config:
    SECRET_KEY = 'avi-project-2026'
    DEBUG = True
    HOST = '127.0.0.1'
    PORT = 5000
    SOCKETIO_CORS_ALLOWED_ORIGINS = "*"

config = {
    'default': Config
}
