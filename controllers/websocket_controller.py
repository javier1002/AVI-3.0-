import logging
from datetime import datetime, timezone
from flask import request
from flask_socketio import emit, join_room, leave_room

from collections import defaultdict
from flask import request
from flask_socketio import emit, join_room, leave_room
logger = logging.getLogger(__name__)

from collections import defaultdict
from datetime import datetime

# --- NUEVO: ESTRUCTURAS DE DATOS EN MEMORIA ---
room_users = {}
sid_map = {}

# lista de los de reacciones {'nombre_sala': [ {'user': 'Juan', 'emoji': '❤️', 'time': '10:00'}, ... ] }
reactions_log = defaultdict(list)



def init_socket_handlers(socketio):
    """
    Registra los eventos de WebSocket con validación de nombres duplicados.
    """

    @socketio.on('connect')
    def handle_connect():
        logger.info(f"[connect] Cliente conectado: {request.sid}")
        emit('connection_response', {'status': 'connected'})

    @socketio.on('disconnect')
    def handle_disconnect():
        """
        Al desconectarse, debemos liberar el nombre para que pueda volver a usarse.
        """
        sid = request.sid
        if sid in sid_map:
            room, username = sid_map[sid]

            # Borrar al usuario de la lista de la sala
            if room in room_users and username in room_users[room]:
                room_users[room].discard(username)  # .discard no da error si no existe

                # Si la sala queda vacía, limpiamos la entrada (opcional)
                if not room_users[room]:
                    del room_users[room]

            # Borrar del mapa de sockets
            del sid_map[sid]

            logger.info(f"[disconnect] {username} salió de {room}. Nombre liberado.")

            # Avisar a los demás que salió
            emit('user_left', {'username': username}, to=room)

    @socketio.on('join_room')
    def handle_join_room(data):
        room = data.get('room')
        username = data.get('username', 'Anónimo')

        if not room:
            return

        # --- NUEVO: VALIDACIÓN DE DUPLICADOS ---
        # 1. Asegurar que la sala existe en el diccionario
        if room not in room_users:
            room_users[room] = set()

        # 2. Verificar si el nombre ya está en uso en ESA sala
        if username in room_users[room]:
            logger.warning(f"[RECHAZADO] El nombre '{username}' ya existe en la sala '{room}'")

            # Emitimos error SOLO a este usuario
            emit('error_duplicate_user', {
                'message': f"El nombre '{username}' ya está en uso en esta sala. Por favor, usa otro (ej: {username} 2)."
            }, room=request.sid)

            # Cortamos la ejecución aquí (no lo unimos a la sala)
            return

            # --- SI PASA LA VALIDACIÓN, CONTINUAMOS ---

        # Guardamos en memoria
        room_users[room].add(username)
        sid_map[request.sid] = (room, username)

        join_room(room)

        logger.info(f"[join_room] {username} se unió a la sala {room}")

        emit('user_joined', {
            'message': f'{username} ha entrado.',
            'username': username
        }, to=room, include_self=False)

    # ... (El resto de tus eventos: update_position, draw_stroke, etc. siguen igual) ...
    @socketio.on('update_position')
    def handle_update_position(data):
        room = data.get('room')
        if room:
            emit('position_updated', data, to=room, include_self=False)

    @socketio.on('draw_stroke')
    def handle_draw_stroke(data):
        room = data.get('room')
        if room:
            emit('draw_stroke', data, to=room, include_self=False)

        # --- EVENTO: REACCIÓN ---
    @socketio.on("reaction")
    def handle_reaction(data):
        room = data.get("room")
        emoji = data.get("emoji")
        username = data.get("username", "Anónimo")  # Recibimos el nombre

        if room and emoji:
            # 1. Crear registro detallado
            log_entry = {
                'user': username,
                'emoji': emoji,
                'timestamp': datetime.now().strftime("%H:%M:%S")
            }

            # 2. Guardar en la lista de la sala
            reactions_log[room].append(log_entry)

            # 3. Reenviar para animación (esto no cambia)
            emit("show_reaction", {"emoji": emoji}, to=room)