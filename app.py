import logging
from flask import Flask
from flask_socketio import SocketIO

from config import config
from controllers.controller_vista import main_bp
from controllers.websocket_controller import init_socket_handlers

# Instancia global de socketio
socketio = SocketIO(cors_allowed_origins="*")

def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    # Inicializar socketio
    socketio.init_app(app)

    # Registrar blueprints
    app.register_blueprint(main_bp)

    # Registrar handlers de websockets
    init_socket_handlers(socketio)

    return app

# Crear app para Gunicorn/Render
app = create_app()

# Punto de entrada local
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    logger.info(" Servidor iniciando en http://127.0.0.1:5000")
    app.secret_key = "3f9a...copia_aqui_lo_que_salio_en_la_terminal...1b2c"
    socketio.run(
        app,
        host=app.config.get('HOST', '127.0.0.1'),
        port=app.config.get('PORT', 5000),
        debug=app.config.get('DEBUG', True),
        allow_unsafe_werkzeug=True,
    )

