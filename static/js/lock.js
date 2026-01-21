/* static/js/lock.js */

document.addEventListener('DOMContentLoaded', () => {
    console.log('🔒 Sistema de seguridad cargado.');

    // Aquí puedes agregar validaciones extra si lo deseas en el futuro
    const form = document.querySelector('form');
    form.addEventListener('submit', (e) => {
        const input = document.querySelector('input[name="password"]');
        if (input.value.trim() === "") {
            e.preventDefault();
            alert("Por favor, escribe la contraseña.");
        }
    });
});