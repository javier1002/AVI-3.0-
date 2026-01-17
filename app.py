import logging
from flask import Flask
from flask_socketio import SocketIO

from config import config
from controllers.controller_vista import main_bp
from controllers.websocket_controller import init_socket_handlers

# ---- instancia global de socketio (sin app aún) ----
socketio = SocketIO(cors_allowed_origins="*")

# patron factory
def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])


    # inicializar socketio con la app
    socketio.init_app(app)

    # registrar blueprints existentes
    app.register_blueprint(main_bp)


    # registrar handlers de websockets
    init_socket_handlers(socketio)

    return app

# Creamos la app en el ámbito global para Gunicorn/Render
app = create_app()

# ---- punto de entrada (Solo para Local) ----
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger = logging.getLogger(__name__)

    logger.info("Servidor iniciando en http://127.0.0.1:5000 ...")

    socketio.run(
        app,
        host=app.config.get('HOST', '127.0.0.1'),
        port=app.config.get('PORT', 5000),
        debug=app.config.get('DEBUG', True),
        allow_unsafe_werkzeug=True,
    )


    # varita websocket
    @socketio.on('wand_move')
    def handle_wand_move(data):
        # Recibimos las coordenadas del dedo de un usuario
        room = session.get('room')  # O data.get('room') si lo envías en el json

        # Agregamos el ID de sesión para identificar quién es
        data['id'] = request.sid

        # Retransmitimos a TODOS en la sala (menos al que lo envió)
        # include_self=False evita que veas tu propia varita con lag (retraso)
        emit('wand_remote_update', data, to=room, include_self=False)