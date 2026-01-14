"""
Maneja la comunicación WebSocket con diferenciación de HOST y PARTICIPANTES
"""
# ==========================================
# imports necesarios para utilizar websockets
# ==========================================
import logging
from datetime import datetime
from flask import request
from flask_socketio import emit, join_room, leave_room
from collections import defaultdict

logger = logging.getLogger(__name__)

# --- ESTRUCTURAS DE DATOS EN MEMORIA ---
# {room_id: {'host': {'sid': socket_id, 'username': name}, 'participants': {socket_id: username}}}
rooms = {}

# Mapa de socket_id -> (room, username, is_host)
sid_map = {}

# Log de reacciones: {'nombre_sala': [{'user': 'Juan', 'emoji': '❤️', 'time': '10:00'}, ...]}
reactions_log = defaultdict(list)


def init_socket_handlers(socketio):
    """
    Registra los eventos de WebSocket con validación de HOST y PARTICIPANTES
    """

    @socketio.on('connect')
    def handle_connect():
        logger.info(f"[connect] Cliente conectado: {request.sid}")
        emit('connection_response', {'status': 'connected'})

    @socketio.on('disconnect')
    def handle_disconnect():
        """
        Al desconectarse, liberar el espacio del usuario (host o participante)
        """
        sid = request.sid

        if sid not in sid_map:
            return

        room, username, is_host = sid_map[sid]

        # Si era el HOST
        if is_host and room in rooms:
            if rooms[room]['host'] and rooms[room]['host']['sid'] == sid:
                rooms[room]['host'] = None
                logger.info(f"[disconnect] HOST {username} salió de {room}")

                # Notificar que el host salió
                emit('host_left', {
                    'username': username,
                    'message': f'El host {username} ha salido.'
                }, to=room)

        # Si era PARTICIPANTE
        elif not is_host and room in rooms:
            if sid in rooms[room]['participants']:
                del rooms[room]['participants'][sid]
                logger.info(f"[disconnect] INVITADO {username} salió de {room}")

                emit('user_left', {
                    'username': username,
                    'socket_id': sid
                }, to=room)

        # Limpiar del mapa
        del sid_map[sid]

        # Limpiar sala vacía
        if room in rooms:
            if not rooms[room]['host'] and not rooms[room]['participants']:
                del rooms[room]
                logger.info(f"[disconnect] Sala {room} eliminada (vacía)")

    @socketio.on('join_room')
    def handle_join_room(data):
        """
        Usuario se une a la sala como HOST o PARTICIPANTE
        """
        room = data.get('room')
        username = data.get('username', 'Anónimo')
        is_host = data.get('is_host', False)
        sid = request.sid

        if not room:
            emit('error', {'message': 'Sala no especificada'})
            return

        # Inicializar sala si no existe
        if room not in rooms:
            rooms[room] = {
                'host': None,
                'participants': {}
            }

        # --- LÓGICA PARA HOST ---
        if is_host:
            # Verificar si ya hay un host
            if rooms[room]['host'] is not None:
                logger.warning(f"[RECHAZADO] Ya hay un HOST en {room}")
                emit('error_duplicate_host', {
                    'message': 'Ya hay un host en esta sala. Solo puede haber uno.'
                }, room=sid)
                return

            # Asignar como host
            rooms[room]['host'] = {
                'sid': sid,
                'username': username
            }
            sid_map[sid] = (room, username, True)
            join_room(room)

            logger.info(f"[join_room] HOST {username} ({sid}) entró a {room}")

            # Enviar lista de participantes actuales al host
            participants_list = [
                {'socket_id': s, 'username': u}
                for s, u in rooms[room]['participants'].items()
            ]

            emit('joined_as_host', {
                'message': f'Bienvenido como HOST, {username}',
                'room': room
            })

            emit('room_users', {'users': participants_list})

            # Notificar a participantes que el host llegó
            emit('host_joined', {
                'username': username,
                'socket_id': sid
            }, to=room, include_self=False)

        # --- LÓGICA PARA PARTICIPANTE ---
        else:
            # Verificar nombre duplicado entre participantes
            existing_names = list(rooms[room]['participants'].values())
            if username in existing_names:
                logger.warning(f"[RECHAZADO] Nombre '{username}' duplicado en {room}")
                emit('error_duplicate_user', {
                    'message': f"El nombre '{username}' ya está en uso. Usa otro (ej: {username}2)."
                }, room=sid)
                return

            # Agregar como participante
            rooms[room]['participants'][sid] = username
            sid_map[sid] = (room, username, False)
            join_room(room)

            logger.info(f"[join_room] PARTICIPANTE {username} ({sid}) entró a {room}")

            emit('joined_as_participant', {
                'message': f'Bienvenido, {username}',
                'room': room
            })

            # Enviar info del host si existe
            if rooms[room]['host']:
                emit('host_info', {
                    'socket_id': rooms[room]['host']['sid'],
                    'username': rooms[room]['host']['username']
                })

            # Enviar lista de otros participantes
            other_participants = [
                {'socket_id': s, 'username': u}
                for s, u in rooms[room]['participants'].items()
                if s != sid
            ]
            emit('room_users', {'users': other_participants})

            # Notificar a todos
            emit('user_joined', {
                'username': username,
                'socket_id': sid,
                'message': f'{username} se ha unido.'
            }, to=room, include_self=False)

    @socketio.on('update_position')
    def handle_update_position(data):
        """Sincronizar movimiento de cajas"""
        room = data.get('room')
        if room:
            emit('position_updated', {
                'id': data.get('id'),
                'x': data.get('x'),
                'y': data.get('y')
            }, to=room, include_self=False)

    @socketio.on('draw_stroke')
    def handle_draw_stroke(data):
        """Sincronizar dibujos en la pizarra"""
        room = data.get('room')
        if room:
            emit('draw_stroke', {
                'x0': data.get('x0'),
                'y0': data.get('y0'),
                'x1': data.get('x1'),
                'y1': data.get('y1')
            }, to=room, include_self=False)

    @socketio.on('reaction')
    def handle_reaction(data):
        """
        Manejar reacciones de emojis con log detallado
        """
        room = data.get('room')
        emoji = data.get('emoji')
        username = data.get('username', 'Anónimo')

        if room and emoji:
            # 1. Crear registro detallado
            log_entry = {
                'user': username,
                'emoji': emoji,
                'timestamp': datetime.now().strftime("%H:%M:%S")
            }

            # 2. Guardar en el log
            reactions_log[room].append(log_entry)

            logger.info(f"[reaction] {username} envió {emoji} en {room}")

            # 3. Reenviar a todos (incluyendo al emisor para el log)
            emit('show_reaction', {
                'emoji': emoji,
                'username': username
            }, to=room)

    @socketio.on('get_room_info')
    def handle_get_room_info(data):
        """Obtener información completa de la sala"""
        room = data.get('room')

        if room not in rooms:
            emit('room_info', {
                'host': None,
                'participants': [],
                'total': 0
            })
            return

        room_data = rooms[room]

        participants_list = [
            {'socket_id': s, 'username': u}
            for s, u in room_data['participants'].items()
        ]

        emit('room_info', {
            'host': room_data['host'],
            'participants': participants_list,
            'total': len(participants_list) + (1 if room_data['host'] else 0)
        })

    @socketio.on('get_reactions_log')
    def handle_get_reactions_log(data):
        """Obtener el log de reacciones de una sala"""
        room = data.get('room')

        if room in reactions_log:
            emit('reactions_log', {
                'room': room,
                'reactions': reactions_log[room]
            })
        else:
            emit('reactions_log', {
                'room': room,
                'reactions': []
            })
