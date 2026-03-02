import gevent.monkey
gevent.monkey.patch_all()

import logging
from flask import Flask
from flask_socketio import SocketIO
from config import config
from controllers.controller_vista import main_bp
from controllers.websocket_controller import init_socket_handlers

# ── Socket.IO configurado para soportar relay de frames de video ──────────────
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='gevent',            # <-- CAMBIO CRÍTICO: Para producción en Render
    max_http_buffer_size=10_000_000,  # 10 MB — soporta frames JPEG base64
    ping_timeout=60,                  # evita desconexión durante streaming
    ping_interval=25,
    logger=False,
    engineio_logger=False,
)

def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    app.secret_key = "3f9a...1b2c"
    socketio.init_app(app)
    app.register_blueprint(main_bp)
    init_socket_handlers(socketio)
    return app

app = create_app()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)
    logger.info("Servidor iniciando en http://0.0.0.0:5000")
    socketio.run(
        app,
        host=app.config.get('HOST', '0.0.0.0'),
        port=app.config.get('PORT', 5000),
        debug=app.config.get('DEBUG', False)
    )