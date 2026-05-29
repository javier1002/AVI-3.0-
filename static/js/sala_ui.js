/* static/js/sala_ui.js - v11 — WYSIWIS: cualquier usuario puede ocultar/mostrar videos, sincronizado para todos */
document.addEventListener('DOMContentLoaded', () => {

    const wasHost = sessionStorage.getItem('is_host') === 'true';
    const iamHost = (typeof IS_HOST !== 'undefined' && IS_HOST) || wasHost;
    if (iamHost) sessionStorage.setItem('is_host', 'true');
    else sessionStorage.removeItem('is_host');

    // ── Persistencia de cajas ─────────────────────────────────────────────
    function boxKey(u) { return `sala_${ROOM_ID}_box_${(u || '').replace(/[^a-z0-9]/gi, '').toLowerCase()}`; }
    function saveBox(u, patch) {
        try { const k = boxKey(u); localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), ...patch, _ts: Date.now() })); } catch (e) { }
    }
    function loadBox(u) { try { return JSON.parse(localStorage.getItem(boxKey(u)) || 'null'); } catch { return null; } }

    // ── DOM refs ──────────────────────────────────────────────────────────
    const participantsArea = document.getElementById('avi-participants');
    const whiteboard = document.getElementById('avi-whiteboard');
    const chatPanel = document.getElementById('chat-panel');
    const viewChat = document.getElementById('view-chat-container');
    const viewUsers = document.getElementById('view-users-container');
    const tabChat = document.getElementById('tab-chat');
    const tabUsers = document.getElementById('tab-users');
    const chatInput = document.getElementById('chat-input');
    const btnSendChat = document.getElementById('btn-send-chat');
    const chatMessages = document.getElementById('chat-messages');
    const chatBadge = document.getElementById('chat-badge');
    const usersList = document.getElementById('users-list');
    const btnChat = document.getElementById('btn-chat');
    const btnCloseChat = document.getElementById('btn-close-chat');
    const btnShare = document.getElementById('btn-share');
    const btnHand = document.getElementById('btn-hand');
    const btnReactions = document.getElementById('btn-reactions');
    const reactionPanel = document.getElementById('reaction-panel');
    const btnStats = document.getElementById('btn-stats');
    const statsModal = document.getElementById('stats-modal');
    const btnCloseStats = document.getElementById('btn-close-stats');
    const chartCanvas = document.getElementById('chart-canvas');
    const btnClear = document.getElementById('btn-clear');
    const btnToggleTools = document.getElementById('btn-toggle-tools');
    const dockContainer = document.getElementById('collab-dock');
    const tools = document.querySelectorAll('#avi-tools button');
    const btnBg = document.getElementById('btn-bg');
    const btnToggleVideosBtn = document.getElementById('btn-toggle-videos');

    // ── Estado ────────────────────────────────────────────────────────────
    let wctx = null, canvasBG = null, ctxBG = null;
    let isDrawing = false, lastPos = { x: 0, y: 0 };
    let currentMode = 'move', drawingType = 'pen';
    let isDragging = false, dragEl = null, dragOffset = { x: 0, y: 0 };
    let lastMoveEmit = 0;
    const MOVE_THROTTLE = 32;
    const CANVAS_BG = '#1a1a2e';
    let reactionChart = null;
    let mySocketId = null;
    let myVideoHidden = false;
    let videosHidden = false;

    // ── Sonidos ───────────────────────────────────────────────────────────
    const chatSound = new Audio('https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3');
    const handSound = new Audio('https://media.geeksforgeeks.org/wp-content/uploads/20190531135120/beep.mp3');
    document.body.addEventListener('click', () => {
        handSound.volume = 0; handSound.play().then(() => { handSound.pause(); handSound.currentTime = 0; handSound.volume = 1; }).catch(() => { });
    }, { once: true });

    // ── Utils ─────────────────────────────────────────────────────────────
    function san(u) { return (u || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase(); }

    window.showToast = function (msg, type = 'info') {
        const c = document.getElementById('toast-container'); if (!c) return;
        const d = document.createElement('div'); d.className = `toast ${type}`;
        d.innerHTML = `<span>${msg}</span>`; c.appendChild(d);
        setTimeout(() => d.remove(), 3000);
    };
    window.createFloatingEmoji = function (emoji) {
        const d = document.createElement('div');
        Object.assign(d.style, {
            position: 'fixed', left: (Math.random() * 80 + 10) + '%', bottom: '0',
            fontSize: '2.5rem', zIndex: '9999', pointerEvents: 'none',
            transition: 'bottom 2.5s ease-out, opacity 1s ease-in 1.5s'
        });
        d.innerText = emoji; document.body.appendChild(d);
        setTimeout(() => { d.style.bottom = '80%'; d.style.opacity = '0'; }, 50);
        setTimeout(() => d.remove(), 3000);
    };

    // ── VDO URLs ──────────────────────────────────────────────────────────
    function streamId(u) { return san(ROOM_ID) + san(u); }
    function pushUrl(u) { return `https://vdo.ninja/?push=${streamId(u)}&password=false&autostart&label=${encodeURIComponent(u)}`; }
    function viewUrl(u) { return `https://vdo.ninja/?view=${streamId(u)}&password=false&autoplay&cleanoutput&label=${encodeURIComponent(u)}`; }

    window.copyVdoLink = function (username) {
        const url = viewUrl(username);
        navigator.clipboard.writeText(url).then(() => showToast(`Link copiado para ${username}`)).catch(() => prompt('Link:', url));
    };

    window.emitBgChange = function (socketId, color) {
        if (typeof socket !== 'undefined')
            socket.emit('change_bg', { room: ROOM_ID, socket_id: socketId, color });
    };

    // FIX: requestToggleVisibility usa style.display consistente
    window.requestToggleVisibility = function (targetId) {
        const box = document.getElementById(`participant-${targetId}`);
        const isVisible = box && box.style.display !== 'none';
        socket.emit('toggle_visibility', { room: ROOM_ID, target_id: targetId, include_self: true });
    };
    window.updateParticipantsListUI = function () {
        if (typeof socket !== 'undefined') socket.emit('get_room_info', { room: ROOM_ID });
    };

    window.toggleMyVideo = function () {
        myVideoHidden = !myVideoHidden;
        const myBox = mySocketId ? document.getElementById(`participant-${mySocketId}`) : null;
        if (myBox) myBox.style.display = myVideoHidden ? 'none' : '';
        showToast(myVideoHidden ? 'Tu video está oculto ' : 'Tu video es visible ', myVideoHidden ? 'info' : 'success');
        updateParticipantsListUI();
    };

    // FIX: toggleLocalBox usa style.display directo, sin mezclar con classList
    window.toggleLocalBox = function (uid) {
        const box = document.getElementById(`participant-${uid}`);
        if (!box) return;
        const isVisible = box.style.display !== 'none';
        socket.emit('toggle_visibility', {
            room: ROOM_ID,
            target_id: uid,
            visible: !isVisible
        });
    };

    // ── Helper: cargar BgSegModule ────────────────────────────────────────
    function loadBgSegModule(cb) {
        if (window.BgSegModule) { cb(); return; }
        const s = document.createElement('script');
        s.src = '/static/js/bg_segmentation.js';
        s.onload = () => { if (window.BgSegModule) cb(); };
        document.head.appendChild(s);
    }

    function destroyBgSeg(socketId) {
        try {
            if (window.BgSegModule && typeof window.BgSegModule.destroy === 'function') {
                window.BgSegModule.destroy(socketId);
            }
        } catch (e) {
            console.warn('[BgSeg] destroy error:', e);
        }
    }

    function destroyAllBgSeg() {
        try {
            if (window.BgSegModule && typeof window.BgSegModule.destroyAll === 'function') {
                window.BgSegModule.destroyAll();
            } else if (window.BgSegModule && typeof window.BgSegModule.destroy === 'function') {
                document.querySelectorAll('.participant').forEach(b => {
                    const sid = b.id.replace('participant-', '');
                    window.BgSegModule.destroy(sid);
                });
            }
        } catch (e) {
            console.warn('[BgSeg] destroyAll error:', e);
        }
    }

    // ── CREAR CAJA DE PARTICIPANTE ────────────────────────────────────────
    window.createBox = function (socketId, username, isHost, isMe) {
        if (document.getElementById(`participant-${socketId}`)) return;

        document.querySelectorAll('.participant').forEach(b => {
            const lbl = b.querySelector('.label-participant');
            if (lbl && lbl.dataset.username === username) {
                destroyBgSeg(b.id.replace('participant-', ''));
                b.remove();
            }
        });

        const div = document.createElement('div');
        div.id = `participant-${socketId}`;
        div.className = isHost ? 'participant host' : 'participant';
        div.dataset.username = username;
        div.dataset.mirror = 'false';
        div.dataset.bgSeg = 'off';
        div.style.cssText = 'left:20px;top:80px;';

        if (isMe) mySocketId = socketId;

        const url = isMe ? pushUrl(username) : viewUrl(username);
        const perms = 'autoplay; camera; microphone; fullscreen; display-capture; picture-in-picture';
        const mirrorBtn = isMe
            ? `<button onclick="toggleMirror('${socketId}')" class="btn-mirror-box" title="Espejo"
                style="float:right;background:transparent;border:none;cursor:pointer;
                       font-size:0.9em;opacity:0.6;padding:0 3px;margin-left:4px;">↔️</button>`
            : '';

        div.innerHTML = `
            <div class="box-video-wrap" style="position:relative;width:100%;height:calc(100% - 28px);overflow:hidden;">
                <iframe class="box-iframe" src="${url}" allow="${perms}" allowfullscreen
                    style="width:100%;height:100%;border:0;display:block;"></iframe>
            </div>
            <div class="label-participant" data-username="${username}">
                ${isHost ? '👑 ' : ''}${username}${mirrorBtn}
            </div>`;

        div.addEventListener('mousedown', () => { const f = div.querySelector('iframe'); if (f) f.style.pointerEvents = 'none'; });
        div.addEventListener('mouseup', () => { const f = div.querySelector('iframe'); if (f) f.style.pointerEvents = 'auto'; });
        participantsArea.appendChild(div);
        addDragAndResize(div);

        if (isMe) {
            loadBgSegModule(() => {
                window.BgSegModule.attach(div, socketId, username);
                document.querySelectorAll('.participant[data-pending-viewer]').forEach(el => {
                    const pSid = el.dataset.pendingViewer;
                    el.removeAttribute('data-pending-viewer');
                    window.BgSegModule.setupViewer(el, pSid);
                });
                document.querySelectorAll('.participant').forEach(el => {
                    if (el.id === `participant-${socketId}`) return;
                    const pSid = el.id.replace('participant-', '');
                    window.BgSegModule.setupViewer(el, pSid);
                });
            });
        } else {
            loadBgSegModule(() => {
                const el = document.getElementById(`participant-${socketId}`);
                if (!el) return;
                window.BgSegModule.setupViewer(el, socketId);
            });
        }

        const saved = loadBox(username);
        if (saved) {
            if (saved.x != null) div.style.left = `${saved.x}px`;
            if (saved.y != null) div.style.top = `${saved.y}px`;
            if (saved.w) div.style.width = saved.w;
            if (saved.h) div.style.height = saved.h;
            if (saved.mirror) applyMirror(socketId, true, false);
        } else { reorganizeLayout(); }

        if (viewUsers && !viewUsers.classList.contains('hidden')) updateParticipantsListUI();
    };

    window.createMyBox = (s, u, h) => createBox(s, u, h, true);
    window.addParticipant = (s, u, h) => createBox(s, u, h, false);
    window.loadParticipants = (users) => users.forEach(u => createBox(u.socket_id, u.username, false, false));

    window.removeParticipant = function (socketId) {
        destroyBgSeg(socketId);
        const el = document.getElementById(`participant-${socketId}`);
        if (el) { el.remove(); reorganizeLayout(); }
        if (viewUsers && !viewUsers.classList.contains('hidden')) updateParticipantsListUI();
    };

    // ── Espejo ────────────────────────────────────────────────────────────
    window.toggleMirror = function (socketId) {
        const el = document.getElementById(`participant-${socketId}`); if (!el) return;
        applyMirror(socketId, el.dataset.mirror !== 'true', true);
    };
    function applyMirror(socketId, active, persist) {
        const el = document.getElementById(`participant-${socketId}`); if (!el) return;
        const iframe = el.querySelector('iframe');
        if (iframe) iframe.style.transform = active ? 'scaleX(-1)' : 'none';
        el.dataset.mirror = active ? 'true' : 'false';
        const btn = el.querySelector('.btn-mirror-box');
        if (btn) btn.style.opacity = active ? '1' : '0.6';
        if (persist) saveBox(el.dataset.username, { mirror: active });
    }

    // ── Layout ────────────────────────────────────────────────────────────
    // FIX: reorganizeLayout usa style.display consistentemente
    function reorganizeLayout() {
        const visible = Array.from(document.querySelectorAll('.participant')).filter(b => b.style.display !== 'none');
        const hostBox = visible.find(b => b.classList.contains('host'));
        const guests = visible.filter(b => !b.classList.contains('host'))
            .sort((a, b) => a.innerText.toUpperCase() < b.innerText.toUpperCase() ? -1 : 1);
        const W = 260, H = 180, gX = 20, gY = 20, x0 = 20, y0 = 80, maxCol = 4;
        let cx = x0, cy = y0, col = 0;
        if (hostBox) { hostBox.style.left = `${cx}px`; hostBox.style.top = `${cy}px`; hostBox.style.zIndex = 202; cx += W + gX; col++; }
        guests.forEach(b => {
            if (col >= maxCol) { cx = x0; cy += H + gY; col = 0; }
            b.style.left = `${cx}px`; b.style.top = `${cy}px`; b.style.zIndex = 201; cx += W + gX; col++;
        });
    }
    function constrainToCanvas(el) {
        if (!participantsArea || !el) return;
        const pr = participantsArea.getBoundingClientRect(), er = el.getBoundingClientRect();
        el.style.left = `${Math.max(0, Math.min(parseInt(el.style.left) || 0, pr.width - er.width))}px`;
        el.style.top = `${Math.max(0, Math.min(parseInt(el.style.top) || 0, pr.height - er.height))}px`;
    }

    // ── Drag y resize ─────────────────────────────────────────────────────
    function addDragAndResize(el) {
        if (window.ResizeObserver) {
            let t = null;
            const ro = new ResizeObserver(() => {
                if (isDragging && dragEl === el) return;
                clearTimeout(t); t = setTimeout(() => {
                    emitBoxState(el);
                    saveBox(el.dataset.username, { w: el.style.width || el.offsetWidth + 'px', h: el.style.height || el.offsetHeight + 'px' });
                }, 150);
            });
            ro.observe(el);
        }
        el.addEventListener('mousedown', e => {
            if (currentMode !== 'move') return;
            const r = el.getBoundingClientRect();
            if (e.clientX > r.right - 20 && e.clientY > r.bottom - 20) return;
            isDragging = true; dragEl = el;
            dragOffset.x = e.clientX - r.left; dragOffset.y = e.clientY - r.top;
        });
        el.addEventListener('mouseup', () => {
            if (isDragging && dragEl === el) {
                constrainToCanvas(el); emitBoxState(el);
                saveBox(el.dataset.username, { x: parseInt(el.style.left) || 0, y: parseInt(el.style.top) || 0 });
            }
        });
    }
    function emitBoxState(el) {
        if (typeof socket === 'undefined') return;
        socket.emit('box_state', {
            room: ROOM_ID, socket_id: el.id.replace('participant-', ''),
            x: parseInt(el.style.left) || 0, y: parseInt(el.style.top) || 0,
            width: el.style.width || el.offsetWidth + 'px', height: el.style.height || el.offsetHeight + 'px'
        });
    }
    document.addEventListener('mousemove', e => {
        if (!isDragging || !dragEl || currentMode !== 'move') return;
        const pr = participantsArea.getBoundingClientRect();
        const nx = Math.max(0, Math.min(e.clientX - pr.left - dragOffset.x, pr.width - dragEl.offsetWidth));
        const ny = Math.max(0, Math.min(e.clientY - pr.top - dragOffset.y, pr.height - dragEl.offsetHeight));
        dragEl.style.left = `${nx}px`; dragEl.style.top = `${ny}px`;
        const now = Date.now();
        if (now - lastMoveEmit >= MOVE_THROTTLE && typeof socket !== 'undefined') {
            lastMoveEmit = now;
            socket.emit('box_move', { room: ROOM_ID, socket_id: dragEl.id.replace('participant-', ''), x: nx, y: ny });
        }
    });
    document.addEventListener('mouseup', () => {
        if (isDragging && dragEl) { constrainToCanvas(dragEl); emitBoxState(dragEl); saveBox(dragEl.dataset.username, { x: parseInt(dragEl.style.left) || 0, y: parseInt(dragEl.style.top) || 0 }); }
        isDragging = false; dragEl = null;
    });
    function applyBoxState(d) {
        const el = document.getElementById(`participant-${d.socket_id}`); if (!el) return;
        if (d.x != null) el.style.left = `${d.x}px`;
        if (d.y != null) el.style.top = `${d.y}px`;
        if (d.width) el.style.width = d.width;
        if (d.height) el.style.height = d.height;
    }

    // ── Whiteboard ────────────────────────────────────────────────────────
    if (whiteboard) {
        canvasBG = document.getElementById('avi-whiteboard-bg');
        if (!canvasBG) {
            canvasBG = document.createElement('canvas'); canvasBG.id = 'avi-whiteboard-bg';
            Object.assign(canvasBG.style, {
                position: 'absolute', top: '0', left: '0',
                pointerEvents: 'none', zIndex: '0'
            });
            whiteboard.parentElement.style.position = 'relative';
            whiteboard.parentElement.insertBefore(canvasBG, whiteboard);
        }
        ctxBG = canvasBG.getContext('2d', { willReadFrequently: true });

        whiteboard.classList.add('whiteboard-layer');
        wctx = whiteboard.getContext('2d', { willReadFrequently: true });
        wctx.lineCap = 'round'; wctx.lineJoin = 'round';

        function resizeCanvases() {
            const p = whiteboard.parentElement, w = p.clientWidth, h = p.clientHeight;

            let imgData = null;
            if (whiteboard.width > 0 && whiteboard.height > 0) {
                try { imgData = wctx.getImageData(0, 0, whiteboard.width, whiteboard.height); } catch (e) { }
            }

            canvasBG.width = w; canvasBG.height = h;
            ctxBG.fillStyle = CANVAS_BG; ctxBG.fillRect(0, 0, w, h);

            whiteboard.width = w; whiteboard.height = h;
            if (imgData) try { wctx.putImageData(imgData, 0, 0); } catch (e) { }
        }
        window.addEventListener('resize', resizeCanvases);
        setTimeout(resizeCanvases, 100);

        function gp(e) { const r = whiteboard.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
        whiteboard.addEventListener('mousedown', e => { if (currentMode !== 'draw') return; isDrawing = true; lastPos = gp(e); });
        whiteboard.addEventListener('mousemove', e => { if (!isDrawing) return; const p = gp(e); drawLine(lastPos.x, lastPos.y, p.x, p.y, drawingType, true); lastPos = p; });
        whiteboard.addEventListener('mouseup', () => isDrawing = false);
        whiteboard.addEventListener('mouseleave', () => isDrawing = false);
        whiteboard.addEventListener('touchstart', e => { if (currentMode !== 'draw') return; e.preventDefault(); isDrawing = true; const r = whiteboard.getBoundingClientRect(), t = e.touches[0]; lastPos = { x: t.clientX - r.left, y: t.clientY - r.top }; }, { passive: false });
        whiteboard.addEventListener('touchmove', e => { if (!isDrawing) return; e.preventDefault(); const r = whiteboard.getBoundingClientRect(), t = e.touches[0], p = { x: t.clientX - r.left, y: t.clientY - r.top }; drawLine(lastPos.x, lastPos.y, p.x, p.y, drawingType, true); lastPos = p; }, { passive: false });
        whiteboard.addEventListener('touchend', () => isDrawing = false);
    }

    window.drawLine = function (x0, y0, x1, y1, mode, shouldEmit) {
        if (!wctx) return;

        if (mode === 'eraser') {
            const r = 30;
            wctx.save();
            wctx.globalCompositeOperation = 'destination-out';
            wctx.lineCap = 'round';
            wctx.lineJoin = 'round';
            wctx.lineWidth = r * 2;
            wctx.strokeStyle = 'rgba(0,0,0,1)';
            wctx.beginPath();
            wctx.moveTo(x0, y0);
            wctx.lineTo(x1, y1);
            wctx.stroke();
            const pad = 2;
            const bx = Math.min(x0, x1) - r - pad;
            const by = Math.min(y0, y1) - r - pad;
            const bw = Math.abs(x1 - x0) + (r + pad) * 2;
            const bh = Math.abs(y1 - y0) + (r + pad) * 2;
            wctx.clearRect(bx, by, bw, bh);
            wctx.restore();
        } else {
            wctx.globalCompositeOperation = 'source-over';
            wctx.lineWidth = 3;
            wctx.strokeStyle = '#ffffff';
            wctx.beginPath();
            wctx.moveTo(x0, y0); wctx.lineTo(x1, y1); wctx.stroke(); wctx.closePath();
            wctx.globalCompositeOperation = 'source-over';
        }

        if (shouldEmit && typeof socket !== 'undefined')
            socket.emit('draw_stroke', { room: ROOM_ID, x0, y0, x1, y1, mode });
    };
    window.drawLineOnCanvas = window.drawLine;

    window.setWhiteboardBgVisible = function (visible) {
        if (!canvasBG) return;
        if (visible) canvasBG.classList.remove('hidden-el'); else canvasBG.classList.add('hidden-el');
    };

    // ══════════════════════════════════════════════════════════════════════
    // SALAS EN GRUPO
    // ══════════════════════════════════════════════════════════════════════
    let _groupParticipants = [];

    function buildGroupModal() {
        if (document.getElementById('group-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'group-modal';
        modal.className = 'modal-backdrop';
        modal.innerHTML = `
        <div style="
            background: #ffffff;
            border-radius: 16px;
            padding: 28px 32px;
            width: 580px;
            max-width: 95vw;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 24px 60px rgba(0,0,0,0.5);
            font-family: 'Segoe UI', sans-serif;
        ">
            <!-- Encabezado -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 style="margin:0;color:#1a1a2e;font-size:20px;font-weight:700;">🏫 Dividir en grupos</h3>
                <button id="group-modal-close" style="
                    background:#f0f0f5;border:none;color:#555;width:34px;height:34px;
                    border-radius:50%;cursor:pointer;font-size:16px;line-height:34px;
                    display:flex;align-items:center;justify-content:center;
                ">✕</button>
            </div>

            <!-- Nombres de salas -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
                <div>
                    <label style="color:#666;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Nombre Sala A</label>
                    <input id="group-name-a" value="Grupo A" style="
                        width:100%;margin-top:5px;padding:9px 12px;
                        background:#f7f8fc;border:1.5px solid #d0d5e8;
                        border-radius:9px;color:#1a1a2e;font-size:13px;
                        box-sizing:border-box;outline:none;
                    ">
                </div>
                <div>
                    <label style="color:#666;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Nombre Sala B</label>
                    <input id="group-name-b" value="Grupo B" style="
                        width:100%;margin-top:5px;padding:9px 12px;
                        background:#f7f8fc;border:1.5px solid #d0d5e8;
                        border-radius:9px;color:#1a1a2e;font-size:13px;
                        box-sizing:border-box;outline:none;
                    ">
                </div>
            </div>

            <p style="color:#777;font-size:12px;margin:0 0 14px;">
                Haz clic en cada participante para asignarlo (A → B → Sin asignar).
            </p>

            <!-- Lista de participantes -->
            <div id="group-participants-list" style="
                display:flex;flex-wrap:wrap;gap:10px;min-height:70px;
                background:#f7f8fc;border:1.5px solid #e0e4f0;
                border-radius:12px;padding:14px;margin-bottom:16px;
            ">
                <p style="color:#aaa;font-size:13px;margin:auto;">Cargando participantes...</p>
            </div>

            <!-- Leyenda -->
            <div style="display:flex;gap:18px;margin-bottom:20px;font-size:12px;color:#555;">
                <span style="display:flex;align-items:center;gap:5px;">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#4a90d9;"></span>Sala A
                </span>
                <span style="display:flex;align-items:center;gap:5px;">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#e25555;"></span>Sala B
                </span>
                <span style="display:flex;align-items:center;gap:5px;">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ccc;"></span>Sin asignar
                </span>
            </div>

            <!-- Botones -->
            <div style="display:flex;gap:10px;justify-content:flex-end;">
                <button id="group-auto-btn" style="
                    padding:10px 20px;border-radius:10px;
                    border:1.5px solid #c0c8e0;background:#f0f2fb;
                    color:#333;cursor:pointer;font-size:13px;font-weight:600;
                ">⚡ Dividir automático</button>
                <button id="group-send-btn" style="
                    padding:10px 22px;border-radius:10px;border:none;
                    background:linear-gradient(135deg,#4a90d9,#7c4fd4);
                    color:#fff;cursor:pointer;font-size:13px;font-weight:700;
                ">📤 Enviar a grupos</button>
            </div>
        </div>`;

        document.body.appendChild(modal);

        // Estilos infalibles directamente en el elemento (no depende de clases CSS externas)
        Object.assign(modal.style, {
            display: 'none',
            position: 'fixed',
            inset: '0',
            top: '0', left: '0', right: '0', bottom: '0',
            zIndex: '99999',
            background: 'rgba(0,0,0,0.80)',
            backdropFilter: 'blur(6px)',
            alignItems: 'center',
            justifyContent: 'center'
        });

        document.getElementById('group-modal-close').addEventListener('click', closeGroupModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeGroupModal(); });
        document.getElementById('group-auto-btn').addEventListener('click', autoAssign);
        document.getElementById('group-send-btn').addEventListener('click', sendToGroups);
    }

    function openGroupModal() {
        buildGroupModal();
        const modal = document.getElementById('group-modal');
        modal.style.display = 'flex';
        renderGroupParticipants();
    }

    function closeGroupModal() {
        const modal = document.getElementById('group-modal');
        if (modal) modal.style.display = 'none';
    }

    function renderGroupParticipants() {
        const container = document.getElementById('group-participants-list');
        if (!container) return;
        container.innerHTML = '';

        const allBoxes = Array.from(document.querySelectorAll('#avi-participants .participant'))
            .filter(b => b.style.display !== 'none');

        if (allBoxes.length === 0) {
            container.innerHTML = '<p style="color:#aaa;font-size:13px;margin:auto;">No hay participantes en la sala.</p>';
            return;
        }

        _groupParticipants = allBoxes.map(b => ({
            socket_id: b.id.replace('participant-', ''),
            username: b.dataset.username || b.id.replace('participant-', ''),
            isHost: b.classList.contains('host'),
            group: b.dataset.groupAssign || 'none'
        }));

        const groupLabel = { none: '⬜ Sin asignar', a: '🔵 Sala A', b: '🔴 Sala B' };

        _groupParticipants.forEach(p => {
            const chip = document.createElement('div');
            chip.id = `gchip-${p.socket_id}`;
            updateChipStyle(chip, p.group);
            chip.title = `Clic para cambiar grupo de ${p.username}`;
            chip.innerHTML = `
                <span style="font-size:14px;">${p.isHost ? '👑' : '👤'}</span>
                <span>${p.username}</span>
                <span style="font-size:10px;opacity:0.7;" id="gchip-label-${p.socket_id}">${groupLabel[p.group]}</span>
            `;
            chip.addEventListener('click', () => {
                const next = p.group === 'none' ? 'a' : p.group === 'a' ? 'b' : 'none';
                p.group = next;
                const box = document.getElementById(`participant-${p.socket_id}`);
                if (box) box.dataset.groupAssign = next;
                updateChipStyle(chip, next);
                const lbl = document.getElementById(`gchip-label-${p.socket_id}`);
                if (lbl) lbl.textContent = groupLabel[next];
            });
            container.appendChild(chip);
        });
    }

    function updateChipStyle(chip, group) {
        const styles = {
            none: 'background:#eef0f8;color:#666;border:1.5px solid #d0d5e8;',
            a:    'background:#ddeeff;color:#1a6ab5;border:1.5px solid #90bce8;',
            b:    'background:#ffeaea;color:#b51a1a;border:1.5px solid #e89090;',
        };
        chip.className = 'group-chip';
        chip.style.cssText = `padding:8px 14px;border-radius:24px;cursor:pointer;
            font-size:13px;font-weight:600;user-select:none;
            transition:background 0.18s,transform 0.1s;
            display:flex;align-items:center;gap:6px;
            ${styles[group || 'none']}`;
    }

    function autoAssign() {
        const groupLabel = { none: '⬜ Sin asignar', a: '🔵 Sala A', b: '🔴 Sala B' };
        let idx = 0;
        _groupParticipants.forEach(p => {
            if (p.isHost) { p.group = 'none'; return; }
            p.group = idx % 2 === 0 ? 'a' : 'b';
            idx++;
            const box = document.getElementById(`participant-${p.socket_id}`);
            if (box) box.dataset.groupAssign = p.group;
            const chip = document.getElementById(`gchip-${p.socket_id}`);
            if (chip) updateChipStyle(chip, p.group);
            const lbl = document.getElementById(`gchip-label-${p.socket_id}`);
            if (lbl) lbl.textContent = groupLabel[p.group];
        });
    }

    function sendToGroups() {
        const nameA = document.getElementById('group-name-a').value.trim() || 'Grupo A';
        const nameB = document.getElementById('group-name-b').value.trim() || 'Grupo B';

        const groupA = _groupParticipants.filter(p => p.group === 'a').map(p => p.socket_id);
        const groupB = _groupParticipants.filter(p => p.group === 'b').map(p => p.socket_id);

        if (!groupA.length && !groupB.length) {
            showToast('Asigna al menos un participante a un grupo', 'warning');
            return;
        }

        const roomA = ROOM_ID + '_ga';
        const roomB = ROOM_ID + '_gb';

        // Solo enviar grupos que tengan miembros
        const groups = [];
        if (groupA.length) groups.push({ room_id: roomA, name: nameA, members: groupA });
        if (groupB.length) groups.push({ room_id: roomB, name: nameB, members: groupB });

        socket.emit('create_breakout_rooms', { room: ROOM_ID, groups });

        const resumen = groups.map(g => `${g.name} (${g.members.length})`).join(' y ');
        showToast(`✅ Enviando: ${resumen}`, 'success');
        closeGroupModal();

        document.querySelectorAll('#avi-participants .participant').forEach(b => delete b.dataset.groupAssign);
    }

    function injectGroupButton() {
        if (!iamHost) return;
        if (document.getElementById('btn-breakout')) return;

        const btn = document.createElement('button');
        btn.id = 'btn-breakout';
        btn.title = 'Dividir en grupos';
        btn.type = 'button';
        btn.innerHTML = '🏫 Grupos';
        btn.addEventListener('click', openGroupModal);

        const toolbar = document.getElementById('avi-tools');
        if (toolbar) {
            const statsBtn = document.getElementById('btn-stats');
            if (statsBtn) toolbar.insertBefore(btn, statsBtn);
            else toolbar.appendChild(btn);
        }
    }

    // ── MODAL DE CONFIRMACIÓN — breakout rooms ────────────────────────────
    function showBreakoutConfirm(roomName, roomId) {
        const prev = document.getElementById('breakout-confirm-modal');
        if (prev) prev.remove();

        const modal = document.createElement('div');
        modal.id = 'breakout-confirm-modal';
        // Estilos inline para garantizar visibilidad sin depender de CSS externo
        Object.assign(modal.style, {
            display: 'flex',
            position: 'fixed',
            top: '0', left: '0', right: '0', bottom: '0',
            zIndex: '99999',
            background: 'rgba(0,0,0,0.80)',
            backdropFilter: 'blur(6px)',
            alignItems: 'center',
            justifyContent: 'center'
        });

        const box = document.createElement('div');
        Object.assign(box.style, {
            background: 'rgba(15,17,30,0.98)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '20px',
            padding: '32px 36px',
            maxWidth: '420px',
            width: '90%',
            textAlign: 'center',
            boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
            animation: 'bcSlide .25s ease'
        });

        box.innerHTML = `
            <div style="font-size:42px;margin-bottom:12px;">🏫</div>
            <h3 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 8px">Te invitan a una sala</h3>
            <p style="color:rgba(255,255,255,.55);font-size:14px;margin:0 0 24px">
                El host te ha asignado a<br>
                <strong style="color:#7c9eff;font-size:16px;">${roomName}</strong>
            </p>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button id="bc-accept" style="padding:12px 28px;border-radius:12px;border:none;cursor:pointer;background:linear-gradient(135deg,#4a90d9,#7c4fd4);color:#fff;font-size:14px;font-weight:700;flex:1;max-width:160px;">✓ Entrar (30s)</button>
                <button id="bc-reject" style="padding:12px 28px;border-radius:12px;cursor:pointer;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);font-size:14px;font-weight:600;flex:1;max-width:160px;">✕ Quedarme</button>
            </div>
        `;

        modal.appendChild(box);
        document.body.appendChild(modal);

        let secs = 30;
        const acceptBtn = document.getElementById('bc-accept');
        const countdown = setInterval(() => {
            secs--;
            if (acceptBtn) acceptBtn.textContent = `✓ Entrar (${secs}s)`;
            if (secs <= 0) { clearInterval(countdown); doAccept(); }
        }, 1000);

        function doAccept() {
            clearInterval(countdown);
            modal.remove();
            showToast(`📚 Entrando a ${roomName}...`, 'info');
            setTimeout(() => {
                const url = `/sala?room=${encodeURIComponent(roomId)}&username=${encodeURIComponent(USER_NAME)}&breakout=1`;
                window.location.href = url;
            }, 800);
        }

        function doReject() {
            clearInterval(countdown);
            modal.remove();
            showToast('Decidiste quedarte en esta sala', 'info');
        }

        document.getElementById('bc-accept').addEventListener('click', doAccept);
        document.getElementById('bc-reject').addEventListener('click', doReject);
        modal.addEventListener('click', e => { if (e.target === modal) doReject(); });
    }

    // ══════════════════════════════════════════════════════════════════════
    // SOCKET EVENTS
    // ══════════════════════════════════════════════════════════════════════
    if (typeof socket !== 'undefined') {

        let _joined = false;

        function joinRoom() {
            socket.emit('join_room', { room: ROOM_ID, username: USER_NAME, is_host: iamHost });
        }

        socket.on('connect', () => {
            console.log('✅ Socket conectado. ID:', socket.id);
            if (_joined) {
                showToast('Conexión restaurada ✓', 'success');
                destroyAllBgSeg();
                document.querySelectorAll('.participant').forEach(b => b.remove());
                mySocketId = null;
            }
            joinRoom();
            _joined = true;
        });

        socket.on('disconnect', (reason) => {
            console.warn('⚠️ Socket desconectado:', reason);
            showToast('Reconectando...', 'warning');
            _joined = false;
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Error de conexión Socket.IO:', err.message);
        });

        socket.on('joined_as_host', d => {
            showToast(d.message, 'success');
            createMyBox(socket.id, USER_NAME, true);
            setTimeout(injectGroupButton, 500);
        });
        socket.on('joined_as_participant', d => {
            showToast(d.message, 'success');
            createMyBox(socket.id, USER_NAME, false);
        });
        socket.on('host_joined', d => { showToast(`Host ${d.username} entró`, 'info'); createBox(d.socket_id, d.username, true, false); });
        socket.on('host_info', d => createBox(d.socket_id, d.username, true, false));
        socket.on('user_joined', d => { showToast(d.message, 'info'); createBox(d.socket_id, d.username, false, false); });

        socket.on('room_users', d => {
            setTimeout(() => {
                (d.users || []).forEach(u => {
                    if (u.socket_id === socket.id) return;
                    if (document.getElementById(`participant-${u.socket_id}`)) return;
                    createBox(u.socket_id, u.username, u.is_host || false, false);
                });
                reorganizeLayout();
                updateParticipantsListUI();
            }, 400);
        });

        socket.on('all_box_states', d => {
            Object.entries(d.states || {}).forEach(([sid, st]) => applyBoxState({ socket_id: sid, ...st }));
        });

        socket.on('all_bg_states', d => {
            if (!d.states) return;
            setTimeout(() => {
                loadBgSegModule(() => {
                    window.BgSegModule.restoreAll(d.states);
                });
            }, 800);
        });
        socket.on('box_move_event', d => {
            if (isDragging && dragEl && dragEl.id === `participant-${d.socket_id}`) return;
            const el = document.getElementById(`participant-${d.socket_id}`);
            if (el) { el.style.left = `${d.x}px`; el.style.top = `${d.y}px`; }
        });
        socket.on('box_state_event', d => {
            if (isDragging && dragEl && dragEl.id === `participant-${d.socket_id}`) return;
            applyBoxState(d);
        });

        socket.on('bg_active', d => {
            const el = document.getElementById(`participant-${d.socket_id}`);
            if (!el) return;
            loadBgSegModule(() => {
                const elNow = document.getElementById(`participant-${d.socket_id}`);
                if (!elNow) return;
                window.BgSegModule.setupViewer(elNow, d.socket_id);
            });
        });
        socket.on('bg_change_event', d => {
            const el = document.getElementById(`participant-${d.socket_id}`); if (!el) return;
            const wrap = el.querySelector('.box-video-wrap'); if (!wrap) return;
            if (d.color === 'off' || !d.color) wrap.style.background = '';
            else if (d.color === 'blur') wrap.style.background = 'linear-gradient(135deg,#444,#222)';
            else if (d.color === 'transparent') wrap.style.background = '#1a1a2e';
            else wrap.style.background = d.color;
        });

        socket.on('redirect_to_room', d => {
            const { room_id, room_name } = d;
            showBreakoutConfirm(room_name || room_id, room_id);
        });

        socket.on('breakout_created', d => {
            showToast(`✅ Grupos creados: ${d.groups.map(g => g.name).join(', ')}`, 'success');
        });

        // ── Fondo compartido — todos recargan el iframe ──────────────────────
        socket.on('bg_share_event', d => {
            const bgIframe = document.getElementById('bg-iframe');
            if (bgIframe) {
                // Forzar recarga del iframe para que VDO.ninja detecte el nuevo stream
                const currentSrc = bgIframe.src;
                bgIframe.src = '';
                setTimeout(() => {
                    bgIframe.src = currentSrc;
                }, 300);
                // Mostrar el contenedor de fondo en caso de estar oculto
                const bgDiv = document.getElementById('avi-background');
                if (bgDiv) bgDiv.style.display = '';
            }
            if (d.sharer !== USER_NAME) {
                showToast(`📺 ${d.sharer} comparte su pantalla al fondo`, 'info');
            }
        });

        socket.on('bg_share_stopped', d => {
            if (d.sharer !== USER_NAME) {
                showToast(`${d.sharer} dejó de compartir el fondo`, 'info');
            }
        });

        socket.on('user_left', d => { removeParticipant(d.socket_id); showToast(`${d.username} ha salido.`); });
        socket.on('host_left', d => { removeParticipant(d.socket_id); showToast('Host desconectado.', 'warning'); });
        socket.on('draw_stroke', d => drawLine(d.x0, d.y0, d.x1, d.y1, d.mode, false));
        socket.on('force_clear_event', () => {
            if (wctx) {
                wctx.clearRect(0, 0, whiteboard.width, whiteboard.height);
            }
            showToast('Pizarra limpia');
        });
        socket.on('show_reaction', d => createFloatingEmoji(d.emoji));
        socket.on('hand_raised_event', d => {
            handSound.currentTime = 0; handSound.play().catch(() => { });
            showToast(`${d.username} levantó la mano ✋`);
        });

        // FIX PRINCIPAL: toggle_visibility_event usa style.display en todos los clientes
        // Un solo mecanismo, sin mezcla de classList/style.display
        socket.on('toggle_visibility_event', d => {
            const box = document.getElementById(`participant-${d.target_id}`);
            if (box) {
                box.style.display = d.visible ? '' : 'none';
                reorganizeLayout();
            }
            const btn = document.getElementById(`btn-vis-${d.target_id}`);
            if (btn) {
                btn.innerHTML = d.visible ? '👁️' : '🚫';
                btn.style.background = d.visible ? '#fff' : '#ffebee';
                btn.style.color = d.visible ? '#333' : '#c62828';
                btn.style.borderColor = d.visible ? '#ccc' : '#ef9a9a';
            }
            updateParticipantsListUI();
        });

        // ── WYSIWYS: ocultar/mostrar TODOS los videos para todos ──────────
        socket.on('toggle_all_videos_event', d => {
            const show = d.visible;
            document.querySelectorAll('.participant').forEach(box => {
                box.style.display = show ? '' : 'none';
            });
            videosHidden = !show;
            reorganizeLayout();
            // Actualizar botón local
            if (btnToggleVideosBtn) {
                btnToggleVideosBtn.innerHTML = show ? '📹 Videos' : '🙈 Videos';
                btnToggleVideosBtn.classList.toggle('active', !show);
            }
            showToast(show ? 'Videos visibles 📹' : 'Videos ocultos 🙈', show ? 'success' : 'info');
            updateParticipantsListUI();
        });

        socket.on('chat_message', d => {
            const isMine = d.username === USER_NAME;
            const div = document.createElement('div');
            div.className = `message ${isMine ? 'mine' : 'others'}`;
            div.innerHTML = `${!isMine ? `<span class="msg-author">${d.username}</span>` : ''}${d.message}<span class="msg-time">${d.time || ''}</span>`;
            if (chatMessages) { chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight; }
            if (!isMine && (chatPanel.classList.contains('hidden') || (viewUsers && !viewUsers.classList.contains('hidden')))) {
                chatSound.play().catch(() => { });
                showToast(`${d.username}: ${d.message.substring(0, 40)}`);
                if (chatBadge) { chatBadge.innerText = (parseInt(chatBadge.innerText) || 0) + 1; chatBadge.classList.remove('hidden'); }
            }
        });

        socket.on('room_info', d => {
            const container = usersList || viewUsers; if (!container) return;
            let html = `<div style="padding:12px 15px;border-bottom:1px solid #ddd;font-weight:bold;background:#f8f9fa;position:sticky;top:0;">Conectados (${d.total})</div><ul style="list-style:none;padding:0;margin:0;">`;

            const row = (p, isHostRow) => {
                const uid = p.socket_id || p.sid;
                const box = document.getElementById(`participant-${uid}`);
                // FIX: usar solo style.display para determinar visibilidad
                const hidden = box && box.style.display === 'none';
                const bS = hidden
                    ? 'background:#ffebee;color:#c62828;border:1px solid #ef9a9a;padding:5px 10px;border-radius:4px;cursor:pointer;'
                    : 'background:#fff;color:#333;border:1px solid #ccc;padding:5px 10px;border-radius:4px;cursor:pointer;';

                const eyeBtn = `<button id="btn-vis-${uid}" style="${bS}" onclick="window.toggleLocalBox('${uid}')" title="${hidden ? 'Mostrar video' : 'Ocultar video'}">${hidden ? '🚫' : '👁️'}</button>`;

                return `<li style="padding:12px 15px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fff;">
                    <div><span style="margin-right:8px;font-size:1.2em;">${isHostRow ? '👑' : '👤'}</span><b>${p.username}</b></div>
                    <div style="display:flex;gap:5px;">
                        ${eyeBtn}
                        <button style="background:#fff;color:#333;border:1px solid #ccc;padding:5px 10px;border-radius:4px;cursor:pointer;" onclick="copyVdoLink('${p.username}')">🔗</button>
                    </div>
                </li>`;
            };

            if (d.host) html += row(d.host, true);
            d.participants.forEach(p => { if (!d.host || p.socket_id !== d.host.sid) html += row(p, false); });
            html += '</ul>';
            container.innerHTML = html;
        });
    }

    // ── Herramientas ──────────────────────────────────────────────────────
    const skipIds = ['btn-chat', 'btn-share', 'btn-hand', 'btn-reactions', 'btn-stats', 'btn-toggle-tools', 'btn-breakout', 'btn-bg', 'btn-toggle-videos'];

    tools.forEach(b => {
        // FIX: eliminado el b.classList.toggle('hidden-el') que ocultaba todos los botones al cargar
        b.addEventListener('click', () => {
            if (skipIds.includes(b.id)) return;
            tools.forEach(t => t.classList.remove('active'));
            b.classList.add('active');
            if (b.id === 'btn-draw') {
                currentMode = 'draw'; drawingType = 'pen';
                if (whiteboard) { whiteboard.classList.add('drawing-mode'); whiteboard.style.cursor = 'crosshair'; }
                showToast('Lápiz ✏️');
            } else if (b.id === 'btn-eraser') {
                currentMode = 'draw'; drawingType = 'eraser';
                if (whiteboard) { whiteboard.classList.add('drawing-mode'); whiteboard.style.cursor = 'cell'; }
                showToast('Borrador 🧹');
            } else {
                currentMode = 'move';
                if (whiteboard) { whiteboard.classList.remove('drawing-mode'); whiteboard.style.cursor = 'default'; }
                showToast('Mover 🖐️');
            }
        });
    });

    // ── BOTÓN FONDO — compartir pantalla visible para TODOS ───────────────
    let _bgShareWindow = null;       // ventana VDO.ninja de push
    let _bgShareActive = false;      // ¿estoy compartiendo yo?

    if (btnBg) {
        btnBg.addEventListener('click', () => {
            if (_bgShareActive) {
                // ── Detener compartición ────────────────────────────────────
                if (_bgShareWindow && !_bgShareWindow.closed) _bgShareWindow.close();
                _bgShareWindow = null;
                _bgShareActive = false;
                btnBg.classList.remove('active');
                btnBg.innerHTML = '📺 Fondo';
                socket.emit('bg_share_stop', { room: ROOM_ID, sharer: USER_NAME });
                showToast('Dejaste de compartir el fondo', 'info');
            } else {
                // ── Iniciar compartición de pantalla al fondo ───────────────
                const bgRoom = ROOM_ID + '_bg';
                // &screenshare → VDO.ninja pide compartir pantalla directamente
                // &push        → sube el stream a la sala bgRoom
                const bgPushUrl = `https://vdo.ninja/?room=${bgRoom}` +
                    `&push&autostart&screenshare` +
                    `&videobitrate=8000&framerate=30&codec=vp9`;

                _bgShareWindow = window.open(
                    bgPushUrl, 'FondoShare',
                    'width=900,height=650,menubar=no,toolbar=no,location=no'
                );

                // Detectar cierre de ventana y notificar a la sala
                const _winCheck = setInterval(() => {
                    if (_bgShareWindow && _bgShareWindow.closed) {
                        clearInterval(_winCheck);
                        if (_bgShareActive) {
                            _bgShareActive = false;
                            btnBg.classList.remove('active');
                            btnBg.innerHTML = '📺 Fondo';
                            socket.emit('bg_share_stop', { room: ROOM_ID, sharer: USER_NAME });
                            showToast('Compartición de fondo finalizada', 'info');
                        }
                    }
                }, 1500);

                _bgShareActive = true;
                btnBg.classList.add('active');
                btnBg.innerHTML = '🛑 Detener fondo';

                // Notificar a TODOS (incluido yo mismo) → recarga iframe del fondo
                socket.emit('bg_share_start', {
                    room: ROOM_ID,
                    sharer: USER_NAME,
                    bg_room: bgRoom,
                });
                showToast('¡Compartiendo pantalla al fondo para todos!', 'success');
            }
        });
    }


    if (btnClear) btnClear.addEventListener('click', () => { if (confirm('¿Borrar pizarra para todos?')) socket.emit('clear_board', { room: ROOM_ID }); });

    if (btnHand) btnHand.addEventListener('click', () => {
        btnHand.disabled = true; btnHand.style.opacity = '0.5';
        socket.emit('raise_hand', { room: ROOM_ID, username: USER_NAME });
        setTimeout(() => { btnHand.disabled = false; btnHand.style.opacity = '1'; }, 3000);
    });
    if (btnReactions && reactionPanel) {
        btnReactions.addEventListener('click', e => { e.stopPropagation(); reactionPanel.classList.toggle('hidden'); });
        document.addEventListener('click', () => reactionPanel.classList.add('hidden'));
        reactionPanel.addEventListener('click', e => {
            if (e.target.tagName === 'SPAN') {
                e.stopPropagation();
                socket.emit('reaction', { room: ROOM_ID, emoji: e.target.innerText, username: USER_NAME });
                reactionPanel.classList.add('hidden');
            }
        });
    }
    if (btnShare) btnShare.addEventListener('click', e => {
        e.preventDefault();
        const link = `${window.location.origin}/join?room=${ROOM_ID}`;
        navigator.clipboard.writeText(link).then(() => {
            const originalHTML = btnShare.innerHTML;
            const originalStyle = btnShare.getAttribute('style') || '';
            btnShare.innerHTML = 'Link copiado';
            btnShare.style.background = '#27ae60';
            btnShare.style.color = '#fff';
            btnShare.style.transform = 'scale(1.05)';
            btnShare.disabled = true;
            setTimeout(() => {
                btnShare.innerHTML = originalHTML;
                btnShare.setAttribute('style', originalStyle);
                btnShare.disabled = false;
            }, 2000);
            showToast('Link de sala copiado 🔗', 'success');
        }).catch(() => prompt('Copia este link:', link));
    });

    function switchTab(mode) {
        if (!chatPanel) return;
        chatPanel.classList.remove('hidden');
        const isChat = mode === 'chat';
        if (viewChat) viewChat.classList.toggle('hidden', !isChat);
        if (viewUsers) viewUsers.classList.toggle('hidden', isChat);
        if (tabChat) tabChat.classList.toggle('active', isChat);
        if (tabUsers) tabUsers.classList.toggle('active', !isChat);
        if (isChat) {
            if (chatBadge) { chatBadge.classList.add('hidden'); chatBadge.innerText = '0'; }
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
            if (chatInput) setTimeout(() => chatInput.focus(), 50);
        } else { setTimeout(updateParticipantsListUI, 100); }
    }
    if (tabChat) tabChat.addEventListener('click', () => switchTab('chat'));
    if (tabUsers) tabUsers.addEventListener('click', () => switchTab('users'));
    if (btnChat) btnChat.addEventListener('click', () => { const h = chatPanel.classList.contains('hidden'); chatPanel.classList.toggle('hidden'); if (h) switchTab('chat'); });
    if (btnCloseChat) btnCloseChat.addEventListener('click', e => { e.preventDefault(); chatPanel.classList.add('hidden'); });

    function sendMessage() {
        const text = chatInput ? chatInput.value.trim() : ''; if (!text) return;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        socket.emit('chat_message', { room: ROOM_ID, username: USER_NAME, message: text, time });
        chatInput.value = ''; chatInput.focus();
    }
    if (btnSendChat) btnSendChat.addEventListener('click', sendMessage);
    if (chatInput) chatInput.addEventListener('keypress', e => { if (e.key === 'Enter') sendMessage(); });

    function processData(l) { const c = {}; (l || []).forEach(e => { const k = e.emoji || 'Acción'; c[k] = (c[k] || 0) + 1; }); return c; }
    function renderChart(d) {
        if (!chartCanvas) return;
        if (reactionChart) reactionChart.destroy();
        reactionChart = new Chart(chartCanvas.getContext('2d'), {
            type: 'bar',
            data: { labels: Object.keys(d), datasets: [{ label: 'Reacciones', data: Object.values(d), backgroundColor: '#36a2eb' }] },
            options: { maintainAspectRatio: false }
        });
    }
    if (btnStats) btnStats.addEventListener('click', () => { statsModal.classList.remove('hidden'); fetch(`/summary/${ROOM_ID}`).then(r => r.json()).then(d => renderChart(processData(d))); });
    if (btnCloseStats) btnCloseStats.addEventListener('click', () => statsModal.classList.add('hidden'));
    if (btnToggleTools && dockContainer) btnToggleTools.addEventListener('click', () => dockContainer.classList.toggle('hidden-dock'));


});

function abrirHerramienta(t) { alert('Herramienta: ' + t); }