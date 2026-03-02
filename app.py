import os
import logging

# 1. Detectar si estamos en la nube (Render) o en tu PC (Local)
IS_RENDER = os.environ.get('RENDER') is not None

# 2. Configurar el motor según el entorno
if IS_RENDER:
    # --- MODO PRODUCCIÓN (RENDER / LINUX) ---
    import gevent.monkey

    gevent.monkey.patch_all()
    ASYNC_MODE = 'gevent'
else:
    # --- MODO DESARROLLO (TU PC / WINDOWS) ---
    ASYNC_MODE = 'threading'

from flask import Flask
from flask_socketio import SocketIO
from config import config
from controllers.controller_vista import main_bp
from controllers.websocket_controller import init_socket_handlers

# ── Socket.IO configurado dinámicamente ──────────────
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode=ASYNC_MODE,
    max_http_buffer_size=10_000_000,
    ping_timeout=20 if IS_RENDER else 60,  # En local damos más tiempo
    ping_interval=10 if IS_RENDER else 25,
    max_decode_packets=500,
    logger=False,
    engineio_logger=False,
    always_connect=True
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

    port = int(os.environ.get('PORT', 5000))

    if IS_RENDER:
        logger.info(f"Servidor PRODUCCIÓN iniciando en puerto {port}")
        socketio.run(app, host='0.0.0.0', port=port, debug=False)
    else:
        logger.info(f"Servidor LOCAL iniciando en http://127.0.0.1:{port}")
        # En local usamos debug=True y permitimos werkzeug para que recargue automáticamente si haces cambios
        socketio.run(app, host='127.0.0.1', port=port, debug=True, allow_unsafe_werkzeug=True)