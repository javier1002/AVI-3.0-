document.addEventListener('DOMContentLoaded', () => {
    console.log("--> sala_ui.js v4.1 iniciado.");

    // ============================================================
    // ESTADO INICIAL HOST/PARTICIPANTE
    // ============================================================
    const wasHost = sessionStorage.getItem('is_host') === 'true';
    const iamHost = (typeof IS_HOST !== 'undefined' && IS_HOST) || wasHost;
    if (iamHost) sessionStorage.setItem('is_host', 'true');
    else sessionStorage.removeItem('is_host');

    // ============================================================
    // PERSISTENCIA LOCAL — estado de cajas por username
    // ============================================================
    function boxKey(username) { return `sala_${ROOM_ID}_box_${(username||'').replace(/[^a-z0-9]/gi,'').toLowerCase()}`; }

    function saveBox(username, patch) {
        try {
            const key  = boxKey(username);
            const prev = JSON.parse(localStorage.getItem(key) || '{}');
            localStorage.setItem(key, JSON.stringify({ ...prev, ...patch, _ts: Date.now() }));
        } catch(e) {}
    }

    function loadBox(username) {
        try { return JSON.parse(localStorage.getItem(boxKey(username)) || 'null'); }
        catch { return null; }
    }

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
    // ESTADO INTERNO
    // ============================================================
    let wctx        = null, canvasBG = null, ctxBG = null;
    let isDrawing   = false, lastPos = { x:0, y:0 };
    let currentMode = 'move', drawingType = 'pen';
    let isDragging  = false, dragEl = null, dragOffset = { x:0, y:0 };
    let lastMoveEmit = 0;
    const MOVE_THROTTLE = 32; // ~30fps
    let reactionChart = null;

    // ============================================================
    // SONIDOS
    // ============================================================
    const chatSound = new Audio('https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3');
    const handSound = new Audio('https://media.geeksforgeeks.org/wp-content/uploads/20190531135120/beep.mp3');
    document.body.addEventListener('click', () => {
        handSound.volume = 0;
        handSound.play().then(() => { handSound.pause(); handSound.currentTime = 0; handSound.volume = 1; }).catch(()=>{});
    }, { once: true });

    // ============================================================
    // UTILS
    // ============================================================
    function san(u) { return (u||'').replace(/[^a-zA-Z0-9]/g,'').toLowerCase(); }

    window.showToast = function(msg, type='info') {
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
        Object.assign(d.style, {
            position:'fixed', left:(Math.random()*80+10)+'%', bottom:'0',
            fontSize:'2.5rem', zIndex:'9999', pointerEvents:'none',
            transition:'bottom 2.5s ease-out, opacity 1s ease-in 1.5s'
        });
        d.innerText = emoji;
        document.body.appendChild(d);
        setTimeout(() => { d.style.bottom='80%'; d.style.opacity='0'; }, 50);
        setTimeout(() => d.remove(), 3000);
    };

    // ============================================================
    // VDO.NINJA URLs
    // ============================================================
    function streamId(u) { return san(ROOM_ID) + san(u); }
    function pushUrl(u) { return `https://vdo.ninja/?push=${streamId(u)}&password=false&autostart&label=${encodeURIComponent(u)}`; }
    function viewUrl(u) { return `https://vdo.ninja/?view=${streamId(u)}&password=false&autoplay&cleanoutput&label=${encodeURIComponent(u)}`; }

    window.copyVdoLink = function(username) {
        const url = viewUrl(username);
        navigator.clipboard.writeText(url)
            .then(() => showToast(`Link de vista copiado para ${username}`))
            .catch(() => prompt('Link de vista independiente:', url));
    };

    // ============================================================
    // CREAR CAJA DE PARTICIPANTE
    // ============================================================
    window.createBox = function(socketId, username, isHost, isMe) {
        if (document.getElementById(`participant-${socketId}`)) return;

        document.querySelectorAll('.participant').forEach(b => {
            const lbl = b.querySelector('.label-participant');
            if (lbl && lbl.dataset.username === username) b.remove();
        });

        const div = document.createElement('div');
        div.id              = `participant-${socketId}`;
        div.className       = isHost ? 'participant host' : 'participant';
        div.dataset.username = username;
        div.dataset.mirror  = 'false';
        div.dataset.bgSeg   = 'false';
        div.style.cssText   = 'left:20px;top:80px;';

        const url   = isMe ? pushUrl(username) : viewUrl(username);
        const perms = 'autoplay; camera; microphone; fullscreen; display-capture; picture-in-picture';

        const mirrorBtn = isMe ? `
            <button onclick="toggleMirror('${socketId}')"
                title="Espejo"
                style="float:right;background:transparent;border:none;cursor:pointer;
                       font-size:0.95em;opacity:0.6;padding:0 3px;margin-left:4px;">↔️</button>` : '';

        div.innerHTML = `
            <div class="box-video-wrap" style="position:relative;width:100%;height:calc(100% - 28px);overflow:hidden;">
                <iframe class="box-iframe" src="${url}" allow="${perms}" allowfullscreen
                    style="width:100%;height:100%;border:0;display:block;"></iframe>
            </div>
            <div class="label-participant" data-username="${username}">
                ${isHost?'👑 ':''}${username}${mirrorBtn}
            </div>`;

        div.addEventListener('mousedown', () => { const f = div.querySelector('iframe'); if(f) f.style.pointerEvents='none'; });
        div.addEventListener('mouseup',   () => { const f = div.querySelector('iframe'); if(f) f.style.pointerEvents='auto'; });

        participantsArea.appendChild(div);
        addDragAndResize(div);

        if (isMe) {
            if (window.BgSegModule) {
                window.BgSegModule.attach(div, socketId);
            } else {
                const s = document.createElement('script');
                s.src = '/static/js/bg_segmentation.js';
                s.onload = () => { if (window.BgSegModule) window.BgSegModule.attach(div, socketId); };
                document.head.appendChild(s);
            }
        }

        const saved = loadBox(username);
        if (saved) {
            if (saved.x != null)  div.style.left   = `${saved.x}px`;
            if (saved.y != null)  div.style.top    = `${saved.y}px`;
            if (saved.w)          div.style.width  = saved.w;
            if (saved.h)          div.style.height = saved.h;
            if (saved.mirror)     applyMirror(socketId, true,  false);
        } else {
            reorganizeLayout();
        }

        if (viewUsers && !viewUsers.classList.contains('hidden')) updateParticipantsListUI();
    };

    window.createMyBox    = (s,u,h) => createBox(s,u,h,true);
    window.addParticipant = (s,u,h) => createBox(s,u,h,false);

    window.removeParticipant = function(socketId) {
        const el = document.getElementById(`participant-${socketId}`);
        if (el) { el.remove(); reorganizeLayout(); }
        if (viewUsers && !viewUsers.classList.contains('hidden')) updateParticipantsListUI();
    };

    window.loadParticipants = (users) => users.forEach(u => createBox(u.socket_id, u.username, false, false));

    // ============================================================
    // MODO ESPEJO
    // ============================================================
    window.toggleMirror = function(socketId) {
        const el = document.getElementById(`participant-${socketId}`);
        if (!el) return;
        applyMirror(socketId, el.dataset.mirror !== 'true', true);
    };

    function applyMirror(socketId, active, persist) {
        const el = document.getElementById(`participant-${socketId}`);
        if (!el) return;
        const iframe = el.querySelector('iframe');
        if (iframe) iframe.style.transform = active ? 'scaleX(-1)' : 'none';
        el.dataset.mirror = active ? 'true' : 'false';
        const btn = el.querySelector('.btn-mirror-box');
        if (btn) { btn.style.opacity = active ? '1' : '0.65'; btn.title = active ? 'Espejo ON' : 'Espejo OFF'; }
        if (persist) saveBox(el.dataset.username, { mirror: active });
    }

    // ============================================================
    // LAYOUT AUTOMÁTICO
    // ============================================================
    function reorganizeLayout() {
        const visible = Array.from(document.querySelectorAll('.participant')).filter(b => b.style.display !== 'none');
        const hostBox = visible.find(b => b.classList.contains('host'));
        const guests  = visible.filter(b => !b.classList.contains('host'))
            .sort((a,b) => a.innerText.toUpperCase() < b.innerText.toUpperCase() ? -1 : 1);

        const W=260, H=180, gX=20, gY=20, x0=20, y0=80, maxCol=4;
        let cx=x0, cy=y0, col=0;
        if (hostBox) { hostBox.style.left=`${cx}px`; hostBox.style.top=`${cy}px`; hostBox.style.zIndex=202; cx+=W+gX; col++; }
        guests.forEach(b => {
            if (col>=maxCol) { cx=x0; cy+=H+gY; col=0; }
            b.style.left=`${cx}px`; b.style.top=`${cy}px`; b.style.zIndex=201;
            cx+=W+gX; col++;
        });
    }

    function constrainToCanvas(el) {
        if (!participantsArea||!el) return;
        const pr=participantsArea.getBoundingClientRect(), er=el.getBoundingClientRect();
        el.style.left = `${Math.max(0, Math.min(parseInt(el.style.left)||0, pr.width -er.width))}px`;
        el.style.top  = `${Math.max(0, Math.min(parseInt(el.style.top) ||0, pr.height-er.height))}px`;
    }

    // ============================================================
    // DRAG Y RESIZE
    // ============================================================
    function addDragAndResize(el) {
        if (window.ResizeObserver) {
            let roTimer = null;
            const ro = new ResizeObserver(() => {
                if (isDragging && dragEl === el) return;
                clearTimeout(roTimer);
                roTimer = setTimeout(() => {
                    emitBoxState(el);
                    saveBox(el.dataset.username, { w: el.style.width||el.offsetWidth+'px', h: el.style.height||el.offsetHeight+'px' });
                }, 150);
            });
            ro.observe(el);
        }

        el.addEventListener('mousedown', e => {
            if (currentMode !== 'move') return;
            const r = el.getBoundingClientRect();
            if (e.clientX > r.right-20 && e.clientY > r.bottom-20) return;
            isDragging = true; dragEl = el;
            dragOffset.x = e.clientX - r.left;
            dragOffset.y = e.clientY - r.top;
        });

        el.addEventListener('mouseup', () => {
            if (isDragging && dragEl === el) {
                constrainToCanvas(el); emitBoxState(el);
                saveBox(el.dataset.username, { x:parseInt(el.style.left)||0, y:parseInt(el.style.top)||0 });
            }
        });
    }

    function emitBoxState(el) {
        if (typeof socket === 'undefined') return;
        socket.emit('box_state', {
            room: ROOM_ID,
            socket_id: el.id.replace('participant-',''),
            x: parseInt(el.style.left)||0,
            y: parseInt(el.style.top) ||0,
            width:  el.style.width  || el.offsetWidth  + 'px',
            height: el.style.height || el.offsetHeight + 'px'
        });
    }

    document.addEventListener('mousemove', e => {
        if (!isDragging||!dragEl||currentMode!=='move') return;
        const pr=participantsArea.getBoundingClientRect();
        const nx = Math.max(0, Math.min(e.clientX-pr.left-dragOffset.x, pr.width -dragEl.offsetWidth));
        const ny = Math.max(0, Math.min(e.clientY-pr.top -dragOffset.y, pr.height-dragEl.offsetHeight));
        dragEl.style.left=`${nx}px`; dragEl.style.top=`${ny}px`;

        const now = Date.now();
        if (now - lastMoveEmit >= MOVE_THROTTLE && typeof socket !== 'undefined') {
            lastMoveEmit = now;
            socket.emit('box_move', { room:ROOM_ID, socket_id:dragEl.id.replace('participant-',''), x:nx, y:ny });
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging && dragEl) {
            constrainToCanvas(dragEl); emitBoxState(dragEl);
            saveBox(dragEl.dataset.username, { x:parseInt(dragEl.style.left)||0, y:parseInt(dragEl.style.top)||0 });
        }
        isDragging=false; dragEl=null;
    });

    function applyBoxState(d) {
        const el = document.getElementById(`participant-${d.socket_id}`);
        if (!el) return;
        if (d.x      != null) el.style.left   = `${d.x}px`;
        if (d.y      != null) el.style.top    = `${d.y}px`;
        if (d.width)          el.style.width  = d.width;
        if (d.height)         el.style.height = d.height;
    }

    const CANVAS_BG = '#1a1a2e';

    // ============================================================
    // WHITEBOARD Y FIX DEL BORRADOR
    // ============================================================
    if (whiteboard) {
        canvasBG = document.getElementById('avi-whiteboard-bg');
        if (!canvasBG) {
            canvasBG = document.createElement('canvas');
            canvasBG.id = 'avi-whiteboard-bg';
            Object.assign(canvasBG.style, { position:'absolute', top:'0', left:'0', pointerEvents:'none', zIndex:'0' });
            whiteboard.parentElement.style.position = 'relative';
            whiteboard.parentElement.insertBefore(canvasBG, whiteboard);
        }
        ctxBG = canvasBG.getContext('2d');
        whiteboard.style.cssText += ';position:absolute;top:0;left:0;z-index:1;';
        wctx = whiteboard.getContext('2d');
        wctx.lineCap='round'; wctx.lineJoin='round';

        function resizeCanvases() {
            const p=whiteboard.parentElement, w=p.clientWidth, h=p.clientHeight;
            canvasBG.width=w; canvasBG.height=h;
            ctxBG.fillStyle=CANVAS_BG; ctxBG.fillRect(0,0,w,h);
            whiteboard.width=w; whiteboard.height=h;
        }
        window.addEventListener('resize', resizeCanvases);
        setTimeout(resizeCanvases, 100);

        function gp(e) { const r=whiteboard.getBoundingClientRect(); return {x:e.clientX-r.left, y:e.clientY-r.top}; }
        whiteboard.addEventListener('mousedown',  e => { if(currentMode!=='draw')return; isDrawing=true; lastPos=gp(e); });
        whiteboard.addEventListener('mousemove',  e => { if(!isDrawing)return; const p=gp(e); drawLine(lastPos.x,lastPos.y,p.x,p.y,drawingType,true); lastPos=p; });
        whiteboard.addEventListener('mouseup',    () => isDrawing=false);
        whiteboard.addEventListener('mouseleave', () => isDrawing=false);
        whiteboard.addEventListener('touchstart', e => { if(currentMode!=='draw')return; e.preventDefault(); isDrawing=true; const r=whiteboard.getBoundingClientRect(),t=e.touches[0]; lastPos={x:t.clientX-r.left,y:t.clientY-r.top}; }, {passive:false});
        whiteboard.addEventListener('touchmove',  e => { if(!isDrawing)return; e.preventDefault(); const r=whiteboard.getBoundingClientRect(),t=e.touches[0],p={x:t.clientX-r.left,y:t.clientY-r.top}; drawLine(lastPos.x,lastPos.y,p.x,p.y,drawingType,true); lastPos=p; }, {passive:false});
        whiteboard.addEventListener('touchend',   () => isDrawing=false);
    }

    // LÓGICA DE DIBUJO Y BORRADO CORREGIDA
    window.drawLine = function(x0, y0, x1, y1, mode, shouldEmit) {
        if (!wctx) return;
        wctx.beginPath();

        if (mode === 'eraser') {
            // FIX: Borrar hace transparente el trazo en lugar de pintar del color de fondo
            wctx.globalCompositeOperation = 'destination-out';
            wctx.lineWidth = 30;
            wctx.strokeStyle = "rgba(0,0,0,1)"; // El color no importa en destination-out
        } else {
            // Dibujar normal
            wctx.globalCompositeOperation = 'source-over';
            wctx.lineWidth = 3;
            wctx.strokeStyle = '#ffffff';
        }

        wctx.moveTo(x0, y0);
        wctx.lineTo(x1, y1);
        wctx.stroke();
        wctx.closePath();

        // Restaurar modo por seguridad
        wctx.globalCompositeOperation = 'source-over';

        if (shouldEmit && typeof socket!=='undefined') {
            socket.emit('draw_stroke', { room: ROOM_ID, x0, y0, x1, y1, mode });
        }
    };
    window.drawLineOnCanvas = window.drawLine;

    // ============================================================
    // SOCKET EVENTS
    // ============================================================
    if (typeof socket !== 'undefined') {
        socket.emit('join_room', {room:ROOM_ID, username:USER_NAME, is_host:iamHost});

        socket.on('joined_as_host',        d => { showToast(d.message,'success'); createMyBox(socket.id,USER_NAME,true); });
        socket.on('joined_as_participant',  d => { showToast(d.message,'success'); createMyBox(socket.id,USER_NAME,false); });
        socket.on('host_joined',            d => { showToast(`El Host ${d.username} ha entrado`,'info'); createBox(d.socket_id,d.username,true,false); });
        socket.on('host_info',              d => createBox(d.socket_id,d.username,true,false));
        socket.on('user_joined',            d => { showToast(d.message,'info'); createBox(d.socket_id,d.username,false,false); });

        socket.on('room_users', d => {
            d.users.forEach(u => createBox(u.socket_id,u.username,false,false));
            reorganizeLayout(); updateParticipantsListUI();
        });

        socket.on('all_box_states', d => {
            Object.entries(d.states||{}).forEach(([sid,st]) => applyBoxState({socket_id:sid,...st}));
        });

        socket.on('box_move_event', d => {
            if (isDragging && dragEl && dragEl.id===`participant-${d.socket_id}`) return;
            const el = document.getElementById(`participant-${d.socket_id}`);
            if (el) { el.style.left=`${d.x}px`; el.style.top=`${d.y}px`; }
        });

        socket.on('box_state_event', d => {
            if (isDragging && dragEl && dragEl.id===`participant-${d.socket_id}`) return;
            applyBoxState(d);
        });

        socket.on('user_left', d => { removeParticipant(d.socket_id); showToast(`${d.username} ha salido.`); });
        socket.on('host_left', d => { removeParticipant(d.socket_id); showToast('Host desconectado.','warning'); });

        socket.on('draw_stroke', d => drawLine(d.x0,d.y0,d.x1,d.y1,d.mode,false));

        socket.on('force_clear_event', () => {
            if (wctx)  wctx.clearRect(0,0,whiteboard.width,whiteboard.height);
            if (ctxBG) { ctxBG.fillStyle=CANVAS_BG; ctxBG.fillRect(0,0,canvasBG.width,canvasBG.height); }
            showToast('Pizarra limpia');
        });

        socket.on('show_reaction', d => createFloatingEmoji(d.emoji));

        socket.on('hand_raised_event', d => {
            handSound.currentTime=0; handSound.play().catch(()=>{});
            showToast(`${d.username} levantó la mano ✋`);
        });

        socket.on('toggle_visibility_event', d => {
            const box = document.getElementById(`participant-${d.target_id}`);
            if (box) { box.style.display = d.visible?'flex':'none'; reorganizeLayout(); }
            const btn = document.getElementById(`btn-vis-${d.target_id}`);
            if (btn) {
                btn.innerHTML = d.visible?'👁️':'🚫';
                btn.style.background  = d.visible?'#fff':'#ffebee';
                btn.style.color       = d.visible?'#333':'#c62828';
                btn.style.borderColor = d.visible?'#ccc':'#ef9a9a';
            }
        });

        socket.on('chat_message', d => {
            const isMine = d.username===USER_NAME;
            const div = document.createElement('div');
            div.className = `message ${isMine?'mine':'others'}`;
            div.innerHTML = `${!isMine?`<span class="msg-author">${d.username}</span>`:''}${d.message}<span class="msg-time">${d.time||''}</span>`;
            if (chatMessages) { chatMessages.appendChild(div); chatMessages.scrollTop=chatMessages.scrollHeight; }
            if (!isMine && (chatPanel.classList.contains('hidden')||(viewUsers&&!viewUsers.classList.contains('hidden')))) {
                chatSound.play().catch(()=>{});
                showToast(`${d.username}: ${d.message.substring(0,40)}`);
                if (chatBadge) { chatBadge.innerText=(parseInt(chatBadge.innerText)||0)+1; chatBadge.classList.remove('hidden'); }
            }
        });

        socket.on('room_info', d => {
            const container = usersList || viewUsers;
            if (!container) return;
            let html = `<div style="padding:12px 15px;border-bottom:1px solid #ddd;font-weight:bold;background:#f8f9fa;position:sticky;top:0;z-index:1;">Conectados (${d.total})</div><ul style="list-style:none;padding:0;margin:0;">`;
            const row = (p, isHostRow) => {
                const uid=p.socket_id||p.sid, box=document.getElementById(`participant-${uid}`), hidden=box&&box.style.display==='none';
                const bS = hidden?'background:#ffebee;color:#c62828;border:1px solid #ef9a9a;':'background:#fff;color:#333;border:1px solid #ccc;';
                return `<li style="padding:12px 15px;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;align-items:center;background:#fff;">
                    <div><span style="margin-right:8px;font-size:1.2em;">${isHostRow?'👑':'👤'}</span><b>${p.username}</b></div>
                    <div style="display:flex;gap:5px;">
                        <button id="btn-vis-${uid}" style="${bS}padding:5px 10px;border-radius:4px;cursor:pointer;" onclick="requestToggleVisibility('${uid}')">${hidden?'🚫':'👁️'}</button>
                        <button style="background:#fff;color:#333;border:1px solid #ccc;padding:5px 10px;border-radius:4px;cursor:pointer;" onclick="copyVdoLink('${p.username}')" title="Link de vista">🔗</button>
                    </div>
                </li>`;
            };
            if (d.host) html += row(d.host, true);
            d.participants.forEach(p => { if (!d.host||p.socket_id!==d.host.sid) html+=row(p,false); });
            html += '</ul>';
            container.innerHTML = html;
        });
    }

    // ============================================================
    // FUNCIONES GLOBALES
    // ============================================================
    window.requestToggleVisibility = function(targetId) {
        const box = document.getElementById(`participant-${targetId}`);
        socket.emit('toggle_visibility', { room:ROOM_ID, target_id:targetId, visible:!(box&&box.style.display!=='none') });
    };

    window.updateParticipantsListUI = function() {
        if (typeof socket !== 'undefined') socket.emit('get_room_info', { room:ROOM_ID });
    };

    // ============================================================
    // HERRAMIENTAS
    // ============================================================
    const skipIds = ['btn-chat','btn-share','btn-hand','btn-reactions','btn-stats','btn-toggle-tools'];
    tools.forEach(b => {
        b.addEventListener('click', () => {
            if (skipIds.includes(b.id)) return;
            tools.forEach(t => t.classList.remove('active')); b.classList.add('active');
            if (b.id==='btn-draw')   { currentMode='draw'; drawingType='pen';    if(whiteboard){whiteboard.classList.add('drawing-mode');whiteboard.style.cursor='crosshair';} showToast('Lápiz'); }
            else if(b.id==='btn-eraser') { currentMode='draw'; drawingType='eraser'; if(whiteboard){whiteboard.classList.add('drawing-mode');whiteboard.style.cursor='cell';} showToast('Borrador'); }
            else { currentMode='move'; if(whiteboard){whiteboard.classList.remove('drawing-mode');whiteboard.style.cursor='default';} showToast('Mover'); }
        });
    });

    if (btnClear) btnClear.addEventListener('click', () => { if(confirm('¿Borrar pizarra para todos?')) socket.emit('clear_board',{room:ROOM_ID}); });

    // ============================================================
    // BOTONES DOCK
    // ============================================================
    if (btnHand) {
        btnHand.addEventListener('click', () => {
            btnHand.disabled=true; btnHand.style.opacity='0.5';
            socket.emit('raise_hand', {room:ROOM_ID, username:USER_NAME});
            setTimeout(() => { btnHand.disabled=false; btnHand.style.opacity='1'; }, 3000);
        });
    }

    if (btnReactions && reactionPanel) {
        btnReactions.addEventListener('click', e => { e.stopPropagation(); reactionPanel.classList.toggle('hidden'); });
        document.addEventListener('click', () => reactionPanel.classList.add('hidden'));
        reactionPanel.addEventListener('click', e => {
            if (e.target.tagName==='SPAN') {
                e.stopPropagation();
                socket.emit('reaction', {room:ROOM_ID, emoji:e.target.innerText, username:USER_NAME});
                reactionPanel.classList.add('hidden');
            }
        });
    }

    if (btnShare) {
        btnShare.addEventListener('click', e => {
            e.preventDefault();
            navigator.clipboard.writeText(`${window.location.origin}/join?room=${ROOM_ID}`).then(() => showToast('Link de sala copiado'));
        });
    }

    // ============================================================
    // CHAT Y PESTAÑAS
    // ============================================================
    function switchTab(mode) {
        if (!chatPanel) return;
        chatPanel.classList.remove('hidden');
        const isChat = mode==='chat';
        if (viewChat)  viewChat.classList.toggle('hidden', !isChat);
        if (viewUsers) viewUsers.classList.toggle('hidden', isChat);
        if (tabChat)   tabChat.classList.toggle('active', isChat);
        if (tabUsers)  tabUsers.classList.toggle('active', !isChat);
        if (isChat) {
            if (chatBadge) { chatBadge.classList.add('hidden'); chatBadge.innerText='0'; }
            if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
            if (chatInput) setTimeout(() => chatInput.focus(), 50);
        } else {
            setTimeout(updateParticipantsListUI, 100);
        }
    }

    if (tabChat)      tabChat.addEventListener('click',      () => switchTab('chat'));
    if (tabUsers)     tabUsers.addEventListener('click',     () => switchTab('users'));
    if (btnChat)      btnChat.addEventListener('click',      () => { const h=chatPanel.classList.contains('hidden'); chatPanel.classList.toggle('hidden'); if(h) switchTab('chat'); });
    if (btnCloseChat) btnCloseChat.addEventListener('click', e => { e.preventDefault(); chatPanel.classList.add('hidden'); });

    function sendMessage() {
        const text = chatInput?chatInput.value.trim():'';
        if (!text) return;
        const time = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        socket.emit('chat_message', {room:ROOM_ID, username:USER_NAME, message:text, time});
        chatInput.value=''; chatInput.focus();
    }
    if (btnSendChat) btnSendChat.addEventListener('click', sendMessage);
    if (chatInput)   chatInput.addEventListener('keypress', e => { if(e.key==='Enter') sendMessage(); });

    // ============================================================
    // STATS
    // ============================================================
    function processData(l) { const c={}; (l||[]).forEach(e=>{const k=e.emoji||'Acción';c[k]=(c[k]||0)+1;}); return c; }
    function renderChart(d) {
        if (!chartCanvas) return;
        if (reactionChart) reactionChart.destroy();
        reactionChart = new Chart(chartCanvas.getContext('2d'), {
            type:'bar', data:{labels:Object.keys(d),datasets:[{label:'Reacciones',data:Object.values(d),backgroundColor:'#36a2eb'}]},
            options:{maintainAspectRatio:false}
        });
    }
    if (btnStats)      btnStats.addEventListener('click',      () => { statsModal.classList.remove('hidden'); fetch(`/summary/${ROOM_ID}`).then(r=>r.json()).then(d=>renderChart(processData(d))); });
    if (btnCloseStats) btnCloseStats.addEventListener('click', () => statsModal.classList.add('hidden'));
    if (btnToggleTools&&dockContainer) btnToggleTools.addEventListener('click', () => dockContainer.classList.toggle('hidden-dock'));
});

function abrirHerramienta(t) { alert('Herramienta: '+t); }