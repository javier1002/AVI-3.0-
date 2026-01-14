/**
 * sala_socket.js
 * Maneja la comunicación en tiempo real (WebSockets).
 * Recibe eventos del servidor y actualiza la UI llamando a funciones globales de sala_ui.js.
 */

// 1. INICIALIZAR LA CONEXIÓN
const socket = io();

// 2. AL CONECTARSE
socket.on('connect', () => {
    console.log("✅ Conectado al servidor WebSocket. ID:", socket.id);

    // Solicitamos entrar a la sala con los datos definidos en sala.html
    socket.emit('join_room', {
        room: ROOM_ID,
        username: USER_NAME
    });
});

// 3. MANEJO DE ERRORES (Usuario Duplicado)
socket.on('error_duplicate_user', (data) => {
    alert("⛔ ACCESO DENEGADO:\n" + data.message);
    window.location.href = `/join?room=${ROOM_ID}`;
});

// 4. ESCUCHAR EVENTOS DE OTROS USUARIOS

// A. Alguien movió una caja (Sincronización de movimiento)
socket.on('position_updated', (data) => {
    if (typeof window.updateElementPosition === 'function') {
        window.updateElementPosition(data.id, data.x, data.y);
    }
});

// B. Alguien dibujó en la pizarra
socket.on('draw_stroke', (data) => {
    if (typeof window.drawLineOnCanvas === 'function') {
        window.drawLineOnCanvas(data.x0, data.y0, data.x1, data.y1, false);
    }
});

// C. Alguien envió una reacción (Emoji flotante)
// CORRECCIÓN: Ahora filtramos para NO mostrar nuestras propias reacciones
socket.on('show_reaction', (data) => {
    // data = { emoji: '❤️', username: 'Juan' }

    // Si la reacción es MÍA, no la muestro (ya la mostré localmente)
    if (data.username === USER_NAME) {
        console.log("🔇 Reacción propia ignorada (ya mostrada localmente)");
        return;
    }

    // Si es de otro usuario, la muestro
    console.log("📨 Reacción recibida de", data.username, ":", data.emoji);
    if (typeof window.createFloatingEmoji === 'function') {
        window.createFloatingEmoji(data.emoji);
    }
});

// D. Alguien entró o salió (Notificaciones)
socket.on('user_joined', (data) => {
    console.log("👋", data.message);
    mostrarNotificacion(data.message);
});

socket.on('user_left', (data) => {
    console.log("👋 Usuario desconectado:", data.username);
    mostrarNotificacion(`${data.username} ha salido.`);
});


// 5. FUNCIONES PARA ENVIAR DATOS (Usadas por sala_ui.js)

// Mover elementos
window.emitMove = function(elementId, x, y) {
    socket.emit('update_position', {
        room: ROOM_ID,
        id: elementId,
        x: x,
        y: y
    });
};

// Dibujar
window.emitDraw = function(x0, y0, x1, y1) {
    socket.emit('draw_stroke', {
        room: ROOM_ID,
        x0: x0,
        y0: y0,
        x1: x1,
        y1: y1
    });
};

// 6. UTILIDADES INTERNAS
function mostrarNotificacion(mensaje) {
    const toast = document.getElementById('toast-notification');
    if (toast) {
        toast.innerText = mensaje;
        toast.style.visibility = "visible";
        setTimeout(() => toast.style.visibility = "hidden", 3000);
    }
}

// 7. DESCONEXIÓN
socket.on('disconnect', () => {
    console.log("❌ Desconectado del servidor.");
});