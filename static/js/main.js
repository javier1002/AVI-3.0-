// static/js/main.js
import WhiteboardManager from './modules/WhiteboardManager.js';
import ParticipantManager from './modules/ParticipantManager.js';
import ToolsManager from './modules/ToolsManager.js';
// RoomManager opcional

class App {
  constructor() {
    this.whiteboardManager = null;
    this.participantManager = null;
    this.toolsManager = null;
    this.roomName = null;
  }

  async initialize(roomName) {
    this.roomName = roomName;
    await this.#waitForDOM();
    this.#initializeManagers();
    this.#setupHostBox();
  }

  #waitForDOM() {
    return new Promise((resolve) => {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      } else {
        resolve();
      }
    });
  }

  #initializeManagers() {
    const whiteboardEl   = document.getElementById('avi-whiteboard');
    const participantsEl = document.getElementById('avi-participants');
    const toolsEl        = document.getElementById('avi-tools');

    if (whiteboardEl) {
      this.whiteboardManager = new WhiteboardManager(whiteboardEl, {
        strokeColor: '#ffffff',
        lineWidth: 2,
        backgroundColor: 'rgba(255,0,0,0.1)'
      });
    }

    if (participantsEl) {
      this.participantManager = new ParticipantManager(participantsEl, {
        participantSelector: '.participant',
        dragThreshold: 4,
        onPositionChange: (id, pos) => {
          console.log('Posición actualizada', id, pos);
        }
      });
    }

    if (toolsEl) {
      this.toolsManager = new ToolsManager(toolsEl, {
        defaultMode: 'move',
        onModeChange: this.#handleModeChange.bind(this)
      });
    }
  }

  #setupHostBox() {
    if (!this.participantManager) return;
    this.participantManager.ensureParticipant({
      id: 'HOST',
      room: this.roomName,
      domId: 'host'
    });
  }

  #handleModeChange(newMode, previousMode) {
    if (this.whiteboardManager) {
      this.whiteboardManager.setEnabled(newMode === 'draw');
    }
    if (this.participantManager) {
      this.participantManager.setEnabled(newMode === 'move');
    }
    if (newMode === 'erase' && this.whiteboardManager) {
      this.whiteboardManager.clear();
    }
  }

  destroy() {
    this.whiteboardManager?.destroy();
    this.participantManager?.destroy();
    this.toolsManager?.destroy();
  }
}

export default App;
