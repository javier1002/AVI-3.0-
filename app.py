import gevent.monkey

gevent.monkey.patch_all()

import os
import logging
from flask import Flask
from flask_socketio import SocketIO
from config import config
from controllers.controller_vista import main_bp
from controllers.websocket_controller import init_socket_handlers

# ── Socket.IO configurado para producción en RENDER ──────────────
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode='gevent',
    max_http_buffer_size=10_000_000,
    ping_timeout=20,
    ping_interval=10,
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

    # Render asigna el puerto dinámicamente en la variable 'PORT'
    # Si estamos en local, usará el 5000. En Render usará el asignado.
    port = int(os.environ.get('PORT', 5000))

    logger.info(f"Servidor iniciando en http://0.0.0.0:{port}")

    # Al usar gevent, socketio.run arranca un servidor de PRODUCCIÓN de alto rendimiento automáticamente
    socketio.run(
        app,
        host='0.0.0.0',
        port=port,
        debug=False
    )