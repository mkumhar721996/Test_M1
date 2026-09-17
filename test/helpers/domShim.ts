/**
 * Minimal, purpose-scoped DOM shim so component code written against the
 * standard browser DOM API (createElement, addEventListener, classList,
 * focus/activeElement, etc.) can run under Node's built-in test runner.
 * Not a general jsdom replacement - only implements what src/components
 * actually uses.
 */

type EventLike = {
  type: string;
  target?: unknown;
  defaultPrevented?: boolean;
  _stopped?: boolean;
  preventDefault?: () => void;
};

class EventTargetShim {
  _listeners: Map<string, Set<(event: EventLike) => void>> = new Map();

  addEventListener(type: string, handler: (event: EventLike) => void): void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(handler);
  }

  removeEventListener(type: string, handler: (event: EventLike) => void): void {
    this._listeners.get(type)?.delete(handler);
  }

  dispatchEvent(event: EventLike): boolean {
    event.target = event.target || this;
    let node: ElementShim | this | null = this;
    while (node && !event._stopped) {
      (node as ElementShim)._listeners?.get(event.type)?.forEach((handler) => handler(event));
      node = (node as ElementShim).parentElement ?? null;
    }
    return !event.defaultPrevented;
  }
}

class ElementShim extends EventTargetShim {
  tagName: string;
  attributes: Map<string, string> = new Map();
  children: ElementShim[] = [];
  parentElement: ElementShim | null = null;
  style: Record<string, string> = {};
  disabled = false;
  dataset: Record<string, string>;
  classList: {
    add: (...names: string[]) => void;
    remove: (...names: string[]) => void;
    contains: (name: string) => boolean;
  };
  private _classes: Set<string> = new Set();
  private _text = '';
  private _tabIndex = -1;

  constructor(tagName: string) {
    super();
    this.tagName = tagName.toUpperCase();
    this.classList = {
      add: (...names) => names.forEach((n) => this._classes.add(n)),
      remove: (...names) => names.forEach((n) => this._classes.delete(n)),
      contains: (n) => this._classes.has(n),
    };
    this.dataset = new Proxy(
      {},
      {
        set: (target: Record<string, string>, key: string, value: string) => {
          this.setAttribute(`data-${camelToKebab(key)}`, value);
          target[key] = value;
          return true;
        },
        get: (target: Record<string, string>, key: string) => target[key],
      },
    );
  }

  get tabIndex(): number {
    return this._tabIndex;
  }

  set tabIndex(value: number) {
    this._tabIndex = value;
    this.attributes.set('tabindex', String(value));
  }

  get id(): string {
    return this.attributes.get('id') || '';
  }

  set id(value: string) {
    this.setAttribute('id', value);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.has(name) ? this.attributes.get(name)! : null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  get textContent(): string {
    if (this.children.length === 0) return this._text;
    return this.children.map((c) => c.textContent).join('');
  }

  set textContent(value: string) {
    this._text = value;
    this.children = [];
  }

  appendChild<T extends ElementShim>(child: T): T {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: ElementShim[]): void {
    nodes.forEach((n) => this.appendChild(n));
  }

  removeChild(child: ElementShim): void {
    this.children = this.children.filter((c) => c !== child);
    child.parentElement = null;
  }

  remove(): void {
    this.parentElement?.removeChild(this);
  }

  contains(other: ElementShim | null): boolean {
    let node = other;
    while (node) {
      if (node === (this as unknown as ElementShim)) return true;
      node = node.parentElement;
    }
    return false;
  }

  focus(): void {
    if (this.disabled) return;
    documentShim.activeElement = this;
  }

  blur(): void {
    if (documentShim.activeElement === this) {
      documentShim.activeElement = documentShim.body;
    }
  }

  scrollIntoView(): void {
    // no-op in the shim; real browsers perform the scroll.
  }
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

class KeyboardEventShim implements EventLike {
  type: string;
  key?: string;
  shiftKey: boolean;
  defaultPrevented = false;
  target: unknown = null;
  _stopped = false;

  constructor(type: string, init: { key?: string; shiftKey?: boolean } = {}) {
    this.type = type;
    this.key = init.key;
    this.shiftKey = Boolean(init.shiftKey);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

const documentShim = {
  createElement(tag: string): ElementShim {
    return new ElementShim(tag);
  },
  body: new ElementShim('body'),
  activeElement: null as ElementShim | null,
};
documentShim.activeElement = documentShim.body;

export function installDom(): typeof documentShim {
  documentShim.body = new ElementShim('body');
  documentShim.activeElement = documentShim.body;
  (globalThis as unknown as { document: typeof documentShim }).document = documentShim;
  return documentShim;
}

export function fireKeyDown(target: ElementShim, init?: { key?: string; shiftKey?: boolean }): KeyboardEventShim {
  const event = new KeyboardEventShim('keydown', init);
  target.dispatchEvent(event);
  return event;
}

export function fireClick(target: ElementShim): EventLike {
  const event: EventLike = {
    type: 'click',
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  target.dispatchEvent(event);
  return event;
}
