// Basic on-screen calculator: a pure arithmetic/state module (stand-in "Calculation Engine")
// plus DOM wiring for the keypad, live display and screen-reader live region.

const OPERATORS = ['+', '-', '×', '÷'];
const OVERFLOW_LIMIT = 1e15;

const ERROR_MESSAGES = {
  'divide-zero': 'Divide by Zero',
  overflow: 'Overflow',
  syntax: 'Syntax Error',
  domain: 'Domain Error',
};

function isOperator(ch) {
  return OPERATORS.includes(ch);
}

function currentSegment(expr) {
  let idx = -1;
  for (const op of OPERATORS) {
    const i = expr.lastIndexOf(op);
    if (i > idx) idx = i;
  }
  return idx === -1 ? expr : expr.slice(idx + 1);
}

// Strict evaluator used by "=": a dangling operator is a syntax error.
function evaluate(expr) {
  const tokens = expr.match(/\d+\.?\d*|\.\d+|[+\-×÷]/g);
  if (!tokens || tokens.join('') !== expr) throw { type: 'syntax' };

  // A leading '-' is a unary minus on the first operand (e.g. continuing from a negative
  // finalized result), not a binary operator, so fold it into the first number token.
  if (tokens[0] === '-') {
    if (tokens.length < 2 || isOperator(tokens[1])) throw { type: 'syntax' };
    tokens.splice(0, 2, '-' + tokens[1]);
  } else if (isOperator(tokens[0])) {
    throw { type: 'syntax' };
  }
  if (isOperator(tokens[tokens.length - 1])) throw { type: 'syntax' };

  // Pass 1: × and ÷ left-to-right.
  const reduced = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const num = tokens[i + 1];
    if (num === undefined || isOperator(num)) throw { type: 'syntax' };
    if (op === '×' || op === '÷') {
      const left = parseFloat(reduced[reduced.length - 1]);
      const right = parseFloat(num);
      if (op === '÷' && right === 0) throw { type: 'divide-zero' };
      const val = op === '×' ? left * right : left / right;
      if (!Number.isFinite(val)) throw { type: 'overflow' };
      reduced[reduced.length - 1] = String(val);
    } else {
      reduced.push(op, num);
    }
  }

  // Pass 2: + and − left-to-right.
  let total = parseFloat(reduced[0]);
  for (let i = 1; i < reduced.length; i += 2) {
    const num = parseFloat(reduced[i + 1]);
    total = reduced[i] === '+' ? total + num : total - num;
  }
  if (!Number.isFinite(total) || Math.abs(total) >= OVERFLOW_LIMIT) throw { type: 'overflow' };
  return total;
}

// Lenient evaluator for the live preview: a trailing operator is trimmed, not an error.
function previewEvaluate(expr) {
  let trimmed = expr;
  while (trimmed && isOperator(trimmed[trimmed.length - 1])) trimmed = trimmed.slice(0, -1);
  if (!trimmed) return null;
  return evaluate(trimmed);
}

function formatNumber(n) {
  const rounded = Math.round(n * 1e9) / 1e9;
  if (!Number.isFinite(rounded)) return rounded.toString();
  // toString() switches to exponential notation outside ~1e-6..1e21, which the tokenizer
  // can't parse back; toFixed keeps plain decimal digits for every magnitude this engine
  // can produce (results are capped at OVERFLOW_LIMIT, well under toFixed's own 1e21 limit).
  return rounded.toFixed(9).replace(/\.?0+$/, '');
}

// Matches expenses.js's validateAmount, which rejects more than 2 decimal places.
function formatAmountForField(n) {
  return (Math.round(n * 100) / 100).toString();
}

function createInitialState() {
  return { expression: '', finalized: false, finalizedValue: null, forcedSyntaxError: false };
}

