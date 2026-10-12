import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';

export interface OtpInputOptions {
  length?: number;
  ariaGroupLabel?: string;
  digitLabelPrefix?: string;
  successMessage?: string;
  errorMessage?: string;
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
  validate?: (code: string) => boolean | Promise<boolean>;
}

export interface OtpInputController {
  getValue: () => string;
  setValue: (value: string) => void;
  clear: () => void;
  focus: (index?: number) => void;
  setError: (message?: string) => void;
  setSuccess: (message?: string) => void;
  reset: () => void;
  destroy: () => void;
}

export function createOtpInput(container: HTMLElement, options: OtpInputOptions = {}): OtpInputController {
  const length = options.length ?? 6;
  const groupLabel = options.ariaGroupLabel ?? 'One-time verification code';
  const digitPrefix = options.digitLabelPrefix ?? 'Digit';
  const defaultSuccessMsg = options.successMessage ?? 'Verified';
  const defaultErrorMsg = options.errorMessage ?? 'Invalid code, try again';

  container.innerHTML = '';
  container.classList.add('otp-widget');

  const row = document.createElement('div');
  row.className = 'otp-row';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', groupLabel);

  const statusEl = document.createElement('div');
  statusEl.className = 'otp-status';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');

  const cells: HTMLInputElement[] = [];
  let isLocked = false;
  let state: 'idle' | 'error' | 'success' = 'idle';

  function updateTabIndices(activeIndex: number) {
    cells.forEach((cell, idx) => {
      cell.tabIndex = idx === activeIndex ? 0 : -1;
    });
  }

  function syncVisualState() {
    cells.forEach((cell) => {
      cell.classList.toggle('is-filled', cell.value.length > 0);
    });
  }

  function clearValidationVisuals() {
    if (state === 'idle') return;
    state = 'idle';
    row.classList.remove('is-error', 'is-success', 'is-shaking');
    statusEl.className = 'otp-status';
    statusEl.textContent = '';
  }

  function getValue(): string {
    return cells.map((c) => c.value).join('');
  }

  function emitChange() {
    syncVisualState();
    const code = getValue();
    options.onChange?.(code);
  }

  async function triggerCompleteIfFull() {
    const code = getValue();
    if (code.length !== length || cells.some((c) => !/^\d$/.test(c.value))) {
      return;
    }
    options.onComplete?.(code);
    if (options.validate) {
      try {
        const valid = await options.validate(code);
        if (valid) {
          setSuccess(defaultSuccessMsg);
        } else {
          setError(defaultErrorMsg);
        }
      } catch (err) {
        const msg = err instanceof Error && err.message ? err.message : defaultErrorMsg;
        setError(msg);
      }
    }
  }

  function focusCell(index = 0) {
    const clamped = Math.max(0, Math.min(length - 1, index));
    updateTabIndices(clamped);
    const target = cells[clamped];
    if (target) {
      target.focus();
      target.select();
    }
  }

  function setError(message = defaultErrorMsg) {
    state = 'error';
    row.classList.remove('is-success', 'is-shaking');
    row.classList.add('is-error');
    // Force reflow to restart shake animation if triggered consecutively
    void row.offsetWidth;
    row.classList.add('is-shaking');
    statusEl.className = 'otp-status is-error';
    statusEl.textContent = message;
  }

  function setSuccess(message = defaultSuccessMsg) {
    state = 'success';
    isLocked = true;
    row.classList.remove('is-error', 'is-shaking');
    row.classList.add('is-success');
    cells.forEach((cell) => {
      cell.readOnly = true;
    });
    statusEl.className = 'otp-status is-success';
    statusEl.textContent = message;
  }

  function clear() {
    if (isLocked) return;
    clearValidationVisuals();
    cells.forEach((cell) => {
      cell.value = '';
    });
    emitChange();
    focusCell(0);
  }

  function reset() {
    isLocked = false;
    state = 'idle';
    row.classList.remove('is-error', 'is-success', 'is-shaking');
    statusEl.className = 'otp-status';
    statusEl.textContent = '';
    cells.forEach((cell) => {
      cell.readOnly = false;
      cell.value = '';
    });
    emitChange();
    updateTabIndices(0);
  }

  function setValue(raw: string) {
    if (isLocked) return;
    clearValidationVisuals();
    const digits = raw.replace(/\D/g, '').slice(0, length).split('');
    cells.forEach((cell, idx) => {
      cell.value = digits[idx] ?? '';
    });
    emitChange();
    if (digits.length === length) {
      void triggerCompleteIfFull();
    }
  }

  function handlePaste(e: ClipboardEvent, startIndex: number) {
    e.preventDefault();
    if (isLocked) return;
    const pasted = e.clipboardData?.getData('text') ?? '';
    const digits = pasted.replace(/\D/g, '').slice(0, length);
    if (!digits) return;

    clearValidationVisuals();
    let lastFilledIndex = startIndex;
    for (let i = 0; i < digits.length; i++) {
      const targetIdx = startIndex + i;
      if (targetIdx >= length) break;
      cells[targetIdx]!.value = digits[i]!;
      lastFilledIndex = targetIdx;
    }

    emitChange();
    const nextFocusIndex = Math.min(length - 1, lastFilledIndex + 1);
    focusCell(nextFocusIndex);
    void triggerCompleteIfFull();
  }

  for (let i = 0; i < length; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.maxLength = 1;
    input.autocomplete = 'one-time-code';
    input.className = 'otp-cell';
    input.setAttribute('aria-label', `${digitPrefix} ${i + 1}`);
    input.tabIndex = i === 0 ? 0 : -1;

    input.addEventListener('focus', () => {
      updateTabIndices(i);
      requestAnimationFrame(() => {
        input.select();
      });
    });

    input.addEventListener('click', () => {
      input.select();
    });

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        // Allow Tab / Shift+Tab to leave the group entirely without trapping focus
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (i > 0) focusCell(i - 1);
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (i < length - 1) focusCell(i + 1);
        return;
      }

      if (e.key === 'Home') {
        e.preventDefault();
        focusCell(0);
        return;
      }

      if (e.key === 'End') {
        e.preventDefault();
        let lastFilled = -1;
        for (let idx = length - 1; idx >= 0; idx--) {
          if (cells[idx]!.value) {
            lastFilled = idx;
            break;
          }
        }
        focusCell(lastFilled >= 0 ? lastFilled : length - 1);
        return;
      }

      if (isLocked) return;

      if (e.key === 'Backspace') {
        e.preventDefault();
        clearValidationVisuals();
        if (input.value) {
          // Backspace on a filled cell: clear it and stay
          input.value = '';
          emitChange();
        } else if (i > 0) {
          // Backspace on an empty cell: clear and focus the previous cell
          cells[i - 1]!.value = '';
          emitChange();
          focusCell(i - 1);
        }
        return;
      }

      if (e.key === 'Delete') {
        e.preventDefault();
        clearValidationVisuals();
        input.value = '';
        emitChange();
        return;
      }

      // Pressing the same digit twice when already selected should still overwrite and advance
      if (/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        clearValidationVisuals();
        input.value = e.key;
        emitChange();
        if (i < length - 1) {
          focusCell(i + 1);
        }
        void triggerCompleteIfFull();
      }
    });

    input.addEventListener('input', () => {
      if (isLocked) return;
      clearValidationVisuals();
      const match = input.value.match(/\d/);
      if (!match) {
        input.value = '';
        emitChange();
        return;
      }
      input.value = match[0];
      emitChange();
      if (i < length - 1) {
        focusCell(i + 1);
      }
      void triggerCompleteIfFull();
    });

    input.addEventListener('paste', (e) => handlePaste(e, i));

    cells.push(input);
    row.appendChild(input);
  }

  row.addEventListener('animationend', () => {
    row.classList.remove('is-shaking');
  });

  container.appendChild(row);
  container.appendChild(statusEl);

  return {
    getValue,
    setValue,
    clear,
    focus: focusCell,
    setError,
    setSuccess,
    reset,
    destroy: () => {
      container.innerHTML = '';
    },
  };
}

