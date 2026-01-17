/* static/js/sala_ui.js - VERSIÓN FINAL: ALARMA, DIBUJO BLANCO Y CORRECCIONES */

document.addEventListener('DOMContentLoaded', () => {
    console.log("--> sala_ui.js iniciado.");

    // --- REFERENCIAS AL DOM ---
    const participantsArea = document.getElementById('avi-participants');
    const whiteboard = document.getElementById('avi-whiteboard');

    // Herramientas
    const tools = document.querySelectorAll('#avi-tools button');

    // Botones específicos
    const btnShare = document.getElementById('btn-share');
    const btnDraw = document.getElementById('btn-draw');
    const btnEraser = document.getElementById('btn-eraser');
    const btnClear = document.getElementById('btn-clear');

    // Botón Mano
    const btnHand = document.getElementById('btn-hand');

    // Reacciones
    const btnReactions = document.getElementById('btn-reactions');
    const reactionPanel = document.getElementById('reaction-panel');

    // Estadísticas
    const btnStats = document.getElementById('btn-stats');
    const statsModal = document.getElementById('stats-modal');
    const btnCloseStats = document.getElementById('btn-close-stats');
    const chartCanvas = document.getElementById('chart-canvas');
    let reactionChart = null;

    // =======================================================
    // 1. CONFIGURACIÓN DE AUDIO (ALARMA)
    // =======================================================
    // Usamos un sonido de notificación tipo "Ding" confiable
    const handSound = new Audio('https://media.geeksforgeeks.org/wp-content/uploads/20190531135120/beep.mp3');
    handSound.volume = 1.0;

    // TRUCO DE DESBLOQUEO DE AUDIO:
    // Al primer clic en cualquier lugar, cargamos el audio en silencio.
    // Esto evita que el navegador bloquee el sonido cuando llegue la notificación.
    document.body.addEventListener('click', () => {
        if (handSound.paused) {
            handSound.play().then(() => {
                handSound.pause();
                handSound.currentTime = 0;
            }).catch(e => console.log("Audio esperando interacción..."));
        }
    }, { once: true });

    // =======================================================
    // 2. CONFIGURACIÓN DEL CANVAS
    // =======================================================
    let wctx;
    let drawingMode = 'pen'; // 'pen' o 'eraser'

    if (whiteboard) {
        wctx = whiteboard.getContext('2d');
        wctx.lineCap = 'round';
        wctx.lineJoin = 'round';

        const resizeCanvas = () => {
            whiteboard.width = whiteboard.parentElement.clientWidth;
            whiteboard.height = whiteboard.parentElement.clientHeight;
        };
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 100);
    }

    // --- VARIABLES DE ESTADO ---
    let currentMode = 'move';
    let isDragging = false;
    let draggedElement = null;
    let dragOffset = { x: 0, y: 0 };

    let isDrawing = false;
    let lastDrawPos = { x: 0, y: 0 };

    let participantCount = 0;

    // --- UTILIDAD: NOTIFICACIONES TOAST ---
    window.showToast = function(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return alert(message);

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${message}</span>`;

        container.appendChild(toast);
        toast.style.animation = 'slideIn 0.3s ease-out forwards';

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.5s forwards';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    };

    // =======================================================
    // 3. GESTIÓN DE CAJAS (VDO.Ninja)
    // =======================================================

    function sanitizeUsername(username) {
        return username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }

    // Crear caja propia (PUSH)
    window.createMyBox = function(socketId, username, isHost) {
        if (document.getElementById(`participant-${socketId}`)) return;

        console.log(" Creando MI caja:", username);
        const x = 20 + (participantCount * 340);
        const y = 80;
        participantCount++;

        const div = document.createElement('div');
        div.id = `participant-${socketId}`;
        div.className = isHost ? 'participant host' : 'participant';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;

        const vdoId = sanitizeUsername(username);
        const vdoUrl = `https://vdo.ninja/?room=${ROOM_ID}&push=${vdoId}&autostart&label=${username}`;

        div.innerHTML = `
            <iframe src="${vdoUrl}"
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                    style="width: 100%; height: 100%; border: none; pointer-events: auto;">
            </iframe>
            <div class="label-participant">${isHost ? 'HOST ' : ''}${username}</div>
        `;

        participantsArea.appendChild(div);
        showToast(`Te has unido como ${username}`, 'success');
        addDragLogic(div);
    };

    // Crear caja remota (VIEW)
    window.addParticipant = function(socketId, username, isHost = false) {
        if (document.getElementById(`participant-${socketId}`)) return;

        console.log(" Creando caja REMOTA:", username);
        const x = 20 + (participantCount * 340);
        const y = 80;
        participantCount++;

        const div = document.createElement('div');
        div.id = `participant-${socketId}`;
        div.className = isHost ? 'participant host' : 'participant';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;

        const vdoId = sanitizeUsername(username);
        const vdoUrl = `https://vdo.ninja/?room=${ROOM_ID}&view=${vdoId}&scene&autoplay&label=${username}`;

        div.innerHTML = `
            <iframe src="${vdoUrl}"
                    allow="autoplay; fullscreen"
                    style="width: 100%; height: 100%; border: none; pointer-events: auto;">
            </iframe>
            <div class="label-participant">${isHost ? 'HOST ' : ''}${username}</div>
        `;

        participantsArea.appendChild(div);
        showToast(`${username} se ha unido`, 'info');
        addDragLogic(div);
    };

    window.removeParticipant = function(socketId) {
        const element = document.getElementById(`participant-${socketId}`);
        if (element) {
            element.remove();
            participantCount = Math.max(0, participantCount - 1);
        }
    };

    window.loadParticipants = function(users) {
        users.forEach(user => {
            addParticipant(user.socket_id, user.username, false);
        });
    };

    // =======================================================
    // 4. LÓGICA DE ARRASTRE
    // =======================================================
    function addDragLogic(element) {
        element.addEventListener('mousedown', (e) => {
            if (currentMode !== 'move') return;
            isDragging = true;
            draggedElement = element;
            const rect = element.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (isDragging && draggedElement && currentMode === 'move') {
            const parentRect = participantsArea.getBoundingClientRect();
            const elementRect = draggedElement.getBoundingClientRect();

            let newX = e.clientX - parentRect.left - dragOffset.x;
            let newY = e.clientY - parentRect.top - dragOffset.y;

            // Límites
            const maxX = parentRect.width - elementRect.width;
            const maxY = parentRect.height - elementRect.height;
            newX = Math.max(0, Math.min(newX, maxX));
            newY = Math.max(0, Math.min(newY, maxY));

            draggedElement.style.left = `${newX}px`;
            draggedElement.style.top = `${newY}px`;

            // Emitir movimiento
            if (typeof emitMove === 'function') emitMove(draggedElement.id, newX, newY);
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        draggedElement = null;
    });

    // =======================================================
    // 5. HERRAMIENTAS Y BOTONES
    // =======================================================
    if (tools.length > 0) {
        tools.forEach(btn => {
            btn.addEventListener('click', () => {
                // Botones de acción inmediata (no cambian modo)
                if (['btn-share', 'btn-reactions', 'btn-stats', 'btn-clear', 'btn-magic-wand', 'btn-hand'].includes(btn.id)) return;

                // Resetear activos
                tools.forEach(b => {
                    if (!['btn-share', 'btn-reactions', 'btn-stats', 'btn-clear', 'btn-hand'].includes(b.id)) {
                        b.classList.remove('active');
                    }
                });
                btn.classList.add('active');

                // Lógica de Modos
                if (btn.id === 'btn-draw') {
                    currentMode = 'draw';
                    drawingMode = 'pen';
                    if(whiteboard) {
                        whiteboard.classList.add('drawing-mode');
                        whiteboard.style.cursor = 'crosshair';
                    }
                    if(wctx) wctx.globalCompositeOperation = 'source-over';
                    showToast('✏️ Lápiz activado', 'info');

                } else if (btn.id === 'btn-eraser') {
                    currentMode = 'draw';
                    drawingMode = 'eraser';
                    if(whiteboard) {
                        whiteboard.classList.add('drawing-mode');
                        whiteboard.style.cursor = 'cell';
                    }
                    if(wctx) wctx.globalCompositeOperation = 'destination-out';
                    showToast('🧼 Borrador activado', 'info');

                } else if (btn.dataset.mode === 'move') {
                    currentMode = 'move';
                    if(whiteboard) {
                        whiteboard.classList.remove('drawing-mode');
                        whiteboard.style.cursor = 'default';
                    }
                    showToast('✋ Modo Mover', 'info');
                }
            });
        });
    }

    // Botón LIMPIAR
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (confirm('¿Borrar toda la pizarra?')) {
                wctx.clearRect(0, 0, whiteboard.width, whiteboard.height);
                if (typeof socket !== 'undefined') socket.emit('clear_board');
                showToast('🗑️ Pizarra limpia', 'error');
            }
        });
    }

    // BOTÓN LEVANTAR MANO
    if (btnHand) {
        btnHand.addEventListener('click', () => {
            btnHand.disabled = true;
            btnHand.style.opacity = "0.5";

            if (typeof socket !== 'undefined') {
                socket.emit('raise_hand', { room: ROOM_ID, username: USER_NAME });
            }
            setTimeout(() => {
                btnHand.disabled = false;
                btnHand.style.opacity = "1";
            }, 3000);
        });
    }

    // =======================================================
    // 6. EVENTOS DE SOCKETS (ESCUCHA)
    // =======================================================
    if (typeof socket !== 'undefined') {

        // REACCIONES
        socket.on('reaction', (data) => {
            if (data.username !== USER_NAME) {
                createFloatingEmoji(data.emoji);
            }
        });

        // MANO LEVANTADA (ALARMA)
        socket.on('hand_raised_event', (data) => {
            // Reproducir sonido
            handSound.currentTime = 0;
            const playPromise = handSound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => console.warn("Audio bloqueado:", error));
            }

            showToast(`✋ ${data.username} levantó la mano`, 'info');
            highlightParticipant(data.username);
        });
    }

    function highlightParticipant(username) {
        const participants = document.querySelectorAll('.participant');
        participants.forEach(p => {
            if (p.innerText.includes(username)) {
                p.style.transition = "box-shadow 0.3s";
                p.style.boxShadow = "0 0 30px #f1c40f"; // Amarillo
                p.style.borderColor = "#f1c40f";
                setTimeout(() => {
                    p.style.boxShadow = "";
                    p.style.borderColor = "";
                }, 5000);
            }
        });
    }

    // =======================================================
    // 7. LÓGICA DE DIBUJO
    // =======================================================
    if (whiteboard) {
        whiteboard.addEventListener('mousedown', (e) => {
            if (currentMode !== 'draw') return;
            isDrawing = true;
            const rect = whiteboard.getBoundingClientRect();
            lastDrawPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        });

        whiteboard.addEventListener('mousemove', (e) => {
            if (!isDrawing || currentMode !== 'draw') return;
            const rect = whiteboard.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            drawLineOnCanvas(lastDrawPos.x, lastDrawPos.y, x, y, true, drawingMode);
            lastDrawPos = { x, y };
        });

        whiteboard.addEventListener('mouseup', () => isDrawing = false);
        whiteboard.addEventListener('mouseleave', () => isDrawing = false);
    }

    // FUNCIÓN DE DIBUJO (BLANCO)
    window.drawLineOnCanvas = function(x1, y1, x2, y2, emit = false, mode = 'pen') {
        if (!wctx) return;

        wctx.beginPath();

        if (mode === 'eraser') {
            wctx.globalCompositeOperation = 'destination-out';
            wctx.lineWidth = 20;
            wctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
            wctx.globalCompositeOperation = 'source-over';
            wctx.strokeStyle = '#ffffff'; // COLOR BLANCO CORRECTO
            wctx.lineWidth = 3;
        }

        wctx.moveTo(x1, y1);
        wctx.lineTo(x2, y2);
        wctx.stroke();
        wctx.closePath();

        if (emit && typeof emitDraw === 'function') {
            emitDraw(x1, y1, x2, y2, mode);
        }
    };

    window.updateElementPosition = function(id, x, y) {
        if (isDragging && draggedElement && draggedElement.id === id) return;
        const el = document.getElementById(id);
        if (el) {
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        }
    };

    // =======================================================
    // 8. REACCIONES Y ESTADÍSTICAS
    // =======================================================
    if (btnReactions && reactionPanel) {
        btnReactions.addEventListener('click', (e) => {
            e.stopPropagation();
            reactionPanel.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!reactionPanel.contains(e.target) && e.target !== btnReactions) {
                reactionPanel.classList.add('hidden');
            }
        });
        reactionPanel.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                const emoji = e.target.innerText;
                createFloatingEmoji(emoji);
                if (typeof socket !== 'undefined' && socket.connected) {
                    socket.emit("reaction", { room: ROOM_ID, emoji: emoji, username: USER_NAME });
                }
                reactionPanel.classList.add('hidden');
            }
        });
    }

    window.createFloatingEmoji = function(emoji) {
        const el = document.createElement("div");
        el.className = "floating-emoji";
        el.innerText = emoji;
        el.style.position = "fixed";
        el.style.left = (Math.random() * 80 + 10) + '%';
        el.style.bottom = "0px";
        el.style.fontSize = "2rem";
        el.style.zIndex = "9999";
        el.style.transition = "all 3s ease-out";
        el.style.opacity = "1";
        document.body.appendChild(el);
        setTimeout(() => { el.style.bottom = "80%"; el.style.opacity = "0"; }, 50);
        setTimeout(() => el.remove(), 3000);
    };

    if (btnStats) {
        btnStats.addEventListener('click', () => {
            statsModal.classList.remove('hidden');
            loadChartData();
        });
    }
    if (btnCloseStats) {
        btnCloseStats.addEventListener('click', () => {
            statsModal.classList.add('hidden');
        });
    }

    function loadChartData() {
        fetch(`/summary/${ROOM_ID}`)
            .then(res => res.json())
            .then(data => renderChart(processDataForChart(data)))
            .catch(err => console.error("Error cargando stats:", err));
    }

    function processDataForChart(logList) {
        const counts = {};
        if (!logList || !Array.isArray(logList)) return {};
        logList.forEach(entry => {
            const emoji = entry.emoji;
            counts[emoji] = (counts[emoji] || 0) + 1;
        });
        return counts;
    }

    function renderChart(dataCounts) {
        if (!chartCanvas) return;
        const ctx = chartCanvas.getContext('2d');
        if (reactionChart) reactionChart.destroy();
        reactionChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(dataCounts),
                datasets: [{
                    label: 'Reacciones',
                    data: Object.values(dataCounts),
                    backgroundColor: ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0', '#9966ff'],
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    // =======================================================
    // 9. BOTÓN INVITAR (CORREGIDO)
    // =======================================================
    if (btnShare) {
        btnShare.addEventListener('click', (e) => {
            e.preventDefault();
            const baseUrl = window.location.origin;

            // URL CORRECTA HACIA LA INVITACIÓN
            const inviteUrl = `${baseUrl}/join?room=${ROOM_ID}`;

            if (navigator.clipboard) {
                navigator.clipboard.writeText(inviteUrl)
                    .then(() => showToast('🔗 Enlace copiado al portapapeles', 'success'))
                    .catch(() => prompt("Copia el enlace:", inviteUrl));
            } else {
                prompt("Copia el enlace:", inviteUrl);
            }
        });
    }
});