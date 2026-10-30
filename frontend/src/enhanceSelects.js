// Gives every <select> in the app the same look and behaviour.
//
// The browser draws the open list of a native <select> itself, so it cannot be
// styled and looks different on every system. This file keeps the real select
// (so forms, validation and React keep working) but hides it, and shows a
// styled button and list instead. Choosing an option sets the real select and
// fires a normal "change" event.

const CARET = '<svg class="ws-icon yp-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
const CHECK = '<svg class="ws-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

const SELECTOR = 'select';
const enhanced = new WeakMap();
let openState = null; // { select, menu, button, active }

function labelOf(select) {
  const option = select.options[select.selectedIndex];
  return option ? option.textContent : '';
}

function isPlaceholder(select) {
  const option = select.options[select.selectedIndex];
  return !option || option.value === '';
}

function sync(select) {
  const record = enhanced.get(select);
  if (!record) return;
  const { button, value } = record;
  const text = labelOf(select);
  if (value.textContent !== text) value.textContent = text;
  value.classList.toggle('is-placeholder', isPlaceholder(select));
  button.disabled = select.disabled;
  button.classList.toggle('is-invalid', select.classList.contains('is-invalid'));
}

function closeMenu(refocus) {
  if (!openState) return;
  const { menu, button } = openState;
  menu.remove();
  button.setAttribute('aria-expanded', 'false');
  button.classList.remove('is-open');
  openState = null;
  document.removeEventListener('mousedown', onOutside, true);
  window.removeEventListener('scroll', onScroll, true);
  window.removeEventListener('resize', onResize);
  if (refocus) button.focus();
}

function onOutside(event) {
  if (!openState) return;
  if (openState.menu.contains(event.target) || openState.button.contains(event.target)) return;
  closeMenu(false);
}
function onScroll(event) {
  if (openState && !openState.menu.contains(event.target)) closeMenu(false);
}
function onResize() { closeMenu(false); }

function choose(select, index) {
  const changed = select.selectedIndex !== index;
  select.selectedIndex = index;
  closeMenu(true);
  sync(select);
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function paintActive() {
  if (!openState) return;
  const { menu, active } = openState;
  [...menu.children].forEach((item, index) => item.classList.toggle('is-active', index === active));
  const item = menu.children[active];
  if (item) item.scrollIntoView({ block: 'nearest' });
  menu.setAttribute('aria-activedescendant', item ? item.id : '');
}

let counter = 0;
function openMenu(select) {
  const record = enhanced.get(select);
  if (!record || select.disabled) return;
  if (openState) closeMenu(false);
  const { button } = record;
  const menu = document.createElement('ul');
  menu.className = 'yp-menu yp-floating';
  menu.setAttribute('role', 'listbox');
  menu.tabIndex = -1;
  const id = `sel-${++counter}`;
  [...select.options].forEach((option, index) => {
    if (option.hidden) return;
    const item = document.createElement('li');
    item.id = `${id}-${index}`;
    item.className = 'yp-option';
    item.setAttribute('role', 'option');
    item.dataset.index = String(index);
    if (option.disabled) item.setAttribute('aria-disabled', 'true');
    const selected = index === select.selectedIndex;
    item.setAttribute('aria-selected', String(selected));
    if (selected) item.classList.add('is-selected');
    if (option.value === '') item.classList.add('is-placeholder');
    item.innerHTML = '<span></span>';
    item.firstChild.textContent = option.textContent;
    if (selected) item.insertAdjacentHTML('beforeend', CHECK);
    item.addEventListener('mousedown', (event) => event.preventDefault());
    item.addEventListener('click', () => { if (!option.disabled) choose(select, index); });
    menu.appendChild(item);
  });
  document.body.appendChild(menu);

  const rect = button.getBoundingClientRect();
  menu.style.minWidth = `${Math.max(rect.width, 180)}px`;
  const below = window.innerHeight - rect.bottom - 12;
  const above = rect.top - 12;
  const height = Math.min(menu.scrollHeight, 300);
  const openUp = below < height && above > below;
  menu.style.maxHeight = `${Math.max(120, Math.min(300, openUp ? above : below))}px`;
  menu.style.left = `${Math.min(rect.left, window.innerWidth - menu.offsetWidth - 12)}px`;
  menu.style.top = openUp ? `${rect.top - menu.offsetHeight - 6}px` : `${rect.bottom + 6}px`;
  if (openUp) menu.style.transformOrigin = 'bottom left';

  button.setAttribute('aria-expanded', 'true');
  button.classList.add('is-open');
  openState = { select, menu, button, active: Math.max(0, select.selectedIndex) };
  paintActive();
  document.addEventListener('mousedown', onOutside, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onResize);
}

function move(step) {
  if (!openState) return;
  const { select } = openState;
  let next = openState.active;
  for (let i = 0; i < select.options.length; i += 1) {
    next += step;
    if (next < 0 || next >= select.options.length) return;
    if (!select.options[next].disabled && !select.options[next].hidden) { openState.active = next; paintActive(); return; }
  }
}

function onKeyDown(event, select) {
  if (!openState) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openMenu(select); }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
  else if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
  else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
  else if (event.key === 'Home') { event.preventDefault(); openState.active = -1; move(1); }
  else if (event.key === 'End') { event.preventDefault(); openState.active = select.options.length; move(-1); }
  else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(select, openState.active); }
  else if (event.key === 'Tab') closeMenu(false);
}

function enhance(select) {
  if (enhanced.has(select) || select.multiple || select.size > 1 || select.dataset.native === 'true') return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'yp-button yp-select';
  if (select.classList.contains('ws-select-sm')) button.classList.add('yp-sm');
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  const label = select.getAttribute('aria-label');
  if (label) button.setAttribute('aria-label', label);
  else if (select.id) {
    const text = document.querySelector(`label[for="${select.id}"]`);
    if (text) button.setAttribute('aria-label', text.textContent.trim());
  }
  const value = document.createElement('span');
  value.className = 'yp-value';
  button.appendChild(value);
  button.insertAdjacentHTML('beforeend', CARET);
  button.addEventListener('click', () => (openState && openState.button === button ? closeMenu(false) : openMenu(select)));
  button.addEventListener('keydown', (event) => onKeyDown(event, select));
  select.classList.add('sel-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(button);
  enhanced.set(select, { button, value });
  select.addEventListener('change', () => sync(select));
  sync(select);
}

function sweep() {
  document.querySelectorAll(SELECTOR).forEach(enhance);
  // Remove buttons whose select is gone, and refresh labels React changed.
  document.querySelectorAll('.yp-select').forEach((button) => {
    const select = button.previousElementSibling;
    if (!select || select.tagName !== 'SELECT' || !select.isConnected) button.remove();
    else sync(select);
  });
}

export function enhanceSelects() {
  if (typeof document === 'undefined' || window.__selectsEnhanced) return;
  window.__selectsEnhanced = true;
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; sweep(); });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  // React sets a select's value without any DOM event; a light check keeps labels right.
  setInterval(() => { if (!document.hidden) document.querySelectorAll('select.sel-native').forEach(sync); }, 400);
  sweep();
}
