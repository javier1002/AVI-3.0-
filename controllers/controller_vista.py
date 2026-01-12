from flask import Blueprint, render_template, request, redirect, url_for


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
def ir_sala():
    """
    Procesa el formulario de ingreso a una sala.
    Recibe el ID de la sala y la contraseña via POST, valida que existan,
    y redirige al usuario a la vista de la sala específica.
    """
    room = request.form.get("roomId", "").strip()
    password = request.form.get("password", "").strip()

    if not room:
        return redirect(url_for("main.crea_sala"))

    return redirect(url_for("main.sala", room=room, password=password))

#Endpoint interfaz de sala
@main_bp.route("/sala")
def sala():
    """
    Renderiza la interfaz principal de la sala.
    """
    room = request.args.get("room", "").strip()
    password = request.args.get("password", "").strip()
    return render_template("sala.html", room=room, password=password)
