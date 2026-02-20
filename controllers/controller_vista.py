import logging
import uuid
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, session, flash

# Configuración de logs para ver errores
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

main_bp = Blueprint("main", __name__)

# --- BASE DE DATOS EN MEMORIA ---
ROOMS_DB = {}
# ogs de reacciones
try:
    from controllers.websocket_controller import reactions_log
except ImportError:
    reactions_log = {}

@main_bp.route("/", methods=["GET"])
def home():
    """
    Página de bienvenida
    """
    return render_template("home.html")

@main_bp.route("/Readme", methods=["GET"])
def Readme():
    """
    Página de bienvenida
    """
    return render_template("Readme.html")

# ==========================================
# 1. RUTAS PARA CREAR SALA (HOST)
# ==========================================

@main_bp.route("/crea_sala", methods=["GET"])
def crea_sala():
    # Generar ID único
    room_id = str(uuid.uuid4())[:8]
    return render_template("crea_sala.html", room_id=room_id)


@main_bp.route("/ir-sala", methods=["POST"])
def ir_sala():
    """
    Recibe los datos del Host, guarda la contraseña y crea la sesión.
    """
    # 'roomId' o 'room', aquí busco ambos por seguridad.
    room_id = request.form.get("roomId") or request.form.get("room")
    password = request.form.get("password", "").strip()
    username = request.form.get("username", "Host").strip()
    if not room_id:
        return redirect(url_for("main.crea_sala"))
    room_id = room_id.strip()

    # --- GUARDAR CONTRASEÑA ---
    if password:
        ROOMS_DB[room_id] = password
        logger.info(f" [CREAR] Sala {room_id} creada CON contraseña: {password}")
    else:
        logger.info(f" [CREAR] Sala {room_id} creada SIN contraseña.")

    # --- AUTENTICACIÓN AUTOMÁTICA DEL HOST ---
    session[f'auth_{room_id}'] = True
    session['username'] = username
    session['is_host'] = True
    return redirect(url_for("main.sala", room=room_id, username=username))

# ==========================================
# 2. RUTAS PARA INVITADO
# ==========================================

@main_bp.route("/join", methods=["GET"])
def join_room():
    room_name = request.args.get("room", "").strip()
    if not room_name:
        return redirect(url_for("main.home"))
    return render_template("invitacion.html", room=room_name)


@main_bp.route("/unirse", methods=["POST"])
def unirse():
    """
    Procesa el intento de entrada del invitado.
    """
    room_id = request.form.get("room", "").strip()
    username = request.form.get("username", "Invitado").strip()
    input_password = request.form.get("password", "").strip()

    if not room_id: return redirect(url_for("main.home"))
    if not username: username = "Invitado"

    # un invitado nunca es host al entrar por aquí
    session['username'] = username
    session['is_host'] = False
    real_password = ROOMS_DB.get(room_id)
    logger.info(f" [LOGIN] Usuario {username} intenta entrar a {room_id}")

    if real_password:
        # La sala tiene contraseña
        if input_password == real_password:
            # Contraseña correcta: Damos la llave
            session[f'auth_{room_id}'] = True
            logger.info(" [LOGIN] Contraseña correcta.")
        elif input_password:
            # Puso contraseña pero está mal: Flash error
            flash(" Contraseña inicial incorrecta.", "error")
            logger.warning(" [LOGIN] Contraseña incorrecta.")
            # NO damos llave (auth)
        else:
            # No puso nada: Dejamos pasar para que el Gatekeeper lo ataje
            pass
    else:
        # La sala no tiene contraseña (o se reinició el servidor y se borró)
        session[f'auth_{room_id}'] = True
        logger.info(" [LOGIN] Acceso permitido (Sala sin contraseña en memoria).")

    # Redirigir siempre a la sala. El Gatekeeper decidirá si entra o ve el candado.
    return redirect(url_for("main.sala", room=room_id, username=username))


# ==========================================
# 3. VISTA PRINCIPAL (GATEKEEPER)
# ==========================================

@main_bp.route("/sala", methods=['GET', 'POST'])
def sala():
    """
    Autenticacion
    """
    # 1. Recuperar datos
    room_id = request.args.get("room") or request.form.get("room")
    username = request.args.get("username") or session.get('username', 'Invitado')
    if not room_id: return redirect(url_for("main.home"))
    if 'username' not in session: session['username'] = username
    stored_password = ROOMS_DB.get(room_id)
    auth_key = f'auth_{room_id}'

    if stored_password and not session.get(auth_key):
        # A. Si el usuario está enviando la contraseña AHORA (desde password_check.html)
        if request.method == 'POST':
            input_pass = request.form.get('password')
            if input_pass == stored_password:
                session[auth_key] = True  # ¡Autenticado!
                logger.info(f" [GATEKEEPER] Acceso concedido a {username}")

            else:
                flash("Contraseña incorrecta, inténtalo de nuevo.", "error")
                return render_template("password_check.html", room=room_id, username=username)

        # Si intento entrar directo por URL sin permiso
        else:
            return render_template("password_check.html", room=room_id, username=username)

    is_host = session.get('is_host', False)
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

    return render_template(
        "sala.html",
        room=room_id,
        username=username,
        is_host=is_host,
        vdo_url=vdo_url
    )


# ==========================================
# API ESTADÍSTICAS  Y REACCIONES
# ==========================================
@main_bp.route("/summary/<room_id>")
def get_summary(room_id):
    return jsonify(reactions_log.get(room_id, []))
