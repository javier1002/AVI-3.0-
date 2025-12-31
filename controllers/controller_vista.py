from flask import Blueprint, render_template, request, redirect, url_for

main_bp = Blueprint("main", __name__)


# Endpoint de bienvenida
@main_bp.route("/")
def home():
    return render_template("home.html")

# Endpoint configurar y crear sala
@main_bp.route("/crea_sala", methods=["GET"])
def crea_sala():
    return render_template("crea_sala.html")


@main_bp.route("/ir-sala", methods=["POST"])
def ir_sala():
    room = request.form.get("roomId", "").strip()
    password = request.form.get("password", "").strip()

    if not room:
        return redirect(url_for("main.crea_sala"))

    return redirect(url_for("main.sala", room=room, password=password))

#Endpoint de sala
@main_bp.route("/sala")
def sala():
    room = request.args.get("room", "").strip()
    password = request.args.get("password", "").strip()
    return render_template("sala.html", room=room, password=password)
