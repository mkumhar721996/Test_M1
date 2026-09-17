/**
 * Minimal, purpose-scoped DOM shim so component code written against the
 * standard browser DOM API (createElement, addEventListener, classList,
 * focus/activeElement, etc.) can run under Node's built-in test runner.
 * Not a general jsdom replacement - only implements what src/components
 * actually uses.
 */

class EventTargetShim {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this._listeners.get(type)?.delete(handler);
  }

  dispatchEvent(event) {
    event.target = event.target || this;
    let node = this;
    while (node && !event._stopped) {
      node._listeners?.get(event.type)?.forEach((handler) => handler(event));
      node = node.parentElement;
    }
    return !event.defaultPrevented;
  }
}

class ElementShim extends EventTargetShim {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this._classes = new Set();
    this._text = '';
    this.disabled = false;
    this._tabIndex = -1;
    this.classList = {
      add: (...names) => names.forEach((n) => this._classes.add(n)),
      remove: (...names) => names.forEach((n) => this._classes.delete(n)),
      contains: (n) => this._classes.has(n),
    };
    this.dataset = new Proxy(
      {},
      {
        set: (target, key, value) => {
          this.setAttribute(`data-${camelToKebab(key)}`, value);
          target[key] = value;
          return true;
        },
        get: (target, key) => target[key],
      },
    );
  }

  get tabIndex() {
    return this._tabIndex;
  }

  set tabIndex(value) {
    this._tabIndex = value;
    this.attributes.set('tabindex', String(value));
  }

  get id() {
    return this.attributes.get('id') || '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(value) {
    this._text = value;
    this.children = [];
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    nodes.forEach((n) => this.appendChild(n));
  }

  removeChild(child) {
    this.children = this.children.filter((c) => c !== child);
    child.parentElement = null;
  }

  remove() {
    this.parentElement?.removeChild(this);
  }

  contains(other) {
    let node = other;
    while (node) {
      if (node === this) return true;
      node = node.parentElement;
    }
    return false;
  }

  focus() {
    if (this.disabled) return;
    documentShim.activeElement = this;
  }

  blur() {
    if (documentShim.activeElement === this) {
      documentShim.activeElement = documentShim.body;
    }
  }

  scrollIntoView() {
    // no-op in the shim; real browsers perform the scroll.
  }
}

function camelToKebab(str) {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

class KeyboardEventShim {
  constructor(type, init = {}) {
    this.type = type;
    this.key = init.key;
    this.shiftKey = Boolean(init.shiftKey);
    this.defaultPrevented = false;
    this.target = null;
    this._stopped = false;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }
}

const documentShim = {
  createElement(tag) {
    return new ElementShim(tag);
  },
  body: new ElementShim('body'),
  activeElement: null,
};
documentShim.activeElement = documentShim.body;

export function installDom() {
  documentShim.body = new ElementShim('body');
  documentShim.activeElement = documentShim.body;
  globalThis.document = documentShim;
  return documentShim;
}

export function fireKeyDown(target, init) {
  const event = new KeyboardEventShim('keydown', init);
  target.dispatchEvent(event);
  return event;
}

export function fireClick(target) {
  const event = { type: 'click', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  target.dispatchEvent(event);
  return event;
}
