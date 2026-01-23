document.addEventListener('DOMContentLoaded', () => {
const btnGoogle = document.getElementById('btn-google-calendar');
const roomInput = document.getElementById('roomId');

    if (btnGoogle) {
        btnGoogle.addEventListener('click', () => {
            // 1. Obtener el nombre de la sala
            const roomName = roomInput.value.trim();
            if (!roomName) {
                alert(" Por favor, escribe un nombre para la sala antes de agendar.");
                roomInput.focus();
                roomInput.style.borderColor = "red";
                return;
            } else {
                roomInput.style.borderColor = "#ddd";
            }

            // 2. Construir el Link de Invitación
            const baseUrl = window.location.origin;
            const inviteLink = `${baseUrl}/join?room=${encodeURIComponent(roomName)}`;

            // 3. Construir la URL de Google Calendar
            const calendarBase = "https://calendar.google.com/calendar/render?action=TEMPLATE";
            const titulo = `Clase Virtual: ${roomName}`;
            const detalles = `Hola,\n\nTe invito a unirte a la clase virtual de ${roomName}.\n\n Haz clic en este enlace para entrar:\n${inviteLink}\n\n¡Nos vemos en clase!`;

            // URL final
            const finalUrl = `${calendarBase}&text=${encodeURIComponent(titulo)}&details=${encodeURIComponent(detalles)}`;
            window.open(finalUrl, '_blank');
        });
    }
});