function pressKey(state, key) {
  if (key === 'clear') return createInitialState();

  const { expression } = state;

  if (key === 'equals') {
    if (!expression || isOperator(expression[expression.length - 1])) {
      return { ...state, forcedSyntaxError: true, finalized: false };
    }
    try {
      return { ...state, forcedSyntaxError: false, finalized: true, finalizedValue: evaluate(expression) };
    } catch (e) {
      // Leave the expression unfinalized; the display re-derives the error from it.
      return { ...state, forcedSyntaxError: false, finalized: false };
    }
  }

  const next = { ...state, forcedSyntaxError: false };

  if (key === 'backspace') {
    const expr = state.finalized ? formatNumber(state.finalizedValue) : expression;
    return { ...next, expression: expr.slice(0, -1), finalized: false };
  }

  if (isOperator(key)) {
    if (state.finalized) {
      return { ...next, expression: formatNumber(state.finalizedValue) + key, finalized: false };
    }
    if (!expression) return next; // no sign-toggle: nothing to operate on yet
    if (isOperator(expression[expression.length - 1])) {
      return { ...next, expression: expression.slice(0, -1) + key };
    }
    return { ...next, expression: expression + key };
  }

  if (key === '.') {
    if (state.finalized) return { ...next, expression: '0.', finalized: false };
    const segment = currentSegment(expression);
    if (segment.includes('.')) return next;
    return { ...next, expression: expression + (segment === '' ? '0.' : '.') };
  }

  // digit
  if (state.finalized) return { ...next, expression: key, finalized: false };
  return { ...next, expression: expression + key };
}

// ---------- DOM wiring ----------

const EXPR_SIZES = [
  'var(--calc-display-expr-size-max)',
  'var(--calc-display-expr-size-mid)',
  'var(--font-size-md)',
];

// Shrinks step by step until the text fits or the minimum is reached. Past the minimum the
// element's CSS (overflow hidden, right-aligned) keeps the newest character visible.
function fitExpressionFontSize(el, sizes) {
  let i = 0;
  el.style.fontSize = sizes[0];
  while (el.scrollWidth > el.clientWidth && i < sizes.length - 1) {
    i += 1;
    el.style.fontSize = sizes[i];
  }
  return sizes[i];
}

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hidden);
}

