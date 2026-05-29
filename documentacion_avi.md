# 📚 Documentación Técnica — AVI 3.0
> Aula Virtual Inmersiva · Grupo IDIS · Flask + Socket.IO + VDO.Ninja + MediaPipe

---

## Índice

1. [Arquitectura General](#1-arquitectura-general)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Estructura de Archivos](#3-estructura-de-archivos)
4. [Herencia de Plantillas (Jinja2)](#4-herencia-de-plantillas-jinja2)
5. [Sistema WebSocket — Protocolo Completo](#5-sistema-websocket--protocolo-completo)
6. [WYSIWIS — Sincronización Visual Colaborativa](#6-wysiwis--sincronización-visual-colaborativa)
7. [Motor de Segmentación de Fondo (BgSegModule v14)](#7-motor-de-segmentación-de-fondo-bgsegmodule-v14)
8. [Varita Mágica IA (varita_magica.js)](#8-varita-mágica-ia-varita_magicajs)
9. [Salas en Grupo (Breakout Rooms)](#9-salas-en-grupo-breakout-rooms)
10. [Guía para Heredar / Extender el Código](#10-guía-para-heredar--extender-el-código)
11. [Despliegue](#11-despliegue)
12. [Referencia Rápida de Eventos Socket](#12-referencia-rápida-de-eventos-socket)

---

## 1. Arquitectura General

```
                        ┌─────────────────────────────────────┐
  Navegador             │         Servidor Flask (app.py)     │
  ─────────             │  ┌──────────────┐  ┌─────────────┐ │
  sala.html  ←─HTTP──►  │  │controller_   │  │websocket_   │ │
  sala_ui.js  ←─WS───►  │  │vista.py      │  │controller.py│ │
  sala_socket.js        │  └──────────────┘  └─────────────┘ │
  bg_segmentation.js    │         │                 │         │
  varita_magica.js      │    Flask Blueprints   SocketIO     │
                        └─────────────────────────────────────┘
                                       │
                             ┌─────────┴─────────┐
                             │   VDO.Ninja CDN   │
                             │  (video p2p WebRTC)│
                             └───────────────────┘
```

**Flujo de una sesión:**
1. Host abre `/` → completa formulario → POST `/ir-sala` → sesión Flask → redirige a `/sala`
2. Invitado recibe link `/join?room=ID` → `password_check.html` si hay contraseña → `/sala`
3. Al cargar `sala.html`, se instancia `socket.io` (cliente) → `join_room` evento WS
4. El servidor sincroniza cajas, posiciones, fondo y pizarra a todos los participantes

---

## 2. Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Backend | Python / Flask | 3.x |
| WebSockets | Flask-SocketIO + Socket.IO | 4.7.2 |
| Async (prod) | Gevent | monkey-patched |
| Async (dev) | Threading | — |
| Video P2P | VDO.Ninja | CDN |
| Segmentación IA | MediaPipe Selfie Segmentation | CDN |
| Gestos IA | MediaPipe Hands | CDN |
| Gráficas | Chart.js | CDN |
| Alertas | SweetAlert2 v11 | CDN |
| CSS Base | Bootstrap 5.3.8 + estilos propios | CDN |
| Despliegue | Render.com (Procfile) | — |

---

## 3. Estructura de Archivos

```
AVIProject/
├── app.py                         # Punto de entrada · Flask + SocketIO
├── config.py                      # Configuración (Config class)
├── Procfile                       # Gunicorn para Render.com
├── requirements.txt               # Dependencias Python
│
├── controllers/
│   ├── __init__.py
│   ├── controller_vista.py        # Rutas HTTP (Blueprint "main")
│   └── websocket_controller.py   # Todos los handlers Socket.IO
│
├── templates/
│   ├── panel-header.html          # 🧩 Plantilla BASE (herencia Jinja2)
│   ├── home.html                  # Página de inicio / crear sala
│   ├── sala.html                  # 🎯 Sala principal (extiende base)
│   ├── invitacion.html            # Página de invitado
│   ├── password_check.html        # Verificación de contraseña
│   ├── dock_colaborativo.html     # Dock lateral (componente)
│   └── Readme.html                # Ayuda
│
└── static/
    ├── css/
    │   ├── styles.css             # Estilos globales
    │   ├── sala.css               # Estilos de la sala
    │   ├── dock_colaborativo.css
    │   ├── crea_sala.css
    │   ├── invitacion.css
    │   ├── invitacionform.css
    │   └── lock.css
    └── js/
        ├── sala_socket.js         # Cliente WS básico (conexión + join)
        ├── sala_ui.js             # 🧠 UI principal + WYSIWIS (1085 líneas)
        ├── bg_segmentation.js     # 🎭 Motor de fondo IA (BgSegModule v14)
        ├── varita_magica.js       # ✍️ Varita con MediaPipe Hands
        ├── app.js                 # Bootstrap JS global
        ├── main.js                # Utilidades generales
        ├── crea_sala.js           # Lógica formulario home
        ├── dock_colaborativo.js   # Lógica dock
        ├── invitacion.js          # Lógica invitación
        └── lock.js                # Lógica contraseña
```

---

## 4. Herencia de Plantillas Jinja2

### 4.1 Plantilla Base: `panel-header.html`

```
┌──────────────────────────────────────────────┐
│ <!DOCTYPE html>                              │
│ <head>                                       │
│   Bootstrap 5 + styles.css                  │
│   {% block head_css %}{% endblock %}   ← override │
│ </head>                                      │
│ <body>                                       │
│   <nav> navbar (AVI 3.0 + Inicio + Ayuda) </nav>│
│   <div class="container p-4">               │
│     {% block content %}{% endblock %}  ← override │
│   </div>                                     │
│   <script src="app.js"></script>             │
│ </body>                                      │
└──────────────────────────────────────────────┘
```

La plantilla base expone **dos bloques** para ser sobreescritos:

| Bloque | Propósito |
|--------|-----------|
| `{% block head_css %}` | Inyectar CSS o scripts adicionales en `<head>` |
| `{% block content %}` | Contenido principal de la página |

### 4.2 Cómo extiende `sala.html`

```jinja2
{% extends "panel-header.html" %}

{% block head_css %}
  <link rel="stylesheet" href="{{ url_for('static', filename='css/sala.css') }}">
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
{% endblock %}

{% block content %}
  {# Variables Jinja2 pasadas desde Flask #}
  {% set bgRoom = room ~ "_bg" %}

  <h1>Sala: {{ room }} <small>({{ username }}{% if is_host %} - Host{% endif %})</small></h1>

  {# Barra de herramientas #}
  <div id="avi-tools"> ... </div>

  {# Escenario principal (capas) #}
  <div id="avi-stage">
    <div id="avi-background" class="avi-layer"> {# iframe VDO fondo #} </div>
    <div id="avi-participants" class="avi-layer"> {# cajas dinámicas #} </div>
    <canvas id="avi-whiteboard"></canvas>
    <canvas id="magic-canvas"></canvas>
  </div>

  {# Variables para JS: se inyectan en <script> inline #}
  <script>
    const ROOM_ID   = "{{ room }}";
    const USER_NAME = "{{ username|default('Invitado') }}";
    const IS_HOST   = {% if is_host %}true{% else %}false{% endif %};
  </script>

  {# Scripts en orden de dependencia #}
  <script src=".../sala_socket.js"></script>   {# 1. Conexión WS #}
  <script src=".../bg_segmentation.js"></script> {# 2. Motor fondo #}
  <script src=".../sala_ui.js"></script>        {# 3. UI principal #}
  <script src=".../varita_magica.js"></script>  {# 4. Varita IA #}
{% endblock %}
```

### 4.3 Variables Jinja2 disponibles en `sala.html`

| Variable | Tipo | Origen | Descripción |
|----------|------|--------|-------------|
| `room` | `str` | `controller_vista.py` | ID único de la sala |
| `username` | `str` | sesión Flask | Nombre del usuario |
| `is_host` | `bool` | sesión Flask | `True` si es anfitrión |
| `vdo_url` | `str` | generado en vista | URL VDO.ninja con parámetros |
| `is_breakout` | `bool` | query param `?breakout=1` | Es sub-sala de grupo |

### 4.4 Crear una nueva página heredando la base

```jinja2
{# templates/mi_nueva_pagina.html #}
{% extends "panel-header.html" %}

{% block head_css %}
  <link rel="stylesheet" href="{{ url_for('static', filename='css/mi_estilo.css') }}">
{% endblock %}

{% block content %}
  <h1>Mi Página</h1>
  <p>Contenido aquí...</p>
{% endblock %}
```

```python
# controllers/controller_vista.py
@main_bp.route("/mi-ruta")
def mi_vista():
    return render_template("mi_nueva_pagina.html", dato="valor")
```

---

## 5. Sistema WebSocket — Protocolo Completo

### 5.1 Inicialización del servidor (`app.py`)

```python
socketio = SocketIO(
    cors_allowed_origins="*",
    async_mode=ASYNC_MODE,       # 'gevent' en prod, 'threading' en dev
    max_http_buffer_size=10_000_000,  # 10 MB (para frames de video)
    ping_timeout=120,            # Crítico para Render.com
    ping_interval=30,
    always_connect=True,
    cookie=None,                 # Evita sticky-session en Render
)
```

### 5.2 Estado en memoria del servidor

```python
rooms         = {}           # {room_id: {host: {...}, participants: {sid: username}}}
sid_map       = {}           # {sid: (room_id, username, is_host)}
reactions_log = defaultdict(list)   # {room_id: [{user, emoji, timestamp}]}
box_states    = defaultdict(dict)   # {room_id: {sid: {x, y, width, height}}}
bg_states     = defaultdict(dict)   # {room_id: {sid: color|True}}
```

> [!WARNING]
> El estado es **en memoria** — se pierde al reiniciar el servidor. No hay base de datos persistente para la sesión de sala.

### 5.3 Mapa de eventos Socket.IO

#### Eventos de Sala (Join/Leave)

```
CLIENT → SERVER                     SERVER → CLIENT
══════════════════════════════════  ═══════════════════════════════════
join_room      {room, username,     joined_as_host    {message, room}
               is_host}        ──►  joined_as_participant {message, room}
                                    host_joined       {username, socket_id}
                                    user_joined       {username, socket_id, message}
                                    room_users        {users: [{socket_id, username}]}
                                    host_info         {socket_id, username}
                                    all_box_states    {states: {}}
                                    all_bg_states     {states: {}}
                                ◄── connection_response {status: 'connected'}

(desconexión automática)       ──►  host_left    {username, socket_id, message}
                                    user_left    {username, socket_id}
```

#### Eventos de Posición de Cajas (WYSIWIS)

```
CLIENT → SERVER                     SERVER → CLIENTES DE LA SALA
══════════════════════════════════  ═══════════════════════════════════
box_move  {room, socket_id, x, y}  box_move_event {socket_id, x, y}
box_state {room, socket_id,        box_state_event {socket_id, x, y,
           x, y, width, height}                     width, height}
```

#### Eventos de Pizarra Colaborativa

```
CLIENT → SERVER                     SERVER → CLIENTES
══════════════════════════════════  ═══════════════════════════════════
draw_stroke {room, x0,y0,x1,y1,   draw_stroke {x0,y0,x1,y1,mode}
             mode}
clear_board {room}             ──► force_clear_event {}
```

#### Eventos de Interacción

```
CLIENT → SERVER                     SERVER → CLIENTES
══════════════════════════════════  ═══════════════════════════════════
reaction    {room, emoji,          show_reaction {emoji, username}
             username}
raise_hand  {room, username}  ──►  hand_raised_event {room, username}
chat_message {room, username,  ──► chat_message {room, username,
              message, time}                     message, time}
```

#### Eventos de Visibilidad (WYSIWIS)

```
CLIENT → SERVER                          SERVER → TODOS
════════════════════════════════════════ ════════════════════════════════════
toggle_visibility {room, target_id,      toggle_visibility_event
                   visible}          ──► {target_id, visible}

toggle_all_videos {room, visible}    ──► toggle_all_videos_event {visible}
```

#### Eventos de Fondo (BgSegmentation)

```
CLIENT → SERVER                     SERVER → CLIENTES
══════════════════════════════════  ═══════════════════════════════════
change_bg   {room, socket_id,      bg_change_event {socket_id, color}
             color}
bg_active   {room, socket_id,      bg_active {socket_id, active}
             active}
bg_frame    {room, data, w, h} ──► bgf_{sid} {data, w, h}
bg_query_active {room,         ──► bg_active {socket_id, active}
                 publisher}
bg_viewer_ready {room, pub,    ──► bg_viewer_ready (al publisher)
                 viewer}
bg_viewer_ack   {viewer,       ──► bg_viewer_ack {socket_id, active}
                 socket_id}
```

#### Eventos de Varita Mágica

```
CLIENT → SERVER                     SERVER → CLIENTES
══════════════════════════════════  ═══════════════════════════════════
wand_move {room, x, y, wx, wy,    wand_remote_update {id, x, y, wx,
           s, c, n}           ──►                      wy, s, c, n}
```

#### Eventos de Breakout Rooms

```
CLIENT → SERVER                     SERVER → CLIENTES
══════════════════════════════════  ═══════════════════════════════════
create_breakout_rooms              redirect_to_room {room_id, room_name}
  {room, groups:[{room_id,    ──►  breakout_created {groups:[{room_id,
   name, members:[sid]}]}                             name, count}]}
```

### 5.4 Cliente JavaScript — Patrón de conexión

```javascript
// sala_socket.js — se ejecuta ANTES que sala_ui.js

const socket = io();                // Conecta automáticamente al servidor
let MY_SOCKET_ID = null;

socket.on('connect', () => {
    MY_SOCKET_ID = socket.id;
    socket.emit('join_room', {
        room: ROOM_ID,              // Inyectado por Jinja2
        username: USER_NAME,
        is_host: IS_HOST
    });
});

// Patrón de escucha
socket.on('nombre_evento', (data) => {
    // data es el objeto JSON enviado por el servidor
});

// Patrón de emisión
socket.emit('nombre_evento', { room: ROOM_ID, ...payload });
```

---

## 6. WYSIWIS — Sincronización Visual Colaborativa

**WYSIWIS** = *What You See Is What I See*

La sala implementa sincronización en tiempo real de:

### 6.1 Posición de cajas de video

```
Usuario arrastra caja             Throttle (32ms)
──────────────────►  mousemove ──────────────► socket.emit('box_move', {x, y})
                                                        │
                                               servidor relay
                                                        │
                                               box_move_event → otros clientes
                                               el.style.left/top = x/y px
```

Al soltar (`mouseup`), se emite `box_state` con dimensiones completas para sincronizar también el tamaño.

### 6.2 Persistencia de posición (localStorage)

```javascript
// Clave: sala_{ROOM_ID}_box_{username_sanitizado}
function boxKey(u) {
    return `sala_${ROOM_ID}_box_${u.replace(/[^a-z0-9]/gi,'').toLowerCase()}`;
}
// Guardado automático tras drag y resize
saveBox(username, { x, y, w, h, mirror });
```

### 6.3 Pizarra colaborativa

| Modo | Cursor | Acción | Evento WS |
|------|--------|--------|-----------|
| Lápiz (`pen`) | `crosshair` | Dibuja línea blanca | `draw_stroke` |
| Borrador (`eraser`) | `cell` | Borra con composite op. | `draw_stroke` con `mode:'eraser'` |
| Limpiar | — | Borra todo el canvas | `clear_board` → `force_clear_event` |

```javascript
// Receptor en todos los clientes
socket.on('draw_stroke', d => drawLine(d.x0, d.y0, d.x1, d.y1, d.mode, false));
// false = no re-emitir (evitar eco)
```

### 6.4 Visibilidad de videos

Cualquier usuario puede ocultar/mostrar videos — se sincroniza para **todos**:

```javascript
// Emisor
socket.emit('toggle_visibility', { room: ROOM_ID, target_id: uid, visible: false });

// Receptor (todos los clientes)
socket.on('toggle_visibility_event', d => {
    const box = document.getElementById(`participant-${d.target_id}`);
    box.style.display = d.visible ? '' : 'none';  // UN solo mecanismo
    reorganizeLayout();
});
```

> [!IMPORTANT]
> Se usa **exclusivamente `style.display`** para mostrar/ocultar. No mezclar con `classList.toggle('hidden')` — esto causó bugs históricos en el proyecto.

### 6.5 Chat

```javascript
// Enviar
socket.emit('chat_message', { room: ROOM_ID, username: USER_NAME, message: text, time });

// Recibir (todos incluyendo emisor — relay broadcast)
socket.on('chat_message', d => {
    const isMine = d.username === USER_NAME;
    // Renderizar burbuja con clase 'mine' u 'others'
});
```

---

## 7. Motor de Segmentación de Fondo (BgSegModule v14)

Archivo: [`bg_segmentation.js`](file:///c:/Users/Javier/PycharmProjects/AVIProject/static/js/bg_segmentation.js)

### 7.1 Arquitectura del módulo

```
window.BgSegModule = {
    attach(boxEl, mySocketId, username)   → emisor: UI + motor IA
    setupViewer(boxEl, pubSocketId)       → receptor: escucha frames del socket
    restoreAll(bgStates)                  → al unirse, restaura estado de todos
    destroy(socketId)                     → destruye viewer de un sid
    destroyAll()                          → limpia todo (reconexión)
}
```

### 7.2 Separación Emisor / Receptor

```
EMISOR (yo):                          RECEPTOR (otros):
─────────────────────────────         ──────────────────────────────
1. getUserMedia() → cámara            NUNCA llama getUserMedia
2. MediaPipe SelfieSegmentation       Escucha socket evento: bgf_{pubSid}
3. Canvas con fondo removido          Dibuja frame en canvas overlay
4. 10 FPS → socket.emit('bg_frame')   Oculta <iframe> VDO mientras activo
5. socket.emit('bg_active', true)     Restaura <iframe> al desactivarse
```

> [!NOTE]
> Esta separación es crítica: el viewer **nunca** accede a la cámara. Solo el emisor lo hace. Esto evita conflictos de permisos y permite que usuarios sin cámara vean el efecto de otros.

### 7.3 Presets de fondo

```javascript
const PRESETS = [
    { c: 'transparent', l: 'Sin fondo',  i: '✕' },
    { c: '#00b341',     l: 'Verde',      i: '' },
    { c: '#0d47a1',     l: 'Azul',       i: '' },
    { c: '#4a148c',     l: 'Morado',     i: '' },
    { c: '#1a1a2e',     l: 'Negro',      i: '' },
    { c: '#ffffff',     l: 'Blanco',     i: '' },
    { c: 'blur',        l: 'Blur',       i: '🌫️' },
    // + color personalizado (input type="color")
];
```

### 7.4 Ciclo de vida completo

```
attachUI()
    └─► Usuario selecciona fondo
            └─► apply(color)
                    ├─► makeEngine().start() ← getUserMedia + MediaPipe
                    ├─► makeStreamer(canvas) ← setInterval 10fps → bg_frame
                    └─► emit('bg_active', {active: true})

setupViewer(boxEl, pubSid)
    └─► makeViewer(boxEl, pubSid)
            ├─► socket.on(`bgf_${pubSid}`, onFrame) ← recibe frame
            ├─► socket.on('bg_active', onActive)
            └─► emit('bg_query_active', {publisher: pubSid}) ← pregunta estado actual

deactivate()
    ├─► str.stop() → emit('bg_active', {active: false})
    ├─► eng.stop() → cierra cámara + MediaPipe
    └─► restaura iframe VDO.ninja
```

---

## 8. Varita Mágica IA (`varita_magica.js`)

### 8.1 Descripción

Usa **MediaPipe Hands** para detectar gestos de la mano y dibujar en el canvas `#magic-canvas` de forma sincronizada entre todos los participantes.

### 8.2 Máquina de estados por número de dedos

| Dedos | Estado | Acción |
|-------|--------|--------|
| 0 (puño) | `0` | Borrar trazos locales |
| 1 | `1` | Láser (rastro luminoso) |
| 2 | `2` | Dibujar trazo rojo |
| ≥3 | `3` | Vara mágica (línea muñeca→dedo) |

### 8.3 Algoritmo de suavizado anti-temblor

```javascript
// Promedio de las últimas HISTORY_SIZE (5) posiciones
positionHistory.push(lm[8]);    // lm[8] = tip del índice
if (positionHistory.length > HISTORY_SIZE) positionHistory.shift();

const avgX = positionHistory.reduce((s, p) => s + p.x, 0) / positionHistory.length;
const avgY = positionHistory.reduce((s, p) => s + p.y, 0) / positionHistory.length;
// smoothedTip = { x: avgX, y: avgY }
```

### 8.4 Render Loop desacoplado

El canvas se renderiza siempre con `requestAnimationFrame`, independientemente de si la cámara está activa:

```javascript
function renderLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRemoteWands();  // Varita de otros usuarios
    if (isWandActive || localPaths.length > 0) drawLocalVisuals();
    requestAnimationFrame(renderLoop);
}
renderLoop(); // Inicia al cargar la página
```

### 8.5 Evento WebSocket de la varita

```javascript
// Emisión (throttle 40ms)
socket.emit('wand_move', {
    room: ROOM_ID,
    x: smoothedTip.x,   // [0,1] normalizado
    y: smoothedTip.y,
    wx: lm[0].x,        // muñeca
    wy: lm[0].y,
    s: localState,      // 0-3
    c: myColor,         // color aleatorio por usuario
    n: myName           // nombre del usuario
});

// Recepción (en sala_ui.js vía websocket_controller)
socket.on('wand_remote_update', d => {
    // d.id = socket_id del emisor
    // Espejo horizontal: r.x = (1 - d.x) * canvas.width
});
```

---

## 9. Salas en Grupo (Breakout Rooms)

### 9.1 Flujo completo

```
HOST abre modal "🏫 Grupos"
    │
    ├─► Asigna participantes (A/B/sin asignar) con click chips
    │     o usa "⚡ Dividir automático" (alternado A/B)
    │
    └─► "📤 Enviar a grupos"
            │
            └─► socket.emit('create_breakout_rooms', {
                    room: ROOM_ID,
                    groups: [
                        { room_id: ROOM_ID+'_ga', name:'Grupo A', members:[sid,sid] },
                        { room_id: ROOM_ID+'_gb', name:'Grupo B', members:[sid,sid] }
                    ]
                })

SERVIDOR (websocket_controller.py):
    ├─► Verifica que sea el host
    ├─► Crea sub-salas en rooms{}
    └─► emit('redirect_to_room', {room_id, room_name}) → a cada member_sid

CLIENTE recibe 'redirect_to_room':
    └─► showBreakoutConfirm(roomName, roomId)
            ├─► Modal con countdown 30s
            ├─► Aceptar → /sala?room={roomId}&username={USER_NAME}&breakout=1
            └─► Rechazar → permanece en sala actual
```

### 9.2 Continuidad de video en breakout

El `stream_id` de VDO.ninja se construye solo con el `username`:

```python
stream_id = san(username)  # sin incluir room_id
```

Esto garantiza que al moverse a la sub-sala, **el stream de video del participante persiste** sin reconexión.

---

## 10. Guía para Heredar / Extender el Código

### 10.1 Agregar un nuevo evento Socket.IO

**Paso 1 — Backend** (`controllers/websocket_controller.py`):
```python
def init_socket_handlers(socketio):
    # ... handlers existentes ...

    @socketio.on('mi_nuevo_evento')
    def handle_mi_nuevo_evento(data):
        room = data.get('room')
        if not room:
            return
        # Lógica del evento
        payload = {'dato': data.get('dato'), 'socket_id': request.sid}
        emit('mi_nuevo_evento_resultado', payload, to=room, include_self=True)
```

**Paso 2 — Frontend** (en `sala_ui.js`, dentro del bloque `if (typeof socket !== 'undefined') {`):
```javascript
// Emitir
socket.emit('mi_nuevo_evento', {
    room: ROOM_ID,
    dato: 'valor'
});

// Escuchar
socket.on('mi_nuevo_evento_resultado', d => {
    console.log('Recibido:', d);
    // Actualizar UI
});
```

### 10.2 Agregar un nuevo botón a la barra de herramientas

En `sala.html` dentro de `{% block content %}`:
```html
<div id="avi-tools">
    <!-- botones existentes -->
    <button id="btn-mi-funcion" type="button">🆕 Mi Función</button>
</div>
```

En `sala_ui.js`, agregar el ID a `skipIds` si no debe seguir el patrón de modo activo:
```javascript
const skipIds = ['btn-chat', ..., 'btn-mi-funcion'];
```

Y registrar el evento:
```javascript
const btnMiFuncion = document.getElementById('btn-mi-funcion');
if (btnMiFuncion) btnMiFuncion.addEventListener('click', () => {
    // lógica
});
```

### 10.3 Agregar persistencia de estado por sala

Usar el patrón `box_states` / `bg_states` del servidor:
1. En el servidor: mantener el estado en un `defaultdict(dict)` con `{room: {sid: valor}}`
2. Al hacer join (`joined_as_host` o `joined_as_participant`), emitir `all_*_states` con el estado acumulado
3. El nuevo cliente restaura el estado al recibirlo

### 10.4 Crear una nueva vista de sala

```python
# controller_vista.py
@main_bp.route("/mi-sala-especial")
def mi_sala_especial():
    return render_template("mi_sala.html",
        room="sala-especial",
        username=session.get('username', 'Anon'),
        is_host=True
    )
```

```html
{# templates/mi_sala.html #}
{% extends "panel-header.html" %}

{% block head_css %}
<link rel="stylesheet" href="{{ url_for('static', filename='css/sala.css') }}">
{% endblock %}

{% block content %}
<script>
    const ROOM_ID   = "{{ room }}";
    const USER_NAME = "{{ username }}";
    const IS_HOST   = {{ is_host | tojson }};
</script>
<script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
<script src="{{ url_for('static', filename='js/sala_socket.js') }}"></script>
<script src="{{ url_for('static', filename='js/sala_ui.js') }}"></script>
{% endblock %}
```

> [!IMPORTANT]
> Siempre definir `ROOM_ID`, `USER_NAME` e `IS_HOST` como variables globales JavaScript **antes** de cargar `sala_socket.js` y `sala_ui.js`.

### 10.5 Agregar un preset de fondo personalizado

En `bg_segmentation.js`, añadir al array `PRESETS`:
```javascript
const PRESETS = [
    // ... existentes ...
    { c: '#ff0066', l: 'Rosa Neón', i: '🌸', s: 'background:#ff0066' },
];
```

### 10.6 Patrón de función global expuesta

Para que una función de `sala_ui.js` sea accesible desde `sala_socket.js` u otros scripts:
```javascript
// En sala_ui.js:
window.miFuncion = function(param) {
    // implementación
};

// En sala_socket.js:
if (typeof window.miFuncion === 'function') {
    window.miFuncion(valor);
}
```

---

## 11. Despliegue

### 11.1 Local (desarrollo)

```powershell
# Instalar dependencias
pip install -r requirements.txt

# Ejecutar
python app.py
# Servidor en http://0.0.0.0:5000
```

Variables de entorno para dev: ninguna requerida (usa threading).

### 11.2 Render.com (producción)

**`Procfile`:**
```
web: gunicorn -k gevent -w 1 "app:create_app()" --bind 0.0.0.0:$PORT
```

**Variables de entorno requeridas en Render:**
| Variable | Valor |
|----------|-------|
| `RENDER` | `true` (activa gevent monkey-patch) |
| `PORT` | (automático en Render) |

**Headers críticos** (ya configurados en `app.py`):
```python
response.headers['X-Accel-Buffering'] = 'no'  # Sin buffering en proxy Nginx
response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
```

### 11.3 Configuración SocketIO para entornos cloud

```python
socketio = SocketIO(
    ping_timeout=120,    # Alto: Render puede pausar hasta 30s
    ping_interval=30,    # Frecuente para detectar desconexiones
    always_connect=True, # Reconectar aunque el servidor diga no
    cookie=None,         # Sin sticky-session (Render usa load balancer)
)
```

---

## 12. Referencia Rápida de Eventos Socket

### Tabla completa

| Evento (cliente→servidor) | Evento respuesta (servidor→cliente) | Destinatario |
|---------------------------|--------------------------------------|--------------|
| `join_room` | `joined_as_host` / `joined_as_participant` | emisor |
| `join_room` | `user_joined` / `host_joined` | sala |
| `join_room` | `room_users`, `all_box_states`, `all_bg_states` | emisor |
| `box_move` | `box_move_event` | sala (sin emisor) |
| `box_state` | `box_state_event` | sala (sin emisor) |
| `draw_stroke` | `draw_stroke` | sala (sin emisor) |
| `clear_board` | `force_clear_event` | sala (con emisor) |
| `reaction` | `show_reaction` | sala (con emisor) |
| `raise_hand` | `hand_raised_event` | sala |
| `toggle_visibility` | `toggle_visibility_event` | sala (con emisor) |
| `toggle_all_videos` | `toggle_all_videos_event` | sala (con emisor) |
| `chat_message` | `chat_message` | sala |
| `get_room_info` | `room_info` | emisor |
| `get_reactions_log` | `reactions_log` | emisor |
| `change_bg` | `bg_change_event` | sala (sin emisor) |
| `bg_active` | `bg_active` | sala (sin emisor) |
| `bg_frame` | `bgf_{sid}` | sala (sin emisor) |
| `bg_query_active` | `bg_active` | emisor |
| `bg_viewer_ready` | `bg_viewer_ready` | publisher |
| `bg_viewer_ack` | `bg_viewer_ack` | viewer |
| `create_breakout_rooms` | `redirect_to_room` | miembros asignados |
| `create_breakout_rooms` | `breakout_created` | host |
| `wand_move` | `wand_remote_update` | sala (sin emisor) |

---

*Documentación generada el 2026-05-28 · AVI 3.0 · Grupo IDIS*
