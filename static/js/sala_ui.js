/**
 * sala_ui.js
 * Maneja el DOM, Canvas y Eventos del Mouse.
 */

const participantsArea = document.getElementById('avi-participants');
const whiteboard = document.getElementById('avi-whiteboard');
const tools = document.querySelectorAll('#avi-tools button');
const wctx = whiteboard.getContext('2d');

// Configuración inicial del Canvas
function resizeCanvas() {
    whiteboard.width = whiteboard.parentElement.clientWidth;
    whiteboard.height = whiteboard.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // Llamada inicial

// Variables de estado
let currentMode = 'move'; // 'move', 'draw', 'pointer'
let isDragging = false;
let draggedElement = null;
let dragOffset = { x: 0, y: 0 };
let isDrawing = false;
let lastDrawPos = { x: 0, y: 0 };

// ----------------------------------------------------------------------
// 1. CONTROL DE MODOS (Barra de herramientas)
// ----------------------------------------------------------------------
tools.forEach(btn => {
    btn.addEventListener('click', () => {
        // Actualizar UI botones
        tools.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentMode = btn.dataset.mode;
        console.log('Modo cambiado a:', currentMode);

        // LÓGICA IMPORTANTE: CSS pointer-events
        // Si estamos en 'move', el canvas deja pasar los clics hacia los videos de abajo.
        // Si estamos en 'draw', el canvas captura los clics.
        if (currentMode === 'move') {
            whiteboard.style.pointerEvents = 'none';
        } else {
            whiteboard.style.pointerEvents = 'auto';
            whiteboard.style.cursor = 'crosshair';
        }
    });
});

// Inicializar en modo mover
whiteboard.style.pointerEvents = 'none';


// ----------------------------------------------------------------------
// 2. LÓGICA DE ARRASTRAR (DRAG & DROP)
// ----------------------------------------------------------------------
// Delegación de eventos: escuchamos en el contenedor padre
participantsArea.addEventListener('mousedown', (e) => {
    if (currentMode !== 'move') return;

    // Buscar si clicamos un participante (o su hijo)
    const target = e.target.closest('.participant');

    // Evitar arrastrar si clicamos dentro del iframe
    if (!target || e.target.tagName.toLowerCase() === 'iframe') return;

    isDragging = true;
    draggedElement = target;

    // Calcular offset para que el elemento no "salte" al mouse
    const rect = target.getBoundingClientRect();
    const parentRect = participantsArea.getBoundingClientRect();

    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    e.preventDefault(); // Evita seleccionar texto
});

document.addEventListener('mousemove', (e) => {
    // A. LÓGICA MOVER ELEMENTOS
    if (isDragging && draggedElement && currentMode === 'move') {
        const parentRect = participantsArea.getBoundingClientRect();

        let newX = e.clientX - parentRect.left - dragOffset.x;
        let newY = e.clientY - parentRect.top - dragOffset.y;

        // Actualizar localmente
        draggedElement.style.left = `${newX}px`;
        draggedElement.style.top = `${newY}px`;

        // ENVIAR AL SOCKET (Función definida en sala_socket.js)
        emitMove(draggedElement.id, newX, newY);
    }

    // B. LÓGICA DIBUJAR (Si el mouse se mueve sobre el documento y estamos dibujando)
    if (isDrawing && currentMode === 'draw') {
        const rect = whiteboard.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Dibujar localmente y emitir
        drawLineOnCanvas(lastDrawPos.x, lastDrawPos.y, x, y, true);

        lastDrawPos = { x, y };
    }
});

document.addEventListener('mouseup', () => {
    isDragging = false;
    draggedElement = null;
    isDrawing = false;
});

// ----------------------------------------------------------------------
// 3. LÓGICA DE DIBUJO (CANVAS)
// ----------------------------------------------------------------------

whiteboard.addEventListener('mousedown', (e) => {
    if (currentMode !== 'draw') return;

    isDrawing = true;
    const rect = whiteboard.getBoundingClientRect();
    lastDrawPos.x = e.clientX - rect.left;
    lastDrawPos.y = e.clientY - rect.top;
});

/**
 * Función para dibujar una línea.
 * @param {boolean} emit - Si es true, envía el trazo al socket. Si es false, solo dibuja (viene del socket).
 */
function drawLineOnCanvas(x1, y1, x2, y2, emit = false) {
    wctx.strokeStyle = '#ffffff'; // Color blanco
    wctx.lineWidth = 2;
    wctx.lineCap = 'round';
    wctx.lineJoin = 'round';

    wctx.beginPath();
    wctx.moveTo(x1, y1);
    wctx.lineTo(x2, y2);
    wctx.stroke();

    if (emit) {
        emitDraw(x1, y1, x2, y2);
    }
}

// ----------------------------------------------------------------------
// 4. FUNCIONES LLAMADAS DESDE sala_socket.js (CALLBACKS)
// ----------------------------------------------------------------------

// Esta función es llamada cuando llega un evento 'position_updated' del socket
window.updateElementPosition = function(id, x, y) {
    // Evitar moverlo si nosotros mismos lo estamos arrastrando en ese instante
    if (isDragging && draggedElement && draggedElement.id === id) return;

    const el = document.getElementById(id);
    if (el) {
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    }
};

// ----------------------------------------------------------------------
// 5. LÓGICA DE COMPARTIR URL (INVITACIÓN)
// ----------------------------------------------------------------------

const btnShare = document.getElementById('btn-share');
const toast = document.getElementById('toast-notification');

if (btnShare) {
    btnShare.addEventListener('click', () => {
        // 1. Obtenemos la URL actual del navegador
        // Esto es inteligente: si usas ngrok, copiará la de ngrok.
        // Si usas localhost, copiará localhost.
        const currentUrl = window.location.href;

        // 2. Copiamos al portapapeles
        navigator.clipboard.writeText(currentUrl).then(() => {
            showToast("¡Enlace copiado! Envíalo a tu invitado.");
        }).catch(err => {
            console.error('Error al copiar: ', err);
            // Fallback por si el navegador es muy viejo o no tiene permisos
            prompt("Copia este enlace manualmente:", currentUrl);
        });
    });
}

// Función para mostrar el mensajito flotante
function showToast(message) {
    if (!toast) return;
    toast.innerText = message;
    toast.style.visibility = "visible";

    // Ocultar después de 3 segundos
    setTimeout(() => {
        toast.style.visibility = "hidden";
    }, 3000);
}