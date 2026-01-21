{% extends "panel-header.html" %}
{% block content %}

{% set params = "room=" ~ room %}
{% if password %}{% set params = params ~ "&password=" ~ password %}{% endif %}
{% set hostUrl  = "https://vdo.ninja/?" ~ params ~ "&director" %}
{% set guestUrl = "https://vdo.ninja/?" ~ params %}

<h1>Sala: {{ room }}</h1>

<div id="avi-tools">
  <button type="button" class="active" data-mode="move">Mover</button>
  <button type="button" data-mode="draw">Dibujar</button>
</div>

<div id="avi-stage">
  <div id="avi-background" class="avi-layer"></div>

  <div id="avi-participants" class="avi-layer">
    <div id="host" class="participant host" style="left: 40px; top: 40px;">
      <iframe
        id="hostFrame"
        src="{{ hostUrl }}" 
        allow="camera; microphone; fullscreen; display-capture">
      </iframe>
    </div>
    
    <div id="p1" class="participant" style="left: 420px; top: 40px;">
      Invitado 1
    </div>
  </div>

  <canvas id="avi-whiteboard"></canvas>
</div>

<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>

<script>
    const ROOM_ID = "{{ room }}";
    const USER_ID = "user_" + Math.floor(Math.random() * 1000); // ID temporal para probar
</script>

<script src="{{ url_for('static', filename='js/sala_socket.js') }}"></script>
<script src="{{ url_for('static', filename='js/sala_ui.js') }}"></script>

{% endblock %}