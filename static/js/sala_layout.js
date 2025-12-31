const participantsArea = document.getElementById('avi-participants');
const whiteboard = document.getElementById('avi-whiteboard');
const tools = document.querySelectorAll('#avi-tools button');
const wctx = whiteboard.getContext('2d');


// TEST: forzar siempre clickeable y visible
whiteboard.style.pointerEvents = 'auto';
whiteboard.style.background = 'rgba(255,0,0,0.1)';
whiteboard.style.zIndex = 9999;
console.log('whiteboard test style:', whiteboard.style.zIndex, whiteboard.style.pointerEvents);
// Tamaño del canvas igual al contenedor
whiteboard.width  = whiteboard.clientWidth;
whiteboard.height = whiteboard.clientHeight;

const positions = {};
let currentMode = 'move';

// ---- MODOS / HERRAMIENTAS ----
tools.forEach(btn => {
  btn.addEventListener('click', () => {
    currentMode = btn.dataset.mode;
    tools.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    whiteboard.style.pointerEvents = currentMode === 'move' ? 'none' : 'auto';
    console.log('Modo actual:', currentMode);
  });
});

// ---- DRAG & DROP LOCAL (sin P2P ni sockets) ----
let dragging = null, offsetX = 0, offsetY = 0, startX = 0, startY = 0, draggingActive = false;
const DRAG_THRESHOLD = 4;

document.querySelectorAll('#avi-participants .participant').forEach(box => {
  box.addEventListener('mousedown', e => {
    if (currentMode !== 'move') return;
    if (e.target.tagName.toLowerCase() === 'iframe') return;

    dragging = box;
    const rect = box.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    startX = e.clientX;
    startY = e.clientY;
    draggingActive = false;
    e.preventDefault();
  });
});

document.addEventListener('mousemove', e => {
  if (currentMode !== 'move' || !dragging) return;

  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  if (!draggingActive && (dx * dx + dy * dy) < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
  draggingActive = true;

  const areaRect = participantsArea.getBoundingClientRect();
  const x = e.clientX - areaRect.left - offsetX;
  const y = e.clientY - areaRect.top - offsetY;

  dragging.style.left = `${x}px`;
  dragging.style.top = `${y}px`;
  positions[dragging.id] = { x, y };
});

document.addEventListener('mouseup', () => {
  dragging = null;
  draggingActive = false;
});

// ---- DIBUJO PIZARRA LOCAL (líneas blancas) ----
let drawing = false;
let lastX = 0, lastY = 0;

console.log('whiteboard:', whiteboard, whiteboard.width, whiteboard.height);

whiteboard.addEventListener('mousedown', e => {
  console.log('mousedown canvas, mode:', currentMode);
//  if (currentMode !== 'draw') return;
  drawing = true;
  const rect = whiteboard.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
});

whiteboard.addEventListener('mousemove', e => {
  if (!drawing || currentMode !== 'draw') return;

  const rect = whiteboard.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  wctx.strokeStyle = '#ffffff';
  wctx.lineWidth = 2;
  wctx.lineCap = 'round';
  wctx.lineJoin = 'round';
  wctx.beginPath();
  wctx.moveTo(lastX, lastY);
  wctx.lineTo(x, y);
  wctx.stroke();

  lastX = x;
  lastY = y;
});

whiteboard.addEventListener('mouseup', () => {
  drawing = false;
});

document.addEventListener('mouseup', () => {
  drawing = false;
});
