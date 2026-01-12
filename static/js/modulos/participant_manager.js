// static/js/modules/ParticipantManager.js
class ParticipantManager {
  #container;
  #participants;
  #config;
  #enabled;

  constructor(containerElement, config = {}) {
    if (!containerElement) {
      throw new Error('ParticipantManager: container requerido');
    }

    this.#container = containerElement;
    this.#participants = new Map(); // id → {element, iframe}
    this.#config = {
      participantSelector: config.participantSelector || '.participant',
      dragThreshold: config.dragThreshold || 4,
      onPositionChange: config.onPositionChange || null
    };
    this.#enabled = true;

    this.#initializeExisting();
  }

  #initializeExisting() {
    const nodes = this.#container.querySelectorAll(
      this.#config.participantSelector
    );

    nodes.forEach((el) => {
      const id = el.dataset.streamId || el.id || `p-${Date.now()}`;
      this.#setupParticipantElement(el, id);
    });
  }

  #setupParticipantElement(el, id) {
    el.dataset.streamId = id;
    el.style.position = 'absolute';
    el.style.border = '2px solid #00ff00';
    el.style.borderRadius = '8px';
    el.style.overflow = 'hidden';
    el.style.cursor = 'move';
    el.style.background = '#111';

    this.#makeDraggable(el, id);
    this.#makeResizable(el);

    this.#participants.set(id, { element: el, iframe: el.querySelector('iframe') });
  }

  #makeDraggable(el, id) {
    let isDragging = false;
    let startX, startY, originLeft, originTop;

    const onMouseDown = (e) => {
      if (!this.#enabled) return;
      if (e.target.closest('.pm-header') || e.target.closest('.pm-resize')) {
        // dejar que header/resize manejen sus cosas
      }
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      originLeft = rect.left + window.scrollX;
      originTop = rect.top + window.scrollY;
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) < this.#config.dragThreshold &&
          Math.abs(dy) < this.#config.dragThreshold) {
        return;
      }
      const newLeft = originLeft + dx - this.#container.getBoundingClientRect().left;
      const newTop  = originTop + dy - this.#container.getBoundingClientRect().top;

      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;

      if (this.#config.onPositionChange) {
        this.#config.onPositionChange(id, { x: newLeft, y: newTop });
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      document.body.style.userSelect = '';
    };

    el.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  #makeResizable(el) {
    const handle = document.createElement('div');
    handle.className = 'pm-resize';
    handle.style.cssText = `
      position:absolute;
      width:14px;
      height:14px;
      right:0;
      bottom:0;
      background:rgba(0,255,0,0.7);
      cursor:nwse-resize;
      z-index:5;
    `;
    el.appendChild(handle);

    let isResizing = false;
    let startX, startY, startW, startH;

    const onMouseDown = (e) => {
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = el.offsetWidth;
      startH = el.offsetHeight;
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = (e) => {
      if (!isResizing) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const w = Math.max(200, startW + dx);
      const h = Math.max(120, startH + dy);
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      const iframe = el.querySelector('iframe');
      if (iframe) {
        iframe.style.width = '100%';
        iframe.style.height = 'calc(100% - 26px)';
      }
    };

    const onMouseUp = () => {
      isResizing = false;
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // Crea un participante si no existe, o reusa el DOM si se pasa domId
  ensureParticipant({ id, room, domId }) {
    if (this.#participants.has(id)) return this.#participants.get(id).element;

    let el = domId
      ? document.getElementById(domId)
      : document.createElement('div');

    if (!domId) {
      el.className = 'participant';
      el.style.left = '40px';
      el.style.top = '40px';
      this.#container.appendChild(el);
    }

    // Cabecera con label + botón copiar link
    const header = document.createElement('div');
    header.className = 'pm-header';
    header.style.cssText = `
      position:absolute;
      top:0;
      left:0;
      right:0;
      height:26px;
      background:rgba(0,0,0,0.7);
      color:#fff;
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding:0 6px;
      font-size:11px;
      z-index:2;
    `;

    const label = document.createElement('span');
    label.textContent = id === 'HOST' ? 'Host' : `Invitado ${id}`;

    const btn = document.createElement('button');
    btn.textContent = 'Copiar link';
    btn.style.fontSize = '10px';

    const guestUrl = `https://vdo.ninja/?room=${encodeURIComponent(
      room
    )}&push=${encodeURIComponent(id)}`;

    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(guestUrl);
        btn.textContent = 'Copiado';
        setTimeout(() => (btn.textContent = 'Copiar link'), 2000);
      } catch (e) {
        console.error('No se pudo copiar', e);
      }
    });

    header.appendChild(label);
    header.appendChild(btn);

    // iframe del stream
    const iframe = document.createElement('iframe');
    iframe.allow =
      'camera; microphone; fullscreen; display-capture; autoplay';
    iframe.style.cssText =
      'position:absolute; top:26px; left:0; width:100%; height:calc(100% - 26px); border:none;';

    iframe.src = `https://vdo.ninja/?room=${encodeURIComponent(
      room
    )}&view=${encodeURIComponent(id)}&cleanoutput`;

    el.innerHTML = '';
    el.appendChild(header);
    el.appendChild(iframe);

    this.#setupParticipantElement(el, id);
    this.#participants.set(id, { element: el, iframe });

    return el;
  }

  removeParticipant(id) {
    const data = this.#participants.get(id);
    if (!data) return;
    data.element.remove();
    this.#participants.delete(id);
  }

  setEnabled(enabled) {
    this.#enabled = enabled;
  }

  destroy() {
    this.#participants.forEach((p) => p.element.remove());
    this.#participants.clear();
  }
}

export default ParticipantManager;
