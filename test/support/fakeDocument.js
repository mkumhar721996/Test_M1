class FakeElement extends EventTarget {
  constructor(tagName) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attributes = {};
    this.children = [];
    this._text = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  get id() {
    return this.attributes.id ?? '';
  }

  set id(value) {
    this.setAttribute('id', value);
  }

  get type() {
    return this.attributes.type ?? '';
  }

  set type(value) {
    this.setAttribute('type', value);
  }

  get value() {
    return this.attributes.value ?? '';
  }

  set value(value) {
    this.attributes.value = value;
  }

  get textContent() {
    return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text;
  }

  set textContent(value) {
    this._text = value;
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    return findAll(this, selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    return findAll(this, selector);
  }
}

function matchesSelector(el, selector) {
  const attrMatch = selector.match(/^([a-zA-Z0-9]+)\[([a-zA-Z-]+)="([^"]*)"\]$/);
  if (attrMatch) {
    const [, tag, attr, value] = attrMatch;
    return el.tagName.toLowerCase() === tag.toLowerCase() && el.getAttribute(attr) === value;
  }
  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }
  return el.tagName.toLowerCase() === selector.toLowerCase();
}

function findAll(root, selector) {
  const results = [];
  const stack = [...root.children];
  while (stack.length) {
    const el = stack.shift();
    if (matchesSelector(el, selector)) {
      results.push(el);
    }
    stack.push(...el.children);
  }
  return results;
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement('body');
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  querySelector(selector) {
    if (matchesSelector(this.body, selector)) {
      return this.body;
    }
    return this.body.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

export function createFakeDocument() {
  const doc = new FakeDocument();
  const app = doc.createElement('div');
  app.id = 'app';
  doc.body.appendChild(app);
  return doc;
}
