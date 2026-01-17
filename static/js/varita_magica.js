/* static/js/varita_magica.js */
/**
 * varita_magica.js - Versión Definitiva MULTIJUGADOR:
 * Sincronización de varitas, nombres y colores.
 */
document.addEventListener('DOMContentLoaded', () => {
    const btnWand = document.getElementById('btn-magic-wand');
    const canvas = document.getElementById('magic-canvas');

    if (!btnWand || !canvas) return;

    const ctx = canvas.getContext('2d');

    // Video oculto
    const videoInput = document.createElement('video');
    videoInput.style.display = 'none';
    document.body.appendChild(videoInput);

    let isWandActive = false;
    let camera = null;

    // --- ESTADO LOCAL ---
    let drawnPaths = [];       // Dibujos persistentes locales
    let currentPath = [];      // Trazo actual
    let hoverTrail = [];       // Cola del cometa
    const MAX_TRAIL_LENGTH = 15;

    // Configuración de Identidad
    const myColor = getRandomColor();
    const myName = (typeof USER_NAME !== 'undefined') ? USER_NAME : 'Yo';

    // --- ESTADO REMOTO (Multijugador) ---
    // Guardamos las varitas de otros: { 'socket_id': { x, y, state, color, name, ... } }
    let remoteWands = {};

    // --- OPTIMIZACIÓN DE RED ---
    let lastSentTime = 0;
    const SEND_INTERVAL = 50; // Enviar máx cada 50ms (~20 FPS)

    // 1. Configuración MediaPipe
    const hands = new Hands({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }});

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.6
    });

    hands.onResults(onResults);

    // 2. Lógica Principal por Frame
    function onResults(results) {
        // Limpieza: Borrar canvas completo
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // A. DIBUJAR REMOTOS (Fantasmas de otros usuarios)
        // Lo hacemos antes para que tu mano quede encima
        drawRemoteWands();

        // B. DIBUJAR LOCAL (Si está activo)
        if (!isWandActive) {
            // Si está apagado, solo vemos a los demás y salimos
            return;
        }

        // Siempre redibujar mis trazos guardados
        drawSavedPaths();

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const fingers = countFingers(landmarks);

            // Coordenadas
            const indexTip = landmarks[8]; // Normalizada 0-1
            const wrist = landmarks[0];    // Normalizada 0-1

            // Convertir a pixeles para dibujar localmente
            const pxIndex = toPixels(indexTip);
            const pxWrist = toPixels(wrist);

            let currentState = 0; // 0:Nada, 1:Láser, 2:Dibujar, 3:Vara

            // === MÁQUINA DE ESTADOS LOCAL ===

            // ESTADO 0: PUÑO (Borrar Todo)
            if (fingers === 0) {
                if (drawnPaths.length > 0 || currentPath.length > 0) {
                    drawnPaths = [];
                    currentPath = [];
                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText("", 50, 50);
                }
                hoverTrail = [];
                currentState = 0;
            }
            // ESTADO 1: UN DEDO (Cursor Láser)
            else if (fingers === 1) {
                saveCurrentPath();
                hoverTrail.push(pxIndex);
                if (hoverTrail.length > MAX_TRAIL_LENGTH) hoverTrail.shift();

                // Dibujar rastro con MI color
                drawHoverTrail(hoverTrail, myColor);
                currentState = 1;
            }
            // ESTADO 2: DOS DEDOS (Dibujar)
            else if (fingers === 2) {
                hoverTrail = [];
                currentPath.push(pxIndex);

                // Feedback visual en el dedo
                ctx.beginPath();
                ctx.arc(pxIndex.x, pxIndex.y, 5, 0, 2 * Math.PI);
                ctx.fillStyle = "red";
                ctx.fill();
                currentState = 2;
            }
            // ESTADO 3: TRES DEDOS (Vara)
            else if (fingers >= 3) {
                saveCurrentPath();
                hoverTrail = [];
                drawPointerStick(pxWrist, pxIndex, myColor);
                currentState = 3;
            }

            // --- ENVÍO A LA RED (Optimizado) ---
            const now = Date.now();
            if (now - lastSentTime > SEND_INTERVAL) {
                // Preparamos paquete ligero
                const packet = {
                    x: parseFloat(indexTip.x.toFixed(4)),
                    y: parseFloat(indexTip.y.toFixed(4)),
                    wx: parseFloat(wrist.x.toFixed(4)), // Muñeca X
                    wy: parseFloat(wrist.y.toFixed(4)), // Muñeca Y
                    s: currentState,
                    c: myColor,
                    n: myName
                };

                if (typeof socket !== 'undefined') {
                    socket.emit('wand_move', packet);
                }
                lastSentTime = now;
            }

        } else {
            // Sin mano detectada
            saveCurrentPath();
            hoverTrail = [];
        }

        // Dibujar el trazo actual (Rojo)
        if (currentPath.length > 0) {
            drawPath(currentPath, '#FF0000', 4);
        }
    }

    // --- 3. RECEPCIÓN DE DATOS (Socket) ---
    if (typeof socket !== 'undefined') {
        socket.on('wand_remote_update', (data) => {
            // data trae: { id, x, y, wx, wy, s, c, n }

            if (!remoteWands[data.id]) {
                remoteWands[data.id] = { trail: [] };
            }

            const remote = remoteWands[data.id];
            remote.lastUpdate = Date.now();
            remote.state = data.s;
            remote.color = data.c || '#FFFF00';
            remote.name = data.n || 'Invitado';

            // Convertir coordenadas remotas a pixeles locales
            // IMPORTANTE: (1-x) para efecto espejo consistente
            const pxX = (1 - data.x) * canvas.width;
            const pxY = data.y * canvas.height;

            remote.x = pxX;
            remote.y = pxY;

            // Lógica visual remota
            if (data.s === 1) { // Hover
                remote.trail.push({x: pxX, y: pxY});
                if (remote.trail.length > MAX_TRAIL_LENGTH) remote.trail.shift();
            } else if (data.s === 3) { // Vara
                 remote.wx = (1 - data.wx) * canvas.width;
                 remote.wy = data.wy * canvas.height;
            } else if (data.s === 0) { // Nada
                 remote.trail = [];
            }
        });
    }

    // --- 4. FUNCIONES DE DIBUJO ---

    function drawRemoteWands() {
        const now = Date.now();

        for (const [id, remote] of Object.entries(remoteWands)) {
            // Limpieza de usuarios inactivos (>3 seg)
            if (now - remote.lastUpdate > 3000) {
                delete remoteWands[id];
                continue;
            }

            // Dibujar según estado remoto
            if (remote.state === 1) {
                // Modo Cometa
                drawHoverTrail(remote.trail, remote.color);
                drawNameTag(remote.x, remote.y, remote.name, remote.color);
            }
            else if (remote.state === 2) {
                // Modo Dibujando (Punto)
                ctx.beginPath();
                ctx.arc(remote.x, remote.y, 8, 0, Math.PI * 2);
                ctx.fillStyle = remote.color;
                ctx.fill();
                drawNameTag(remote.x, remote.y, remote.name, remote.color);
            }
            else if (remote.state === 3) {
                // Modo Vara
                drawPointerStick({x: remote.wx, y: remote.wy}, {x: remote.x, y: remote.y}, remote.color);
                drawNameTag(remote.x, remote.y, remote.name, remote.color);
            }
        }
    }

    function drawNameTag(x, y, name, color) {
        ctx.font = "bold 14px Segoe UI";
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 3;
        ctx.strokeText(name, x + 15, y);
        ctx.fillText(name, x + 15, y);
    }

    function saveCurrentPath() {
        if (currentPath.length > 0) {
            drawnPaths.push(currentPath);
            currentPath = [];
        }
    }

    function toPixels(landmark) {
        return {
            x: (1 - landmark.x) * canvas.width,
            y: landmark.y * canvas.height
        };
    }

    function countFingers(landmarks) {
        let count = 0;
        const tips = [8, 12, 16, 20];
        const pips = [6, 10, 14, 18];
        tips.forEach((tipIdx, i) => {
            if (landmarks[tipIdx].y < landmarks[pips[i]].y) count++;
        });
        return count;
    }

    // Modificado para aceptar color dinámico
    function drawHoverTrail(trailArr, color) {
        if (trailArr.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(trailArr[0].x, trailArr[0].y);
        for (let i = 1; i < trailArr.length; i++) {
            const p0 = trailArr[i-1];
            const p1 = trailArr[i];
            const midX = (p0.x + p1.x) / 2;
            const midY = (p0.y + p1.y) / 2;
            ctx.quadraticCurveTo(p0.x, p0.y, midX, midY);
        }
        ctx.lineTo(trailArr[trailArr.length-1].x, trailArr[trailArr.length-1].y);

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = color; // Color dinámico
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    function drawPointerStick(start, end, color) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineWidth = 8;
        ctx.strokeStyle = color; // Color dinámico
        ctx.globalAlpha = 0.7;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        ctx.beginPath();
        ctx.arc(end.x, end.y, 8, 0, 2*Math.PI);
        ctx.fillStyle = "#FFFFFF"; // Punta blanca
        ctx.fill();
    }

    function drawPath(path, color, width) {
        if (path.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
            const midX = (path[i-1].x + path[i].x) / 2;
            const midY = (path[i-1].y + path[i].y) / 2;
            ctx.quadraticCurveTo(path[i-1].x, path[i-1].y, midX, midY);
        }
        ctx.lineTo(path[path.length-1].x, path[path.length-1].y);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
    }

    function drawSavedPaths() {
        drawnPaths.forEach(path => drawPath(path, '#FF0000', 4));
    }

    function getRandomColor() {
        const colors = ['#00ffcc', '#ff00ff', '#ffff00', '#00ff00', '#ff9900', '#3399ff'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // --- 5. Botón Activar/Desactivar (CON RECUPERACIÓN) ---
    btnWand.addEventListener('click', async () => {
        isWandActive = !isWandActive;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;

        if (isWandActive) {
            btnWand.classList.add('wand-active');
            btnWand.innerText = "🛑 Detener";

            // Crear cámara nueva (Fix para cambio de pestañas)
            camera = new Camera(videoInput, {
                onFrame: async () => {
                    if(isWandActive) await hands.send({image: videoInput});
                },
                width: 1280,
                height: 720
            });
            await camera.start();

        } else {
            // APAGAR
            btnWand.classList.remove('wand-active');
            btnWand.innerText = "🪄 Varita IA";

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawnPaths = [];
            currentPath = [];
            hoverTrail = [];

            // Avisar a red que me fui
            if (typeof socket !== 'undefined') socket.emit('wand_move', { s: 0 });

            // Matar cámara
            if (camera) { await camera.stop(); camera = null; }
            if (videoInput.srcObject) {
                videoInput.srcObject.getTracks().forEach(track => track.stop());
                videoInput.srcObject = null;
            }

            // Forzar un limpiado extra para borrar remotos si ya no hay loop
            // Nota: Al parar la cámara, onResults deja de ejecutarse.
            // Si quieres seguir viendo a los demás con tu varita apagada,
            // necesitaríamos un requestAnimationFrame separado.
            // Por ahora, al apagar, se limpia todo.
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });

    window.addEventListener('resize', () => {
        if(canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }
    });
});