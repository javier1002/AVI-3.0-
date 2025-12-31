const socket = io();

const area = document.getElementById('participantsArea');
let dragging = null;
let offsetX = 0, offsetY = 0;

document.querySelectorAll('.participant').forEach(box => {
  box.addEventListener('mousedown', e => {
    dragging = box;
    const rect = box.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
  });
});

document.addEventListener('mousemove', e => {
  if (!dragging) return;
  const rectArea = area.getBoundingClientRect();
  const x = e.clientX - rectArea.left - offsetX;
  const y = e.clientY - rectArea.top - offsetY;
  dragging.style.left = x + 'px';
  dragging.style.top = y + 'px';
});

document.addEventListener('mouseup', () => {
  if (!dragging) return;

  const rectArea = area.getBoundingClientRect();
  const rectBox = dragging.getBoundingClientRect();
  const x = rectBox.left - rectArea.left;
  const y = rectBox.top - rectArea.top;

  socket.emit('update_position', { id: dragging.id, x, y });
  dragging = null;

 document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("toggleOpciones");
  const contenedor = document.getElementById("opcionesAvanzadas");
  const template = document.getElementById("videoOptionsTemplate");
  const toggleText = document.getElementById("toggleText");
  const toggleIcon = document.getElementById("toggleIcon");

  let abierto = false;

  toggleBtn?.addEventListener("click", () => {
    abierto = !abierto;

    if (abierto) {
      contenedor.innerHTML = "";
      contenedor.appendChild(template.content.cloneNode(true));
      toggleText.textContent = "Menos opciones";
      toggleIcon.textContent = "▲";
    } else {
      contenedor.innerHTML = "";
      toggleText.textContent = "Más opciones";
      toggleIcon.textContent = "▼";
    }
  });
});
});
