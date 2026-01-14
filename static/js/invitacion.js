/* static/js/invitacion.js */

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('joinForm');
    // IMPORTANTE: El ID en el HTML debe ser 'btnSubmit' para que esto funcione
    const btnSubmit = document.getElementById('btnSubmit');
    const usernameInput = document.getElementById('username');

    // Ponemos el foco en el campo nombre automáticamente al cargar
    if(usernameInput) {
        usernameInput.focus();
    }

    if (form) {
        form.addEventListener('submit', (e) => {
            // No prevenimos el envío (e.preventDefault) porque queremos
            // que el formulario se envíe al servidor Flask normalmente.

            // Simplemente cambiamos el botón para feedback visual
            const nombre = usernameInput.value.trim();

            // Validación: Al menos 3 letras
            if(nombre.length < 3) {
                e.preventDefault(); // Detenemos si el nombre es muy corto
                alert("Por favor, escribe un nombre de al menos 3 letras.");
                // Volver a poner el foco para que corrija
                usernameInput.focus();
                return;
            }

            // Deshabilitar botón y cambiar texto para evitar doble envío
            if(btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerText = " Entrando...";
                btnSubmit.style.backgroundColor = "#6c757d"; // Gris
            }
        });
    }
});