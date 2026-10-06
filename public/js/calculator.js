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
  if (isOperator(tokens[0]) || isOperator(tokens[tokens.length - 1])) throw { type: 'syntax' };

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
  return (Math.round(n * 1e9) / 1e9).toString();
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

function initCalculatorApp(doc = document) {
  const $ = (id) => doc.getElementById(id);
  const openBtn = $('open-calculator');
  const overlay = $('calculator-overlay');
  const modalWrap = $('calculator-modal-wrap');
  const expressionEl = $('calc-expression');
  const resultRowEl = $('calc-result-row');
  const liveRegionEl = $('calc-live-region');
  const useBtn = $('calc-use');
  const amountField = $('create-field-amount');
  if (!openBtn || !modalWrap) return;

  let state = createInitialState();

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

  function open() {
    state = createInitialState();
    render('Calculator opened');
    overlay.hidden = false;
    modalWrap.hidden = false;
    $('calc-close').focus();
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
        e.stopImmediatePropagation();
        e.preventDefault();
        close();
      } else if (e.key === 'Tab') {
        e.stopImmediatePropagation();
      }
    },
    true,
  );

  useBtn.addEventListener('click', () => {
    if (useBtn.disabled) return;
    const value = state.finalized ? state.finalizedValue : previewEvaluate(state.expression);
    amountField.value = formatNumber(value);
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
  createInitialState,
  pressKey,
  fitExpressionFontSize,
  initCalculatorApp,
};

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => initCalculatorApp());
}