function initCalculatorApp(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const openBtn = $('open-calculator');
  const overlay = $('calculator-overlay');
  const modalWrap = $('calculator-modal-wrap');
  const modalPanel = $('calculator-modal');
  const expressionEl = $('calc-expression');
  const resultRowEl = $('calc-result-row');
  const liveRegionEl = $('calc-live-region');
  const useBtn = $('calc-use');
  const amountField = $('create-field-amount');
  if (!openBtn || !modalWrap) return;

  let state = createInitialState();
  let currentLayout = 'basic';

  function setResultRow(className, text, errorText) {
    resultRowEl.textContent = '';
    if (errorText) {
      const err = doc.createElement('span');
      err.className = 'calc-error';
      const icon = doc.createElement('span');
      icon.className = 'calc-error-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '⚠';
      err.append(icon, errorText);
      resultRowEl.appendChild(err);
      return;
    }
    const span = doc.createElement('span');
    span.className = className;
    span.textContent = text;
    resultRowEl.appendChild(span);
  }

  function render(announcement) {
    expressionEl.textContent = state.expression;
    fitExpressionFontSize(expressionEl, EXPR_SIZES);
    // At minimum font size the expression can still overflow; keep the newest character
    // (right edge) visible instead of the start of the expression.
    expressionEl.scrollLeft = expressionEl.scrollWidth;

    let errorType = null;
    let value = null;
    if (state.forcedSyntaxError) {
      errorType = 'syntax';
    } else if (state.finalized) {
      value = state.finalizedValue;
    } else {
      try {
        value = previewEvaluate(state.expression);
      } catch (e) {
        errorType = e.type;
      }
    }

    if (errorType) {
      setResultRow('', '', ERROR_MESSAGES[errorType]);
    } else {
      setResultRow(
        state.finalized ? 'calc-result' : 'calc-result is-preview',
        value === null ? '' : formatNumber(value),
      );
    }
    useBtn.disabled = errorType !== null || value === null;

    if (announcement) {
      liveRegionEl.textContent = announcement;
    } else if (errorType) {
      liveRegionEl.textContent = `Error: ${ERROR_MESSAGES[errorType]}`;
    } else if (state.expression === '') {
      liveRegionEl.textContent = 'Display cleared';
    } else if (state.finalized) {
      liveRegionEl.textContent = `Result ${formatNumber(state.finalizedValue)}, finalized`;
    } else {
      liveRegionEl.textContent =
        `Expression ${state.expression}` + (value !== null ? `, result ${formatNumber(value)}` : '');
    }
  }

  function setLayout(layout) {
    currentLayout = layout;
    $('scientific-keys').hidden = layout !== 'scientific';
    $('tab-basic').setAttribute('aria-selected', String(layout === 'basic'));
    $('tab-scientific').setAttribute('aria-selected', String(layout === 'scientific'));
  }

  function open() {
    state = createInitialState();
    setLayout('basic');
    render('Calculator opened');
    overlay.hidden = false;
    modalWrap.hidden = false;
    // Focus the non-activating panel so Enter means "=" rather than clicking Close.
    modalPanel.focus();
  }

  function close() {
    overlay.hidden = true;
    modalWrap.hidden = true;
    openBtn.focus();
  }

  doc.querySelectorAll('#calculator-modal .calc-keypad .calc-key').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      state = pressKey(state, key);
      render(key === 'clear' ? 'Display cleared' : undefined);
    });
  });

  $('tab-basic').addEventListener('click', () => setLayout('basic'));
  $('tab-scientific').addEventListener('click', () => setLayout('scientific'));

  // Physical keys that map to on-screen button keys in every layout.
  const KEYBOARD_KEYS = { '+': '+', '-': '-', '*': '×', '/': '÷', '.': '.', Enter: 'equals', Backspace: 'backspace' };
  // No on-screen equivalent in Basic, so only mapped in Scientific.
  const NATIVE_ENTER_CONTROLS = '#calc-close, #calc-cancel, #calc-use, .layout-tab';
  const SCIENTIFIC_KEYBOARD_KEYS = ['(', ')', '^'];

  function keyboardKeyFor(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (/^[0-9]$/.test(e.key)) return e.key;
    if (Object.prototype.hasOwnProperty.call(KEYBOARD_KEYS, e.key)) return KEYBOARD_KEYS[e.key];
    if (currentLayout === 'scientific' && SCIENTIFIC_KEYBOARD_KEYS.includes(e.key)) return e.key;
    return null;
  }

  function trapModalTab(e) {
    const focusable = getFocusableElements(modalPanel);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    const atStart = doc.activeElement === modalPanel;
    if (e.shiftKey) {
      if (atStart || doc.activeElement === first || !modalPanel.contains(doc.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else if (atStart) {
      e.preventDefault();
      first.focus();
    } else if (doc.activeElement === last || !modalPanel.contains(doc.activeElement)) {
      e.preventDefault();
      first.focus();
    }
  }

  openBtn.addEventListener('click', open);
  $('calc-close').addEventListener('click', close);
  $('calc-cancel').addEventListener('click', close);
  overlay.addEventListener('click', close);
  // Capture phase so the create modal's own Escape/Tab handling doesn't act while the
  // calculator is on top of it.
  doc.addEventListener(
    'keydown',
    (e) => {
      if (modalWrap.hidden) return;
      if (e.key === 'Escape') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Deliberate: Escape clears the display (like "C") rather than closing the dialog.
        e.stopImmediatePropagation();
        e.preventDefault();
        state = pressKey(state, 'clear');
        render('Display cleared');
      } else if (e.key === 'Tab') {
        e.stopImmediatePropagation();
        trapModalTab(e);
      } else {
        const mapped = keyboardKeyFor(e);
        if (mapped === null) return;
        // Enter on a focused Close/Cancel/Use/tab control must still activate it. Keypad keys
        // are not exempt: Enter there means "=" (preventDefault stops the native click).
        if (mapped === 'equals' && e.target.closest && e.target.closest(NATIVE_ENTER_CONTROLS)) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        state = pressKey(state, mapped);
        render();
      }
    },
    true,
  );

  useBtn.addEventListener('click', () => {
    if (useBtn.disabled) return;
    const value = state.finalized ? state.finalizedValue : previewEvaluate(state.expression);
    amountField.value = formatAmountForField(value);
    close();
  });
}

module.exports = {
  OPERATORS,
  ERROR_MESSAGES,
  isOperator,
  currentSegment,
  evaluate,
  previewEvaluate,
  formatNumber,
  formatAmountForField,
  createInitialState,
  pressKey,
  fitExpressionFontSize,
  initCalculatorApp,
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initCalculatorApp());
}
