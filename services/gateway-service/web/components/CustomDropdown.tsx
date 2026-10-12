import { useEffect, useRef, useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  badge?: string;
}

export function CustomDropdown({
  id,
  value,
  placeholder,
  options,
  ariaLabel,
  onChange,
  compact = false,
}: {
  id?: string;
  value: string;
  placeholder?: string;
  options: DropdownOption[];
  ariaLabel?: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`fc-dropdown ${compact ? 'fc-dropdown--compact' : ''} ${open ? 'is-open' : ''}`}
    >
      <button
        id={id}
        type="button"
        className="fc-dropdown__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="fc-dropdown__value">
          {selectedOption ? selectedOption.label : placeholder ?? ''}
        </span>
        <svg
          className="fc-dropdown__chevron"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="fc-dropdown__menu" role="listbox" aria-label={ariaLabel}>
          {placeholder && (
            <div className="fc-dropdown__header">{placeholder}</div>
          )}
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={`fc-dropdown__item ${isSelected ? 'is-selected' : ''}`}
                onClick={() => {
                  setOpen(false);
                  if (opt.value !== value) {
                    onChange(opt.value);
                  }
                }}
              >
                <span className="fc-dropdown__item-label">{opt.label}</span>
                {isSelected ? (
                  <span className="fc-dropdown__item-check" aria-hidden="true">
                    ✓
                  </span>
                ) : opt.badge ? (
                  <span className="fc-dropdown__item-badge">{opt.badge}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
