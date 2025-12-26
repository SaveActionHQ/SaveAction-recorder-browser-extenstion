/**
 * ✅ BUG FIX #6: Toast notification system for user feedback
 * Shows non-intrusive notifications when inputs are skipped
 */

export interface ToastOptions {
  message: string;
  duration?: number; // milliseconds, default 3000
  type?: 'info' | 'warning' | 'error' | 'success';
}

/**
 * Show a toast notification to the user
 */
export function showToast(options: ToastOptions): void {
  const { message, duration = 3000, type = 'warning' } = options;

  // Check if toast container exists, create if not
  let container = document.getElementById('saveaction-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'saveaction-toast-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      pointer-events: none;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    document.body.appendChild(container);
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: ${getBackgroundColor(type)};
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    margin-bottom: 10px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 14px;
    line-height: 1.4;
    opacity: 0;
    transform: translateX(20px);
    transition: all 0.3s ease;
    pointer-events: auto;
    max-width: 350px;
    word-wrap: break-word;
  `;
  toast.textContent = message;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  });

  // Auto-dismiss after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => {
      toast.remove();
      // Remove container if no more toasts
      if (container && container.children.length === 0) {
        container.remove();
      }
    }, 300);
  }, duration);
}

function getBackgroundColor(type: ToastOptions['type']): string {
  switch (type) {
    case 'success':
      return '#10b981';
    case 'error':
      return '#ef4444';
    case 'warning':
      return '#f59e0b';
    case 'info':
    default:
      return '#3b82f6';
  }
}
