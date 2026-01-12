import logging
from datetime import datetime, timezone
from flask import request
from flask_socketio import emit, join_room, leave_room

# --- ERROR AQUÍ: BORRA ESTA LÍNEA ---
# from app import socketio  <-- ¡BORRAR ESTO!

logger = logging.getLogger(__name__)


# La variable 'socketio' llega como ARGUMENTO aquí abajo vvv
def init_socket_handlers(socketio):
    """
    Registra los eventos de WebSocket.
    """

    # IMPORTANTE: Todos los @socketio.on deben estar INDENTADOS (dentro de esta función)
    # para usar la variable 'socketio' que recibimos como argumento.

    # -------------------------------------------------------------------------
    # GESTIÓN DE CONEXIÓN Y SALAS
    # -------------------------------------------------------------------------

    @socketio.on('connect')
    def handle_connect():
        logger.info(f"[connect] Cliente conectado: {request.sid}")
        emit('connection_response', {
            'status': 'connected',
            'sid': request.sid,
            'message': 'Conexión establecida exitosamente'
        })

    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info(f"[disconnect] Cliente desconectado: {request.sid}")

    @socketio.on('join_room')
    def handle_join_room(data):
        room = data.get('room')
        username = data.get('username', 'Anónimo')

        if not room:
            return

        join_room(room)

        logger.info(f"[join_room] {username} ({request.sid}) se unió a la sala: {room}")

        emit('user_joined', {
            'message': f'{username} ha entrado a la sala.',
            'sid': request.sid
        }, to=room, include_self=False)

    # -------------------------------------------------------------------------
    # LÓGICA DE NEGOCIO (Posición y Dibujo)
    # -------------------------------------------------------------------------

    @socketio.on('update_position')
    def handle_update_position(data):
        room = data.get('room')
        if not room:
            return

        emit('position_updated', {
            'id': data.get('id'),
            'x': data.get('x'),
            'y': data.get('y'),
            'sender': request.sid
        }, to=room, include_self=False)

    @socketio.on('draw_stroke')
    def handle_draw_stroke(data):
        room = data.get('room')
        if not room:
            return

        emit('draw_stroke', data, to=room, include_self=False)

    # -------------------------------------------------------------------------
    # UTILIDADES
    # -------------------------------------------------------------------------

    @socketio.on('position_log')
    def handle_position_log(data):
        logger.info(f"[position_log] Data recibida: {data}")
        emit('position_log_response', {
            'status': 'received',
            'timestamp': datetime.now(timezone.utc).isoformat()
        }, room=request.sid)

    logger.info("Handlers de SocketIO registrados correctamente.")