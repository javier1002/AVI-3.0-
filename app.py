# app.py
from flask import Flask, render_template
from flask_socketio import SocketIO
from config import config
import logging
from controllers.controller_vista import main_bp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

socketio = SocketIO(cors_allowed_origins="*")

def create_app(config_name='default'):
    #Defino el archivo principal
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    socketio.init_app(app)

    app.register_blueprint(main_bp)

    #logs de posicion al mover flujos de video
    @socketio.on('update_position')
    def handle_update_position(data):
        # por ahora solo logueamos
        logger.info(f"Posición recibida: {data}")
        # luego aquí haremos broadcast
        # emit('position_updated', data, broadcast=True)

    return app

if __name__ == '__main__':
    app = create_app()
    logger.info('Servidor en http://127.0.0.1:5000')
    socketio.run(
        app,
        host=app.config['HOST'],
        port=app.config['PORT'],
        debug=True,
        allow_unsafe_werkzeug=True
    )

    app.run(debug=True)