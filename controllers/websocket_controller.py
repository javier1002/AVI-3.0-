import logging
from datetime import datetime

from flask import request
from flask_socketio import emit

logger = logging.getLogger(__name__)


def init_socket_handlers(socketio):
    """
    Registra todos los handlers de eventos de SocketIO.
    Debes llamar a esta función después de crear la instancia de socketio.
    """

    # ---- LOG DE POSICIONES PERIÓDICO ----
    @socketio.on('position_log')
    def handle_position_log(data):
        logger.info(f"[position_log] positions: {data}")

        emit(
            'position_log_response',
            {
                'status': 'received',
                'message': f'Log procesado: {len(data)} claves',
                'timestamp': datetime.utcnow().isoformat()
            },
            room=request.sid
        )

    # ---- ACTUALIZACIÓN EN TIEMPO REAL DE POSICIÓN ----
    @socketio.on('update_position')
    def handle_update_position(data):
        """
        Endpoint: update_position - Actualiza posición en tiempo real.
        data ejemplo: { "id": "box-1", "x": 120, "y": 80 }
        """
        logger.info(f"[update_position] recibido: {data}")

        emit(
            'position_updated',
            {
                'id': data.get('id'),
                'x': data.get('x'),
                'y': data.get('y'),
                'sender': request.sid
            },
            broadcast=True
        )

    # ---- DIBUJO EN PIZARRA (TRAZOS) ----
    @socketio.on('draw_stroke')
    def handle_draw_stroke(data):
        """
        Endpoint: draw_stroke - Propaga un trazo de pizarra.
        data ejemplo: { x1, y1, x2, y2 } normalizados o en píxeles.
        """
        logger.debug(f"[draw_stroke] {data}")

        # Reenvía a todos menos al emisor
        emit(
            'draw_stroke',
            data,
            broadcast=True,
            include_self=False
        )

    # ---- CONEXIÓN / DESCONEXIÓN ----
    @socketio.on('connect')
    def handle_connect():
        logger.info(f"[connect] Cliente CONECTADO: {request.sid}")
        emit(
            'connection_response',
            {
                'status': 'connected',
                'sid': request.sid,
                'message': 'Conectado al servidor de posiciones'
            }
        )

    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info(f"[disconnect] Cliente DESCONECTADO: {request.sid}")

    logger.info("Handlers de SocketIO registrados correctamente.")
