// alerts.js
(function() {
  // Inject CSS styles
  const css = `
    .custom-toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }
    .custom-toast {
      pointer-events: auto;
      min-width: 300px;
      max-width: 450px;
      padding: 16px 24px;
      background: rgba(10, 10, 10, 0.9);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: #fff;
      font-family: 'Outfit', 'Inter', sans-serif;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      transform: translateX(120%);
      transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.4s ease;
      opacity: 0;
    }
    .custom-toast.show {
      transform: translateX(0);
      opacity: 1;
    }
    .custom-toast-success {
      border-left: 4px solid #00ff41;
      box-shadow: 0 8px 32px 0 rgba(0, 255, 65, 0.15), inset 0 0 10px rgba(0, 255, 65, 0.05);
    }
    .custom-toast-error {
      border-left: 4px solid #ff3b30;
      box-shadow: 0 8px 32px 0 rgba(255, 59, 48, 0.15), inset 0 0 10px rgba(255, 59, 48, 0.05);
    }
    .custom-toast-info {
      border-left: 4px solid #007aff;
      box-shadow: 0 8px 32px 0 rgba(0, 122, 255, 0.15), inset 0 0 10px rgba(0, 122, 255, 0.05);
    }
    .custom-toast-message {
      font-size: 0.95rem;
      font-weight: 500;
      line-height: 1.4;
      flex-grow: 1;
    }
    .custom-toast-close {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      font-size: 1.2rem;
      padding: 0;
      line-height: 1;
      transition: color 0.2s ease;
    }
    .custom-toast-close:hover {
      color: #fff;
    }

    /* Modal styles */
    .custom-confirm-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    .custom-confirm-overlay.show {
      opacity: 1;
    }
    .custom-confirm-card {
      background: rgba(15, 15, 15, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 20px 50px rgba(0, 255, 65, 0.05), 0 0 0 1px rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: 28px;
      width: 90%;
      max-width: 440px;
      text-align: center;
      font-family: 'Outfit', 'Inter', sans-serif;
      transform: scale(0.9);
      transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .custom-confirm-overlay.show .custom-confirm-card {
      transform: scale(1);
    }
    .custom-confirm-title {
      font-size: 1.3rem;
      font-weight: 600;
      color: #fff;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }
    .custom-confirm-message {
      font-size: 0.95rem;
      color: rgba(255, 255, 255, 0.7);
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .custom-confirm-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }
    .custom-confirm-btn {
      padding: 10px 24px;
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.25s ease;
      font-family: inherit;
    }
    .custom-confirm-btn-cancel {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
    }
    .custom-confirm-btn-cancel:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
    }
    .custom-confirm-btn-confirm {
      background: rgba(0, 255, 65, 0.1);
      border: 1px solid #00ff41;
      color: #00ff41;
      box-shadow: 0 0 10px rgba(0, 255, 65, 0.2);
    }
    .custom-confirm-btn-confirm:hover {
      background: #00ff41;
      color: #000;
      box-shadow: 0 0 20px rgba(0, 255, 65, 0.4);
    }
  `;

  // Insert style tag
  const styleTag = document.createElement('style');
  styleTag.innerHTML = css;
  document.head.appendChild(styleTag);

  // Override window.alert
  window.alert = function(message, type = 'info') {
    // Toast Container Setup
    let toastContainer = document.querySelector('.custom-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'custom-toast-container';
      document.body.appendChild(toastContainer);
    }

    // Detect emojis or content to infer type if not explicitly set
    let toastType = type;
    if (message.includes('✅') || message.toLowerCase().includes('éxito') || message.toLowerCase().includes('exitoso') || message.toLowerCase().includes('confirmad')) {
      toastType = 'success';
    } else if (message.includes('❌') || message.toLowerCase().includes('error') || message.toLowerCase().includes('falló') || message.toLowerCase().includes('incorrect')) {
      toastType = 'error';
    }

    // Clean message of emojis since we show type visually
    let cleanMessage = message.replace(/^[✅❌ℹ️⚠️]\s*/, '');

    const toast = document.createElement('div');
    toast.className = `custom-toast custom-toast-${toastType}`;
    
    toast.innerHTML = `
      <div class="custom-toast-message">${cleanMessage}</div>
      <button class="custom-toast-close">&times;</button>
    `;

    toastContainer.appendChild(toast);

    // Trigger transition
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto dismiss
    const dismissTimeout = setTimeout(() => {
      dismissToast(toast);
    }, 4000);

    // Close button click
    toast.querySelector('.custom-toast-close').onclick = () => {
      clearTimeout(dismissTimeout);
      dismissToast(toast);
    };
  };

  function dismissToast(toast) {
    toast.classList.remove('show');
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 400);
  }

  // Override window.confirm (returns Promise)
  window.confirm = function(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'custom-confirm-overlay';

      overlay.innerHTML = `
        <div class="custom-confirm-card">
          <div class="custom-confirm-title">Confirmar Acción</div>
          <div class="custom-confirm-message">${message}</div>
          <div class="custom-confirm-actions">
            <button class="custom-confirm-btn custom-confirm-btn-cancel" id="btnCancel">Cancelar</button>
            <button class="custom-confirm-btn custom-confirm-btn-confirm" id="btnConfirm">Confirmar</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Trigger show
      setTimeout(() => overlay.classList.add('show'), 10);

      const closeConfirm = (result) => {
        overlay.classList.remove('show');
        setTimeout(() => {
          if (overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
          }
          resolve(result);
        }, 300);
      };

      overlay.querySelector('#btnCancel').onclick = () => closeConfirm(false);
      overlay.querySelector('#btnConfirm').onclick = () => closeConfirm(true);
    });
  };
})();
