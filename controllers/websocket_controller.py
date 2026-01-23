import logging
from datetime import datetime
from flask import request
from flask_socketio import emit, join_room, leave_room
from collections import defaultdict

logger = logging.getLogger(__name__)

# Estructuras de datos
rooms = {}
sid_map = {} #Mapa de Identificadores de Sesión: cambia el id de socket por el nombre_usuario
reactions_log = defaultdict(list)

def init_socket_handlers(socketio):
    """
    Registra TODOS los eventos de WebSocket
    """
    @socketio.on('connect')
    def handle_connect():
        logger.info(f"[connect] Cliente conectado: {request.sid}")
        emit('connection_response', {'status': 'connected'})

    @socketio.on('disconnect')
    def handle_disconnect():
        sid = request.sid
        if sid not in sid_map:
            return
        room, username, is_host = sid_map[sid]

        if is_host and room in rooms:
            if rooms[room]['host'] and rooms[room]['host']['sid'] == sid:
                rooms[room]['host'] = None
                logger.info(f"[disconnect]  HOST {username} salió de {room}")
                emit('host_left', {
                    'username': username,
                    'message': f'El host {username} ha salido.'
                }, to=room)

        elif not is_host and room in rooms:
            if sid in rooms[room]['participants']:
                del rooms[room]['participants'][sid]
                logger.info(f"[disconnect]  PARTICIPANTE {username} salió de {room}")
                emit('user_left', {
                    'username': username,
                    'socket_id': sid
                }, to=room)

        del sid_map[sid]

        if room in rooms:
            if not rooms[room]['host'] and not rooms[room]['participants']:
                del rooms[room]
                logger.info(f"[disconnect]  Sala {room} eliminada")

    @socketio.on('join_room')
    def handle_join_room(data):
        room = data.get('room')
        username = data.get('username', 'Anónimo')
        is_host = data.get('is_host', False)
        sid = request.sid

        if not room:
            emit('error', {'message': 'Sala no especificada'})
            return

        if room not in rooms:
            rooms[room] = {'host': None, 'participants': {}}

        if is_host:
            if rooms[room]['host'] is not None:
                logger.warning(f"[RECHAZADO] Ya hay un HOST en {room}")
                emit('error_duplicate_host', {
                    'message': 'Ya hay un host en esta sala.'
                }, room=sid)
                return

            rooms[room]['host'] = {'sid': sid, 'username': username}
            sid_map[sid] = (room, username, True)
            join_room(room)
            logger.info(f"[join_room]  HOST {username} entró a {room}")

            participants_list = [
                {'socket_id': s, 'username': u}
                for s, u in rooms[room]['participants'].items()
            ]

            emit('joined_as_host', {'message': f'Bienvenido HOST, {username}', 'room': room})
            emit('room_users', {'users': participants_list})
            emit('host_joined', {'username': username, 'socket_id': sid}, to=room, include_self=False)

        else:
            existing_names = list(rooms[room]['participants'].values())
            if username in existing_names:
                logger.warning(f"[RECHAZADO] Nombre '{username}' duplicado")
                emit('error_duplicate_user', {
                    'message': f"El nombre '{username}' ya está en uso."
                }, room=sid)
                return

            rooms[room]['participants'][sid] = username
            sid_map[sid] = (room, username, False)
            join_room(room)
            logger.info(f"[join_room]  PARTICIPANTE {username} entró a {room}")

            emit('joined_as_participant', {'message': f'Bienvenido, {username}', 'room': room})

            if rooms[room]['host']:
                emit('host_info', {
                    'socket_id': rooms[room]['host']['sid'],
                    'username': rooms[room]['host']['username']
                })

            other_participants = [
                {'socket_id': s, 'username': u}
                for s, u in rooms[room]['participants'].items()
                if s != sid
            ]
            emit('room_users', {'users': other_participants})
            emit('user_joined', {
                'username': username,
                'socket_id': sid,
                'message': f'{username} se ha unido.'
            }, to=room, include_self=False)

    @socketio.on('update_position')
    def handle_update_position(data):
        room = data.get('room')
        if room:
            emit('position_updated', {
                'id': data.get('id'),
                'x': data.get('x'),
                'y': data.get('y')
            }, to=room, include_self=False)

    @socketio.on('draw_stroke')
    def handle_draw_stroke(data):
        room = data.get('room')
        if room:
            emit('draw_stroke', {
                'x0': data.get('x0'),
                'y0': data.get('y0'),
                'x1': data.get('x1'),
                'y1': data.get('y1'),
                'mode': data.get('mode', 'pen')
            }, to=room, include_self=False)

    @socketio.on('reaction')
    def handle_reaction(data):
        room = data.get('room')
        emoji = data.get('emoji')
        username = data.get('username', 'Anónimo')

        if room and emoji:
            log_entry = {
                'user': username,
                'emoji': emoji,
                'timestamp': datetime.now().strftime("%H:%M:%S")
            }
            reactions_log[room].append(log_entry)
            logger.info(f"[reaction] {username} envió {emoji}")

            emit('show_reaction', {
                'emoji': emoji,
                'username': username
            }, to=room)

    @socketio.on('raise_hand')
    def handle_raise_hand(data):
        logger.info(f"[raise_hand] {data.get('username')} levantó la mano")
        emit('hand_raised_event', data, to=data['room'])

    # ========== VARITA MÁGICA ==========
    @socketio.on('wand_move')
    def handle_wand_move(data):
        room = data.get('room')
        if not room:
            logger.warning("[wand_move] Sin room especificado")
            return

        data['id'] = request.sid
        logger.debug(f"[wand_move] {request.sid} -> sala {room}")

        # Enviar a TODOS en la sala EXCEPTO al emisor
        emit('wand_remote_update', data, to=room, include_self=False)

    # ========== LIMPIAR TODO ==========
    @socketio.on('clear_board')
    def handle_clear_board(data):
        room = data.get('room')
        if room:
            logger.info(f"[clear_board] Limpiando sala {room}")
            # Emitir a TODA la sala (incluido el que presionó)
            emit('force_clear_event', {}, to=room)

    # ========== ENDPOINTS DE INFO ==========
    @socketio.on('get_room_info')
    def handle_get_room_info(data):
        room = data.get('room')
        if room not in rooms:
            emit('room_info', {'host': None, 'participants': [], 'total': 0})
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
        room = data.get('room')
        emit('reactions_log', {
            'room': room,
            'reactions': reactions_log.get(room, [])
        })



    @socketio.on('chat_message')
    def handle_chat_message(data):
        """
        Recibe el mensaje de un usuario y lo reenvía a TODOS en la sala.
        usando el patron Publicación-Suscripción modelo de mensajería asíncrona que desacopla a los emisores de mensajes
        donde la persona que envia el mensaje desconoce los remitentes
        """
        room = data.get('room')

        # debug por consala para confirmar que se envio el mensaje por consola
        print(f"💬 Chat en sala {room}: {data.get('message')}")

        if room:
            emit('chat_message', data, to=room)