
const ERROR_CLASS = 'field-error-text';

function messageFor(element) {
  const custom = element.getAttribute('data-error');
  const { validity } = element;
  if (validity.valueMissing) {
    if (element.type === 'checkbox') return 'This box must be ticked.';
    return element.tagName === 'SELECT' ? 'Choose an option.' : 'This field is required.';
  }
  if (validity.typeMismatch && element.type === 'email') return 'Enter a valid email address.';
  if (validity.typeMismatch) return 'Enter a valid value.';
  if (validity.tooShort) return `Use at least ${element.minLength} characters.`;
  if (validity.rangeUnderflow) return `The smallest value allowed is ${element.min}.`;
  if (validity.rangeOverflow) return `The largest value allowed is ${element.max}.`;
  if (validity.patternMismatch) return custom || 'Use the format that is asked for.';
  if (validity.badInput) return 'Enter a valid value.';
  return custom || element.validationMessage || 'This value is not valid.';
}

export function clearFieldError(element) {
  element.removeAttribute('aria-invalid');
  element.classList.remove('is-invalid');
  const next = element.nextElementSibling;
  if (next && next.classList.contains(ERROR_CLASS)) next.remove();
  const holder = element.closest('label, .field-group');
  const inside = holder && holder.querySelector(`.${ERROR_CLASS}`);
  if (inside) inside.remove();
}

// Marks one box red and shows the message right under it.
export function setFieldError(element, message) {
  clearFieldError(element);
  element.setAttribute('aria-invalid', 'true');
  element.classList.add('is-invalid');
  const note = document.createElement('small');
  note.className = ERROR_CLASS;
  note.setAttribute('role', 'alert');
  note.textContent = message;
  const holder = element.closest('label.ws-field, .field-group');
  if (holder) holder.appendChild(note);
  else element.insertAdjacentElement('afterend', note);
}

function watch(form) {
  if (form.dataset.validationWatching) return;
  form.dataset.validationWatching = 'true';
  const clear = (event) => {
    const target = event.target;
    if (target && target.getAttribute && target.getAttribute('aria-invalid') === 'true') {
      clearFieldError(target);
    }
  };
  form.addEventListener('input', clear);
  form.addEventListener('change', clear);
}

// Checks every box of a form. Returns true when all of them are fine.
export function checkForm(form) {
  watch(form);
  let firstBad = null;
  form.querySelectorAll('input, select, textarea').forEach((element) => {
    if (element.disabled || element.type === 'hidden' || (element.type === 'file' && !element.required)) return;
    clearFieldError(element);
    // Trim: a box that only holds spaces counts as empty.
    if (element.required && element.type !== 'checkbox' && element.type !== 'file'
      && element.tagName !== 'SELECT' && element.value.trim() === '' && element.value !== '') {
      setFieldError(element, 'This field is required.');
      firstBad = firstBad || element;
      return;
    }
    // The browser accepts "name@x"; real addresses need a dot in the domain.
    if (element.type === 'email' && element.value.trim() !== ''
      && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(element.value.trim())) {
      setFieldError(element, 'Enter a valid email address.');
      firstBad = firstBad || element;
      return;
    }
    if (!element.checkValidity()) {
      setFieldError(element, messageFor(element));
      firstBad = firstBad || element;
    }
  });
  if (firstBad) firstBad.focus();
  return !firstBad;
}

// Wraps a submit handler so it only runs when the form is filled in correctly.
export function validatedSubmit(handler) {
  return (event) => {
    event.preventDefault();
    if (!checkForm(event.currentTarget)) return;
    handler(event);
  };
}