export interface OtpInputProps {
  length?: number;
  ariaGroupLabel?: string;
  digitLabelPrefix?: string;
  successMessage?: string;
  errorMessage?: string;
  autoFocus?: boolean;
  onChange?: (code: string) => void;
  onComplete?: (code: string) => void;
  validate?: (code: string) => boolean | Promise<boolean>;
}

export const OtpInput = forwardRef<OtpInputController, OtpInputProps>(function OtpInput(
  {
    length = 6,
    ariaGroupLabel,
    digitLabelPrefix,
    successMessage,
    errorMessage,
    autoFocus = true,
    onChange,
    onComplete,
    validate,
  },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OtpInputController | null>(null);
  const callbacksRef = useRef({ onChange, onComplete, validate });
  callbacksRef.current = { onChange, onComplete, validate };

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ctrl = createOtpInput(el, {
      length,
      ariaGroupLabel,
      digitLabelPrefix,
      successMessage,
      errorMessage,
      onChange: (code) => callbacksRef.current.onChange?.(code),
      onComplete: (code) => callbacksRef.current.onComplete?.(code),
      validate: callbacksRef.current.validate
        ? (code) => callbacksRef.current.validate!(code)
        : undefined,
    });
    controllerRef.current = ctrl;
    if (autoFocus) {
      requestAnimationFrame(() => ctrl.focus(0));
    }
    return () => {
      ctrl.destroy();
      controllerRef.current = null;
    };
  }, [length, ariaGroupLabel, digitLabelPrefix, successMessage, errorMessage, autoFocus]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => controllerRef.current?.getValue() ?? '',
      setValue: (val: string) => controllerRef.current?.setValue(val),
      clear: () => controllerRef.current?.clear(),
      focus: (idx?: number) => controllerRef.current?.focus(idx),
      setError: (msg?: string) => controllerRef.current?.setError(msg),
      setSuccess: (msg?: string) => controllerRef.current?.setSuccess(msg),
      reset: () => controllerRef.current?.reset(),
      destroy: () => controllerRef.current?.destroy(),
    }),
    [],
  );

  return <div ref={hostRef} />;
});

if (typeof window !== 'undefined') {
  (window as unknown as { createOtpInput: typeof createOtpInput }).createOtpInput = createOtpInput;
}
