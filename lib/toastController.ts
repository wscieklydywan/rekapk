// Minimal toast controller — independent from NotificationContext
type ToastPayload = { id: string; text: string; duration?: number; variant?: 'lock-locked' | 'lock-unlocked' | 'error' | 'info' | 'default' };

type ToastListener = (payloads: ToastPayload[]) => void;

let _listener: ToastListener | null = null;
let _toasts: ToastPayload[] = [];
const _timers: Record<string, number> = {};
const MAX_TOASTS = 3;
const DEFAULT_DURATION = 2500;

function _notify() {
  try { if (_listener) _listener([..._toasts]); } catch (e) { /* ignore */ }
}

function _removeById(id: string) {
  _toasts = _toasts.filter(t => t.id !== id);
  const t = _timers[id];
  if (t) { try { clearTimeout(t); } catch (e) { /* ignore */ } delete _timers[id]; }
  _notify();
}

export const toast = {
  // Accepts either a string or a payload object. New toasts are stacked; newest shown in main spot.
  show(arg: string | { text: string; duration?: number; variant?: any }, duration?: number) {
    try {
      let text: string;
      let ms = duration ?? DEFAULT_DURATION;
      let variant: 'lock-locked' | 'lock-unlocked' | 'error' | 'info' | 'default' = 'default';

      if (typeof arg === 'string') { text = arg; }
      else { text = arg.text; ms = arg.duration ?? ms; variant = arg.variant ?? 'default'; }

      const id = `${Date.now()}_${Math.random().toString(16).slice(2,8)}`;
      const item: ToastPayload = { id, text, duration: ms, variant };

      // if too many toasts, remove the oldest to keep viewport clean
      if (_toasts.length >= MAX_TOASTS) {
        const removed = _toasts.shift();
        if (removed) {
          const t = _timers[removed.id];
          if (t) { try { clearTimeout(t); } catch (e) {} }
          delete _timers[removed.id];
        }
      }

      // push as newest (end = main spot)
      _toasts.push(item);
      _notify();

      // schedule removal after ms
      const timer = setTimeout(() => { _removeById(id); }, ms) as unknown as number;
      _timers[id] = timer;
    } catch (e) { /* ignore */ }
  },
  _subscribe(l: ToastListener) {
    _listener = l;
    // initial sync
    try { l([..._toasts]); } catch (e) { /* ignore */ }
    return () => { if (_listener === l) _listener = null; };
  },
  // for testing or immediate clear
  _clearAll() {
    Object.keys(_timers).forEach(id => { try { clearTimeout(_timers[id]); } catch (e) {} });
    for (const k in _timers) delete _timers[k];
    _toasts = [];
    _notify();
  }
};

export default toast;
