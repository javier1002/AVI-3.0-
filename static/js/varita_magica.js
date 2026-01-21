/* static/js/varita_magica.js - VERSIÓN MAESTRA */
/* Incluye:
   1. RenderLoop Desacoplado (Para que los invitados vean sin cámara).
   2. Suavizado de Movimiento (Para que el dibujo sea preciso y no tiemble).
   3. Sincronización Total (Limpieza y visualización remota).
*/

document.addEventListener('DOMContentLoaded', () => {
    const btnWand = document.getElementById('btn-magic-wand');
    const canvas = document.getElementById('magic-canvas');
    const stage = document.getElementById('avi-stage');

    if (!btnWand || !canvas) return;

    const ctx = canvas.getContext('2d');

    // Video oculto para MediaPipe
    const videoInput = document.createElement('video');
    videoInput.style.display = 'none';
    document.body.appendChild(videoInput);

    // --- VARIABLES DE ESTADO ---
    let isWandActive = false;
    let camera = null;

    // Identidad
    const myColor = getRandomColor();
    const myName = (typeof USER_NAME !== 'undefined') ? USER_NAME : 'Yo';

    // --- SUAVIZADO (Anti-Temblor) ---
    const positionHistory = [];
    const HISTORY_SIZE = 5; // Promediar últimos 5 cuadros

    // --- DATOS LOCALES ---
    let localState = 0;
    let localPos = { x: 0, y: 0 };
    let localWrist = { x: 0, y: 0 };

    let localPaths = [];
    let localCurrentPath = [];
    let localHoverTrail = [];
    const MAX_TRAIL = 15;

    // --- DATOS REMOTOS ---
    let remoteWands = {};
    let lastSentTime = 0;
    const SEND_INTERVAL = 40;

    // =======================================================
    // 1. MOTOR GRÁFICO (RENDER LOOP)
    // =======================================================
    // Se ejecuta siempre, independientemente de la cámara
    function renderLoop() {
        // Ajustar Canvas si cambia la ventana
        if (canvas.width !== canvas.parentElement.clientWidth || canvas.height !== canvas.parentElement.clientHeight) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }

        // Limpiar pantalla
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // DIBUJAR REMOTOS
        drawRemoteWands();

        // DIBUJAR LOCALES (Si hay algo)
        if (isWandActive || localPaths.length > 0) {
            drawLocalVisuals();
        }

        requestAnimationFrame(renderLoop);
    }
    // Iniciar motor
    renderLoop();


    // =======================================================
    // 2. LÓGICA DE I.A. (CÁMARA + SUAVIZADO)
    // =======================================================
    const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
    hands.setOptions({maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7});
    hands.onResults(onResults);

    function onResults(results) {
        if (!isWandActive) return;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const lm = results.multiHandLandmarks[0];
            const fingers = countFingers(lm);

            // --- ALGORITMO DE SUAVIZADO ---
            // 1. Guardar posición cruda (Tip del índice)
            positionHistory.push(lm[8]);
            if (positionHistory.length > HISTORY_SIZE) positionHistory.shift();

            // 2. Calcular promedio
            let avgX = 0, avgY = 0;
            positionHistory.forEach(p => { avgX += p.x; avgY += p.y; });
            const smoothedTip = {
                x: avgX / positionHistory.length,
                y: avgY / positionHistory.length
            };

            // 3. Convertir a pixeles (Usando la suavizada)
            const idx = toPixels(smoothedTip);
            const wst = toPixels(lm[0]); // Muñeca normal

            // Actualizar variables globales para el RenderLoop
            localPos = idx;
            localWrist = wst;

            // --- MÁQUINA DE ESTADOS ---
            if (fingers === 0) { // Puño: Borrar local
                if(localPaths.length > 0) localPaths = [];
                localCurrentPath = []; localHoverTrail = [];
                localState = 0;
                positionHistory.length = 0; // Reiniciar suavizado
            }
            else if (fingers === 1) { // 1 Dedo: Láser
                if(localCurrentPath.length > 0) { localPaths.push(localCurrentPath); localCurrentPath = []; }
                localHoverTrail.push(idx);
                if(localHoverTrail.length > MAX_TRAIL) localHoverTrail.shift();
                localState = 1;
            }
            else if (fingers === 2) { // 2 Dedos: Dibujar
                localHoverTrail = [];
                localCurrentPath.push(idx); // Guardamos la posición SUAVIZADA
                localState = 2;
            }
            else if (fingers >= 3) { // 3 Dedos: Vara
                if(localCurrentPath.length > 0) { localPaths.push(localCurrentPath); localCurrentPath = []; }
                localHoverTrail = [];
                localState = 3;
            }

            // --- ENVIAR AL SERVIDOR (Datos Suavizados) ---
            const now = Date.now();
            if (now - lastSentTime > SEND_INTERVAL && typeof socket !== 'undefined') {
                socket.emit('wand_move', {
                    room: ROOM_ID,
                    // Enviamos coordenadas suavizadas para que los otros también te vean preciso
                    x: parseFloat(smoothedTip.x.toFixed(4)),
                    y: parseFloat(smoothedTip.y.toFixed(4)),
                    wx: parseFloat(lm[0].x.toFixed(4)),
                    wy: parseFloat(lm[0].y.toFixed(4)),
                    s: localState,
                    c: myColor,
                    n: myName
                });
                lastSentTime = now;
            }
        } else {
            // Si pierde la mano
            if(localCurrentPath.length > 0) { localPaths.push(localCurrentPath); localCurrentPath = []; }
            positionHistory.length = 0;
        }
    }


    // =======================================================
    // 3. SOCKETS (Recepción)
    // =======================================================
    if (typeof socket !== 'undefined') {
        socket.on('wand_remote_update', (d) => {
            if (!remoteWands[d.id]) remoteWands[d.id] = { trail: [] };
            const r = remoteWands[d.id];

            r.last = Date.now();
            r.s = d.s; r.c = d.c || 'yellow'; r.n = d.n || 'Invitado';

            // Espejo horizontal
            r.x = (1 - d.x) * canvas.width;
            r.y = d.y * canvas.height;
            r.wx = (1 - d.wx) * canvas.width;
            r.wy = d.wy * canvas.height;

            if (d.s === 1) {
                r.trail.push({x: r.x, y: r.y});
                if (r.trail.length > MAX_TRAIL) r.trail.shift();
            } else {
                r.trail = [];
            }
        });

        socket.on('force_clear_event', () => {
            console.log("Limpieza global recibida");
            localPaths = []; localCurrentPath = []; localHoverTrail = [];
            remoteWands = {};
            positionHistory.length = 0;
        });
    }


    // =======================================================
    // 4. FUNCIONES DE DIBUJO (Se ejecutan en RenderLoop)
    // =======================================================

    function drawLocalVisuals() {
        localPaths.forEach(p => drawPath(p, '#FF0000', 4));
        if (localCurrentPath.length > 0) drawPath(localCurrentPath, '#FF0000', 4);

        if (localState === 1) { // Láser
            drawTrail(localHoverTrail, myColor);
            drawNameTag(localPos.x, localPos.y, myName, myColor);
        } else if (localState === 2) { // Punto Dibujo
            ctx.beginPath(); ctx.arc(localPos.x, localPos.y, 5, 0, Math.PI*2);
            ctx.fillStyle = "red"; ctx.fill();
            drawNameTag(localPos.x, localPos.y, myName, "white");
        } else if (localState === 3) { // Vara
            drawStick(localWrist, localPos, myColor);
            drawNameTag(localPos.x, localPos.y, myName, myColor);
        }
    }

    function drawRemoteWands() {
        const now = Date.now();
        for (const [id, r] of Object.entries(remoteWands)) {
            if (now - r.last > 3000) { delete remoteWands[id]; continue; }

            if (r.s === 1) {
                drawTrail(r.trail, r.c);
                drawNameTag(r.x, r.y, r.n, r.c);
            }
            else if (r.s === 2) {
                ctx.beginPath(); ctx.arc(r.x, r.y, 8, 0, Math.PI*2);
                ctx.fillStyle = r.c; ctx.fill();
                drawNameTag(r.x, r.y, r.n, r.c);
            }
            else if (r.s === 3) {
                drawStick({x: r.wx, y: r.wy}, {x: r.x, y: r.y}, r.c);
                drawNameTag(r.x, r.y, r.n, r.c);
            }
        }
    }

    // Utiles
    function drawNameTag(x, y, text, color) {
        ctx.save();
        ctx.font = "bold 14px Segoe UI";
        ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4;
        ctx.fillStyle = "white";
        ctx.fillText(text, x + 15, y);
        ctx.strokeStyle = "black"; ctx.lineWidth = 0.5;
        ctx.strokeText(text, x + 15, y);
        ctx.restore();
    }
    function drawTrail(arr, c) {
        if(arr.length<2) return;
        ctx.beginPath(); ctx.moveTo(arr[0].x, arr[0].y);
        for(let i=1; i<arr.length; i++) ctx.lineTo(arr[i].x, arr[i].y);
        ctx.strokeStyle=c; ctx.lineWidth=6; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.shadowBlur=10; ctx.shadowColor=c; ctx.stroke(); ctx.shadowBlur=0;
    }
    function drawStick(s, e, c) {
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y);
        ctx.strokeStyle=c; ctx.lineWidth=8; ctx.lineCap='round';
        ctx.globalAlpha=0.7; ctx.stroke(); ctx.globalAlpha=1.0;
        ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI*2); ctx.fillStyle="white"; ctx.fill();
    }
    function drawPath(p, c, w) {
        if(p.length<2) return;
        ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y);
        for(let i=1; i<p.length; i++) {
            const midX = (p[i-1].x + p[i].x)/2;
            const midY = (p[i-1].y + p[i].y)/2;
            ctx.quadraticCurveTo(p[i-1].x, p[i-1].y, midX, midY);
        }
        ctx.lineTo(p[p.length-1].x, p[p.length-1].y);
        ctx.strokeStyle=c; ctx.lineWidth=w; ctx.lineCap='round'; ctx.stroke();
    }

    // Helpers
    function toPixels(lm) { return {x: (1-lm.x)*canvas.width, y: lm.y*canvas.height}; }
    function countFingers(lm) { let c=0; [8,12,16,20].forEach((t,i)=>{ if(lm[t].y < lm[[6,10,14,18][i]].y) c++; }); return c; }
    function getRandomColor() { return ['#00ffcc', '#ff00ff', '#ffff00', '#00ff00', '#ff9900'][Math.floor(Math.random()*5)]; }

    // Botón
    btnWand.addEventListener('click', async () => {
        isWandActive = !isWandActive;
        if (isWandActive) {
            btnWand.classList.add('wand-active'); btnWand.innerText = "🛑 Detener";
            positionHistory.length = 0; // Reset suavizado
            camera = new Camera(videoInput, { onFrame: async()=>{ if(isWandActive) await hands.send({image:videoInput}); }, width:1280, height:720 });
            await camera.start();
        } else {
            btnWand.classList.remove('wand-active'); btnWand.innerText = "🪄 Varita IA";
            if(camera) await camera.stop();
            if (typeof socket !== 'undefined') socket.emit('wand_move', { s: 0, room: ROOM_ID });
        }
    });

    // Limpieza al salir
    window.addEventListener('beforeunload', () => {
        if (typeof socket !== 'undefined') socket.emit('wand_move', { s: 0, room: ROOM_ID });
    });
});