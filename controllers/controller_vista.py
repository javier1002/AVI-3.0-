import logging

from flask import Blueprint, render_template, request, redirect, url_for, Response,jsonify
from controllers.websocket_controller import reactions_log

logger = logging.getLogger(__name__)
main_bp = Blueprint("main", __name__)

# Endpoint de bienvenida
@main_bp.route("/", methods=["GET", "POST"])
def home():
    """
    Renderiza la pagina de inicio, "Bienvenida".
    Retorna plantilla HTML renderizada de 'home.html'
    """
    return render_template("home.html")

# Endpoints de creacion
@main_bp.route("/crea_sala", methods=["GET"])
def crea_sala():
    """
    muestra formulario para crear y configurar una sala
    Retorna HTML renderizado de 'crea_sala.html'
    """
    return render_template("crea_sala.html")


@main_bp.route("/ir-sala", methods=["POST"])
def ir_sala()-> Response:
    """
    Procesa el formulario de ingreso a una sala.
    Recibe el ID de la sala y la contraseña via POST, valida que existan,
    y redirige al usuario a la vista de la sala específica.
    """
    room_id = request.form.get("roomId", "").strip()
    password = request.form.get("password", "").strip()

    # nombre del usuario, si no se pone pondra anonimo
    username = request.form.get("username", "Host").strip()

    if not room_id:
            return redirect(url_for("main.crea_sala"))

    logger.info(f"Redirigiendo a sala: {room_id} | Usuario: {username}")
    return redirect(url_for("main.sala", room=room_id, password=password, username=username))



@main_bp.route("/join", methods=["GET"])
def join_room():
    """
    Formulario para que invitados ingresen a la sala
    """
    room_name= request.args.get("room","").strip()
    if not room_name:
        return redirect(url_for("home.html"))

    return render_template("invitacion.html", room=room_name)

    #Endpoint interfaz de sala
@main_bp.route("/sala")
def sala() -> str:
    room_id = request.args.get("room", "").strip()
    password = request.args.get("password", "").strip()

    # RECUPERAR EL NOMBRE DE LA URL
    username = request.args.get("username", "Invitado")

    if not room_id:
        return redirect(url_for("main.home"))

    #  ENVIAR EL NOMBRE A LA PLANTILLA HTML
    return render_template("sala.html", room=room_id, password=password, username=username)


@main_bp.route("/summary/<room>")
def summary(room):
    # Devuelve el conteo de reacciones en formato JSON
    return jsonify(reactions_log[room])