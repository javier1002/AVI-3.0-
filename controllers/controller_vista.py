# ==========================================
# imports necesarios para el controller
# ==========================================
import logging
import uuid
from flask import Blueprint, render_template, request, redirect, url_for, jsonify
from controllers.websocket_controller import reactions_log

#Blueprints
logger = logging.getLogger(__name__)
main_bp = Blueprint("main", __name__)


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
    Redirige a la sala con is_host=true
    """
    room_id = request.form.get("roomId", "").strip()
    password = request.form.get("password", "").strip()
    username = request.form.get("username", "Host").strip()

    if not room_id:
        return redirect(url_for("main.crea_sala"))

    if not username:
        username = "Host"

    logger.info(f"[HOST] Creando sala: {room_id} | Usuario: {username}")

    # Redirigir como HOST
    return redirect(url_for(
        "main.sala",
        room=room_id,
        password=password,
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
    Procesa el formulario de invitación (PARTICIPANTE)
    """
    room_id = request.form.get("room", "").strip()
    username = request.form.get("username", "Invitado").strip()
    password = request.form.get("password", "").strip()

    if not room_id:
        return redirect(url_for("main.home"))

    if not username:
        username = "Invitado"

    logger.info(f"[PARTICIPANTE] Uniéndose a sala: {room_id} | Usuario: {username}")

    return redirect(url_for(
        "main.sala",
        room=room_id,
        password=password,
        username=username,
        is_host="false"
    ))


# ==========================================
# VISTA PRINCIPAL DE SALA
# ==========================================

@main_bp.route("/sala")
def sala():
    """
    Vista principal de la sala
    Diferencia entre HOST y PARTICIPANTE según el parámetro is_host
    """
    room_id = request.args.get("room", "").strip()
    password = request.args.get("password", "").strip()
    username = request.args.get("username", "Invitado").strip()
    is_host = request.args.get("is_host", "false").lower() == "true"

    # Validación
    if not room_id or not username:
        return redirect(url_for("main.home"))

    # Generar URLs de VDO.Ninja según el rol
    if is_host:
        # HOST: Puede enviar video y tiene controles
        vdo_url = (
            f"https://vdo.ninja/?room={room_id}"
            f"&push"
            f"&autostart"
            f"&cleanoutput"
            f"&label={username}"
            f"&audiobitrate=256"
            f"&bitrate=30000"
            f"&codec=h264"
            f"&view"
        )
        logger.info(f"[SALA] HOST '{username}' entrando a '{room_id}'")
    else:
        # PARTICIPANTE: Solo vista, sin enviar video
        vdo_url = (
            f"https://vdo.ninja/?room={room_id}"
            f"&view"
            f"&cleanoutput"
            f"&transparent"
            f"&autoplay"
            f"&muted"
            f"&scene"
            f"&bitrate=30000"
            f"&codec=h264"
            f"&label={username}"
        )
        logger.info(f"[SALA] PARTICIPANTE '{username}' entrando a '{room_id}'")

    # Renderizar con todas las variables
    return render_template(
        "sala.html",
        room=room_id,
        password=password,
        username=username,
        is_host=is_host,
        vdo_url=vdo_url
    )


# ==========================================
# API DE ESTADÍSTICAS
# ==========================================

@main_bp.route("/summary/<room_id>")
def get_summary(room_id):
    """
    API REST(Stateless guarda información de interacciones pasadas) para obtener el log de reacciones de una sala que se comunica mediante rest con jsonify que devuelve la lista
    Devuelve JSON con todas las reacciones registradas
    """
    reactions = reactions_log.get(room_id, [])
    logger.info(f"[SUMMARY] Solicitando resumen de sala '{room_id}': {len(reactions)} reacciones")
    return jsonify(reactions)