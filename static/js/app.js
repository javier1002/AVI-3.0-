// ==========================
// FORMULARIO CREAR SALA
// ==========================
const form = document.getElementById('roomForm');
const linksDiv = document.getElementById('links');
const videoArea = document.getElementById('videoArea');

form?.addEventListener('submit', (e) => {
  e.preventDefault();

  const room = document.getElementById('roomId').value.trim();
  const pass = document.getElementById('password').value.trim();

  if (!room) return;

  let params = `room=${encodeURIComponent(room)}`;
  if (pass) params += `&password=${encodeURIComponent(pass)}`;

  const hostUrl = `https://vdo.ninja/?${params}&director`;
  const guestUrl = `https://vdo.ninja/?${params}`;

  linksDiv.innerHTML = `
    <p><strong>URL HOST (director):</strong><br><code>${hostUrl}</code></p>
    <p><strong>URL Invitados:</strong><br><code>${guestUrl}</code></p>
  `;

  videoArea.innerHTML = `
    <iframe
      src="${hostUrl}"
      width="3840"
      height="2160"
      allow="camera; microphone; fullscreen; display-capture">
    </iframe>
  `;
});
/* --- LÓGICA DE AGENDAMIENTO --- */

function abrirModalAgenda() {
    document.getElementById('modal-agenda').classList.remove('hidden');

    // Pre-llenar fechas (Inicio: ahora, Fin: en 1 hora)
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset()); // Ajuste zona horaria local
    document.getElementById('agenda-inicio').value = now.toISOString().slice(0, 16);

    now.setHours(now.getHours() + 1);
    document.getElementById('agenda-fin').value = now.toISOString().slice(0, 16);
}

function cerrarModalAgenda() {
    document.getElementById('modal-agenda').classList.add('hidden');
}

// Interceptar el envío del formulario
document.getElementById('form-agenda').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btn-crear-evento');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Creando...";
    btn.disabled = true;

    // Preparar datos
    const data = {
        titulo: document.getElementById('agenda-titulo').value,
        inicio: new Date(document.getElementById('agenda-inicio').value).toISOString(),
        fin: new Date(document.getElementById('agenda-fin').value).toISOString()
    };

    try {
        const response = await fetch('/calendar/crear-reunion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (response.ok) {
            alert(`¡ÉXITO!\n\nClase creada en Google Calendar.\n\nLink Invitación: ${result.sala_link}`);
            cerrarModalAgenda();
        } else {
            // Si el error es 401, es porque no se ha logueado
            if (response.status === 401) {
                alert("⚠️ Error de Permisos: Primero debes hacer clic en 'Conectar Cuenta Google'.");
            } else {
                alert("Error: " + (result.error || "Desconocido"));
            }
        }
    } catch (err) {
        console.error(err);
        alert("Error de conexión con el servidor.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});