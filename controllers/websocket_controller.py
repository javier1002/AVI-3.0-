import logging
from datetime import datetime
from flask import request
from flask_socketio import emit, join_room
from collections import defaultdict

logger = logging.getLogger(__name__)

rooms         = {}
sid_map       = {}
reactions_log = defaultdict(list)
box_states    = defaultdict(dict)   # {room: {socket_id: {x,y,width,height}}}


def init_socket_handlers(socketio):

    @socketio.on('connect')
    def handle_connect():
        logger.info(f"[connect] {request.sid}")
        emit('connection_response', {'status': 'connected'})

    # ------------------------------------------------------------------ #
    @socketio.on('disconnect')
    def handle_disconnect():
        sid = request.sid
        if sid not in sid_map:
            return
        room, username, is_host = sid_map[sid]

        if is_host and room in rooms and rooms[room]['host'] and rooms[room]['host']['sid'] == sid:
            rooms[room]['host'] = None
            emit('host_left', {'username': username, 'socket_id': sid,
                               'message': f'El host {username} ha salido.'}, to=room)

        elif not is_host and room in rooms and sid in rooms[room]['participants']:
            del rooms[room]['participants'][sid]
            emit('user_left', {'username': username, 'socket_id': sid}, to=room)

        if room in box_states and sid in box_states[room]:
            del box_states[room][sid]

        del sid_map[sid]

        if room in rooms and not rooms[room]['host'] and not rooms[room]['participants']:
            del rooms[room]
            box_states.pop(room, None)
            logger.info(f"[disconnect] Sala {room} eliminada")

    # ------------------------------------------------------------------ #
    @socketio.on('join_room')
    def handle_join_room(data):
        room     = data.get('room')
        username = data.get('username', 'Anónimo')
        is_host  = data.get('is_host', False)
        sid      = request.sid

        if not room:
            emit('error', {'message': 'Sala no especificada'})
            return

        if room not in rooms:
            rooms[room] = {'host': None, 'participants': {}}

        # --- HOST ---
        if is_host:
            current_host = rooms[room]['host']
            if current_host is not None:
                if current_host['username'] == username:
                    # Reconexión del mismo host
                    rooms[room]['host']['sid'] = sid
                    # Limpiar entrada fantasma en participantes
                    for k in [k for k, v in rooms[room]['participants'].items() if v == username]:
                        del rooms[room]['participants'][k]
                        box_states[room].pop(k, None)
                    logger.info(f"[RECONEXIÓN HOST] {username} en {room}")
                else:
                    emit('error_duplicate_host', {'message': 'Sala ya tiene anfitrión.'}, room=sid)
                    return
            else:
                rooms[room]['host'] = {'sid': sid, 'username': username}

            sid_map[sid] = (room, username, True)
            join_room(room)

            participants_list = [{'socket_id': s, 'username': u}
                                 for s, u in rooms[room]['participants'].items()]
            emit('joined_as_host',  {'message': f'Bienvenido HOST, {username}', 'room': room})
            emit('room_users',      {'users': participants_list})
            emit('all_box_states',  {'states': box_states.get(room, {})})
            emit('host_joined',     {'username': username, 'socket_id': sid}, to=room, include_self=False)

        # --- PARTICIPANTE ---
        else:
            existing = list(rooms[room]['participants'].values())
            if username in existing:
                # Reconexión: remplazar sid antiguo
                old_sid = next((s for s, u in rooms[room]['participants'].items() if u == username), None)
                if old_sid:
                    del rooms[room]['participants'][old_sid]
                    if old_sid in box_states.get(room, {}):
                        box_states[room][sid] = box_states[room].pop(old_sid)
                    sid_map.pop(old_sid, None)

            rooms[room]['participants'][sid] = username
            sid_map[sid] = (room, username, False)
            join_room(room)

            emit('joined_as_participant', {'message': f'Bienvenido, {username}', 'room': room})

            if rooms[room]['host']:
                emit('host_info', {'socket_id': rooms[room]['host']['sid'],
                                   'username':  rooms[room]['host']['username']})

            others = [{'socket_id': s, 'username': u}
                      for s, u in rooms[room]['participants'].items() if s != sid]
            emit('room_users',     {'users': others})
            emit('all_box_states', {'states': box_states.get(room, {})})
            emit('user_joined',    {'username': username, 'socket_id': sid,
                                    'message': f'{username} se ha unido.'}, to=room, include_self=False)

    # ------------------------------------------------------------------ #
    # MOVIMIENTO EN TIEMPO REAL (no guarda estado, solo relay)
    @socketio.on('box_move')
    def handle_box_move(data):
        room = data.get('room')
        if not room:
            return
        sid = data.get('socket_id')
        x   = data.get('x')
        y   = data.get('y')
        # Actualizar estado parcial
        if sid not in box_states[room]:
            box_states[room][sid] = {}
        box_states[room][sid]['x'] = x
        box_states[room][sid]['y'] = y
        emit('box_move_event', {'socket_id': sid, 'x': x, 'y': y},
             to=room, include_self=False)

    # ------------------------------------------------------------------ #
    # ESTADO COMPLETO DE CAJA (tamaño + posición al soltar)
    @socketio.on('box_state')
    def handle_box_state(data):
        room = data.get('room')
        if not room:
            return
        sid = data.get('socket_id')
        state = {
            'x':      data.get('x'),
            'y':      data.get('y'),
            'width':  data.get('width'),
            'height': data.get('height'),
        }
        box_states[room][sid] = state
        emit('box_state_event', {'socket_id': sid, **state},
             to=room, include_self=False)

    # ------------------------------------------------------------------ #
    @socketio.on('draw_stroke')
    def handle_draw_stroke(data):
        room = data.get('room')
        if room:
            emit('draw_stroke', {
                'x0':  data.get('x0'),
                'y0':  data.get('y0'),
                'x1':  data.get('x1'),
                'y1':  data.get('y1'),
                'mode': data.get('mode', 'pen')
            }, to=room, include_self=False)

    # ------------------------------------------------------------------ #
    # LIMPIAR PIZARRA - include_self=True para que todos (incl. emisor) reciban
    @socketio.on('clear_board')
    def handle_clear_board(data):
        room = data.get('room')
        if room:
            logger.info(f"[clear_board] {room}")
            emit('force_clear_event', {}, to=room, include_self=True)

    # ------------------------------------------------------------------ #
    @socketio.on('reaction')
    def handle_reaction(data):
        room    = data.get('room')
        emoji   = data.get('emoji')
        username = data.get('username', 'Anónimo')
        if room and emoji:
            reactions_log[room].append({
                'user': username, 'emoji': emoji,
                'timestamp': datetime.now().strftime("%H:%M:%S")
            })
            emit('show_reaction', {'emoji': emoji, 'username': username}, to=room)

    # ------------------------------------------------------------------ #
    @socketio.on('raise_hand')
    def handle_raise_hand(data):
        emit('hand_raised_event', data, to=data.get('room'))

    # ------------------------------------------------------------------ #
    @socketio.on('toggle_visibility')
    def handle_toggle_visibility(data):
        room = data.get('room')
        if room:
            emit('toggle_visibility_event', {
                'target_id': data.get('target_id'),
                'visible':   data.get('visible')
            }, to=room)

    # ------------------------------------------------------------------ #
    @socketio.on('chat_message')
    def handle_chat_message(data):
        room = data.get('room')
        if room:
            emit('chat_message', data, to=room)

    # ------------------------------------------------------------------ #
    @socketio.on('get_room_info')
    def handle_get_room_info(data):
        room = data.get('room')
        if room not in rooms:
            emit('room_info', {'host': None, 'participants': [], 'total': 0})
            return
        rd = rooms[room]
        participants_list = [{'socket_id': s, 'username': u}
                             for s, u in rd['participants'].items()]
        emit('room_info', {
            'host':         rd['host'],
            'participants': participants_list,
            'total':        len(participants_list) + (1 if rd['host'] else 0)
        })

    # ------------------------------------------------------------------ #
    @socketio.on('get_reactions_log')
    def handle_get_reactions_log(data):
        room = data.get('room')
        emit('reactions_log', {'room': room, 'reactions': reactions_log.get(room, [])})

    # ------------------------------------------------------------------ #
    @socketio.on('wand_move')
    def handle_wand_move(data):
        room = data.get('room')
        if room:
            data['id'] = request.sid
            emit('wand_remote_update', data, to=room, include_self=False)