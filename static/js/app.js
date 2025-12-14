const form = document.getElementById('roomForm');
const linksDiv = document.getElementById('links');
const videoArea = document.getElementById('videoArea');

form.addEventListener('submit', (e) => {
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
      width="1280"
      height="720"
      allow="camera; microphone; fullscreen; display-capture">
    </iframe>
  `;
});
