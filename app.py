# app.py
import logging
from flask import Flask
from flask_socketio import SocketIO

from config import config
from controllers.controller_vista import main_bp
from controllers.websocket_controller import init_socket_handlers

# ---- instancia global de socketio (sin app aún) ----
socketio = SocketIO(cors_allowed_origins="*")


def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # inicializar socketio con la app
    socketio.init_app(app)

    # registrar blueprints
    app.register_blueprint(main_bp)

    # registrar handlers de websockets
    init_socket_handlers(socketio)

    return app


# ---- punto de entrada ----
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    app = create_app()
    logger.info("Servidor en http://127.0.0.1:5000")

    socketio.run(
        app,
        host=app.config.get('HOST', '127.0.0.1'),
        port=app.config.get('PORT', 5000),
        debug=app.config.get('DEBUG', True),
        allow_unsafe_werkzeug=True,
    )