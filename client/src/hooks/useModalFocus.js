import { useEffect, useRef } from 'react';

const stack = [];
let previousOverflow;
const candidates = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

// Shared across both modal variants: only the top dialog handles keyboard input.
export default function useModalFocus(open, onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open || !ref.current) return undefined;
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    if (!stack.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    const childIndex = stack.findIndex(other => dialog.contains(other));
    if (childIndex < 0) stack.push(dialog);
    else stack.splice(childIndex, 0, dialog);
    if (stack[stack.length - 1] === dialog) (dialog.querySelector(candidates) || dialog).focus();
    const keyboard = event => {
      if (stack[stack.length - 1] !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = [...dialog.querySelectorAll(candidates)].filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true');
      const first = elements[0] || dialog;
      const last = elements[elements.length - 1] || dialog;
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('keydown', keyboard);
      const wasTop = stack[stack.length - 1] === dialog;
      stack.splice(stack.indexOf(dialog), 1);
      if (!stack.length) document.body.style.overflow = previousOverflow;
      if (wasTop && previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  return ref;
}
