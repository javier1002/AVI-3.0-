# ==========================================
# imports necesarios para el controller
# ==========================================
import logging
import uuid
from flask import Blueprint, render_template, request, redirect, url_for, jsonify, session, flash
from controllers.websocket_controller import reactions_log

# Blueprints
logger = logging.getLogger(__name__)
main_bp = Blueprint("main", __name__)

# --- SIMULACIÓN DE BASE DE DATOS EN MEMORIA ---
# Estructura: { 'room_id': 'password_string' }
ROOMS_DB = {}


@main_bp.route("/", methods=["GET"])
def home():
    """
    Página de bienvenida
    """
    return render_template("home.html")


# ==========================================
# RUTAS PARA CREAR SALA (HOST)
# ==========================================

@main_bp.route("/crea_sala", methods=["GET"])
def crea_sala():
    """
    Formulario para crear sala como HOST
    Genera automáticamente un ID de sala
    """
    room_id = str(uuid.uuid4())[:8]  # ID de 8 caracteres, aleatorio
    return render_template("crea_sala.html", room_id=room_id)


@main_bp.route("/ir-sala", methods=["POST"])
def ir_sala():
    """
    Procesa el formulario de creación de sala (HOST)
    Guarda la contraseña en memoria y autentica al Host.
    """
    room_id = request.form.get("roomId", "").strip()
    password = request.form.get("password", "").strip()
    username = request.form.get("username", "Host").strip()

    if not room_id:
        return redirect(url_for("main.crea_sala"))

    if not username:
        username = "Host"

    # --- GUARDAR EN "BASE DE DATOS" ---
    # Si puso contraseña, la guardamos asociada a la sala
    if password:
        ROOMS_DB[room_id] = password
        logger.info(f"[SEGURIDAD] Contraseña establecida para sala {room_id}")

    # --- AUTENTICAR AL HOST AUTOMÁTICAMENTE ---
    # El creador no necesita poner su propia contraseña
    session[f'auth_{room_id}'] = True
    session['username'] = username
    session['is_host'] = True

    logger.info(f"[HOST] Creando sala: {room_id} | Usuario: {username}")

    # Redirigir como HOST
    return redirect(url_for(
        "main.sala",
        room=room_id,
        username=username,
        is_host="true"
    ))


# ==========================================
# RUTAS PARA UNIRSE A SALA (PARTICIPANTE)
# ==========================================

@main_bp.route("/join", methods=["GET"])
def join_room():
    """
    Formulario para que invitados ingresen a la sala
    """
    room_name = request.args.get("room", "").strip()
    if not room_name:
        return redirect(url_for("main.home"))
    return render_template("invitacion.html", room=room_name)


@main_bp.route("/unirse", methods=["POST"])
def unirse():
    """
    Procesa el formulario de invitación (PARTICIPANTE).
    Intenta validar la contraseña si se envió desde el formulario de inicio.
    """
    room_id = request.form.get("room", "").strip()
    username = request.form.get("username", "Invitado").strip()
    input_password = request.form.get("password", "").strip()

    if not room_id:
        return redirect(url_for("main.home"))

    if not username:
        username = "Invitado"

    # Guardamos datos básicos en sesión
    session['username'] = username
    session['is_host'] = False

    # --- VERIFICACIÓN PRELIMINAR ---
    # Si la sala tiene contraseña guardada en memoria
    real_password = ROOMS_DB.get(room_id)

    if real_password:
        # Si el usuario escribió la contraseña en el formulario inicial
        if input_password == real_password:
            session[f'auth_{room_id}'] = True  # Autenticado
        else:
            # Si no la puso o está mal, no autenticamos todavía.
            # La ruta /sala se encargará de mostrar el bloqueo.
            pass
    else:
        # Si no hay contraseña, autenticamos por defecto
        session[f'auth_{room_id}'] = True

    logger.info(f"[PARTICIPANTE] Intentando unirse a: {room_id} | Usuario: {username}")

    return redirect(url_for(
        "main.sala",
        room=room_id,
        username=username,
        is_host="false"
    ))


# ==========================================
# VISTA PRINCIPAL DE SALA (GATEKEEPER)
# ==========================================

@main_bp.route("/sala", methods=['GET', 'POST'])
def sala():
    """
    Vista principal de la sala.
    Actúa como GATEKEEPER (Portero) verificando la contraseña.
    """
    # 1. Obtener ID de la sala (puede venir por GET o POST)
    room_id = request.args.get("room") or request.form.get("room")
    if not room_id:
        return redirect(url_for("main.home"))

    # Obtener otros datos
    username = request.args.get("username") or session.get('username', 'Invitado')
    is_host_param = request.args.get("is_host", "false").lower() == "true"

    # Actualizar sesión si viene por URL
    if request.args.get("username"):
        session['username'] = username
        session['is_host'] = is_host_param

    # =======================================================
    # LÓGICA DE SEGURIDAD (PASSWORD CHECK)
    # =======================================================

    # Verificar si la sala tiene contraseña en nuestra "DB"
    stored_password = ROOMS_DB.get(room_id)
    auth_key = f'auth_{room_id}'

    # Si la sala TIENE contraseña Y el usuario NO está autenticado en sesión
    if stored_password and not session.get(auth_key):

        # A. Si el usuario está enviando la contraseña ahora (desde password_check.html)
        if request.method == 'POST':
            input_pass = request.form.get('password')
            if input_pass == stored_password:
                # ¡ÉXITO! Guardamos la llave en la sesión
                session[auth_key] = True
                # Dejamos que el código continúe hacia abajo para renderizar la sala
            else:
                # ERROR: Contraseña mal, volvemos a mostrar el bloqueo
                flash("Contraseña incorrecta, inténtalo de nuevo.", "error")
                return render_template("password_check.html", room=room_id, username=username)

        # B. Si es acceso directo (GET) y no tiene llave
        else:
            # MOSTRAR PANTALLA DE BLOQUEO
            return render_template("password_check.html", room=room_id, username=username)

    # =======================================================
    # RENDERIZADO DE LA SALA (SOLO SI PASÓ LA SEGURIDAD)
    # =======================================================

    # Determinar si es host basado en sesión o parámetro seguro
    is_host = session.get('is_host', False)

    # Generar URLs de VDO.Ninja
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

    logger.info(f"[ACCESO CONCEDIDO] Usuario '{username}' en sala '{room_id}'")

    return render_template(
        "sala.html",
        room=room_id,
        username=username,
        is_host=is_host,
        vdo_url=vdo_url
    )


# ==========================================
# API DE ESTADÍSTICAS
# ==========================================

@main_bp.route("/summary/<room_id>")
def get_summary(room_id):
    reactions = reactions_log.get(room_id, [])
    return jsonify(reactions)