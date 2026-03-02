
;(function(){
'use strict';
const L=(...a)=>console.log('[BgSeg v13]',...a);

// ─── CSS ─────────────────────────────────────────────────────────────────────
const CSS=`
.bgseg-btn{position:absolute;top:8px;right:8px;z-index:30;padding:4px 10px;border-radius:16px;border:1.5px solid rgba(255,255,255,.3);background:rgba(0,0,0,.6);color:#fff;font-size:11px;font-weight:600;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .2s;white-space:nowrap;user-select:none;}
.participant:hover .bgseg-btn,.bgseg-btn.open,.bgseg-btn.on{opacity:1;pointer-events:all;}
.bgseg-btn.on{border-color:#00e676;background:rgba(0,40,20,.85);box-shadow:0 0 10px rgba(0,230,118,.5);}
.bgseg-popup{position:absolute;top:42px;right:8px;z-index:35;background:rgba(8,10,22,.97);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px;width:215px;display:none;flex-direction:column;gap:9px;box-shadow:0 12px 36px rgba(0,0,0,.7);}
.bgseg-popup.open{display:flex;}
.bgseg-swatches{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;}
.bgseg-swatch{aspect-ratio:1;border-radius:7px;border:2px solid rgba(255,255,255,.15);cursor:pointer;transition:transform .13s,border-color .13s;position:relative;overflow:hidden;}
.bgseg-swatch:hover{transform:scale(1.14);border-color:rgba(255,255,255,.5);}
.bgseg-swatch.active{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.3);}
.bgseg-row{display:flex;align-items:center;gap:7px;}
.bgseg-picker{width:26px;height:26px;padding:0;cursor:pointer;border:2px solid rgba(255,255,255,.2);border-radius:6px;background:none;flex-shrink:0;}
.bgseg-off{padding:6px 0;border-radius:8px;width:100%;border:1px solid rgba(255,80,80,.3);background:rgba(255,55,55,.08);color:rgba(255,130,130,.9);font-size:12px;font-weight:600;cursor:pointer;}
.bgseg-loader{position:absolute;inset:0;z-index:40;background:rgba(8,10,22,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:#fff;font-size:12px;}
.bgseg-spin{width:28px;height:28px;border:3px solid rgba(255,255,255,.1);border-top-color:#00e676;border-radius:50%;animation:bgspin .72s linear infinite;}
@keyframes bgspin{to{transform:rotate(360deg);}}
.bgseg-badge{position:absolute;top:8px;left:8px;z-index:30;background:rgba(0,200,100,.88);color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;pointer-events:none;display:none;}
.bgseg-badge.on{display:block;}
.participant.bg-float{background:transparent!important;border:none!important;box-shadow:none!important;border-radius:0!important;}
.participant.bg-float .label-participant{display:none!important;}
.participant.bg-float .box-video-wrap{background:transparent!important;}
.bg-person-canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:8;pointer-events:none;background:transparent;}
`;
function injectCSS(){
    if(document.getElementById('bgseg-v13'))return;
    const s=document.createElement('style');s.id='bgseg-v13';s.textContent=CSS;
    document.head.appendChild(s);
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
function getRoom(){ return window.ROOM_ID||(typeof ROOM_ID!=='undefined'?ROOM_ID:null); }

const K=u=>`bgseg13_${(u||'').toLowerCase().replace(/[^a-z0-9]/g,'')}`;
const save=(u,c)=>{try{c&&c!=='off'?localStorage.setItem(K(u),c):localStorage.removeItem(K(u));}catch(e){}};
const load=u=>{try{return localStorage.getItem(K(u))||null;}catch(e){return null;}};

// ─── MediaPipe ────────────────────────────────────────────────────────────────
let mpOk=false,mpProm=null;
function mpLoad(){
    if(mpOk)return Promise.resolve();
    if(mpProm)return mpProm;
    // Si SelfieSegmentation ya está disponible globalmente, no cargar nada más
    if(typeof SelfieSegmentation!=='undefined' && typeof Camera!=='undefined'){
        mpOk=true;
        L('MediaPipe ya disponible globalmente');
        return Promise.resolve();
    }
    mpProm=new Promise((res,rej)=>{
        const B='https://cdn.jsdelivr.net/npm/@mediapipe/';
        const S=[B+'camera_utils/camera_utils.js',B+'selfie_segmentation/selfie_segmentation.js'];
        let n=0, total=S.length;
        S.forEach(src=>{
            // No re-cargar si ya hay un script con esa URL exacta
            if(document.querySelector(`script[src="${src}"]`)){
                if(++n===total){mpOk=true;res();}
                return;
            }
            const el=document.createElement('script');
            el.src=src;el.crossOrigin='anonymous';
            el.onload=()=>{if(++n===total){mpOk=true;res();}};
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
        if(ok)return cv;
        col=opts.col||'transparent';mir=!!opts.mir;
        await mpLoad();
        seg=new SelfieSegmentation({locateFile:f=>`https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${f}`});
        seg.setOptions({modelSelection:1,selfieMode:true});
        seg.onResults(draw);await seg.initialize();
        raw=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
        vid=document.createElement('video');
        Object.assign(vid,{srcObject:raw,autoplay:true,playsInline:true,muted:true});
        vid.style.display='none';document.body.appendChild(vid);await vid.play();
        cv=document.createElement('canvas');
        cv.width=vid.videoWidth||640;cv.height=vid.videoHeight||480;
        ctx=cv.getContext('2d',{willReadFrequently:true});
        cam=new Camera(vid,{onFrame:async()=>{
            if(cv.width!==vid.videoWidth)cv.width=vid.videoWidth||640;
            if(cv.height!==vid.videoHeight)cv.height=vid.videoHeight||480;
            await seg.send({image:vid});
        },width:640,height:480});
        await cam.start();ok=true;return cv;
    }
    function stop(){
        try{cam&&cam.stop();}catch(e){}try{seg&&seg.close();}catch(e){}
        if(vid){vid.srcObject=null;vid.remove();}
        if(raw)raw.getTracks().forEach(t=>t.stop());
        cam=seg=vid=raw=tmp=null;ok=false;
    }
    return{start,stop,setCol:c=>{col=c;},setMir:v=>{mir=v;},active:()=>ok,canvas:()=>cv};
}

// ─── EMISOR ───────────────────────────────────────────────────────────────────
function makeStreamer(cvEl){
    const sk=getSock();
    if(!sk){L('ERROR: no hay socket');return null;}

    const myId=sk.id;
    // Evento dedicado para este emisor: bg_frame_<myId>
    // El servidor lo retransmite a la sala como bg_frame_<myId>
    const frameEvent=`bgf_${myId}`;
    L('Streamer: myId=',myId,'evento=',frameEvent);

    const FPS=10;
    const TX_W=320, TX_H=240;
    const txCv=document.createElement('canvas');
    txCv.width=TX_W;txCv.height=TX_H;
    const txCtx=txCv.getContext('2d');
    let alive=true, n=0;

    sk.emit('bg_active',{room:getRoom(), socket_id:myId, active:true});
    L('bg_active emitido, room=',getRoom());

    const timer=setInterval(()=>{
        if(!alive||!cvEl)return;
        try{
            txCtx.clearRect(0,0,TX_W,TX_H);
            txCtx.drawImage(cvEl,0,0,TX_W,TX_H);
            // PNG conserva el canal alfa (transparencia) — JPEG lo destruye
            const transparent = (window._bgSegColor==='transparent'||!window._bgSegColor);
            const fmt  = transparent ? 'image/png' : 'image/jpeg';
            const qual = transparent ? undefined : 0.40;
            const data = txCv.toDataURL(fmt, qual);
            sk.emit('bg_frame',{room:getRoom(), data, w:TX_W, h:TX_H});
            n++;
            if(n===1) L('✓ Primer frame bytes=',data.length,'fmt=',fmt);
            if(n%60===0) L('frames enviados=',n);
        }catch(e){}
    },1000/FPS);

    return{
        myId,
        stop(){
            alive=false;clearInterval(timer);
            sk.emit('bg_active',{room:getRoom(),socket_id:myId,active:false});
        }
    };
}

// ─── VIEWER ───────────────────────────────────────────────────────────────────
function makeViewer(boxEl, pubSocketId){
    const sk=getSock();
    if(!sk){L('ERROR: no hay socket');return null;}
    const wrap=boxEl.querySelector('.box-video-wrap')||boxEl;
    let cvEl=null, shown=false, n=0;

    // Escuchar el canal dedicado del emisor: bgf_<pubSocketId>
    const frameEvent=`bgf_${pubSocketId}`;
    L('Viewer: pubId=',pubSocketId,'escuchando evento=',frameEvent);

    function show(){
        if(shown)return;shown=true;
        L('▶ show() para',pubSocketId);
        // Ocultar TODOS los iframes en el wrap
        wrap.querySelectorAll('iframe').forEach(f=>{
            f.style.display='none';
            f.style.visibility='hidden';
        });
        boxEl.classList.add('bg-float');
        if(!cvEl){
            cvEl=document.createElement('canvas');
            cvEl.className='bg-person-canvas';
            cvEl.width=320;cvEl.height=240;
            cvEl.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:99;background:transparent!important;pointer-events:none;';
            // Forzar contexto con alpha para soportar transparencia PNG
            cvEl.getContext('2d',{alpha:true});
            wrap.appendChild(cvEl);
            // Hacer el wrap y la caja completamente transparentes
            wrap.style.background='transparent';
            boxEl.style.background='transparent';
            L('Canvas viewer creado en',boxEl.id);
        }
    }
    function hide(){
        if(!shown)return;shown=false;
        if(cvEl){cvEl.remove();cvEl=null;}
        const ifr=wrap.querySelector('iframe.box-iframe');
        if(ifr)ifr.style.display='block';
        boxEl.classList.remove('bg-float');
    }

    function onFrame(d){
        n++;
        if(n===1){
            L('✓ PRIMER FRAME recibido canal=',frameEvent,'bytes=',d.data?.length);
            show();
        }
        if(!shown)show();
        if(!cvEl)return;
        const img=new Image();
        img.onload=()=>{
            if(!cvEl)return;
            if(cvEl.width!==d.w)cvEl.width=d.w;
            if(cvEl.height!==d.h)cvEl.height=d.h;
            const ctx=cvEl.getContext('2d');
            // Limpiar antes de dibujar para mantener transparencia
            ctx.clearRect(0,0,cvEl.width,cvEl.height);
            ctx.drawImage(img,0,0);
        };
        img.src=d.data;
    }

    function onActive(d){
        if(d.socket_id!==pubSocketId)return;
        L('bg_active para',pubSocketId,'active=',d.active);
        d.active?show():hide();
    }

    // Escuchar canal dedicado de frames
    sk.on(frameEvent, onFrame);
    // Escuchar estado activo/inactivo
    sk.on('bg_active', onActive);

    // Preguntar si ya está activo
    sk.emit('bg_query_active',{room:getRoom(), publisher:pubSocketId});
    L('bg_query_active enviado para',pubSocketId);

    const retry=setTimeout(()=>{
        if(!shown){
            L('Retry bg_query_active para',pubSocketId);
            sk.emit('bg_query_active',{room:getRoom(),publisher:pubSocketId});
        }
    },3000);

    return{destroy(){
        clearTimeout(retry);
        sk.off(frameEvent,onFrame);
        sk.off('bg_active',onActive);
        hide();
    }};
}

// ─── UI propia ────────────────────────────────────────────────────────────────
function attachUI(boxEl, myId, username){
    if(boxEl.querySelector('.bgseg-btn'))return;
    const wrap=boxEl.querySelector('.box-video-wrap')||boxEl.querySelector('div');
    if(!wrap)return;
    wrap.style.position='relative';wrap.style.overflow='hidden';
    const ifr=wrap.querySelector('iframe.box-iframe');

    let eng=null,str=null,cvEl=null,on=false,col='transparent';

    const badge=document.createElement('div');badge.className='bgseg-badge';badge.textContent='🎭 ACTIVO';wrap.appendChild(badge);
    const btn=document.createElement('button');btn.className='bgseg-btn';btn.innerHTML='🎭 Fondo';wrap.appendChild(btn);
    const pop=document.createElement('div');pop.className='bgseg-popup';
    pop.appendChild(Object.assign(document.createElement('div'),{style:'font-size:10px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,.35)',textContent:'🎭 Fondo de video'}));
    const grid=document.createElement('div');grid.className='bgseg-swatches';
    PRESETS.forEach(({c,l,i,s})=>{
        const sw=document.createElement('div');sw.className='bgseg-swatch';sw.title=l;sw.setAttribute('style',s);
        if(i)sw.innerHTML=`<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12px;">${i}</span>`;
        if(c===col)sw.classList.add('active');
        sw.addEventListener('click',async e=>{
            e.stopPropagation();
            grid.querySelectorAll('.bgseg-swatch').forEach(x=>x.classList.remove('active'));
            sw.classList.add('active');await apply(c);closeP();
        });
        grid.appendChild(sw);
    });
    pop.appendChild(grid);
    const row=document.createElement('div');row.className='bgseg-row';
    const pk=document.createElement('input');pk.type='color';pk.value='#ff5500';pk.className='bgseg-picker';
    pk.addEventListener('input',async e=>{
        e.stopPropagation();
        grid.querySelectorAll('.bgseg-swatch').forEach(x=>x.classList.remove('active'));
        await apply(pk.value);
    });
    row.appendChild(pk);
    row.appendChild(Object.assign(document.createElement('span'),{style:'flex:1;font-size:11px;color:rgba(255,255,255,.45)',textContent:'Personalizado'}));
    pop.appendChild(row);
    const off=document.createElement('button');off.className='bgseg-off';off.textContent='✕  Desactivar efecto';
    off.addEventListener('click',e=>{e.stopPropagation();deactivate();closeP();});
    pop.appendChild(off);wrap.appendChild(pop);
    btn.addEventListener('click',e=>{
        e.stopPropagation();const o=!pop.classList.contains('open');
        pop.classList.toggle('open',o);btn.classList.toggle('open',o);
    });
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
                cvEl=await eng.start({col:color,mir:boxEl.dataset.mirror==='true'});
                if(ifr)ifr.style.display='none';
                boxEl.classList.add('bg-float');
                cvEl.className='bg-person-canvas';
                wrap.appendChild(cvEl);
                str=makeStreamer(cvEl);
                window._bgSegColor=color; // para que el streamer sepa si usar PNG/JPEG
                on=true;
                btn.innerHTML='✓ Fondo';btn.classList.add('on');
                badge.classList.add('on');boxEl.dataset.bgSeg='on';
                save(username,color);
                if(window.showToast)showToast('🎭 Todos ven el filtro','success');
            }catch(err){
                L('ERROR:',err);
                if(ifr)ifr.style.display='block';
                boxEl.classList.remove('bg-float');
                if(eng){try{eng.stop();}catch(e){}eng=null;}
                cvEl=null;on=false;
                if(window.showToast)showToast('Error: '+err.message,'error');
            }finally{spin(false);}
        }else{
            if(eng)eng.setCol(color);
            window._bgSegColor=color;
            save(username,color);
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

// ─── Registro de viewers ──────────────────────────────────────────────────────
const _v=new Map();
function setupViewer(boxEl, pubId){
    const key=boxEl.id+'|'+pubId;
    if(_v.has(key))return;
    const v=makeViewer(boxEl,pubId);
    if(v)_v.set(key,v);
}
function restoreAll(states){
    if(!states)return;
    Object.entries(states).forEach(([sid])=>{
        const el=document.getElementById(`participant-${sid}`);
        if(el)setupViewer(el,sid);
    });
}

window.BgSegModule={attach:attachUI,setupViewer,restoreAll};
injectCSS();
L('v13 cargado ✓ — canales dedicados por emisor');
})();