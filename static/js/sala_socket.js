/**
 * sala_socket.js
 * Maneja la conexión con el servidor Flask-SocketIO.
 */

const socket = io(); // Se conecta automáticamente al origen

// 1. Al conectarse, unirse a la sala específica
socket.on('connect', () => {
    console.log("Conectado al servidor WebSocket. ID:", socket.id);
    socket.emit('join_room', {
        room: ROOM_ID,
        username: USER_ID
    });
});

// 2. Escuchar cuando alguien más mueve un objeto
socket.on('position_updated', (data) => {
    // data = { id, x, y, sender }
    console.log("Recibido movimiento externo:", data);
    // Llamamos a una función global que definiremos en la UI
    if (typeof updateElementPosition === 'function') {
        updateElementPosition(data.id, data.x, data.y);
    }
});

// 3. Escuchar cuando alguien dibuja
socket.on('draw_stroke', (data) => {
    // data = { x1, y1, x2, y2, color... }
    if (typeof drawLineOnCanvas === 'function') {
        drawLineOnCanvas(data.x1, data.y1, data.x2, data.y2, false); // false = no emitir de nuevo
    }
});

// ---- FUNCIONES PARA QUE LA UI LAS USE ----

function emitMove(elementId, x, y) {
    socket.emit('update_position', {
        room: ROOM_ID,
        id: elementId,
        x: x,
        y: y
    });
}

function emitDraw(x1, y1, x2, y2) {
    socket.emit('draw_stroke', {
        room: ROOM_ID,
        x1: x1, y1: y1,
        x2: x2, y2: y2
    });
}