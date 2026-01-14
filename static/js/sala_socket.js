const socket = io();
// Variable para guardar mi socket_id
let MY_SOCKET_ID = null;

socket.on('connect', () => {
    console.log("Conectado al servidor WebSocket. ID:", socket.id);
    MY_SOCKET_ID = socket.id;

    socket.emit('join_room', {
        room: ROOM_ID,
        username: USER_NAME,
        is_host: IS_HOST
    });
});

socket.on('error_duplicate_user', (data) => {
    alert("ACCESO DENEGADO:\n" + data.message);
    window.location.href = `/join?room=${ROOM_ID}`;
});

socket.on('error_duplicate_host', (data) => {
    alert(" ACCESO DENEGADO:\n" + data.message);
    window.location.href = `/`;
});

// --- EVENTOS PARA HOST ---

socket.on('joined_as_host', (data) => {
    console.log("HOST", data.message);

    // Crear MI propia caja como HOST
    if (typeof window.createMyBox === 'function') {
        window.createMyBox(MY_SOCKET_ID, USER_NAME, true);
    }
});

socket.on('host_joined', (data) => {
    console.log(" Host entró:", data.username);

    // Si YO no soy el host, crear la caja del host
    if (!IS_HOST && typeof window.addParticipant === 'function') {
        window.addParticipant(data.socket_id, data.username, true);
    }
});

socket.on('host_left', (data) => {
    console.log(" Host salió:", data.username);
    mostrarNotificacion(data.message);
});

// --- EVENTOS PARA PARTICIPANTES ---

socket.on('joined_as_participant', (data) => {
    console.log("Invitado", data.message);

    // Crear MI propia caja como PARTICIPANTE
    if (typeof window.createMyBox === 'function') {
        window.createMyBox(MY_SOCKET_ID, USER_NAME, false);
    }
});

socket.on('host_info', (data) => {
    console.log("Info del host:", data);

    // Crear caja del host
    if (typeof window.addParticipant === 'function') {
        window.addParticipant(data.socket_id, data.username, true);
    }
});

socket.on('user_joined', (data) => {
    console.log(" Nuevo usuario:", data);
    mostrarNotificacion(data.message);

    // Crear caja del nuevo participante (si no soy yo)
    if (data.socket_id !== MY_SOCKET_ID && typeof window.addParticipant === 'function') {
        window.addParticipant(data.socket_id, data.username, false);
    }
});

socket.on('user_left', (data) => {
    console.log(" Usuario salió:", data.username);
    mostrarNotificacion(`${data.username} ha salido.`);

    // Eliminar caja del participante
    if (typeof window.removeParticipant === 'function') {
        window.removeParticipant(data.socket_id);
    }
});

// Recibir lista de usuarios existentes
socket.on('room_users', (data) => {
    console.log(" Usuarios en la sala:", data.users);

    if (typeof window.loadParticipants === 'function') {
        window.loadParticipants(data.users);
    }
});

// --- EVENTOS DE SINCRONIZACIÓN ---

socket.on('position_updated', (data) => {
    if (typeof window.updateElementPosition === 'function') {
        window.updateElementPosition(data.id, data.x, data.y);
    }
});

socket.on('draw_stroke', (data) => {
    if (typeof window.drawLineOnCanvas === 'function') {
        window.drawLineOnCanvas(data.x0, data.y0, data.x1, data.y1, false);
    }
});

socket.on('show_reaction', (data) => {
    if (data.username === USER_NAME) {
        console.log(" Reacción propia ignorada");
        return;
    }

    console.log(" Reacción de", data.username, ":", data.emoji);
    if (typeof window.createFloatingEmoji === 'function') {
        window.createFloatingEmoji(data.emoji);
    }
});

// --- FUNCIONES DE EMISIÓN ---

window.emitMove = function(elementId, x, y) {
    socket.emit('update_position', {
        room: ROOM_ID,
        id: elementId,
        x: x,
        y: y
    });
};

window.emitDraw = function(x0, y0, x1, y1) {
    socket.emit('draw_stroke', {
        room: ROOM_ID,
        x0: x0,
        y0: y0,
        x1: x1,
        y1: y1
    });
};

// --- UTILIDADES ---

function mostrarNotificacion(mensaje) {
    const toast = document.getElementById('toast-notification');
    if (toast) {
        toast.innerText = mensaje;
        toast.style.visibility = "visible";
        setTimeout(() => toast.style.visibility = "hidden", 3000);
    }
}

socket.on('disconnect', () => {
    console.log(" Desconectado del servidor.");
});