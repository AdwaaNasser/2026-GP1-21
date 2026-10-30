import { useEffect, useRef, useState } from 'react';
import { Icon } from './taskUi.jsx';

// A year chooser that matches the rest of the interface (the browser's own
// <select> menu cannot be styled). Works with mouse, touch and keyboard.
export default function YearPicker({ year, years, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef(null);
  const button = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function outside(event) {
      if (root.current && !root.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  function show() {
    setActive(Math.max(0, years.indexOf(year)));
    setOpen(true);
  }

  function choose(value) {
    setOpen(false);
    button.current?.focus();
    if (value !== year) onChange(value);
  }

  function onKeyDown(event) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(years.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(years.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(years[active]); }
    else if (event.key === 'Tab') setOpen(false);
  }

  return (
    <div className="yp" ref={root} onKeyDown={onKeyDown}>
      <span className="yp-label" id="yp-label">Evaluation year</span>
      <button
        ref={button}
        type="button"
        className={`yp-button${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="yp-label yp-value"
        onClick={() => (open ? setOpen(false) : show())}
      >
        <Icon name="calendar" size={16} />
        <span id="yp-value" className="yp-value">{year}</span>
        <Icon name="chevron" size={14} className="yp-caret" />
      </button>
      {open && (
        <ul className="yp-menu" role="listbox" aria-labelledby="yp-label" aria-activedescendant={`yp-${years[active]}`}>
          {years.map((value, index) => (
            <li
              key={value}
              id={`yp-${value}`}
              role="option"
              aria-selected={value === year}
              className={`yp-option${index === active ? ' is-active' : ''}${value === year ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(value)}
            >
              <span>{value}</span>
              {value === new Date().getFullYear() && <span className="yp-tag">This year</span>}
              {value === year && <Icon name="check" size={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

