/* static/js/sala_ui.js - REESCRITURA COMPLETA v3 */
/* FIXES:
   1. Cámara VDO.ninja: push/view con stream ID único; SIN cleanoutput en push para tener controles
   2. Sync posición y tamaño en tiempo real para TODOS
   3. Borrador: dos canvas apilados (fondo negro fijo + canvas de dibujo encima) → borrador perfecto
   4. Botones Invitar/Mano/Reacción SOLO en dock, NO en panel de mensajes ni participantes
*/

document.addEventListener('DOMContentLoaded', () => {
    console.log("--> sala_ui.js iniciado.");

    // ============================================================
    // ESTADO INICIAL
    // ============================================================
    const wasHost = sessionStorage.getItem('is_host') === 'true';
    const iamHost = (typeof IS_HOST !== 'undefined' && IS_HOST) || wasHost;
    if (iamHost) sessionStorage.setItem('is_host', 'true');
    else sessionStorage.removeItem('is_host');

    // ============================================================
    // REFERENCIAS DOM
    // ============================================================
    const participantsArea = document.getElementById('avi-participants');
    const whiteboard       = document.getElementById('avi-whiteboard');
    const chatPanel        = document.getElementById('chat-panel');
    const viewChat         = document.getElementById('view-chat-container');
    const viewUsers        = document.getElementById('view-users-container');
    const tabChat          = document.getElementById('tab-chat');
    const tabUsers         = document.getElementById('tab-users');
    const chatInput        = document.getElementById('chat-input');
    const btnSendChat      = document.getElementById('btn-send-chat');
    const chatMessages     = document.getElementById('chat-messages');
    const chatBadge        = document.getElementById('chat-badge');
    const usersList        = document.getElementById('users-list');
    const btnChat          = document.getElementById('btn-chat');
    const btnCloseChat     = document.getElementById('btn-close-chat');
    const btnShare         = document.getElementById('btn-share');
    const btnHand          = document.getElementById('btn-hand');
    const btnReactions     = document.getElementById('btn-reactions');
    const reactionPanel    = document.getElementById('reaction-panel');
    const btnStats         = document.getElementById('btn-stats');
    const statsModal       = document.getElementById('stats-modal');
    const btnCloseStats    = document.getElementById('btn-close-stats');
    const chartCanvas      = document.getElementById('chart-canvas');
    const btnClear         = document.getElementById('btn-clear');
    const btnToggleTools   = document.getElementById('btn-toggle-tools');
    const dockContainer    = document.getElementById('collab-dock');
    const tools            = document.querySelectorAll('#avi-tools button');

    // ============================================================
    // ESTADO DE CANVAS Y DRAG
    // ============================================================
    let wctx         = null;
    let isDrawing    = false;
    let lastPos      = { x: 0, y: 0 };
    let currentMode  = 'move';   // 'move' | 'draw'
    let drawingType  = 'pen';    // 'pen' | 'eraser'

    let isDragging   = false;
    let dragEl       = null;
    let dragOffset   = { x: 0, y: 0 };

    let reactionChart = null;

    // ============================================================
    // SONIDOS
    // ============================================================
    const chatSound = new Audio('https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3');
    const handSound = new Audio('https://media.geeksforgeeks.org/wp-content/uploads/20190531135120/beep.mp3');

    document.body.addEventListener('click', () => {
        handSound.volume = 0;
        handSound.play().then(() => {
            handSound.pause();
            handSound.currentTime = 0;
            handSound.volume = 1;
        }).catch(() => {});
    }, { once: true });

    // ============================================================
    // UTILIDADES
    // ============================================================
    function sanitize(u) {
        return (u || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    }

    window.showToast = function(msg, type = 'info') {
        const c = document.getElementById('toast-container');
        if (!c) return;
        const d = document.createElement('div');
        d.className = `toast ${type}`;
        d.innerHTML = `<span>${msg}</span>`;
        c.appendChild(d);
        setTimeout(() => d.remove(), 3000);
    };

    window.createFloatingEmoji = function(emoji) {
        const d = document.createElement('div');
        d.className = 'floating-emoji';
        d.innerText = emoji;
        Object.assign(d.style, {
            position: 'fixed', left: (Math.random() * 80 + 10) + '%',
            bottom: '0', fontSize: '2rem', zIndex: '9999', transition: 'all 3s'
        });
        document.body.appendChild(d);
        setTimeout(() => { d.style.bottom = '80%'; d.style.opacity = '0'; }, 50);
        setTimeout(() => d.remove(), 3100);
    };

    // ============================================================
    // VDO.NINJA - LÓGICA DE URLs
    // ============================================================
    // Usamos &push=STREAMID y &view=STREAMID para control exacto.
    // STREAMID = sanitize(ROOM_ID) + sanitize(username)
    // Esto garantiza que push y view apunten al mismo stream sin ambigüedad.
    function getStreamId(username) {
        return sanitize(ROOM_ID) + sanitize(username);
    }

    function buildPushUrl(username) {
        const sid = getStreamId(username);
        // push: publica la cámara con un ID único
        // SIN &cleanoutput para que aparezcan los controles nativos (silenciar, cámara, config)
        return `https://vdo.ninja/?push=${sid}&password=false&autostart&label=${encodeURIComponent(username)}`;
    }

    function buildViewUrl(username) {
        const sid = getStreamId(username);
        // view: visualiza el stream con ese mismo ID
        return `https://vdo.ninja/?view=${sid}&password=false&autoplay&cleanoutput&label=${encodeURIComponent(username)}`;
    }

    window.copyVdoLink = function(username) {
        const url = buildPushUrl(username);
        navigator.clipboard.writeText(url)
            .then(() => showToast('Link copiado'))
            .catch(() => prompt('Copia este link:', url));
    };

    // ============================================================
    // GESTIÓN DE CAJAS (PARTICIPANTES)
    // ============================================================
    window.createBox = function(socketId, username, isHost, isMe) {
        // Evitar duplicados
        if (document.getElementById(`participant-${socketId}`)) return;

        // Eliminar caja fantasma con mismo nombre
        document.querySelectorAll('.participant').forEach(box => {
            const lbl = box.querySelector('.label-participant');
            if (lbl && lbl.dataset.username === username) box.remove();
        });

        const div = document.createElement('div');
        div.id        = `participant-${socketId}`;
        div.className = isHost ? 'participant host' : 'participant';
        div.style.cssText = 'left:20px;top:80px;';

        const vdoUrl = isMe ? buildPushUrl(username) : buildViewUrl(username);
        const perms  = 'autoplay; camera; microphone; fullscreen; display-capture; picture-in-picture';

        div.innerHTML = `
            <iframe
                src="${vdoUrl}"
                allow="${perms}"
                allowfullscreen
                style="width:100%;height:100%;border:0;display:block;">
            </iframe>
            <div class="label-participant" data-username="${username}">
                ${isHost ? '👑 ' : ''}${username}
            </div>`;

        // Bloquear iframe durante drag
        div.addEventListener('mousedown', () => {
            div.querySelector('iframe').style.pointerEvents = 'none';
        });
        div.addEventListener('mouseup', () => {
            div.querySelector('iframe').style.pointerEvents = 'auto';
        });

        participantsArea.appendChild(div);
        addDragAndResize(div);
        reorganizeLayout();

        if (viewUsers && !viewUsers.classList.contains('hidden')) {
            updateParticipantsListUI();
        }
    };

    window.createMyBox  = (s, u, h) => createBox(s, u, h, true);
    window.addParticipant = (s, u, h) => createBox(s, u, h, false);

    window.removeParticipant = function(socketId) {
        const el = document.getElementById(`participant-${socketId}`);
        if (el) { el.remove(); reorganizeLayout(); }
        if (viewUsers && !viewUsers.classList.contains('hidden')) updateParticipantsListUI();
    };

    window.loadParticipants = (users) =>
        users.forEach(u => createBox(u.socket_id, u.username, false, false));

    // ============================================================
    // REORGANIZAR LAYOUT (posiciones por defecto al conectarse)
    // ============================================================
    function reorganizeLayout() {
        const all     = Array.from(document.querySelectorAll('.participant'));
        const visible = all.filter(b => b.style.display !== 'none');

        const hostBox    = visible.find(b => b.classList.contains('host'));
        const guestBoxes = visible
            .filter(b => !b.classList.contains('host'))
            .sort((a, b) => {
                const na = a.innerText.toUpperCase();
                const nb = b.innerText.toUpperCase();
                return na < nb ? -1 : na > nb ? 1 : 0;
            });

        const W = 260, H = 150, gX = 20, gY = 20, x0 = 20, y0 = 80, maxCol = 4;
        let cx = x0, cy = y0, col = 0;

        if (hostBox) {
            hostBox.style.left  = `${cx}px`;
            hostBox.style.top   = `${cy}px`;
            hostBox.style.zIndex = 202;
            cx += W + gX;
            col++;
        }

        guestBoxes.forEach(box => {
            if (col >= maxCol) { cx = x0; cy += H + gY; col = 0; }
            box.style.left   = `${cx}px`;
            box.style.top    = `${cy}px`;
            box.style.zIndex = 201;
            cx += W + gX;
            col++;
        });
    }

    function constrainToCanvas(el) {
        if (!participantsArea || !el) return;
        const pr = participantsArea.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        let l = parseInt(el.style.left) || 0;
        let t = parseInt(el.style.top)  || 0;
        const maxL = pr.width  - er.width;
        const maxT = pr.height - er.height;
        el.style.left = `${Math.max(0, Math.min(l, maxL))}px`;
        el.style.top  = `${Math.max(0, Math.min(t, maxT))}px`;
    }

    // ============================================================
    // DRAG Y RESIZE CON SYNC EN TIEMPO REAL
    // ============================================================
    function addDragAndResize(el) {
        // ResizeObserver para detectar cambios de tamaño (handle nativo CSS resize)
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => {
                if (!isDragging || dragEl !== el) {
                    emitBoxState(el);
                }
            });
            ro.observe(el);
        }

        el.addEventListener('mousedown', (e) => {
            if (currentMode !== 'move') return;
            const rect = el.getBoundingClientRect();
            // Zona de resize (esquina inferior derecha 20x20px)
            if (e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20) return;
            isDragging = true;
            dragEl = el;
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
        });

        el.addEventListener('mouseup', () => {
            if (isDragging && dragEl === el) {
                constrainToCanvas(el);
                emitBoxState(el);
            }
        });
    }

    // Enviar estado completo de caja
    function emitBoxState(el) {
        if (typeof socket === 'undefined') return;
        const socketId = el.id.replace('participant-', '');
        socket.emit('box_state', {
            room:      ROOM_ID,
            socket_id: socketId,
            x:         parseInt(el.style.left)  || 0,
            y:         parseInt(el.style.top)   || 0,
            width:     el.offsetWidth  + 'px',
            height:    el.offsetHeight + 'px'
        });
    }

    // Mouse global para drag
    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !dragEl || currentMode !== 'move') return;
        const pr = participantsArea.getBoundingClientRect();
        const ew = dragEl.offsetWidth;
        const eh = dragEl.offsetHeight;
        let nx = e.clientX - pr.left - dragOffset.x;
        let ny = e.clientY - pr.top  - dragOffset.y;
        nx = Math.max(0, Math.min(nx, pr.width  - ew));
        ny = Math.max(0, Math.min(ny, pr.height - eh));
        dragEl.style.left = `${nx}px`;
        dragEl.style.top  = `${ny}px`;
        // Emitir posición en tiempo real
        if (typeof socket !== 'undefined') {
            socket.emit('box_move', {
                room:      ROOM_ID,
                socket_id: dragEl.id.replace('participant-', ''),
                x: nx,
                y: ny
            });
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging && dragEl) {
            constrainToCanvas(dragEl);
            emitBoxState(dragEl);
        }
        isDragging = false;
        dragEl = null;
    });

    // Aplicar estado de caja desde servidor
    function applyBoxState(data) {
        const el = document.getElementById(`participant-${data.socket_id}`);
        if (!el) return;
        if (data.x      !== undefined) el.style.left   = `${data.x}px`;
        if (data.y      !== undefined) el.style.top    = `${data.y}px`;
        if (data.width)                el.style.width  = data.width;
        if (data.height)               el.style.height = data.height;
    }

    // ============================================================
    // WHITEBOARD / CANVAS - DOS CAPAS
    // ============================================================
    // Arquitectura de dos canvas apilados:
    //   1. canvasBG  (z-index inferior): fondo negro sólido, nunca se toca excepto al limpiar
    //   2. whiteboard (z-index superior): donde se dibuja; usa destination-out para borrar
    // Así el borrador revela el negro del fondo → sin residuos de líneas.
    // Ambos canvas están en el mismo contenedor padre de #avi-whiteboard.

    let canvasBG  = null;  // canvas de fondo
    let ctxBG     = null;

    if (whiteboard) {
        // Crear canvas de fondo si no existe ya
        canvasBG = document.getElementById('avi-whiteboard-bg');
        if (!canvasBG) {
            canvasBG = document.createElement('canvas');
            canvasBG.id = 'avi-whiteboard-bg';
            Object.assign(canvasBG.style, {
                position: 'absolute',
                top: '0', left: '0',
                pointerEvents: 'none',
                zIndex: '0'
            });
            whiteboard.parentElement.style.position = 'relative';
            whiteboard.parentElement.insertBefore(canvasBG, whiteboard);
        }
        ctxBG = canvasBG.getContext('2d');

        // El canvas de dibujo encima
        whiteboard.style.position = 'absolute';
        whiteboard.style.top      = '0';
        whiteboard.style.left     = '0';
        whiteboard.style.zIndex   = '1';

        wctx = whiteboard.getContext('2d');
        wctx.lineCap  = 'round';
        wctx.lineJoin = 'round';

        function resizeCanvases() {
            const parent = whiteboard.parentElement;
            const w = parent.clientWidth;
            const h = parent.clientHeight;

            // Fondo negro
            canvasBG.width  = w;
            canvasBG.height = h;
            ctxBG.fillStyle = '#1a1a2e';   // color de fondo de la pizarra
            ctxBG.fillRect(0, 0, w, h);

            // Canvas de dibujo (se resetea, pero eso es aceptable en resize)
            whiteboard.width  = w;
            whiteboard.height = h;
        }

        window.addEventListener('resize', resizeCanvases);
        setTimeout(resizeCanvases, 100);

        function getPos(e) {
            const r = whiteboard.getBoundingClientRect();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        }

        whiteboard.addEventListener('mousedown', e => {
            if (currentMode !== 'draw') return;
            isDrawing = true;
            lastPos = getPos(e);
        });
        whiteboard.addEventListener('mousemove', e => {
            if (!isDrawing) return;
            const pos = getPos(e);
            drawLine(lastPos.x, lastPos.y, pos.x, pos.y, drawingType, true);
            lastPos = pos;
        });
        whiteboard.addEventListener('mouseup',    () => isDrawing = false);
        whiteboard.addEventListener('mouseleave', () => isDrawing = false);

        // Touch
        whiteboard.addEventListener('touchstart', e => {
            if (currentMode !== 'draw') return;
            e.preventDefault();
            isDrawing = true;
            const r = whiteboard.getBoundingClientRect();
            const t = e.touches[0];
            lastPos = { x: t.clientX - r.left, y: t.clientY - r.top };
        }, { passive: false });
        whiteboard.addEventListener('touchmove', e => {
            if (!isDrawing) return;
            e.preventDefault();
            const r = whiteboard.getBoundingClientRect();
            const t = e.touches[0];
            const pos = { x: t.clientX - r.left, y: t.clientY - r.top };
            drawLine(lastPos.x, lastPos.y, pos.x, pos.y, drawingType, true);
            lastPos = pos;
        }, { passive: false });
        whiteboard.addEventListener('touchend', () => isDrawing = false);
    }

    // Función central de dibujo
    // Con dos canvas: pen dibuja en el canvas de trazos, eraser usa destination-out
    // que elimina los píxeles del canvas de trazos → revela el fondo negro → sin residuos
    window.drawLine = function(x0, y0, x1, y1, mode, shouldEmit) {
        if (!wctx) return;
        wctx.beginPath();
        if (mode === 'eraser') {
            // destination-out elimina píxeles del canvas de dibujo,
            // dejando ver el fondo negro del canvasBG → borrador limpio
            wctx.globalCompositeOperation = 'destination-out';
            wctx.lineWidth   = 30;
            wctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            wctx.globalCompositeOperation = 'source-over';
            wctx.lineWidth   = 3;
            wctx.strokeStyle = '#ffffff';
        }
        wctx.moveTo(x0, y0);
        wctx.lineTo(x1, y1);
        wctx.stroke();
        wctx.closePath();

        if (shouldEmit && typeof socket !== 'undefined') {
            socket.emit('draw_stroke', { room: ROOM_ID, x0, y0, x1, y1, mode });
        }
    };

    // Alias para compatibilidad
    window.drawLineOnCanvas = window.drawLine;

    // ============================================================
    // SOCKET EVENTS
    // ============================================================
    if (typeof socket !== 'undefined') {
        // Unirse a la sala
        socket.emit('join_room', { room: ROOM_ID, username: USER_NAME, is_host: iamHost });

        socket.on('joined_as_host',        d => { showToast(d.message, 'success'); createMyBox(socket.id, USER_NAME, true); });
        socket.on('joined_as_participant',  d => { showToast(d.message, 'success'); createMyBox(socket.id, USER_NAME, false); });
        socket.on('host_joined',            d => { showToast(`El Host ${d.username} ha entrado`, 'info'); createBox(d.socket_id, d.username, true, false); });
        socket.on('host_info',              d => createBox(d.socket_id, d.username, true, false));
        socket.on('user_joined',            d => { showToast(d.message, 'info'); createBox(d.socket_id, d.username, false, false); });

        socket.on('room_users', d => {
            d.users.forEach(u => createBox(u.socket_id, u.username, false, false));
            reorganizeLayout();
            updateParticipantsListUI();
        });

        // Estado completo de todas las cajas (al conectarse)
        socket.on('all_box_states', d => {
            Object.entries(d.states || {}).forEach(([sid, state]) => applyBoxState({ socket_id: sid, ...state }));
        });

        // Movimiento en tiempo real
        socket.on('box_move_event', d => {
            if (isDragging && dragEl && dragEl.id === `participant-${d.socket_id}`) return;
            const el = document.getElementById(`participant-${d.socket_id}`);
            if (el) { el.style.left = `${d.x}px`; el.style.top = `${d.y}px`; }
        });

        // Estado completo de caja (tamaño + posición)
        socket.on('box_state_event', d => {
            if (isDragging && dragEl && dragEl.id === `participant-${d.socket_id}`) return;
            applyBoxState(d);
        });

        socket.on('user_left', d => { removeParticipant(d.socket_id); showToast(`${d.username} ha salido.`); });
        socket.on('host_left', d => { removeParticipant(d.socket_id); showToast('Host desconectado.', 'warning'); });

        // Dibujo remoto
        socket.on('draw_stroke', d => drawLine(d.x0, d.y0, d.x1, d.y1, d.mode, false));

        // Limpiar pizarra - llega a TODOS (servidor usa include_self=True)
        socket.on('force_clear_event', () => {
            // Limpiar canvas de trazos
            if (wctx) wctx.clearRect(0, 0, whiteboard.width, whiteboard.height);
            // Repintar fondo negro (se borra con clearRect del canvas de trazos no, pero por seguridad)
            if (ctxBG && canvasBG) {
                ctxBG.fillStyle = '#1a1a2e';
                ctxBG.fillRect(0, 0, canvasBG.width, canvasBG.height);
            }
            showToast('Pizarra limpia');
        });

        socket.on('show_reaction', d => {
            if (d.username !== USER_NAME) createFloatingEmoji(d.emoji);
        });

        socket.on('hand_raised_event', d => {
            handSound.currentTime = 0;
            handSound.play().catch(() => {});
            showToast(`${d.username} levantó la mano`);
        });

        // Visibilidad de cajas
        socket.on('toggle_visibility_event', d => {
            const box = document.getElementById(`participant-${d.target_id}`);
            if (box) { box.style.display = d.visible ? 'flex' : 'none'; reorganizeLayout(); }
            const btn = document.getElementById(`btn-vis-${d.target_id}`);
            if (btn) {
                btn.innerHTML            = d.visible ? '👁️' : '🚫';
                btn.style.background     = d.visible ? '#fff'    : '#ffebee';
                btn.style.color          = d.visible ? '#333'    : '#c62828';
                btn.style.borderColor    = d.visible ? '#ccc'    : '#ef9a9a';
            }
        });

        // Chat
        socket.on('chat_message', d => {
            const isMine = d.username === USER_NAME;
            const div    = document.createElement('div');
            div.className = `message ${isMine ? 'mine' : 'others'}`;
            div.innerHTML = `${!isMine ? `<span class="msg-author">${d.username}</span>` : ''}${d.message}<span class="msg-time">${d.time || ''}</span>`;
            if (chatMessages) { chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight; }
            if (!isMine && (chatPanel.classList.contains('hidden') || (viewUsers && !viewUsers.classList.contains('hidden')))) {
                chatSound.play().catch(() => {});
                showToast(`${d.username}: ${d.message.substring(0, 40)}`);
                if (chatBadge) { chatBadge.innerText = (parseInt(chatBadge.innerText) || 0) + 1; chatBadge.classList.remove('hidden'); }
            }
        });

        // Info de sala (para lista de participantes)
        socket.on('room_info', d => {
            const container = usersList || viewUsers;
            if (!container) return;

            let html = `<div style="padding:12px 15px;border-bottom:1px solid #ddd;font-weight:bold;background:#f8f9fa;position:sticky;top:0;z-index:1;">Conectados (${d.total})</div><ul style="list-style:none;padding:0;margin:0;">`;

            const row = (p, isHostRow) => {
                const uid     = p.socket_id || p.sid;
                const box     = document.getElementById(`participant-${uid}`);
                const hidden  = box && box.style.display === 'none';
                const icon    = isHostRow ? '👑' : '👤';
                const btnIcon = hidden ? '🚫' : '👁️';
                const btnStyle = hidden
                    ? 'background:#ffebee;color:#c62828;border:1px solid #ef9a9a;'
                    : 'background:#fff;color:#333;border:1px solid #ccc;';
                // SOLO botones de visibilidad y link; sin mano/invitar/reacción
                return `<li style="padding:12px 15px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fff;">
                    <div><span style="margin-right:8px;font-size:1.2em;">${icon}</span><b>${p.username}</b></div>
                    <div style="display:flex;gap:5px;">
                        <button id="btn-vis-${uid}"
                            style="${btnStyle}padding:5px 10px;border-radius:4px;cursor:pointer;"
                            onclick="requestToggleVisibility('${uid}')" title="${hidden ? 'Video Oculto' : 'Video Visible'}">${btnIcon}
                        </button>
                        <button style="background:#fff;color:#333;border:1px solid #ccc;padding:5px 10px;border-radius:4px;cursor:pointer;"
                            onclick="copyVdoLink('${p.username}')" title="Copiar Link VDO">🔗
                        </button>
                    </div>
                </li>`;
            };

            if (d.host) html += row(d.host, true);
            d.participants.forEach(p => { if (!d.host || p.socket_id !== d.host.sid) html += row(p, false); });
            html += '</ul>';
            container.innerHTML = html;
        });
    }

    // ============================================================
    // FUNCIONES GLOBALES
    // ============================================================
    window.requestToggleVisibility = function(targetId) {
        const box = document.getElementById(`participant-${targetId}`);
        const isVisible = box && box.style.display !== 'none';
        socket.emit('toggle_visibility', { room: ROOM_ID, target_id: targetId, visible: !isVisible });
    };

    window.updateParticipantsListUI = function() {
        if (typeof socket !== 'undefined') socket.emit('get_room_info', { room: ROOM_ID });
    };

    // ============================================================
    // HERRAMIENTAS
    // ============================================================
    if (tools.length > 0) {
        const skipIds = ['btn-chat','btn-share','btn-hand','btn-reactions','btn-stats','btn-toggle-tools'];
        tools.forEach(b => {
            b.addEventListener('click', () => {
                if (skipIds.includes(b.id)) return;
                tools.forEach(t => t.classList.remove('active'));
                b.classList.add('active');
                if (b.id === 'btn-draw') {
                    currentMode  = 'draw'; drawingType = 'pen';
                    if (whiteboard) { whiteboard.classList.add('drawing-mode'); whiteboard.style.cursor = 'crosshair'; }
                    showToast('Lápiz activado');
                } else if (b.id === 'btn-eraser') {
                    currentMode  = 'draw'; drawingType = 'eraser';
                    if (whiteboard) { whiteboard.classList.add('drawing-mode'); whiteboard.style.cursor = 'cell'; }
                    showToast('Borrador activado');
                } else {
                    currentMode = 'move';
                    if (whiteboard) { whiteboard.classList.remove('drawing-mode'); whiteboard.style.cursor = 'default'; }
                    showToast('Modo Mover');
                }
            });
        });
    }

    // Borrar pizarra: el servidor lo enviará a TODOS (include_self=True)
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (confirm('¿Borrar pizarra para todos?')) {
                socket.emit('clear_board', { room: ROOM_ID });
            }
        });
    }

    // ============================================================
    // BOTONES DEL DOCK (mano, share, reacciones - SOLO aquí, NO en panel)
    // ============================================================
    if (btnHand) {
        btnHand.addEventListener('click', () => {
            btnHand.disabled = true;
            btnHand.style.opacity = '0.5';
            socket.emit('raise_hand', { room: ROOM_ID, username: USER_NAME });
            setTimeout(() => { btnHand.disabled = false; btnHand.style.opacity = '1'; }, 3000);
        });
    }

    if (btnReactions && reactionPanel) {
        btnReactions.addEventListener('click', e => { e.stopPropagation(); reactionPanel.classList.toggle('hidden'); });
        document.addEventListener('click', () => reactionPanel.classList.add('hidden'));
        reactionPanel.addEventListener('click', e => {
            if (e.target.tagName === 'SPAN') {
                e.stopPropagation();
                socket.emit('reaction', { room: ROOM_ID, emoji: e.target.innerText, username: USER_NAME });
                createFloatingEmoji(e.target.innerText);
                reactionPanel.classList.add('hidden');
            }
        });
    }

    if (btnShare) {
        btnShare.addEventListener('click', e => {
            e.preventDefault();
            navigator.clipboard.writeText(`${window.location.origin}/join?room=${ROOM_ID}`)
                .then(() => showToast('Link copiado'));
        });
    }

    // ============================================================
    // CHAT
    // ============================================================
    function switchTab(mode) {
        if (!chatPanel) return;
        chatPanel.classList.remove('hidden');
        if (mode === 'chat') {
            if (viewChat)  viewChat.classList.remove('hidden');
            if (viewUsers) viewUsers.classList.add('hidden');
            if (tabChat)   tabChat.classList.add('active');
            if (tabUsers)  tabUsers.classList.remove('active');
            if (chatBadge) { chatBadge.classList.add('hidden'); chatBadge.innerText = '0'; }
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
            if (chatInput) setTimeout(() => chatInput.focus(), 50);
        } else {
            if (viewChat)  viewChat.classList.add('hidden');
            if (viewUsers) viewUsers.classList.remove('hidden');
            if (tabChat)   tabChat.classList.remove('active');
            if (tabUsers)  tabUsers.classList.add('active');
            setTimeout(updateParticipantsListUI, 100);
        }
    }

    if (tabChat)     tabChat.addEventListener('click',     () => switchTab('chat'));
    if (tabUsers)    tabUsers.addEventListener('click',    () => switchTab('users'));
    if (btnChat)     btnChat.addEventListener('click',     () => { const h = chatPanel.classList.contains('hidden'); chatPanel.classList.toggle('hidden'); if (h) switchTab('chat'); });
    if (btnCloseChat) btnCloseChat.addEventListener('click', e => { e.preventDefault(); chatPanel.classList.add('hidden'); });

    function sendMessage() {
        const text = chatInput ? chatInput.value.trim() : '';
        if (!text) return;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        socket.emit('chat_message', { room: ROOM_ID, username: USER_NAME, message: text, time });
        chatInput.value = '';
        chatInput.focus();
    }

    if (btnSendChat) btnSendChat.addEventListener('click', sendMessage);
    if (chatInput)   chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

    // ============================================================
    // STATS
    // ============================================================
    function processData(l) {
        const c = {};
        (l || []).forEach(e => { const k = e.emoji || 'Acción'; c[k] = (c[k] || 0) + 1; });
        return c;
    }
    function renderChart(d) {
        if (!chartCanvas) return;
        if (reactionChart) reactionChart.destroy();
        reactionChart = new Chart(chartCanvas.getContext('2d'), {
            type: 'bar',
            data: { labels: Object.keys(d), datasets: [{ label: 'Reacciones', data: Object.values(d), backgroundColor: '#36a2eb' }] },
            options: { maintainAspectRatio: false }
        });
    }
    if (btnStats)      btnStats.addEventListener('click',      () => { statsModal.classList.remove('hidden'); fetch(`/summary/${ROOM_ID}`).then(r => r.json()).then(d => renderChart(processData(d))); });
    if (btnCloseStats) btnCloseStats.addEventListener('click', () => statsModal.classList.add('hidden'));

    if (btnToggleTools && dockContainer) {
        btnToggleTools.addEventListener('click', () => dockContainer.classList.toggle('hidden-dock'));
    }
});

function abrirHerramienta(t) { alert('Herramienta: ' + t); }