import os
import logging

IS_RENDER = os.environ.get('RENDER') is not None

if IS_RENDER:
    import gevent.monkey
    gevent.monkey.patch_all()
    ASYNC_MODE = 'gevent'
else:
    ASYNC_MODE = 'threading'

from flask import Flask
from flask_socketio import SocketIO
from config import config
from controllers.controller_vista import main_bp
from controllers.websocket_controller import init_socket_handlers

socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode=ASYNC_MODE,
    max_http_buffer_size=10_000_000,
    # ─── CRÍTICO para Render ───────────────────────────
    ping_timeout=120,
    ping_interval=30,
    # Permite tanto websocket como polling como fallback
    # (Render a veces bloquea WS puro en plan free)
    logger=False,
    engineio_logger=False,
    always_connect=True,
    # ─── Evita problemas de sticky session en Render ──
    cookie=None,
)


def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    app.secret_key = "3f9a...1b2c"

    # Header crítico: le dice al proxy de Render que no bufferice
    @app.after_request
    def add_headers(response):
        response.headers['X-Accel-Buffering'] = 'no'
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        return response

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
        logger.info(f"Producción en puerto {port}")
        socketio.run(app, host='0.0.0.0', port=port, debug=False)
    else:
        # AQUÍ ESTÁ EL CAMBIO: Cambiamos 127.0.0.1 por 0.0.0.0
        logger.info(f"Servidor expuesto en puerto {port} (0.0.0.0)")
        socketio.run(app, host='0.0.0.0', port=port, debug=True, allow_unsafe_werkzeug=True)