
document.addEventListener('DOMContentLoaded', () => {
    console.log("--> sala_ui.js iniciado.");

    // --- REFERENCIAS AL DOM ---
    const participantsArea = document.getElementById('avi-participants');
    const whiteboard = document.getElementById('avi-whiteboard');
    const tools = document.querySelectorAll('#avi-tools button');
    const btnShare = document.getElementById('btn-share');
    const toast = document.getElementById('toast-notification');

    const btnReactions = document.getElementById('btn-reactions');
    const reactionPanel = document.getElementById('reaction-panel');

    const btnStats = document.getElementById('btn-stats');
    const statsModal = document.getElementById('stats-modal');
    const btnCloseStats = document.getElementById('btn-close-stats');
    const chartCanvas = document.getElementById('chart-canvas');
    let reactionChart = null;

    // --- CONFIGURACIÓN DEL CANVAS ---
    let wctx;
    if (whiteboard) {
        wctx = whiteboard.getContext('2d');
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 100);
    }

    function resizeCanvas() {
        if (!whiteboard) return;
        whiteboard.width = whiteboard.parentElement.clientWidth;
        whiteboard.height = whiteboard.parentElement.clientHeight;
    }

    // --- VARIABLES DE ESTADO ---
    let currentMode = 'move';
    let isDragging = false;
    let draggedElement = null;
    let dragOffset = { x: 0, y: 0 };
    let isDrawing = false;
    let lastDrawPos = { x: 0, y: 0 };
    let participantCount = 0;

    // --- GESTIÓN DE CAJAS DINÁMICAS ---

    /**
     * Generar ID único para VDO.Ninja basado en username
     * Importante: debe ser consistente y alfanumérico
     */
    function sanitizeUsername(username) {
        return username.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }

    /**
     * Crear MI propia caja (cuando me conecto)
     * Uso &push con mi username como ID único
     */
    window.createMyBox = function(socketId, username, isHost) {
        console.log(" Creando MI caja:", username, isHost ? "(HOST)" : "(PARTICIPANTE)");

        const x = 20 + (participantCount * 340);
        const y = 20;
        participantCount++;

        const div = document.createElement('div');
        div.id = `participant-${socketId}`;
        div.className = isHost ? 'participant host' : 'participant';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;

        // Usar username como ID único en VDO.Ninja
        const vdoId = sanitizeUsername(username);

        // TODOS usan &push con su username único
        let vdoUrl;
        if (isHost) {
            vdoUrl = `https://vdo.ninja/?room=${ROOM_ID}&push=${vdoId}&autostart&label=${username}`;
        } else {
            vdoUrl = `https://vdo.ninja/?room=${ROOM_ID}&push=${vdoId}&autostart&label=${username}`;
        }

        div.innerHTML = `
            <iframe src="${vdoUrl}"
                    allow="camera; microphone; fullscreen; display-capture; autoplay"
                    style="width: 100%; height: 100%; border: none;">
            </iframe>
            <div class="label-participant">${isHost ? 'HOST ' : ''}${username}</div>
        `;

        participantsArea.appendChild(div);
    };

    /**
     * Agregar caja de OTRO usuario (para VER su video)
     * Uso &view con su username único
     */
    window.addParticipant = function(socketId, username, isHost = false) {
        // Verificar que no exista ya
        if (document.getElementById(`participant-${socketId}`)) {
            console.log("Caja ya existe:", username);
            return;
        }

        console.log(" Creando caja para VER a:", username, isHost ? "(HOST)" : "(PARTICIPANTE)");

        const x = 20 + (participantCount * 340);
        const y = 20;
        participantCount++;

        const div = document.createElement('div');
        div.id = `participant-${socketId}`;
        div.className = isHost ? 'participant host' : 'participant';
        div.style.left = `${x}px`;
        div.style.top = `${y}px`;

        // Usar username del otro usuario como ID para verlo
        const vdoId = sanitizeUsername(username);

        // Ver el stream del otro usuario usando su username
        const vdoUrl = `https://vdo.ninja/?room=${ROOM_ID}&view=${vdoId}&scene&autoplay&label=${username}`;

        div.innerHTML = `
            <iframe src="${vdoUrl}"
                    allow="autoplay; fullscreen"
                    style="width: 100%; height: 100%; border: none;">
            </iframe>
            <div class="label-participant">${isHost ? 'HOST ' : ''}${username}</div>
        `;

        participantsArea.appendChild(div);
    };

    /**
     * Eliminar caja de usuario
     */
    window.removeParticipant = function(socketId) {
        const element = document.getElementById(`participant-${socketId}`);
        if (element) {
            console.log("️ Eliminando caja:", socketId);
            element.remove();
            participantCount = Math.max(0, participantCount - 1);
        }
    };

    /**
     * Cargar participantes existentes
     */
    window.loadParticipants = function(users) {
        console.log(" Cargando participantes existentes:", users);

        users.forEach(user => {
            addParticipant(user.socket_id, user.username, false);
        });
    };

    // --- HERRAMIENTAS ---
    if (tools.length > 0) {
        tools.forEach(btn => {
            btn.addEventListener('click', () => {
                if (['btn-share', 'btn-reactions', 'btn-stats'].includes(btn.id)) return;

                tools.forEach(b => {
                    if (!['btn-share', 'btn-reactions', 'btn-stats'].includes(b.id)) {
                        b.classList.remove('active');
                    }
                });
                btn.classList.add('active');

                currentMode = btn.dataset.mode;

                if (whiteboard) {
                    whiteboard.classList.remove('drawing-mode');

                    if (currentMode === 'draw') {
                        whiteboard.classList.add('drawing-mode');
                        whiteboard.style.cursor = 'crosshair';
                    } else {
                        whiteboard.style.cursor = 'default';
                    }
                }
            });
        });
    }

    // --- ARRASTRE ---
    if (participantsArea) {
        participantsArea.addEventListener('mousedown', (e) => {
            if (currentMode !== 'move') return;

            const target = e.target.closest('.participant');
            if (!target) return;

            isDragging = true;
            draggedElement = target;

            const rect = target.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging && draggedElement && currentMode === 'move') {
                const parentRect = participantsArea.getBoundingClientRect();
                const elementRect = draggedElement.getBoundingClientRect();

                let newX = e.clientX - parentRect.left - dragOffset.x;
                let newY = e.clientY - parentRect.top - dragOffset.y;

                const maxX = parentRect.width - elementRect.width;
                const maxY = parentRect.height - elementRect.height;

                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));

                draggedElement.style.left = `${newX}px`;
                draggedElement.style.top = `${newY}px`;

                if (typeof emitMove === 'function') {
                    emitMove(draggedElement.id, newX, newY);
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            draggedElement = null;
        });
    }

    // --- DIBUJO ---
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
            drawLineOnCanvas(lastDrawPos.x, lastDrawPos.y, x, y, true);
            lastDrawPos = { x, y };
        });

        whiteboard.addEventListener('mouseup', () => isDrawing = false);
        whiteboard.addEventListener('mouseleave', () => isDrawing = false);
    }

    window.drawLineOnCanvas = function(x1, y1, x2, y2, emit = false) {
        if (!wctx) return;
        wctx.strokeStyle = '#ffffff';
        wctx.lineWidth = 2;
        wctx.lineCap = 'round';
        wctx.beginPath();
        wctx.moveTo(x1, y1);
        wctx.lineTo(x2, y2);
        wctx.stroke();
        if (emit && typeof emitDraw === 'function') emitDraw(x1, y1, x2, y2);
    };

    window.updateElementPosition = function(id, x, y) {
        if (isDragging && draggedElement && draggedElement.id === id) return;

        const el = document.getElementById(id);
        if (el) {
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        }
    };

    // --- REACCIONES (SIMPLIFICADO Y CORREGIDO) ---
    if (btnReactions && reactionPanel) {
        // Toggle panel
        btnReactions.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = reactionPanel.classList.contains('hidden');
            reactionPanel.classList.toggle('hidden');
            console.log("Panel de emojis:", isHidden ? "ABIERTO" : "CERRADO");
        });

        // Cerrar al hacer clic fuera
        document.addEventListener('click', (e) => {
            if (!reactionPanel.contains(e.target) && e.target !== btnReactions) {
                reactionPanel.classList.add('hidden');
            }
        });

        // Click en emojis (delegación de eventos)
        reactionPanel.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                const emoji = e.target.innerText;
                console.log("Emoji seleccionado:", emoji);

                createFloatingEmoji(emoji);

                if (typeof socket !== 'undefined' && socket.connected) {
                    socket.emit("reaction", {
                        room: ROOM_ID,
                        emoji: emoji,
                        username: USER_NAME
                    });
                }

                reactionPanel.classList.add('hidden');
            }
        });
    }

    window.createFloatingEmoji = function(emoji) {
        const el = document.createElement("div");
        el.className = "floating-emoji";
        el.innerText = emoji;
        el.style.left = Math.random() * 80 + 10 + '%';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2800);
    };

    // --- ESTADÍSTICAS ---
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
                    label: 'Cantidad de Reacciones',
                    data: Object.values(dataCounts),
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.6)',
                        'rgba(54, 162, 235, 0.6)',
                        'rgba(255, 206, 86, 0.6)',
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(153, 102, 255, 0.6)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: 'Total de Reacciones en la Sala' }
                }
            }
        });
    }

    // --- BOTÓN INVITAR ---
    if (btnShare) {
        btnShare.addEventListener('click', (e) => {
            e.preventDefault();
            const baseUrl = window.location.origin;
            const inviteUrl = `${baseUrl}/join?room=${ROOM_ID}`;
            copiarAlPortapapeles(inviteUrl);
        });
    }

    function copierToast(msg) {
        if (!toast) return alert(msg);
        toast.innerText = msg;
        toast.style.visibility = "visible";
        setTimeout(() => toast.style.visibility = "hidden", 3000);
    }

    function copiarAlPortapapeles(texto) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(texto)
                .then(() => copierToast("¡Link copiado!"))
                .catch(() => fallbackCopy(texto));
        } else {
            fallbackCopy(texto);
        }
    }

    function fallbackCopy(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
            copierToast("¡Link copiado!");
        } catch (e) {
            prompt("Copia:", text);
        }
        document.body.removeChild(ta);
    }
});