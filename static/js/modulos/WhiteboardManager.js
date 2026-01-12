/**
 * WhiteboardManager - Gestiona el canvas de dibujo
 * - Inicializar canvas
 * - Dibujar líneas
 * - Limpiar canvas
 * - Sincronizar con otros usuarios (futuro)
 */
class WhiteboardManager {
  // Variables privadas
  #canvas;
  #ctx;
  #isDrawing;
  #lastPosition;
  #config;

  constructor(canvasElement, config = {}) {
    if (!canvasElement) {
      throw new Error('WhiteboardManager: canvas element is required');
    }

    this.#canvas = canvasElement;
    this.#ctx = this.#canvas.getContext('2d');
    this.#isDrawing = false;
    this.#lastPosition = { x: 0, y: 0 };

    // Configuración por defecto
    this.#config = {
      strokeColor: config.strokeColor || '#ffffff',
      lineWidth: config.lineWidth || 2,
      backgroundColor: config.backgroundColor || 'rgba(255,0,0,0.1)',
      ...config
    };

    this.#initialize();
  }

  /**
   * Inicializa el canvas y sus estilos
   * @private
   */
  #initialize() {
    // Configurar tamaño del canvas
    this.resize();

    // Estilos del canvas
    this.#canvas.style.pointerEvents = 'auto';
    this.#canvas.style.background = this.#config.backgroundColor;
    this.#canvas.style.zIndex = 9999;

    // Event listeners
    this.#attachEventListeners();

    console.log('✓ WhiteboardManager inicializado', {
      width: this.#canvas.width,
      height: this.#canvas.height
    });
  }

  /**
   * Adjunta event listeners del canvas
   * @private
   */
  #attachEventListeners() {
    this.#canvas.addEventListener('mousedown', this.#handleMouseDown.bind(this));
    this.#canvas.addEventListener('mousemove', this.#handleMouseMove.bind(this));
    this.#canvas.addEventListener('mouseup', this.#handleMouseUp.bind(this));
    this.#canvas.addEventListener('mouseleave', this.#handleMouseUp.bind(this));

    // Manejar resize de ventana
    window.addEventListener('resize', this.resize.bind(this));
  }

  /**
   * Maneja mousedown
   * @private
   */
  #handleMouseDown(e) {
    this.#isDrawing = true;
    const pos = this.#getMousePosition(e);
    this.#lastPosition = pos;
  }

  /**
   * Maneja mousemove (dibujo)
   * @private
   */
  #handleMouseMove(e) {
    if (!this.#isDrawing) return;

    const currentPos = this.#getMousePosition(e);
    this.#drawLine(this.#lastPosition, currentPos);
    this.#lastPosition = currentPos;
  }

  /**
   * Maneja mouseup
   * @private
   */
  #handleMouseUp() {
    this.#isDrawing = false;
  }

  /**
   * Obtiene posición del mouse relativa al canvas
   * @private
   */
  #getMousePosition(e) {
    const rect = this.#canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  /**
   * Dibuja una línea en el canvas
   * @private
   */
  #drawLine(from, to) {
    this.#ctx.strokeStyle = this.#config.strokeColor;
    this.#ctx.lineWidth = this.#config.lineWidth;
    this.#ctx.lineCap = 'round';
    this.#ctx.lineJoin = 'round';

    this.#ctx.beginPath();
    this.#ctx.moveTo(from.x, from.y);
    this.#ctx.lineTo(to.x, to.y);
    this.#ctx.stroke();
  }

  /**
   * Ajusta el tamaño del canvas al contenedor
   * @public
   */
  resize() {
    // Guardar contenido actual
    const imageData = this.#ctx.getImageData(
      0, 0,
      this.#canvas.width,
      this.#canvas.height
    );

    // Cambiar tamaño
    this.#canvas.width = this.#canvas.clientWidth;
    this.#canvas.height = this.#canvas.clientHeight;

    // Restaurar contenido
    this.#ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Limpia todo el canvas
   * @public
   */
  clear() {
    this.#ctx.clearRect(0, 0, this.#canvas.width, this.#canvas.height);
    console.log('✓ Canvas limpiado');
  }

  /**
   * Habilita/deshabilita el canvas
   * @public
   */
  setEnabled(enabled) {
    this.#canvas.style.pointerEvents = enabled ? 'auto' : 'none';
  }

  /**
   * Cambia el color del trazo
   * @public
   */
  setStrokeColor(color) {
    this.#config.strokeColor = color;
  }

  /**
   * Cambia el grosor de línea
   * @public
   */
  setLineWidth(width) {
    this.#config.lineWidth = width;
  }

  /**
   * Destruye el manager (cleanup)
   * @public
   */
  destroy() {
    window.removeEventListener('resize', this.resize.bind(this));
    this.#canvas.remove();
    console.log('✓ WhiteboardManager destruido');
  }
}

export default WhiteboardManager;