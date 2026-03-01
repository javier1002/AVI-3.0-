/**
 * bg_segmentation.js  v11  —  DIAGNÓSTICO + FIX DEFINITIVO
 *
 * CAMBIOS CLAVE v11:
 * 1. El viewer recibe bg_frame y lo dibuja — CON LOGS en consola para debug
 * 2. show() se llama en cuanto llega el primer frame (no espera bg_active)
 * 3. bg_active también llama show() directamente
 * 4. setupViewer llama show() inmediatamente si ya hay bg_states activo
 * 5. El viewer pide un "ping" explícito al emisor: bg_viewer_ready
 *    El emisor responde enviando bg_active directo al viewer
 * 6. Reducido FPS a 10 y calidad a 0.4 para evitar overflow de Socket.IO
 */
;(function(){
'use strict';

const LOG = (...a) => console.log('[BgSeg v11]', ...a);

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS=`
.bgseg-btn{position:absolute;top:8px;right:8px;z-index:30;padding:4px 10px;border-radius:16px;border:1.5px solid rgba(255,255,255,.3);background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:600;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s,background .2s;white-space:nowrap;user-select:none;}
.participant:hover .bgseg-btn,.bgseg-btn.open,.bgseg-btn.on{opacity:1;pointer-events:all;}
.bgseg-btn.on{border-color:#00e676;background:rgba(0,40,20,.85);box-shadow:0 0 10px rgba(0,230,118,.5);}
.bgseg-popup{position:absolute;top:42px;right:8px;z-index:35;background:rgba(8,10,22,.97);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px;width:215px;display:none;flex-direction:column;gap:9px;box-shadow:0 12px 36px rgba(0,0,0,.7);}
.bgseg-popup.open{display:flex;}
.bgseg-popup-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.35);}
.bgseg-swatches{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
.bgseg-swatch{aspect-ratio:1;border-radius:7px;border:2px solid rgba(255,255,255,.15);cursor:pointer;transition:transform .13s,border-color .13s;position:relative;overflow:hidden;}
.bgseg-swatch:hover{transform:scale(1.14);border-color:rgba(255,255,255,.5);}
.bgseg-swatch.active{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.3);}
.bgseg-row{display:flex;align-items:center;gap:7px;}
.bgseg-picker{width:26px;height:26px;padding:0;cursor:pointer;border:2px solid rgba(255,255,255,.2);border-radius:6px;background:none;flex-shrink:0;}
.bgseg-off{padding:6px 0;border-radius:8px;width:100%;border:1px solid rgba(255,80,80,.3);background:rgba(255,55,55,.08);color:rgba(255,130,130,.9);font-size:12px;font-weight:600;cursor:pointer;transition:background .15s;}
.bgseg-off:hover{background:rgba(255,55,55,.22);}
.bgseg-loader{position:absolute;inset:0;z-index:40;background:rgba(8,10,22,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;font-size:12px;}
.bgseg-spin{width:28px;height:28px;border:3px solid rgba(255,255,255,.1);border-top-color:#00e676;border-radius:50%;animation:bgspin .72s linear infinite;}
@keyframes bgspin{to{transform:rotate(360deg);}}
.bgseg-badge{position:absolute;top:8px;left:8px;z-index:30;background:rgba(0,200,100,.88);color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;pointer-events:none;display:none;}
.bgseg-badge.on{display:block;}
.participant.bg-float{background:transparent!important;border:none!important;box-shadow:none!important;border-radius:0!important;}
.participant.bg-float .label-participant{display:none!important;}
.participant.bg-float .box-video-wrap{background:transparent!important;overflow:visible!important;}
.bg-person-canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:7;pointer-events:none;background:transparent;}
`;
function injectCSS(){
    if(document.getElementById('bgseg-v11'))return;
    const s=document.createElement('style');s.id='bgseg-v11';s.textContent=CSS;document.head.appendChild(s);
}

const PRESETS=[
    {c:'transparent',l:'Sin fondo',  i:'✕',s:'background:repeating-conic-gradient(#666 0 25%,#333 0 50%) 0 0/10px 10px'},
    {c:'#00b341',    l:'Verde',      i:'', s:'background:#00b341'},
    {c:'#0d47a1',    l:'Azul',       i:'', s:'background:#0d47a1'},
    {c:'#4a148c',    l:'Morado',     i:'', s:'background:#4a148c'},
    {c:'#1a1a2e',    l:'Negro',      i:'', s:'background:#1a1a2e'},
    {c:'#ffffff',    l:'Blanco',     i:'', s:'background:#fff'},
    {c:'blur',       l:'Blur',       i:'🌫️',s:'background:linear-gradient(135deg,#6af,#84f)'},
];

function getSock(){ return window.socket||(typeof socket!=='undefined'?socket:null); }

const K=u=>`bgseg11_${(u||'').toLowerCase().replace(/[^a-z0-9]/g,'')}`;
const save=(u,c)=>{try{c&&c!=='off'?localStorage.setItem(K(u),c):localStorage.removeItem(K(u));}catch(e){}};
const load=u=>{try{return localStorage.getItem(K(u))||null;}catch(e){return null;}};

// ─── MediaPipe ────────────────────────────────────────────────────────────────
let mpOk=false,mpProm=null;
function mpLoad(){
    if(mpOk)return Promise.resolve();
    if(mpProm)return mpProm;
    mpProm=new Promise((res,rej)=>{
        const B='https://cdn.jsdelivr.net/npm/@mediapipe/';
        const S=[B+'camera_utils/camera_utils.js',B+'selfie_segmentation/selfie_segmentation.js'];
        let n=0;
        S.forEach(src=>{
            if(document.querySelector(`script[src="${src}"]`)){if(++n===S.length){mpOk=true;res();}return;}
            const el=document.createElement('script');el.src=src;el.crossOrigin='anonymous';
            el.onload=()=>{if(++n===S.length){mpOk=true;res();}};
            el.onerror=()=>rej(new Error('No cargó '+src));
            document.head.appendChild(el);
        });
    });
    return mpProm;
}

// ─── Motor ────────────────────────────────────────────────────────────────────
function makeEngine(){
    let seg=null,cam=null,vid=null,cv=null,ctx=null,raw=null,tmp=null;
    let ok=false,col='transparent',mir=false;
    function draw(r){
        if(!ctx||!r.segmentationMask)return;
        const w=cv.width,h=cv.height;
        ctx.clearRect(0,0,w,h);
        if(mir){ctx.save();ctx.translate(w,0);ctx.scale(-1,1);}
        if(col==='blur'){ctx.filter='blur(20px)';ctx.drawImage(r.image,0,0,w,h);ctx.filter='none';}
        else if(col!=='transparent'){ctx.fillStyle=col;ctx.fillRect(0,0,w,h);}
        if(!tmp||tmp.width!==w||tmp.height!==h){tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;}
        const tc=tmp.getContext('2d');
        tc.clearRect(0,0,w,h);tc.drawImage(r.segmentationMask,0,0,w,h);
        tc.globalCompositeOperation='source-in';tc.drawImage(r.image,0,0,w,h);
        tc.globalCompositeOperation='source-over';ctx.drawImage(tmp,0,0);
        if(mir)ctx.restore();
    }
    async function start(opts={}){
        if(ok)return cv.captureStream(30);
        col=opts.col||'transparent';mir=!!opts.mir;
        await mpLoad();
        seg=new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
        seg.setOptions({modelSelection:1,selfieMode:true});seg.onResults(draw);
        await seg.initialize();
        raw=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
        vid=document.createElement('video');Object.assign(vid,{srcObject:raw,autoplay:true,playsInline:true,muted:true});
        vid.style.display='none';document.body.appendChild(vid);await vid.play();
        cv=document.createElement('canvas');cv.width=vid.videoWidth||640;cv.height=vid.videoHeight||480;
        ctx=cv.getContext('2d',{willReadFrequently:true});
        cam=new Camera(vid,{onFrame:async()=>{
            if(cv.width!==vid.videoWidth)cv.width=vid.videoWidth||640;
            if(cv.height!==vid.videoHeight)cv.height=vid.videoHeight||480;
            await seg.send({image:vid});
        },width:640,height:480});
        await cam.start();ok=true;return cv.captureStream(30);
    }
    function stop(){
        try{cam&&cam.stop();}catch(e){}try{seg&&seg.close();}catch(e){}
        if(vid){vid.srcObject=null;vid.remove();}if(raw)raw.getTracks().forEach(t=>t.stop());
        cam=seg=vid=raw=tmp=null;ok=false;
    }
    return{start,stop,setCol:c=>{col=c;},setMir:v=>{mir=v;},active:()=>ok,canvas:()=>cv};
}

// ─── Streamer ─────────────────────────────────────────────────────────────────
function makeStreamer(cvEl, myId){
    const sk=getSock(); if(!sk){LOG('ERROR: no socket en streamer');return null;}
    let alive=true;
    // FPS bajo y calidad baja para no saturar Socket.IO
    const FPS=10, Q=0.35;
    let frameCount=0;

    // 1. Anunciar que estoy activo
    sk.emit('bg_active',{room:window.ROOM_ID,socket_id:myId,active:true});
    LOG('Streamer iniciado, emitiendo bg_active como',myId);

    // 2. Escuchar si un viewer nuevo pide el stream
    function onViewerReady(d){
        if(d.publisher!==myId)return;
        LOG('Viewer listo:',d.viewer,', respondiendo bg_active directo');
        sk.emit('bg_viewer_ack',{room:window.ROOM_ID,socket_id:myId,active:true,viewer:d.viewer});
    }
    sk.on('bg_viewer_ready',onViewerReady);

    const timer=setInterval(()=>{
        if(!alive||!cvEl)return;
        try{
            const d=cvEl.toDataURL('image/jpeg',Q);
            if(d.length>500){
                sk.emit('bg_frame',{room:window.ROOM_ID,from:myId,data:d,w:cvEl.width,h:cvEl.height});
                frameCount++;
                if(frameCount%50===0) LOG('Frames enviados:',frameCount);
            }
        }catch(e){LOG('Error toDataURL:',e);}
    },1000/FPS);

    return{stop(){
        alive=false;clearInterval(timer);
        sk.off('bg_viewer_ready',onViewerReady);
        sk.emit('bg_active',{room:window.ROOM_ID,socket_id:myId,active:false});
        LOG('Streamer detenido');
    }};
}

// ─── Viewer ───────────────────────────────────────────────────────────────────
function makeViewer(boxEl, pubId){
    const sk=getSock(); if(!sk){LOG('ERROR: no socket en viewer');return null;}
    const wrap=boxEl.querySelector('.box-video-wrap')||boxEl;
    let cvEl=null, shown=false, frameCount=0;

    LOG('makeViewer creado para pubId:',pubId,'en caja:',boxEl.id);

    function show(){
        if(shown)return; shown=true;
        LOG('show() ejecutado para',pubId);
        // Ocultar iframe VDO
        const ifr=wrap.querySelector('iframe.box-iframe');
        if(ifr){ifr.style.display='none';LOG('iframe oculto');}
        else LOG('WARN: iframe no encontrado en wrap');
        // Hacer caja flotante
        boxEl.classList.add('bg-float');
        // Crear canvas de visualización
        if(!cvEl){
            cvEl=document.createElement('canvas');
            cvEl.className='bg-person-canvas';
            cvEl.width=640; cvEl.height=480;
            wrap.appendChild(cvEl);
            LOG('canvas viewer creado');
        }
    }

    function hide(){
        shown=false;
        if(cvEl){cvEl.remove();cvEl=null;}
        const ifr=wrap.querySelector('iframe.box-iframe');
        if(ifr)ifr.style.display='block';
        boxEl.classList.remove('bg-float');
        LOG('hide() ejecutado para',pubId);
    }

    function onFrame(d){
        if(d.from!==pubId)return;
        frameCount++;
        if(frameCount===1) LOG('PRIMER FRAME recibido de',pubId,'tamaño:',d.data?.length);
        if(frameCount%50===0) LOG('Frames recibidos:',frameCount,'de',pubId);
        if(!shown) show();
        if(!cvEl) return;
        const img=new Image();
        img.onload=()=>{
            if(!cvEl)return;
            if(cvEl.width!==d.w)cvEl.width=d.w;
            if(cvEl.height!==d.h)cvEl.height=d.h;
            cvEl.getContext('2d').drawImage(img,0,0);
        };
        img.src=d.data;
    }

    function onActive(d){
        if(d.socket_id!==pubId)return;
        LOG('bg_active recibido para',pubId,'active:',d.active);
        d.active ? show() : hide();
    }

    // Respuesta directa cuando el streamer nos confirma (bg_viewer_ack)
    function onAck(d){
        if(d.socket_id!==pubId)return;
        LOG('bg_viewer_ack recibido de',pubId);
        show();
    }

    sk.on('bg_frame',        onFrame);
    sk.on('bg_active',       onActive);
    sk.on('bg_viewer_ack',   onAck);

    // Estrategia 1: preguntar al servidor si ya está activo
    sk.emit('bg_query_active',{room:window.ROOM_ID,publisher:pubId});
    LOG('bg_query_active emitido para',pubId);

    // Estrategia 2: avisar al streamer directamente que estamos listos
    sk.emit('bg_viewer_ready',{room:window.ROOM_ID,publisher:pubId,viewer:sk.id});
    LOG('bg_viewer_ready emitido para',pubId);

    // Estrategia 3: reintento con delay por si el módulo cargó tarde
    const retry=setTimeout(()=>{
        if(!shown){
            LOG('Reintentando query para',pubId);
            sk.emit('bg_query_active',{room:window.ROOM_ID,publisher:pubId});
        }
    },3000);

    return{destroy(){
        clearTimeout(retry);
        sk.off('bg_frame',onFrame);sk.off('bg_active',onActive);sk.off('bg_viewer_ack',onAck);
        hide();
        LOG('viewer destruido para',pubId);
    }};
}

// ─── UI propia ────────────────────────────────────────────────────────────────
function attachUI(boxEl, myId, username){
    if(boxEl.querySelector('.bgseg-btn'))return;
    const wrap=boxEl.querySelector('.box-video-wrap')||boxEl.querySelector('div');
    if(!wrap)return;
    wrap.style.position='relative';wrap.style.overflow='hidden';
    const ifr=wrap.querySelector('iframe.box-iframe');

    let eng=null,str=null,cvEl=null;
    let on=false,col='transparent';

    const badge=document.createElement('div');badge.className='bgseg-badge';badge.textContent='🎭 ACTIVO';wrap.appendChild(badge);
    const btn=document.createElement('button');btn.className='bgseg-btn';btn.innerHTML='🎭 Fondo';wrap.appendChild(btn);

    const pop=document.createElement('div');pop.className='bgseg-popup';
    pop.appendChild(Object.assign(document.createElement('div'),{className:'bgseg-popup-title',textContent:'🎭 Fondo de video'}));
    const grid=document.createElement('div');grid.className='bgseg-swatches';
    PRESETS.forEach(({c,l,i,s})=>{
        const sw=document.createElement('div');sw.className='bgseg-swatch';sw.title=l;sw.setAttribute('style',s);
        if(i)sw.innerHTML=`<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;">${i}</span>`;
        if(c===col)sw.classList.add('active');
        sw.addEventListener('click',async e=>{e.stopPropagation();grid.querySelectorAll('.bgseg-swatch').forEach(x=>x.classList.remove('active'));sw.classList.add('active');await apply(c);closeP();});
        grid.appendChild(sw);
    });
    pop.appendChild(grid);
    const row=document.createElement('div');row.className='bgseg-row';
    const pk=document.createElement('input');pk.type='color';pk.value='#ff5500';pk.className='bgseg-picker';
    pk.addEventListener('input',async e=>{e.stopPropagation();grid.querySelectorAll('.bgseg-swatch').forEach(x=>x.classList.remove('active'));await apply(pk.value);});
    row.appendChild(pk);row.appendChild(Object.assign(document.createElement('span'),{style:'flex:1;font-size:11px;color:rgba(255,255,255,.45)',textContent:'Personalizado'}));
    pop.appendChild(row);
    const off=document.createElement('button');off.className='bgseg-off';off.textContent='✕  Desactivar efecto';
    off.addEventListener('click',e=>{e.stopPropagation();deactivate();closeP();});
    pop.appendChild(off);wrap.appendChild(pop);

    btn.addEventListener('click',e=>{e.stopPropagation();const o=!pop.classList.contains('open');pop.classList.toggle('open',o);btn.classList.toggle('open',o);});
    document.addEventListener('click',closeP);
    pop.addEventListener('click',e=>e.stopPropagation());
    function closeP(){pop.classList.remove('open');btn.classList.remove('open');}

    function spin(v){
        const el=wrap.querySelector('.bgseg-loader');
        if(v&&!el){const d=document.createElement('div');d.className='bgseg-loader';d.innerHTML='<div class="bgseg-spin"></div><span>Cargando segmentación...</span>';wrap.appendChild(d);}
        else if(!v&&el)el.remove();
    }

    async function apply(color){
        col=color;
        if(!on){
            spin(true);
            try{
                eng=makeEngine();
                await eng.start({col:color,mir:boxEl.dataset.mirror==='true'});
                if(ifr)ifr.style.display='none';
                boxEl.classList.add('bg-float');
                cvEl=eng.canvas();cvEl.className='bg-person-canvas';
                wrap.appendChild(cvEl);
                str=makeStreamer(cvEl,myId);
                on=true;
                btn.innerHTML='✓ Fondo';btn.classList.add('on');
                badge.classList.add('on');boxEl.dataset.bgSeg='on';
                save(username,color);
                if(window.emitBgChange)window.emitBgChange(myId,color);
                if(window.showToast)showToast('🎭 Todos ven el filtro','success');
                LOG('Filtro activado por',username,'id:',myId);
            }catch(err){
                LOG('ERROR activando filtro:',err);
                if(ifr)ifr.style.display='block';
                boxEl.classList.remove('bg-float');
                if(eng){try{eng.stop();}catch(e){}eng=null;}cvEl=null;on=false;
                if(window.showToast)showToast('Error: '+err.message,'error');
            }finally{spin(false);}
        }else{
            if(eng)eng.setCol(color);save(username,color);
            if(window.emitBgChange)window.emitBgChange(myId,color);
        }
    }

    function deactivate(){
        if(!on)return;
        if(str){try{str.stop();}catch(e){}str=null;}
        if(eng){try{eng.stop();}catch(e){}eng=null;}
        if(cvEl){try{cvEl.remove();}catch(e){}cvEl=null;}
        if(ifr)ifr.style.display='block';
        boxEl.classList.remove('bg-float');
        on=false;col='transparent';
        grid.querySelectorAll('.bgseg-swatch').forEach(x=>x.classList.remove('active'));
        btn.innerHTML='🎭 Fondo';btn.classList.remove('on');
        badge.classList.remove('on');boxEl.dataset.bgSeg='off';
        save(username,'off');
        if(window.showToast)showToast('Fondo desactivado');
        if(window.emitBgChange)window.emitBgChange(myId,'off');
    }

    const sv=load(username);
    if(sv&&sv!=='off'){
        setTimeout(()=>{
            grid.querySelectorAll('.bgseg-swatch').forEach(sw=>{const p=PRESETS.find(p=>p.l===sw.title);if(p&&p.c===sv)sw.classList.add('active');});
            apply(sv);
        },2500);
    }
    new MutationObserver(()=>{if(eng&&eng.active())eng.setMir(boxEl.dataset.mirror==='true');}).observe(boxEl,{attributes:true,attributeFilter:['data-mirror']});
}

// ─── Map de viewers activos ───────────────────────────────────────────────────
const _viewers=new Map();

function setupViewer(boxEl, pubId){
    const key=boxEl.id+'|'+pubId;
    if(_viewers.has(key)){LOG('setupViewer: ya existe viewer para',key);return;}
    LOG('setupViewer: creando viewer para',pubId,'en',boxEl.id);
    const v=makeViewer(boxEl,pubId);
    if(v)_viewers.set(key,v);
}

function restoreAll(states){
    if(!states)return;
    LOG('restoreAll:',Object.keys(states));
    Object.entries(states).forEach(([sid])=>{
        const el=document.getElementById(`participant-${sid}`);
        if(el)setupViewer(el,sid);
    });
}

window.BgSegModule={attach:attachUI,setupViewer,restoreAll};
injectCSS();
LOG('cargado ✓');
})();