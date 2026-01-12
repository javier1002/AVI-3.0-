/**
 * SocketManager - Gestiona comunicación con VDO.Ninja iframes
 * - Enviar comandos a iframes
 * - Recibir eventos (join, disconnect, etc.)
 * - Gestionar streams de participantes
 */
class SocketManager {
  #iframes;
  #eventHandlers;

  constructor() {
    this.#iframes = new Map();
    this.#eventHandlers = new Map();
    this.#initialize();
  }

  /**
   * Inicializa el listener global para mensajes de iframes
   * @private
   */
  #initialize() {
    window.addEventListener('message', this.#handleMessage.bind(this));
    console.log('✓ SocketManager inicializado');
  }

  /**
   * Maneja mensajes recibidos de iframes de VDO.Ninja
   * @private
   */
  #handleMessage(event) {
    // Validar origen (seguridad)
    if (!event.data || typeof event.data !== 'object') return;

    const { action, streamID, value } = event.data;

    console.log('📨 Mensaje recibido:', event.data);

    // Emitir eventos según el tipo de mensaje
    switch (action) {
      case 'joined':
        this.#emit('participant-joined', { streamID, data: value });
        break;
      case 'disconnected':
        this.#emit('participant-left', { streamID });
        break;
      case 'error':
        this.#emit('error', { streamID, error: value });
        break;
    }
  }

  /**
   * Registra un iframe de VDO.Ninja
   * @public
   */
  registerIframe(streamID, iframeElement) {
    this.#iframes.set(streamID, iframeElement);
    console.log(`✓ Iframe registrado: ${streamID}`);
  }

  /**
   * Envía comando a un iframe específico
   * @public
   */
  sendCommand(streamID, command) {
    const iframe = this.#iframes.get(streamID);
    if (!iframe) {
      console.warn(`⚠️  Iframe no encontrado: ${streamID}`);
      return;
    }

    iframe.contentWindow.postMessage(command, '*');
    console.log(`📤 Comando enviado a ${streamID}:`, command);
  }

  /**
   * Envía comando a todos los iframes
   * @public
   */
  broadcast(command) {
    this.#iframes.forEach((iframe, streamID) => {
      this.sendCommand(streamID, command);
    });
  }

  /**
   * Registra un handler para eventos
   * @public
   */
  on(event, handler) {
    if (!this.#eventHandlers.has(event)) {
      this.#eventHandlers.set(event, []);
    }
    this.#eventHandlers.get(event).push(handler);
  }

  /**
   * Emite un evento
   * @private
   */
  #emit(event, data) {
    const handlers = this.#eventHandlers.get(event);
    if (!handlers) return;

    handlers.forEach(handler => handler(data));
  }

  /**
   * Destruye el manager
   * @public
   */
  destroy() {
    window.removeEventListener('message', this.#handleMessage.bind(this));
    this.#iframes.clear();
    this.#eventHandlers.clear();
    console.log('✓ SocketManager destruido');
  }
}

export default SocketManager;