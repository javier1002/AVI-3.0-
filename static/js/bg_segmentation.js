/**
 * bg_segmentation.js v4 (FINAL - TRANSPARENCIA REAL)
 * Chroma key con MediaPipe.
 * Permite que el contenedor de la cámara se vuelva invisible
 * para lograr una integración real tipo "sticker" sobre el fondo.
 */

;(function() {
'use strict';

// ─── 1. Estilos CSS ──────────────────────────────────────────────────────
const CSS = `
/* CLASE CRÍTICA PARA TRANSPARENCIA REAL */
.participant.is-transparent {
    background-color: transparent !important;
    border: none !important;
    box-shadow: none !important;
}
/* Asegura que el canvas de segmentación no tenga fondo */
.bgseg-canvas {
    background: transparent !important;
}

/* Estilos del botón disparador */
.bgseg-trigger {
    position: absolute;
    top: 8px; right: 8px; z-index: 30;
    width: 34px; height: 34px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.5);
    background: rgba(0,0,0,0.55);
    color: #fff; font-size: 16px;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    transition: all 0.2s; opacity: 0; pointer-events: none;
}
.participant:hover .bgseg-trigger, .bgseg-trigger.open { opacity: 1; pointer-events: all; }
.bgseg-trigger:hover { background: rgba(0,0,0,0.8); transform: scale(1.1); }
.bgseg-trigger.on { border-color: #00e676; box-shadow: 0 0 10px rgba(0,230,118,0.6); background: rgba(0,230,118,0.2); }

/* Estilos del Popup */
.bgseg-popup {
    position: absolute; top: 50px; right: 8px; z-index: 31;
    background: rgba(15, 20, 35, 0.95); backdrop-filter: blur(16px);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 16px;
    padding: 12px; display: none; flex-direction: column; gap: 12px;
    min-width: 180px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);
    animation: bgPopIn 0.2s ease-out;
}
.bgseg-popup.open { display: flex; }
@keyframes bgPopIn { from {opacity:0; transform:translateY(-10px) scale(0.95);} to {opacity:1; transform:translateY(0) scale(1);} }

.bgseg-popup-title {
    font-size: 11px; font-weight: 700; letter-spacing: 1px;
    text-transform: uppercase; color: rgba(255,255,255,0.5);
    margin-bottom: 4px;
}

/* Rejilla de colores */
.bgseg-colors { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.bgseg-swatch {
    aspect-ratio: 1; border-radius: 10px;
    border: 2px solid rgba(255,255,255,0.15);
    cursor: pointer; position: relative; overflow: hidden;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.bgseg-swatch:hover { transform: translateY(-3px); border-color: rgba(255,255,255,0.8); }
.bgseg-swatch.active { border-color: #00e676; box-shadow: 0 0 12px rgba(0,230,118,0.5); transform: scale(1.1); z-index: 2; }

/* Iconos para transparente y blur */
.bgseg-swatch-icon {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 18px; background: rgba(0,0,0,0.3); backdrop-filter: blur(2px);
}
.bgseg-trans-bg {
    background: repeating-linear-gradient(45deg, #444 25%, transparent 25%, transparent 75%, #444 75%, #444),
                repeating-linear-gradient(45deg, #444 25%, #333 25%, #333 75%, #444 75%, #444);
    background-size: 10px 10px; background-position: 0 0, 5px 5px;
}

/* Selector personalizado y botón de apagado */
.bgseg-custom-row {
    display: flex; align-items: center; gap: 10px; font-size: 12px; color: #ccc;
    background: rgba(255,255,255,0.05); padding: 8px; border-radius: 10px;
}
.bgseg-custom-row input[type=color] {
    width: 32px; height: 32px; border: none; border-radius: 50%; padding: 0; cursor: pointer; background: none;
    box-shadow: 0 0 0 2px rgba(255,255,255,0.2); transition: box-shadow 0.2s;
}
.bgseg-custom-row input[type=color]:hover { box-shadow: 0 0 0 2px rgba(255,255,255,0.8); }
.bgseg-custom-row input[type=color]::-webkit-color-swatch-wrapper { padding: 0; }
.bgseg-custom-row input[type=color]::-webkit-color-swatch { border: none; border-radius: 50%; }

.bgseg-off-btn {
    width: 100%; padding: 10px; border-radius: 10px; border: 1px solid rgba(255, 90, 90, 0.3);
    background: rgba(255, 90, 90, 0.1); color: #ff8a80; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
}
.bgseg-off-btn:hover { background: rgba(255, 90, 90, 0.25); border-color: #ff5a5a; color: white; }

/* Overlay de carga */
.bgseg-loading-overlay {
    position: absolute; inset: 0; z-index: 50; background: rgba(10,12,25,0.95);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 15px; color: #fff; font-size: 13px; font-weight: 500; border-radius: inherit; backdrop-filter: blur(5px);
}
.bgseg-spinner {
    width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #00e676;
    border-radius: 50%; animation: bgspin 1s cubic-bezier(0.6, 0, 0.4, 1) infinite;
}
@keyframes bgspin { to { transform: rotate(360deg); } }
`;

function injectCSS() {
    if (document.getElementById('bgseg-css')) return;
    const s = document.createElement('style'); s.id = 'bgseg-css'; s.textContent = CSS; document.head.appendChild(s);
}

// ─── 2. Configuración ────────────────────────────────────────────────────
const PRESETS = [
    { color: 'transparent', label: 'Transparente Real (Ver detrás)' },
    { color: 'blur',        label: 'Desenfoque (Blur)' },
    { color: '#00b341',     label: 'Verde Chroma' },
    { color: '#222222',     label: 'Negro Oficina' },
    { color: '#ffffff',     label: 'Blanco Estudio' },
    { color: '#3D5AFE',     label: 'Azul Intenso' },
    { color: '#FFD700',     label: 'Dorado' },
    { color: '#FF3D00',     label: 'Naranja' },
];

// Carga diferida de MediaPipe
let _mpReady = false, _mpLoading = null;
function loadMediaPipe() {
    if (_mpReady) return Promise.resolve();
    if (_mpLoading) return _mpLoading;
    _mpLoading = new Promise((res, rej) => {
        const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/';
        const srcs = [CDN + 'camera_utils/camera_utils.js', CDN + 'selfie_segmentation/selfie_segmentation.js'];
        let loaded = 0;
        srcs.forEach(src => {
            if (document.querySelector(`script[src="${src}"]`)) { if (++loaded === srcs.length) { _mpReady=true; res(); } return; }
            const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
            s.onload = ()=>{if(++loaded===srcs.length){_mpReady=true;res();}}; s.onerror=()=>rej(new Error('Error cargando MediaPipe: '+src));
            document.head.appendChild(s);
        });
    });
    return _mpLoading;
}

// ─── 3. Motor de Segmentación ────────────────────────────────────────────
function createInstance() {
    let _seg=null, _cam=null, _video=null, _cvOut=null, _ctxOut=null, _tmpCanvas=null, _tmpCtx=null, _rawStream=null;
    let _active=false, _bgColor='transparent', _mirror=false, _wrapEl=null;

    // Función auxiliar para actualizar el estado del contenedor (transparencia)
    function updateContainerState() {
        if (!_wrapEl) return;
        if (_bgColor === 'transparent') {
            _wrapEl.classList.add('is-transparent');
        } else {
            _wrapEl.classList.remove('is-transparent');
        }
    }

    function onFrame(results) {
        if (!_ctxOut || !results.segmentationMask) return;
        const w = _cvOut.width, h = _cvOut.height;
        if (!_tmpCanvas || _tmpCanvas.width !== w || _tmpCanvas.height !== h) {
            _tmpCanvas = document.createElement('canvas'); _tmpCanvas.width = w; _tmpCanvas.height = h; _tmpCtx = _tmpCanvas.getContext('2d');
        }

        _ctxOut.save();
        _ctxOut.clearRect(0, 0, w, h); // Limpiar siempre el canvas principal
        if (_mirror) { _ctxOut.translate(w, 0); _ctxOut.scale(-1, 1); }

        // 1. Dibujar fondo (si no es transparente)
        if (_bgColor === 'blur') {
            _ctxOut.filter = 'blur(20px)'; _ctxOut.drawImage(results.image, 0, 0, w, h); _ctxOut.filter = 'none';
        } else if (_bgColor !== 'transparent') {
            _ctxOut.fillStyle = _bgColor; _ctxOut.fillRect(0, 0, w, h);
        }

        // 2. Recortar y pegar persona
        _tmpCtx.clearRect(0, 0, w, h);
        _tmpCtx.drawImage(results.segmentationMask, 0, 0, w, h);
        _tmpCtx.globalCompositeOperation = 'source-in';
        _tmpCtx.drawImage(results.image, 0, 0, w, h);
        _tmpCtx.globalCompositeOperation = 'source-over';
        _ctxOut.drawImage(_tmpCanvas, 0, 0);

        _ctxOut.restore();
    }

    async function start(wrap, opts = {}) {
        if (_active) return;
        _wrapEl = wrap;
        _bgColor = opts.bgColor || 'transparent';
        _mirror  = opts.mirror  || false;

        updateContainerState(); // Aplicar estado inicial del contenedor

        const spinner = document.createElement('div'); spinner.className = 'bgseg-loading-overlay';
        spinner.innerHTML = '<div class="bgseg-spinner"></div><span>Cargando IA...</span>'; wrap.appendChild(spinner);

        try {
            await loadMediaPipe();
            _seg = new SelfieSegmentation({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}` });
            _seg.setOptions({ modelSelection: 1, selfieMode: true });
            _seg.onResults(onFrame); await _seg.initialize();

            _rawStream = await navigator.mediaDevices.getUserMedia({ video: { width:{ideal:640}, height:{ideal:480}, facingMode:'user' }, audio: false });
            _video = document.createElement('video'); _video.srcObject = _rawStream; _video.autoplay = true; _video.playsInline = true; _video.muted = true;
            _video.style.cssText = 'position:absolute; opacity:0; pointer-events:none; width:1px; height:1px;'; document.body.appendChild(_video); await _video.play();

            _cvOut = document.createElement('canvas'); _cvOut.className = 'bgseg-canvas';
            _cvOut.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:10; pointer-events:none;';
            _cvOut.width = _video.videoWidth || 640; _cvOut.height = _video.videoHeight || 480; _ctxOut = _cvOut.getContext('2d');

            const iframe = wrap.querySelector('iframe'); if (iframe) iframe.style.opacity = '0';
            wrap.insertBefore(_cvOut, wrap.firstChild);

            _cam = new Camera(_video, {
                onFrame: async () => {
                    const vw=_video.videoWidth||640, vh=_video.videoHeight||480;
                    if(_cvOut.width!==vw || _cvOut.height!==vh){_cvOut.width=vw;_cvOut.height=vh;}
                    await _seg.send({image:_video});
                }, width: 640, height: 480
            });
            await _cam.start(); _active = true;
        } finally { spinner.remove(); }
    }

    function stop() {
        if (_wrapEl) _wrapEl.classList.remove('is-transparent'); // Restaurar contenedor
        try { if (_cam) _cam.stop(); } catch(e){} try { if (_seg) _seg.close(); } catch(e){}
        if (_video) { _video.srcObject = null; _video.remove(); }
        if (_rawStream) _rawStream.getTracks().forEach(t => t.stop());
        if (_cvOut) _cvOut.remove();
        const iframe = _wrapEl && _wrapEl.querySelector('iframe'); if (iframe) iframe.style.opacity = '1';
        _cam=_seg=_video=_rawStream=_cvOut=_ctxOut=_tmpCanvas=_tmpCtx=_wrapEl=null; _active = false;
    }

    function setColor(c) {
        _bgColor = c;
        updateContainerState(); // Actualizar contenedor al cambiar color
    }
    function setMirror(v){ _mirror = v; }
    function isActive()  { return _active; }

    return { start, stop, setColor, setMirror, isActive };
}

// ─── 4. Interfaz de Usuario (UI) ─────────────────────────────────────────
function attachUI(boxEl, socketId) {
    if (boxEl.querySelector('.bgseg-trigger')) return;
    let wrap = boxEl; let instance = null; let popupOpen = false; let activeColor = 'transparent';

    const trigger = document.createElement('button'); trigger.className = 'bgseg-trigger';
    trigger.title = 'Efectos de Fondo'; trigger.innerHTML = '✨'; wrap.appendChild(trigger);

    const popup = document.createElement('div'); popup.className = 'bgseg-popup';
    popup.innerHTML = '<div class="bgseg-popup-title">Fondo Virtual</div>';

    const colorsRow = document.createElement('div'); colorsRow.className = 'bgseg-colors';
    PRESETS.forEach(({ color, label }) => {
        const sw = document.createElement('div'); sw.className = 'bgseg-swatch'; sw.title = label;
        if (color === 'transparent') { sw.classList.add('bgseg-trans-bg'); sw.innerHTML = '<span class="bgseg-swatch-icon" style="color:#fff;">🔳</span>'; }
        else if (color === 'blur') { sw.style.background = 'linear-gradient(135deg,#555,#222)'; sw.innerHTML = '<span class="bgseg-swatch-icon">💧</span>'; }
        else { sw.style.backgroundColor = color; }
        if (color === activeColor) sw.classList.add('active');

        sw.addEventListener('click', async () => {
            colorsRow.querySelectorAll('.bgseg-swatch').forEach(s => s.classList.remove('active')); sw.classList.add('active');
            activeColor = color;
            if (instance && instance.isActive()) instance.setColor(color); else await activate();
        });
        colorsRow.appendChild(sw);
    });
    popup.appendChild(colorsRow);

    const customRow = document.createElement('div'); customRow.className = 'bgseg-custom-row';
    customRow.innerHTML = '<span> Color Personalizado</span>';
    const picker = document.createElement('input'); picker.type = 'color'; picker.value = '#00b341';
    picker.addEventListener('input', async () => {
        colorsRow.querySelectorAll('.bgseg-swatch').forEach(s => s.classList.remove('active')); activeColor = picker.value;
        if (instance && instance.isActive()) instance.setColor(picker.value); else await activate();
    });
    customRow.appendChild(picker); popup.appendChild(customRow);

    const offBtn = document.createElement('button'); offBtn.className = 'bgseg-off-btn';
    offBtn.innerHTML = ' Desactivar Efectos'; offBtn.addEventListener('click', deactivate); popup.appendChild(offBtn);
    wrap.appendChild(popup);

    trigger.addEventListener('click', (e) => { e.stopPropagation(); popupOpen=!popupOpen; popup.classList.toggle('open', popupOpen); trigger.classList.toggle('open', popupOpen); });
    document.addEventListener('click', () => { popupOpen=false; popup.classList.remove('open'); trigger.classList.remove('open'); });
    popup.addEventListener('click', e => e.stopPropagation());

    async function activate() {
        if (instance && instance.isActive()) return;
        if (!window.BgSegModule) return;
        instance = createInstance(); const mirror = boxEl.dataset.mirror === 'true';
        try {
            await instance.start(wrap, { bgColor: activeColor, mirror });
            trigger.classList.add('on');
        } catch(err) {
            console.error('[BgSeg]', err); if(window.showToast) showToast('Error: '+err.message, 'error'); instance = null;
        }
    }

    function deactivate() {
        if (instance) { instance.stop(); instance = null; }
        trigger.classList.remove('on'); popupOpen=false; popup.classList.remove('open'); trigger.classList.remove('open');
    }

    trigger.addEventListener('dblclick', async (e) => { e.stopPropagation(); if(!instance || !instance.isActive()) await activate(); else deactivate(); });
}

window.BgSegModule = { attach: attachUI, create: createInstance };
injectCSS();
})();