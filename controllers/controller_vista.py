from flask import Blueprint, render_template, request, redirect, url_for, jsonify, session, flash
import logging
import uuid

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

main_bp = Blueprint("main", __name__)

#Base de datos de salas en memoria
ROOMS_DB = {}  
try:
    from controllers.websocket_controller import reactions_log
except ImportError:
    reactions_log = {}

# PÁGINAS DE INICIO

@main_bp.route("/", methods=["GET"])
def home():
    return render_template("home.html")

@main_bp.route("/Readme", methods=["GET"])
def Readme():
    return render_template("Readme.html")

# 1. CREAR SALA (HOST)

@main_bp.route("/crea_sala", methods=["GET"])
def crea_sala():
    room_id = str(uuid.uuid4())[:8]
    return render_template("crea_sala.html", room_id=room_id)

@main_bp.route("/ir-sala", methods=["POST"])
def ir_sala():
    """
    Recibe datos del Host, guarda contraseña y redirige a la sala.
    """
    room_id = (request.form.get("roomId") or request.form.get("room", "")).strip()
    password = request.form.get("password", "").strip()
    username = request.form.get("username", "Host").strip()

    if not room_id:
        return redirect(url_for("main.crea_sala"))

    if password:
        ROOMS_DB[room_id] = password
        logger.info(f"[CREAR] Sala {room_id} CON contraseña")
    else:
        ROOMS_DB.setdefault(room_id, None)
        logger.info(f"[CREAR] Sala {room_id} SIN contraseña")

    session[f'auth_{room_id}'] = True
    session['username'] = username
    session['is_host'] = True
    return redirect(url_for("main.sala", room=room_id, username=username))

# 2. INVITADO — UNIRSE

@main_bp.route("/join", methods=["GET"])
def join_room():
    """Página de invitación con formulario de contraseña."""
    room_name = request.args.get("room", "").strip()
    if not room_name:
        return redirect(url_for("main.home"))
    return render_template("invitacion.html", room=room_name)

@main_bp.route("/unirse", methods=["POST"])
def unirse():
    """Procesa el intento de entrada del invitado."""
    room_id = request.form.get("room", "").strip()
    username = request.form.get("username", "Invitado").strip() or "Invitado"
    input_password = request.form.get("password", "").strip()
    if not room_id:
        return redirect(url_for("main.home"))
    session['username'] = username
    session['is_host'] = False
    real_password = ROOMS_DB.get(room_id)
    logger.info(f"[LOGIN] {username} → {room_id}")
    if real_password:
        if input_password == real_password:
            session[f'auth_{room_id}'] = True
            logger.info("[LOGIN] Contraseña correcta")
        elif input_password:
            flash("Contraseña incorrecta.", "error")
            logger.warning("[LOGIN] Contraseña incorrecta")
    else:
        session[f'auth_{room_id}'] = True
        logger.info("[LOGIN] Acceso libre (sin contraseña)")

    return redirect(url_for("main.sala", room=room_id, username=username))

# 3. VISTA PRINCIPAL 
@main_bp.route("/sala", methods=['GET', 'POST'])
def sala():
    """
    Gatekeeper + render de la sala principal y sub-salas (breakout).
    """
    room_id = (request.args.get("room") or request.form.get("room", "")).strip()
    username = (request.args.get("username") or request.form.get("username")
                or session.get('username', 'Invitado')).strip()
    is_breakout = request.args.get("breakout") == "1"

    if not room_id:
        return redirect(url_for("main.home"))
    session['username'] = username
    stored_password = ROOMS_DB.get(room_id)
    auth_key = f'auth_{room_id}'

    # Las sub-salas (breakout) no requieren contraseña — el host las crea dinámicamente
    # y el usuario ya estaba autenticado en la sala principal
    if is_breakout:
        session[auth_key] = True
        logger.info(f"[BREAKOUT] {username} → sub-sala {room_id}")

    # Si hay contraseña y no está autenticado
    elif stored_password and not session.get(auth_key):
        if request.method == 'POST':
            input_pass = request.form.get('password', '')
            if input_pass == stored_password:
                session[auth_key] = True
                logger.info(f"[GATEKEEPER] Acceso concedido a {username}")
            else:
                flash("Contraseña incorrecta.", "error")
                return render_template("password_check.html", room=room_id, username=username)
        else:
            return render_template("password_check.html", room=room_id, username=username)

    # ── Determinar rol ────────────────────────────────────────────────────
    # Es host si la sesión lo dice Y el room_id coincide con una sala creada por él
    # En sub-salas (breakout) NUNCA es host (solo el original lo es)
    is_host = session.get('is_host', False) and not is_breakout

    # ── Construir URLs VDO.ninja ──────────────────────────────────────────
    # IMPORTANTE: el streamId NO incluye el room_id para que la cámara persista
    # al mover al invitado de sala. Solo depende del username.
    # Esto garantiza que al entrar a la sub-sala, VDO.ninja siga usando el mismo stream.
    def san(u):
        return (u or '').replace(' ', '').lower()[:20]

    stream_id = san(username)  
    if is_host:
        vdo_url = (
            f"https://vdo.ninja/?room={room_id}"
            f"&push&autostart&cleanoutput&label={username}"
            f"&audiobitrate=256&bitrate=30000&codec=h264&view"
        )
    else:
        vdo_url = (
            f"https://vdo.ninja/?room={room_id}"
            f"&view&cleanoutput&transparent&autoplay&muted"
            f"&scene&bitrate=30000&codec=h264&label={username}"
        )

    logger.info(f"[SALA] {username} ({'host' if is_host else 'invitado'}) → {room_id}")

    return render_template(
        "sala.html",
        room=room_id,
        username=username,
        is_host=is_host,
        vdo_url=vdo_url,
        is_breakout=is_breakout,
    )


# API ESTADÍSTICAS
@main_bp.route("/summary/<room_id>")
def get_summary(room_id):
    return jsonify(reactions_log.get(room_id, []))
