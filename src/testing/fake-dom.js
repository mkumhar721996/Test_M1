// Minimal DOM stand-in for tests: this sandbox has no network access to
// install jsdom, so this implements only the handful of Element/Document
// members bet-selector-view.js actually uses.

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName;
    this.ownerDocument = ownerDocument;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.children = [];
    this.disabled = false;
    this.textContent = '';
    this.listeners = {};
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }

  click() {
    for (const handler of this.listeners.click ?? []) {
      handler({ target: this });
    }
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

export function createFakeContainer() {
  return new FakeDocument().createElement('div');
}
