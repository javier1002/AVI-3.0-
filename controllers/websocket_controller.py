import logging
from datetime import datetime
from flask import request
from flask_socketio import emit, join_room
from collections import defaultdict

logger = logging.getLogger(__name__)

rooms         = {}
sid_map       = {}
reactions_log = defaultdict(list)
box_states    = defaultdict(dict) 
bg_states     = defaultdict(dict)  

def init_socket_handlers(socketio):

    @socketio.on('connect')
    def handle_connect():
        logger.info(f"[connect] {request.sid}")
        emit('connection_response', {'status': 'connected'})

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

        box_states[room].pop(sid, None)
        bg_states[room].pop(sid, None)
        del sid_map[sid]

        if room in rooms and not rooms[room]['host'] and not rooms[room]['participants']:
            del rooms[room]
            box_states.pop(room, None)
            bg_states.pop(room, None)

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

        # ── HOST ──────────────────────────────────────────────────────────
        if is_host:
            current_host = rooms[room]['host']
            if current_host is not None:
                if current_host['username'] == username:
                    rooms[room]['host']['sid'] = sid
                    for k in [k for k, v in rooms[room]['participants'].items() if v == username]:
                        del rooms[room]['participants'][k]
                        box_states[room].pop(k, None)
                else:
                    emit('error_duplicate_host', {'message': 'Sala ya tiene anfitrión.'})
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
            emit('all_bg_states',   {'states': bg_states.get(room, {})})
            emit('host_joined', {'username': username, 'socket_id': sid}, to=room, include_self=False)

        # ── PARTICIPANTE ──────────────────────────────────────────────────
        else:
            existing = list(rooms[room]['participants'].values())
            if username in existing:
                old_sid = next((s for s, u in rooms[room]['participants'].items() if u == username), None)
                if old_sid:
                    del rooms[room]['participants'][old_sid]
                    if old_sid in box_states.get(room, {}):
                        box_states[room][sid] = box_states[room].pop(old_sid)
                    bg_states[room].pop(old_sid, None)
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
            emit('room_users',      {'users': others})
            emit('all_box_states',  {'states': box_states.get(room, {})})
            emit('all_bg_states',   {'states': bg_states.get(room, {})})
            emit('user_joined', {'username': username, 'socket_id': sid,
                                 'message': f'{username} se ha unido.'}, to=room, include_self=False)

    @socketio.on('box_move')
    def handle_box_move(data):
        room = data.get('room')
        if not room: return
        sid = data.get('socket_id')
        x, y = data.get('x'), data.get('y')
        if sid not in box_states[room]:
            box_states[room][sid] = {}
        box_states[room][sid]['x'] = x
        box_states[room][sid]['y'] = y
        emit('box_move_event', {'socket_id': sid, 'x': x, 'y': y},
             to=room, include_self=False)

    @socketio.on('box_state')
    def handle_box_state(data):
        room = data.get('room')
        if not room: return
        sid = data.get('socket_id')
        state = {'x': data.get('x'), 'y': data.get('y'),
                 'width': data.get('width'), 'height': data.get('height')}
        box_states[room][sid] = state
        emit('box_state_event', {'socket_id': sid, **state},
             to=room, include_self=False)

    @socketio.on('draw_stroke')
    def handle_draw_stroke(data):
        room = data.get('room')
        if room:
            emit('draw_stroke', {'x0': data.get('x0'), 'y0': data.get('y0'),
                                 'x1': data.get('x1'), 'y1': data.get('y1'),
                                 'mode': data.get('mode', 'pen')},
                 to=room, include_self=False)

    @socketio.on('clear_board')
    def handle_clear_board(data):
        room = data.get('room')
        if room:
            emit('force_clear_event', {}, to=room, include_self=True)

    @socketio.on('reaction')
    def handle_reaction(data):
        room, emoji, username = data.get('room'), data.get('emoji'), data.get('username', 'Anónimo')
        if room and emoji:
            reactions_log[room].append({'user': username, 'emoji': emoji,
                                        'timestamp': datetime.now().strftime("%H:%M:%S")})
            emit('show_reaction', {'emoji': emoji, 'username': username}, to=room, include_self=True)

    @socketio.on('raise_hand')
    def handle_raise_hand(data):
        emit('hand_raised_event', data, to=data.get('room'))

    @socketio.on('toggle_visibility')
    def handle_toggle_visibility(data):
        room = data.get('room')
        if room:
            emit('toggle_visibility_event', {'target_id': data.get('target_id'),
                                             'visible': data.get('visible')}, to=room)

    @socketio.on('chat_message')
    def handle_chat_message(data):
        room = data.get('room')
        if room:
            emit('chat_message', data, to=room)

    @socketio.on('get_room_info')
    def handle_get_room_info(data):
        room = data.get('room')
        if room not in rooms:
            emit('room_info', {'host': None, 'participants': [], 'total': 0})
            return
        rd = rooms[room]
        participants_list = [{'socket_id': s, 'username': u}
                             for s, u in rd['participants'].items()]
        emit('room_info', {'host': rd['host'], 'participants': participants_list,
                           'total': len(participants_list) + (1 if rd['host'] else 0)})

    @socketio.on('get_reactions_log')
    def handle_get_reactions_log(data):
        room = data.get('room')
        emit('reactions_log', {'room': room, 'reactions': reactions_log.get(room, [])})
    @socketio.on('change_bg')
    def handle_change_bg(data):
        room      = data.get('room')
        socket_id = data.get('socket_id')
        color     = data.get('color', 'off')
        if room:
            if color and color != 'off':
                bg_states[room][socket_id] = color
            else:
                bg_states[room].pop(socket_id, None)
            emit('bg_change_event', {'socket_id': socket_id, 'color': color},
                 to=room, include_self=False)

    # WebRTC señalización (bg_segmentation.js)
    @socketio.on('bg_active')
    def handle_bg_active(data):
        room   = data.get('room')
        sid    = data.get('socket_id', request.sid)
        active = data.get('active', False)

        # Si room viene vacío, buscarlo en sid_map
        if not room and request.sid in sid_map:
            room = sid_map[request.sid][0]
            logger.info(f"[bg_active] room recuperado de sid_map: {room}")

        if room:
            if active:
                bg_states[room][sid] = True
            else:
                bg_states[room].pop(sid, None)
            emit('bg_active', {'socket_id': sid, 'active': active},
                 to=room, include_self=False)
            logger.info(f"[bg_active] {sid[:6]} active={active} room={room}")
        else:
            logger.warning(f"[bg_active] room=None para sid={request.sid[:6]}")

    @socketio.on('bg_frame')
    def handle_bg_frame(data):
        """Relay de frame usando canal dedicado bgf_<sid>. Recupera room de sid_map si viene vacío."""
        room = data.get('room')

        # Recuperar room de sid_map si el cliente envió room=undefined/null
        if not room and request.sid in sid_map:
            room = sid_map[request.sid][0]

        if not room:
            return

        channel = f'bgf_{request.sid}'
        emit(channel, {
            'data': data.get('data'),
            'w':    data.get('w', 320),
            'h':    data.get('h', 240),
        }, to=room, include_self=False)

    @socketio.on('bg_query_active')
    def handle_bg_query_active(data):
        """Viewer pregunta: ¿publisher X está activo? Responder directo al viewer."""
        room    = data.get('room')
        pub_sid = data.get('publisher')
        if room and pub_sid:
            if bg_states.get(room, {}).get(pub_sid):
                emit('bg_active', {'socket_id': pub_sid, 'active': True})
                logger.info(f"[bg_query] {request.sid[:6]} preguntó por {pub_sid[:6]} → activo")

    @socketio.on('bg_viewer_ready')
    def handle_bg_viewer_ready(data):
        """
        Viewer notifica al streamer que está listo para recibir.
        El servidor retransmite al streamer (publisher) para que envíe bg_viewer_ack.
        """
        room    = data.get('room')
        pub_sid = data.get('publisher')
        viewer  = data.get('viewer', request.sid)
        if room and pub_sid:
            emit('bg_viewer_ready', {'publisher': pub_sid, 'viewer': viewer}, to=pub_sid)
            logger.info(f"[bg_viewer_ready] viewer {viewer[:6]} → pub {pub_sid[:6]}")

    @socketio.on('bg_viewer_ack')
    def handle_bg_viewer_ack(data):
        """Streamer confirma al viewer específico que está activo."""
        viewer  = data.get('viewer')
        pub_sid = data.get('socket_id')
        if viewer:
            emit('bg_viewer_ack', {'socket_id': pub_sid, 'active': True}, to=viewer)
            logger.info(f"[bg_viewer_ack] pub {str(pub_sid)[:6]} → viewer {viewer[:6]}")

    @socketio.on('bg_request')
    def handle_bg_request(data):
        to_sid = data.get('to')
        if to_sid:
            emit('bg_request', {'to': to_sid, 'from': data.get('from', request.sid),
                                'room': data.get('room')}, to=to_sid)

    @socketio.on('bg_offer')
    def handle_bg_offer(data):
        to_sid = data.get('to')
        if to_sid:
            emit('bg_offer', {'from': data.get('from', request.sid), 'sdp': data.get('sdp')},
                 to=to_sid)

    @socketio.on('bg_answer')
    def handle_bg_answer(data):
        to_sid = data.get('to')
        if to_sid:
            emit('bg_answer', {'to': to_sid, 'from': data.get('from', request.sid),
                               'sdp': data.get('sdp')}, to=to_sid)

    @socketio.on('bg_ice_pub')
    def handle_bg_ice_pub(data):
        to_sid = data.get('to')
        if to_sid:
            emit('bg_ice_pub', {'from': data.get('from', request.sid), 'to': to_sid,
                                'candidate': data.get('candidate')}, to=to_sid)

    @socketio.on('bg_ice_viewer')
    def handle_bg_ice_viewer(data):
        to_sid = data.get('to')
        if to_sid:
            emit('bg_ice_viewer', {'from': data.get('from', request.sid), 'to': to_sid,
                                   'candidate': data.get('candidate')}, to=to_sid)

    # SALAS EN GRUPO (breakout rooms)
    @socketio.on('create_breakout_rooms')
    def handle_create_breakout_rooms(data):
        """
        El host manda la distribución de participantes en grupos.
        El servidor crea las sub-salas y redirige a cada miembro.
        La cámara/micro de VDO.ninja se mantiene porque el streamId
        depende del username, no del room_id.
        """
        parent_room = data.get('room')
        groups      = data.get('groups', [])  
        sid         = request.sid

        # Verificar que el host es que tiene permitido crear grupos
        if parent_room not in rooms or (rooms[parent_room]['host'] or {}).get('sid') != sid:
            emit('error', {'message': 'Solo el host puede crear grupos'})
            return

        created = []
        for group in groups:
            sub_room_id = group.get('room_id')
            sub_name    = group.get('name', sub_room_id)
            members     = group.get('members', []) 

            if not sub_room_id or not members:
                continue

            # Pre-crear la sala en memoria para que el redirect funcione sin contraseña
            if sub_room_id not in rooms:
                rooms[sub_room_id] = {'host': None, 'participants': {}}

            # Enviar redirect a cada miembro asignado
            for member_sid in members:
                emit('redirect_to_room', {
                    'room_id':   sub_room_id,
                    'room_name': sub_name,
                }, to=member_sid)

            created.append({'room_id': sub_room_id, 'name': sub_name,
                            'count': len(members)})

        # Confirmar al host
        emit('breakout_created', {'groups': created})
        logger.info(f"[breakout] {parent_room} → {[g['name'] for g in created]}")

    @socketio.on('wand_move')
    def handle_wand_move(data):
        room = data.get('room')
        if room:
            data['id'] = request.sid
            emit('wand_remote_update', data, to=room, include_self=False)