document.addEventListener('DOMContentLoaded', () => {
    const btnWand = document.getElementById('btn-magic-wand');
    const canvas = document.getElementById('magic-canvas');
    if (!btnWand || !canvas) {
        console.error(" Elementos de varita no encontrados");
        return;
    }

    console.log(" Varita Mágica iniciada");

    const ctx = canvas.getContext('2d');

    // Video oculto
    const videoInput = document.createElement('video');
    videoInput.style.display = 'none';
    document.body.appendChild(videoInput);

    let isWandActive = false;
    let camera = null;

    // Estado local
    let drawnPaths = [];
    let currentPath = [];
    let hoverTrail = [];
    const MAX_TRAIL_LENGTH = 15;

    // Identidad
    const myColor = getRandomColor();
    const myName = (typeof USER_NAME !== 'undefined') ? USER_NAME : 'Anónimo';
    console.log(` Mi color: ${myColor}, Mi nombre: ${myName}`);

    // Estado remoto
    let remoteWands = {};

    // Optimización
    let lastSentTime = 0;
    const SEND_INTERVAL = 40;

    // MediaPipe
    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7
    });
    hands.onResults(onResults);

    function onResults(results) {
        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. SIEMPRE dibujar remotos (incluso si mi varita está apagada)
        drawRemoteWands();

        if (!isWandActive) return;

        // 2. Dibujar local
        drawSavedPaths();

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const fingers = countFingers(landmarks);

            const indexTip = landmarks[8];
            const wrist = landmarks[0];
            const pxIndex = toPixels(indexTip);
            const pxWrist = toPixels(wrist);

            let currentState = 0;

            // Lógica de dedos
            if (fingers === 0) {
                if(drawnPaths.length > 0) drawnPaths = [];
                currentPath = [];
                hoverTrail = [];
                currentState = 0;
            }
            else if (fingers === 1) {
                saveCurrentPath();
                hoverTrail.push(pxIndex);
                if (hoverTrail.length > MAX_TRAIL_LENGTH) hoverTrail.shift();
                drawHoverTrail(hoverTrail, myColor);
                drawNameTag(pxIndex.x, pxIndex.y, myName, myColor);
                currentState = 1;
            }
            else if (fingers === 2) {
                hoverTrail = [];
                currentPath.push(pxIndex);
                ctx.beginPath();
                ctx.arc(pxIndex.x, pxIndex.y, 5, 0, Math.PI*2);
                ctx.fillStyle = "red";
                ctx.fill();
                drawNameTag(pxIndex.x, pxIndex.y, myName, "white");
                currentState = 2;
            }
            else if (fingers >= 3) {
                saveCurrentPath();
                hoverTrail = [];
                drawPointerStick(pxWrist, pxIndex, myColor);
                drawNameTag(pxIndex.x, pxIndex.y, myName, myColor);
                currentState = 3;
            }

            if (currentPath.length > 0) drawPath(currentPath, '#FF0000', 4);

            // ENVIAR A LA RED
            const now = Date.now();
            if (now - lastSentTime > SEND_INTERVAL && typeof socket !== 'undefined') {
                const packet = {
                    room: ROOM_ID,
                    x: parseFloat(indexTip.x.toFixed(4)),
                    y: parseFloat(indexTip.y.toFixed(4)),
                    wx: parseFloat(wrist.x.toFixed(4)),
                    wy: parseFloat(wrist.y.toFixed(4)),
                    s: currentState,
                    c: myColor,
                    n: myName
                };

                console.log("📡 Enviando wand_move:", packet);
                socket.emit('wand_move', packet);
                lastSentTime = now;
            }
        } else {
            saveCurrentPath();
            hoverTrail = [];
        }
    }

    // SOCKETS: RECIBIR DATOS
    if (typeof socket !== 'undefined') {
        console.log(" Socket conectado, escuchando eventos de varita");

        socket.on('wand_remote_update', (d) => {
            console.log(" Recibido wand_remote_update:", d);

            if (!remoteWands[d.id]) {
                remoteWands[d.id] = { trail: [] };
                console.log(`👤 Nueva varita remota detectada: ${d.n} (${d.id})`);
            }

            const r = remoteWands[d.id];
            r.lastUpdate = Date.now();
            r.state = d.s;
            r.color = d.c || 'yellow';
            r.name = d.n || 'Invitado';

            // Espejo invertido
            r.x = (1 - d.x) * canvas.width;
            r.y = d.y * canvas.height;
            r.wx = (1 - d.wx) * canvas.width;
            r.wy = d.wy * canvas.height;

            if (d.s === 1) {
                r.trail.push({x: r.x, y: r.y});
                if (r.trail.length > MAX_TRAIL_LENGTH) r.trail.shift();
            } else {
                r.trail = [];
            }
        });

        socket.on('force_clear_event', () => {
            console.log(" Limpiando Varita...");
            drawnPaths = [];
            currentPath = [];
            hoverTrail = [];
            remoteWands = {};
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        });
    } else {
        console.error(" Socket NO está disponible");
    }

    // Funciones gráficas
    function drawRemoteWands() {
        const now = Date.now();
        let activeWands = 0;

        for (const [id, r] of Object.entries(remoteWands)) {
            if (now - r.lastUpdate > 3000) {
                console.log(` Varita ${id} expirada (timeout)`);
                delete remoteWands[id];
                continue;
            }

            activeWands++;

            if (r.state === 1) {
                drawHoverTrail(r.trail, r.color);
                drawNameTag(r.x, r.y, r.name, r.color);
            }
            else if (r.state === 2) {
                ctx.beginPath();
                ctx.arc(r.x, r.y, 8, 0, Math.PI*2);
                ctx.fillStyle = r.color;
                ctx.fill();
                drawNameTag(r.x, r.y, r.name, r.color);
            }
            else if (r.state === 3) {
                drawPointerStick({x: r.wx, y: r.wy}, {x: r.x, y: r.y}, r.color);
                drawNameTag(r.x, r.y, r.name, r.color);
            }
        }

        if (activeWands > 0) {
            console.log(`👥 Varitas remotas activas: ${activeWands}`);
        }
    }

    function drawNameTag(x, y, name, color) {
        ctx.save();
        ctx.font = "bold 14px Arial";
        ctx.shadowColor = "black";
        ctx.shadowBlur = 4;
        ctx.fillStyle = color;
        ctx.fillText(name, x + 15, y);
        ctx.restore();
    }

    function drawHoverTrail(arr, c) {
        if (arr.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(arr[0].x, arr[0].y);
        for (let i = 1; i < arr.length; i++) ctx.lineTo(arr[i].x, arr[i].y);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = c;
        ctx.shadowBlur = 10;
        ctx.shadowColor = c;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    function drawPointerStick(s, e, c) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.lineWidth = 8;
        ctx.strokeStyle = c;
        ctx.lineCap = "round";
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 8, 0, Math.PI*2);
        ctx.fillStyle = "white";
        ctx.fill();
    }

    function drawPath(p, c, w) {
        if (p.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
    }

    function saveCurrentPath() {
        if (currentPath.length > 0) {
            drawnPaths.push(currentPath);
            currentPath = [];
        }
    }

    function drawSavedPaths() {
        drawnPaths.forEach(p => drawPath(p, '#FF0000', 4));
    }

    function toPixels(lm) {
        return {
            x: (1 - lm.x) * canvas.width,
            y: lm.y * canvas.height
        };
    }

    function countFingers(lm) {
        let c = 0;
        [8,12,16,20].forEach((t,i) => {
            if(lm[t].y < lm[[6,10,14,18][i]].y) c++;
        });
        return c;
    }

    function getRandomColor() {
        return ['#00ffcc', '#ff00ff', '#ffff00', '#00ff00', '#ff9900'][Math.floor(Math.random()*5)];
    }

    // Botón
    btnWand.addEventListener('click', async () => {
        isWandActive = !isWandActive;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;

        if (isWandActive) {
            console.log("🪄 Varita ACTIVADA");
            btnWand.classList.add('wand-active');
            btnWand.innerText = " Detener";

            camera = new Camera(videoInput, {
                onFrame: async() => {
                    if(isWandActive) await hands.send({image:videoInput});
                },
                width:1280,
                height:720
            });
            await camera.start();
        } else {
            console.log(" Varita DESACTIVADA");
            btnWand.classList.remove('wand-active');
            btnWand.innerText = "🪄 Varita IA";

            if(camera) await camera.stop();
            ctx.clearRect(0,0,canvas.width, canvas.height);

            // Avisar que se apagó
            if (typeof socket !== 'undefined') {
                socket.emit('wand_move', { s: 0, room: ROOM_ID });
            }
        }
    });

    window.addEventListener('resize', () => {
        if(canvas.parentElement) {
            canvas.width = canvas.parentElement.clientWidth;
            canvas.height = canvas.parentElement.clientHeight;
        }
    });
});