document.addEventListener('DOMContentLoaded', () => {
    console.log("--> sala_ui.js iniciado.");

    // =======================================================
    // 1. REFERENCIAS AL DOM
    // =======================================================
    const participantsArea = document.getElementById('avi-participants');
    const whiteboard = document.getElementById('avi-whiteboard');
    const tools = document.querySelectorAll('#avi-tools button');

    // Botones Herramientas
    const btnDraw = document.getElementById('btn-draw');
    const btnEraser = document.getElementById('btn-eraser');
    const btnClear = document.getElementById('btn-clear');

    // Botones Generales
    const btnShare = document.getElementById('btn-share');
    const btnHand = document.getElementById('btn-hand');
    const btnReactions = document.getElementById('btn-reactions');
    const reactionPanel = document.getElementById('reaction-panel');

    // Stats
    const btnStats = document.getElementById('btn-stats');
    const statsModal = document.getElementById('stats-modal');
    const btnCloseStats = document.getElementById('btn-close-stats');
    const chartCanvas = document.getElementById('chart-canvas');
    let reactionChart = null;

    // Dock
    const btnToggleTools = document.getElementById('btn-toggle-tools');
    const dockContainer = document.getElementById('collab-dock');

    // --- ELEMENTOS DEL CHAT ---
    const chatPanel = document.getElementById('chat-panel');
    const btnChat = document.getElementById('btn-chat');
    const btnCloseChat = document.getElementById('btn-close-chat');
    const viewChat = document.getElementById('view-chat-container');
    const viewUsers = document.getElementById('view-users-container');
    const tabChat = document.getElementById('tab-chat');
    const tabUsers = document.getElementById('tab-users');
    const chatInput = document.getElementById('chat-input');
    const btnSendChat = document.getElementById('btn-send-chat');
    const chatMessages = document.getElementById('chat-messages');
    const chatBadge = document.getElementById('chat-badge');

    // Audio Config
    const chatSound = new Audio('https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3');
    const handSound = new Audio('https://media.geeksforgeeks.org/wp-content/uploads/20190531135120/beep.mp3');

    // Desbloqueo silencioso de audio
    document.body.addEventListener('click', () => {
        if (handSound.paused) {
            handSound.volume = 0; // Silencio
            handSound.play().then(() => {
                handSound.pause();
                handSound.currentTime = 0;
                handSound.volume = 1.0; // Restaurar volumen
            }).catch(()=>{});
        }
    }, { once: true });

    // =======================================================
    // 2. PIZARRA (DIBUJO) - LÓGICA CORREGIDA
    // =======================================================
    let wctx;
    let isDrawing = false;
    let lastDrawPos = { x: 0, y: 0 };
    let currentMode = 'move'; // 'move' o 'draw'
    let drawingType = 'pen';  // 'pen' o 'eraser'

    if (whiteboard) {
        // Inicializar contexto 2D
        wctx = whiteboard.getContext('2d');
        wctx.lineCap = 'round';
        wctx.lineJoin = 'round';

        // Ajustar tamaño del canvas al cargar y al redimensionar
        const resizeCanvas = () => {
            whiteboard.width = whiteboard.parentElement.clientWidth;
            whiteboard.height = whiteboard.parentElement.clientHeight;
        };
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 100); // Pequeño delay para asegurar carga

        // EVENTOS DEL MOUSE PARA DIBUJAR
        whiteboard.addEventListener('mousedown', (e) => {
            if (currentMode !== 'draw') return;
            isDrawing = true;
            const rect = whiteboard.getBoundingClientRect();
            lastDrawPos = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        });

        whiteboard.addEventListener('mousemove', (e) => {
            if (!isDrawing || currentMode !== 'draw') return;

            const rect = whiteboard.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Dibujar localmente
            drawLineOnCanvas(lastDrawPos.x, lastDrawPos.y, x, y, true, drawingType);

            lastDrawPos = { x, y };
        });

        whiteboard.addEventListener('mouseup', () => isDrawing = false);
        whiteboard.addEventListener('mouseleave', () => isDrawing = false);
    }

    // Función Global de Dibujo (Usada por local y sockets)
    window.drawLineOnCanvas = function(x1, y1, x2, y2, emit, type) {
        if (!wctx) return;

        wctx.beginPath();
        if (type === 'eraser') {
            wctx.globalCompositeOperation = 'destination-out';
            wctx.lineWidth = 30; // Borrador más grande
            wctx.strokeStyle = "rgba(0,0,0,1)";
        } else {
            wctx.globalCompositeOperation = 'source-over';
            wctx.strokeStyle = '#ffffff'; // Color del lápiz
            wctx.lineWidth = 3;
        }

        wctx.moveTo(x1, y1);
        wctx.lineTo(x2, y2);
        wctx.stroke();
        wctx.closePath();

        // Emitir si es dibujo local
        if (emit && typeof emitDraw === 'function') {
            emitDraw(x1, y1, x2, y2, type);
        }
    };

    // LOGICA DE LOS BOTONES DE HERRAMIENTAS
    if (tools.length > 0) {
        tools.forEach(btn => {
            btn.addEventListener('click', () => {
                // Ignorar botones que no son herramientas de pizarra/movimiento
                if (['btn-chat', 'btn-share', 'btn-hand', 'btn-reactions', 'btn-stats', 'btn-toggle-tools'].includes(btn.id)) return;

                // Quitar clase active de las otras herramientas
                tools.forEach(t => {
                    if (!['btn-chat', 'btn-toggle-tools'].includes(t.id)) t.classList.remove('active');
                });
                btn.classList.add('active');

                // Configurar modo
                if (btn.id === 'btn-draw') {
                    currentMode = 'draw';
                    drawingType = 'pen';
                    whiteboard.classList.add('drawing-mode'); // ACTIVA POINTER-EVENTS
                    whiteboard.style.cursor = 'crosshair';
                    showToast('✏️ Lápiz Activo');
                }
                else if (btn.id === 'btn-eraser') {
                    currentMode = 'draw';
                    drawingType = 'eraser';
                    whiteboard.classList.add('drawing-mode'); // ACTIVA POINTER-EVENTS
                    whiteboard.style.cursor = 'cell';
                    showToast('🧼 Borrador Activo');
                }
                else if (btn.dataset.mode === 'move') {
                    currentMode = 'move';
                    whiteboard.classList.remove('drawing-mode'); // DESACTIVA POINTER-EVENTS (Para mover cajas)
                    whiteboard.style.cursor = 'default';
                    showToast('🤏 Modo Mover');
                }
            });
        });
    }

    // Botón Limpiar
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (confirm('¿Borrar toda la pizarra?')) {
                if (wctx) wctx.clearRect(0, 0, whiteboard.width, whiteboard.height);
                if (typeof socket !== 'undefined') socket.emit('clear_board', { room: ROOM_ID });
            }
        });
    }
    // Evento socket limpiar
    if (typeof socket !== 'undefined') {
        socket.on('force_clear_event', () => {
            if (wctx) wctx.clearRect(0, 0, whiteboard.width, whiteboard.height);
            showToast('🧹 Pizarra limpia', 'info');
        });
    }

    // =======================================================
    // 3. LOGICA ARRASTRE DE CAJAS (Modo Mover)
    // =======================================================
    let isDraggingBox = false;
    let draggedElement = null;
    let dragOffset = { x: 0, y: 0 };

    function addDragLogic(el) {
        el.addEventListener('mousedown', (e) => {
            if (currentMode !== 'move') return; // Solo mover si estamos en modo mover
            isDraggingBox = true;
            draggedElement = el;
            const rect = el.getBoundingClientRect();
            // Calcular offset relativo al contenedor padre
            const parentRect = participantsArea.getBoundingClientRect();
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
        });
    }

    document.addEventListener('mousemove', (e) => {
        if (isDraggingBox && draggedElement && currentMode === 'move') {
            const parentRect = participantsArea.getBoundingClientRect();
            let newX = e.clientX - parentRect.left - dragOffset.x;
            let newY = e.clientY - parentRect.top - dragOffset.y;

            draggedElement.style.left = `${newX}px`;
            draggedElement.style.top = `${newY}px`;

            if (typeof emitMove === 'function') {
                emitMove(draggedElement.id, newX, newY);
            }
        }
    });

    document.addEventListener('mouseup', () => {
        isDraggingBox = false;
        draggedElement = null;
    });

    window.updateElementPosition = function(id, x, y) {
        // No actualizar si soy yo quien lo está arrastrando en este momento
        if (isDraggingBox && draggedElement && draggedElement.id === id) return;

        const el = document.getElementById(id);
        if (el) {
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
        }
    };

    // =======================================================
    // 4. PESTAÑAS Y CHAT (Separación Correcta)
    // =======================================================
    function switchTab(mode) {
        if (!chatPanel) return;
        chatPanel.classList.remove('hidden');

        if (mode === 'chat') {
            if(viewChat) viewChat.classList.remove('view-hidden');
            if(viewUsers) viewUsers.classList.add('view-hidden');

            if(tabChat) tabChat.classList.add('active');
            if(tabUsers) tabUsers.classList.remove('active');

            if(chatBadge) { chatBadge.classList.add('hidden'); chatBadge.innerText = '0'; }
            scrollToBottom();
            if(chatInput) setTimeout(() => chatInput.focus(), 10);
        } else if (mode === 'users') {
            if(viewChat) viewChat.classList.add('view-hidden');
            if(viewUsers) viewUsers.classList.remove('view-hidden');

            if(tabChat) tabChat.classList.remove('active');
            if(tabUsers) tabUsers.classList.add('active');

            updateParticipantsListUI();
        }
    }

    if (tabChat) tabChat.addEventListener('click', () => switchTab('chat'));
    if (tabUsers) tabUsers.addEventListener('click', () => switchTab('users'));

    if (btnChat) {
        btnChat.addEventListener('click', () => {
            if (chatPanel.classList.contains('hidden')) {
                switchTab('chat');
            } else {
                chatPanel.classList.add('hidden');
            }
        });
    }
    if (btnCloseChat) {
        btnCloseChat.addEventListener('click', (e) => {
            e.preventDefault();
            chatPanel.classList.add('hidden');
        });
    }

    // Enviar Mensaje
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        if (typeof socket !== 'undefined') socket.emit('chat_message', { room: ROOM_ID, username: USER_NAME, message: text});
        chatInput.value = ''; chatInput.focus();
    }
    if (btnSendChat) btnSendChat.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

    // Recibir Mensaje
    if (typeof socket !== '') {
        socket.on('chat_message', (data) => {
            const isMine = data.username === USER_NAME;
            const msgDiv = document.createElement('div');
            msgDiv.className = `message ${isMine ? 'mine' : 'others'}`;
            msgDiv.innerHTML = `<b>${!isMine ? data.username : ''}</b> ${data.message} <span style="font-size:0.7em;float:right"></span>`;

            if (chatMessages) {
                chatMessages.appendChild(msgDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            if (!isMine) {
                const isHidden = chatPanel.classList.contains('hidden');
                const isChatActive = viewChat && !viewChat.classList.contains('view-hidden');

                if (isHidden || !isChatActive) {
                    chatSound.play().catch(()=>{});
                    if (typeof showToast === 'function') showToast(`💬 ${data.username}: ${data.message}`, 'info');
                    if(chatBadge) {
                        let c = parseInt(chatBadge.innerText)||0; chatBadge.innerText = c+1; chatBadge.classList.remove('hidden');
                    }
                }
            }
        });
    }
    function scrollToBottom() { if(chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight; }

    // =======================================================
    // 5. CAJAS VIDEO (Anti-Duplicados)
    // =======================================================
    function sanitizeUsername(u) { return u.replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); }

    window.updateParticipantsListUI = function() {
        if (typeof socket !== 'undefined') socket.emit('get_room_info', { room: ROOM_ID });
    };

    if (typeof socket !== 'undefined') {
        socket.on('room_info', (data) => {
            if (!viewUsers) return;
            let html = `<div style="padding:10px; background:#f0f2f5; font-weight:bold; border-bottom:1px solid #ddd;">👥 Conectados (${data.total})</div><ul style="list-style:none; padding:0; margin:0;">`;
            if (data.host) html += `<li style="padding:10px; border-bottom:1px solid #eee;">👑 <b>${data.host.username}</b></li>`;
            data.participants.forEach(p => {
                if (!data.host || p.socket_id !== data.host.sid) html += `<li style="padding:10px; border-bottom:1px solid #eee;">👤 ${p.username}</li>`;
            });
            html += '</ul>';
            viewUsers.innerHTML = html;
        });
    }

    window.createBox = function(socketId, username, isHost, isMe) {
        if (document.getElementById(`participant-${socketId}`)) return;
        // Eliminar duplicados por nombre
        document.querySelectorAll('.participant').forEach(box => {
            const label = box.querySelector('.label-participant');
            if (label && label.innerText.includes(username)) box.remove();
        });

        const x = 20 + (document.querySelectorAll('.participant').length * 340);
        const div = document.createElement('div');
        div.id = `participant-${socketId}`;
        div.className = isHost ? 'participant host' : 'participant';
        div.style.left = `${x}px`; div.style.top = `80px`;

        const vdoId = sanitizeUsername(username);
        let vdoUrl = isMe
            ? `https://vdo.ninja/?room=${ROOM_ID}&push=${vdoId}&autostart&label=${username}`
            : `https://vdo.ninja/?room=${ROOM_ID}&view=${vdoId}&scene&autoplay&label=${username}`;

        div.innerHTML = `<iframe src="${vdoUrl}" style="width:100%;height:100%;border:0;"></iframe><div class="label-participant">${isHost?'HOST ':''}${username}</div>`;

        // Bloquear iframe al hacer clic para que no robe el foco del drag
        div.addEventListener('mousedown', () => div.querySelector('iframe').style.pointerEvents = 'none');
        div.addEventListener('mouseup', () => div.querySelector('iframe').style.pointerEvents = 'auto');

        participantsArea.appendChild(div);
        addDragLogic(div);

        if(viewUsers && !viewUsers.classList.contains('view-hidden')) updateParticipantsListUI();
    };

    window.createMyBox = (s,u,h) => createBox(s,u,h,true);
    window.addParticipant = (s,u,h) => createBox(s,u,h,false);
    window.removeParticipant = (sid) => {
        const e=document.getElementById(`participant-${sid}`); if(e) e.remove();
        if(viewUsers && !viewUsers.classList.contains('view-hidden')) updateParticipantsListUI();
    };
    window.loadParticipants = (users) => users.forEach(u => createBox(u.socket_id, u.username, false, false));

    // =======================================================
    // 6. ESTADÍSTICAS Y EXTRAS
    // =======================================================
    function processDataForChart(logList) {
        const counts = {};
        if (!logList) return {};
        logList.forEach(e => {
            const key = e.emoji || 'Acción';
            counts[key] = (counts[key] || 0) + 1;
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
                    backgroundColor: '#36a2eb'
                }]
            },
            options: { maintainAspectRatio: false }
        });
    }

    if (btnStats) {
        btnStats.addEventListener('click', () => {
            statsModal.classList.remove('hidden');
            fetch(`/summary/${ROOM_ID}`).then(res => res.json()).then(data => {
                const processed = processDataForChart(data);
                renderChart(processed);
            });
        });
    }
    if (btnCloseStats) btnCloseStats.addEventListener('click', () => statsModal.classList.add('hidden'));

    // Reacciones y Mano
    if (btnHand) {
        btnHand.addEventListener('click', () => {
            btnHand.disabled = true; btnHand.style.opacity="0.5";
            socket.emit('raise_hand', { room: ROOM_ID, username: USER_NAME });
            setTimeout(() => { btnHand.disabled = false; btnHand.style.opacity="1"; }, 3000);
        });
    }
    if (typeof socket !== 'undefined') {
        socket.on('hand_raised_event', (d) => {
            handSound.volume = 1.0; handSound.currentTime = 0; handSound.play().catch(()=>{});
            showToast(`✋ ${d.username} levantó la mano`);
        });
        socket.on('reaction', (d) => { if(d.username !== USER_NAME) createFloatingEmoji(d.emoji); });
    }

    if (btnReactions && reactionPanel) {
        btnReactions.addEventListener('click', (e) => { e.stopPropagation(); reactionPanel.classList.toggle('hidden'); });
        reactionPanel.addEventListener('click', (e) => {
            if (e.target.tagName === 'SPAN') {
                const emoji = e.target.innerText;
                createFloatingEmoji(emoji);
                socket.emit("reaction", { room: ROOM_ID, emoji: emoji, username: USER_NAME });
                reactionPanel.classList.add('hidden');
            }
        });
    }
    window.createFloatingEmoji = function(emoji) {
        const el = document.createElement("div"); el.className = "floating-emoji"; el.innerText = emoji;
        el.style.position="fixed"; el.style.left=(Math.random()*80+10)+'%'; el.style.bottom="0"; el.style.fontSize="2rem"; el.style.zIndex="9999";
        el.style.transition="all 3s ease-out"; document.body.appendChild(el);
        setTimeout(()=>{el.style.bottom="80%"; el.style.opacity="0";},50); setTimeout(()=>el.remove(),3000);
    };

    // Toast
    window.showToast = (msg, type='info') => {
        const c = document.getElementById('toast-container'); if (!c) return;
        const d = document.createElement('div'); d.className = `toast ${type}`; d.innerHTML = `<span>${msg}</span>`;
        c.appendChild(d); setTimeout(() => d.remove(), 3000);
    };

    // Share
    if (btnShare) {
        btnShare.addEventListener('click', (e) => {
            e.preventDefault();
            navigator.clipboard.writeText(`${window.location.origin}/join?room=${ROOM_ID}`)
                .then(() => showToast('Enlace copiado', 'success'));
        });
    }

    // Dock
    if(btnToggleTools && dockContainer) btnToggleTools.addEventListener('click', () => dockContainer.classList.toggle('hidden-dock'));
});

function abrirHerramienta(t) { alert("Herramienta: "+t); }