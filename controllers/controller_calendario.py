import os
import uuid
import datetime
from flask import Blueprint, redirect, request, jsonify, url_for, session
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

calendar_bp = Blueprint('calendar', __name__)

CLIENT_SECRETS_FILE = "credentials.json"
SCOPES = ["https://www.googleapis.com/auth/calendar"]

def get_flow():
    """
    Ayuda a crear el flujo de autenticación dinámicamente
    """
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE,
        scopes=SCOPES
    )
    flow.redirect_uri = url_for('calendar.oauth2callback', _external=True)
    return flow


#  1. Login OAuth
@calendar_bp.route("/login")
def login():
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"
    flow = get_flow()
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return redirect(auth_url)


#  2. Callback OAuth
@calendar_bp.route("/oauth2callback")
def oauth2callback():
    flow = get_flow()
    flow.fetch_token(authorization_response=request.url)
    creds = flow.credentials
    session['google_token'] = creds.to_json()
    return "Autenticado con Google. Puedes cerrar esta pestaña."

@calendar_bp.route("/crear-reunion", methods=["POST"])
def crear_reunion():
    """
    Crear evento
    """
    if 'google_token' not in session:
        return jsonify({"error": "No has iniciado sesión con Google"}), 401

    # Reconstruir credenciales desde la sesión
    creds = Credentials.from_authorized_user_info(eval(session['google_token']), SCOPES)
    service = build("calendar", "v3", credentials=creds)
    data = request.json
    titulo = data.get("titulo", "Clase Virtual AVI")

    # Generar ID de sala y Link
    room_id = str(uuid.uuid4())[:8]

    #  Generamos el link para que entren
    # _external=True crea el link completo
    base_url = url_for('main.join_room', _external=True)
    link_clase = f"{base_url}?room={room_id}"

    # Fechas
    ahora = datetime.datetime.utcnow().isoformat() + 'Z'
    despues = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat() + 'Z'

    event_body = {
        "summary": titulo,
        "description": f"Enlace para unirse a la clase AVI:\n{link_clase}",
        "start": {"dateTime": data.get("inicio", ahora), "timeZone": "America/Bogota"},
        "end": {"dateTime": data.get("fin", despues), "timeZone": "America/Bogota"}
    }

    try:
        evento = service.events().insert(calendarId="primary", body=event_body).execute()
        return jsonify({
            "mensaje": "Conferencia creada exitosamente",
            "link": evento.get('htmlLink'),
            "sala_link": link_clase
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
