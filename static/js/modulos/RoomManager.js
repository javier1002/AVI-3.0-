/**
 * RoomManager - Gestiona la creación de salas y generación de links VDO.Ninja
 * Responsabilidades:
 * - Crear salas
 * - Generar URLs de host (director) e invitados
 * - Renderizar iframe principal
 * - Mostrar opciones avanzadas
 */
class RoomManager {
  // Variables privadas
  #form;
  #linksContainer;
  #videoContainer;
  #config;

  constructor(config = {}) {
    this.#form = document.getElementById(config.formId || 'roomForm');
    this.#linksContainer = document.getElementById(config.linksContainerId || 'links');
    this.#videoContainer = document.getElementById(config.videoContainerId || 'videoArea');

    this.#config = {
      baseUrl: config.baseUrl || 'https://vdo.ninja',
      defaultWidth: config.defaultWidth || 1280,
      defaultHeight: config.defaultHeight || 720,
      ...config
    };

    this.#initialize();
  }

  /**
   * Inicializa el manager
   * @private
   */
  #initialize() {
    if (!this.#form) {
      console.warn('⚠️  RoomForm no encontrado');
      return;
    }

    this.#attachFormListener();
    this.#initializeOptionsToggle();

    console.log('✅ RoomManager inicializado');
  }

  /**
   * Adjunta listener al formulario
   * @private
   */
  #attachFormListener() {
    this.#form.addEventListener('submit', this.#handleSubmit.bind(this));
  }

  /**
   * Maneja el submit del formulario
   * @private
   */
  #handleSubmit(e) {
    e.preventDefault();

    const roomId   = document.getElementById('roomId')?.value.trim();
    const password = document.getElementById('password')?.value.trim();

    if (!roomId) {
      this.#showError('El ID de la sala es requerido');
      return;
    }

    const { hostUrl, guestUrl } = this.#generateUrls(roomId, password);

    this.#displayLinks(hostUrl, guestUrl);
    this.#loadVideoFrame(hostUrl);

    console.log('🎬 Sala creada:', roomId);
  }

  /**
   * Genera las URLs de host e invitado
   * Aquí usamos escena (scene) y parámetros pensados para producción
   * @private
   */
  #generateUrls(roomId, password = '') {
    let params = `room=${encodeURIComponent(roomId)}&scene`;

    if (password) {
      params += `&password=${encodeURIComponent(password)}`;
    }

    // host: director de la sala (controla layout, mute, etc.)
    const hostUrl = `${this.#config.baseUrl}/?${params}&director`;

    // guest: link base para invitados (se usa con &push)
    const guestUrl = `${this.#config.baseUrl}/?${params}&push`;

    return { hostUrl, guestUrl };
  }

  /**
   * Muestra los links generados
   * @private
   */
  #displayLinks(hostUrl, guestUrl) {
    if (!this.#linksContainer) return;

    this.#linksContainer.innerHTML = `
      <div class="links-section">
        <div class="link-item">
          <p><strong>🎬 URL HOST (director):</strong></p>
          <code class="link-url">${this.#escapeHtml(hostUrl)}</code>
          <button class="copy-btn" data-url="${this.#escapeHtml(hostUrl)}">
            📋 Copiar
          </button>
        </div>

        <div class="link-item">
          <p><strong>👥 URL Invitados (base):</strong></p>
          <code class="link-url">${this.#escapeHtml(guestUrl)}</code>
          <button class="copy-btn" data-url="${this.#escapeHtml(guestUrl)}">
            📋 Copiar
          </button>
        </div>
      </div>
    `;

    this.#attachCopyListeners();
  }

  /**
   * Carga el iframe de video para el host/director
   * @private
   */
  #loadVideoFrame(url) {
    if (!this.#videoContainer) return;

    this.#videoContainer.innerHTML = `
      <iframe
        src="${this.#escapeHtml(url)}"
        width="${this.#config.defaultWidth}"
        height="${this.#config.defaultHeight}"
        allow="camera; microphone; fullscreen; display-capture; autoplay"
        allowfullscreen
        style="border: none; border-radius: 8px;">
      </iframe>
    `;
  }

  /**
   * Adjunta listeners a botones de copiar
   * @private
   */
  #attachCopyListeners() {
    const copyButtons = this.#linksContainer?.querySelectorAll('.copy-btn');

    copyButtons?.forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        this.#copyToClipboard(url);
        btn.textContent = '✅ Copiado!';
        setTimeout(() => {
          btn.textContent = '📋 Copiar';
        }, 2000);
      });
    });
  }

  /**
   * Copia texto al portapapeles
   * @private
   */
  async #copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      console.log('📋 URL copiada al portapapeles');
    } catch (err) {
      console.error('❌ Error al copiar:', err);
      this.#copyToClipboardFallback(text);
    }
  }

  /**
   * Fallback para copiar (navegadores antiguos)
   * @private
   */
  #copyToClipboardFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  /**
   * Inicializa el toggle de opciones avanzadas
   * (plantilla en el HTML con id="videoOptionsTemplate")
   * @private
   */
  #initializeOptionsToggle() {
    const toggleBtn = document.getElementById('toggleOpciones');
    const container = document.getElementById('opcionesAvanzadas');
    const template  = document.getElementById('videoOptionsTemplate');

    if (!toggleBtn || !container || !template) return;

    let isOpen = false;

    toggleBtn.addEventListener('click', () => {
      isOpen = !isOpen;

      const toggleText = document.getElementById('toggleText');
      const toggleIcon = document.getElementById('toggleIcon');

      if (isOpen) {
        container.innerHTML = '';
        container.appendChild(template.content.cloneNode(true));
        if (toggleText) toggleText.textContent = 'Menos opciones';
        if (toggleIcon) toggleIcon.textContent = '▲';
      } else {
        container.innerHTML = '';
        if (toggleText) toggleText.textContent = 'Más opciones';
        if (toggleIcon) toggleIcon.textContent = '▼';
      }
    });
  }

  /**
   * Muestra un error
   * @private
   */
  #showError(message) {
    alert(message); // Luego puedes cambiar a un toast bonito
    console.error('❌', message);
  }

  /**
   * Escapa HTML para prevenir XSS
   * @private
   */
  #escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Limpia la sala actual (links + iframe + form)
   * @public
   */
  clear() {
    if (this.#linksContainer) {
      this.#linksContainer.innerHTML = '';
    }
    if (this.#videoContainer) {
      this.#videoContainer.innerHTML = '';
    }
    if (this.#form) {
      this.#form.reset();
    }
    console.log('🧹 Sala limpiada');
  }

  /**
   * Destruye el manager
   * @public
   */
  destroy() {
    this.clear();
    console.log('🗑️ RoomManager destruido');
  }
}

export default RoomManager;
