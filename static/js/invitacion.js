document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('joinForm');
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

            if(nombre.length < 3) {
                e.preventDefault(); // Detenemos si el nombre es muy corto
                alert("Por favor, escribe un nombre de al menos 3 letras.");
                return;
            }

            // Deshabilitar botón y cambiar texto para evitar doble envío
            btnSubmit.disabled = true;
            btnSubmit.innerText = " Entrando...";
            btnSubmit.style.backgroundColor = "#6c757d"; // Gris
        });
    }
});