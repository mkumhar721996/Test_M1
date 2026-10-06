/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'index.html');
const CSS_PATH = path.join(__dirname, '..', 'public', 'css', 'calculator.css');

const calc = require('../public/js/calculator');
const {
  createInitialState,
  pressKey,
  evaluate,
  previewEvaluate,
  ERROR_MESSAGES,
  fitExpressionFontSize,
  formatAmountForField,
} = calc;

const press = (keys) => keys.reduce((s, k) => pressKey(s, k), createInitialState());

describe('calculator engine', () => {
  test('AC1 appends digits and operators in order', () => {
    expect(press(['1', '2', '+', '8']).expression).toBe('12+8');
  });

  test('AC2 previewEvaluate honours order of operations and trims trailing operator', () => {
    expect(previewEvaluate('12+8×3')).toBe(36);
    expect(previewEvaluate('12+8×3×')).toBe(36);
    expect(previewEvaluate('')).toBeNull();
  });

  test('AC4 digit/operator/decimal after a finalized result starts fresh', () => {
    const state = press(['1', '2', '+', '8', 'equals']);
    expect(state.finalized).toBe(true);
    expect(pressKey(state, '5')).toMatchObject({ expression: '5', finalized: false });
    expect(pressKey(state, '+').expression).toBe('20+');
    expect(pressKey(state, '.').expression).toBe('0.');
  });

  test('leading operator ignored; stacked operators replace', () => {
    expect(pressKey(createInitialState(), '+').expression).toBe('');
    expect(press(['1', '2', '+', '×']).expression).toBe('12×');
  });

  test('AC7 never caps expression length', () => {
    const digits = '1234567890123456789012345678901234567890';
    const state = press([...digits]);
    expect(pressKey(state, '1').expression).toBe(digits + '1');
    expect(pressKey(state, '+').expression).toBe(digits + '+');
  });

  test('AC8 evaluate classifies errors', () => {
    expect(() => evaluate('5÷0')).toThrow(expect.objectContaining({ type: 'divide-zero' }));
    expect(() => evaluate('99999999999999×99999999999999')).toThrow(expect.objectContaining({ type: 'overflow' }));
    expect(() => evaluate('12+')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(() => evaluate('')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(() => evaluate('12..3')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(ERROR_MESSAGES).toEqual({
      'divide-zero': 'Divide by Zero',
      overflow: 'Overflow',
      syntax: 'Syntax Error',
      domain: 'Domain Error',
    });
  });

  test('equals on a dangling operator forces a syntax error', () => {
    expect(press(['1', '2', '+', 'equals']).forcedSyntaxError).toBe(true);
  });

  test('AC11 ignores repeated decimal in a segment', () => {
    let state = press(['3', '.', '1', '4', '.']);
    expect(state.expression).toBe('3.14');
    state = pressKey(pressKey(state, '+'), '.');
    expect(state.expression).toBe('3.14+0.');
    expect(pressKey(createInitialState(), '.').expression).toBe('0.');
  });

  test('formatAmountForField rounds to the 2 decimal places validateAmount allows', () => {
    expect(formatAmountForField(10 / 3)).toBe('3.33');
    expect(formatAmountForField(24.5)).toBe('24.5');
    expect(formatAmountForField(1 / 3)).toBe('0.33');
  });

  test('AC5 fitExpressionFontSize steps down progressively', () => {
    const el = document.createElement('div');
    const widthBySize = { max: 400, mid: 250, min: 180 };
    Object.defineProperty(el, 'clientWidth', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { get: () => widthBySize[el.style.fontSize], configurable: true });
    expect(fitExpressionFontSize(el, ['max', 'mid', 'min'])).toBe('min');
    expect(el.style.fontSize).toBe('min');

    const fits = document.createElement('div');
    Object.defineProperty(fits, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(fits, 'scrollWidth', { value: 100, configurable: true });
    expect(fitExpressionFontSize(fits, ['max', 'mid', 'min'])).toBe('max');
  });
});

describe('calculator stylesheet', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');

  test('AC6 expression keeps newest character visible', () => {
    const rule = css.match(/\.calc-expression\s*\{[^}]*\}/)[0];
    expect(rule).toMatch(/overflow-x:\s*hidden/);
    expect(rule).toMatch(/white-space:\s*nowrap/);
    expect(rule).toMatch(/text-align:\s*right/);
  });

  test('AC12 keys are at least 44x44', () => {
    const rule = css.match(/\.calc-key\s*\{[^}]*\}/)[0];
    expect(rule).toMatch(/min-height:\s*44px/);
    expect(rule).toMatch(/min-width:\s*44px/);
  });
});

describe('calculator UI', () => {
  const key = (k) => document.querySelector(`.calc-key[data-key="${k}"]`).click();
  const tap = (keys) => keys.forEach(key);
  const expr = () => document.getElementById('calc-expression').textContent;
  const result = () => document.querySelector('#calc-result-row .calc-result');
  const live = () => document.getElementById('calc-live-region').textContent;

  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
    require('../public/js/calculator').initCalculatorApp(document);
    document.getElementById('open-calculator').click();
  });

  test('AC1 taps appear in the expression', () => {
    tap(['1', '2', '+', '8']);
    expect(expr()).toBe('12+8');
  });

  test('AC2 live preview result', () => {
    tap(['1', '2', '+', '8', '×', '3']);
    expect(result().textContent).toBe('36');
    expect(result().classList.contains('is-preview')).toBe(true);
  });

  test('AC3 clear resets and announces', () => {
    tap(['1', '2', '+', '8', 'clear']);
    expect(expr()).toBe('');
    expect(result().textContent).toBe('');
    expect(live()).toBe('Display cleared');
  });

  test('AC4 equals finalizes', () => {
    tap(['1', '2', '+', '8', '×', '3', 'equals']);
    expect(result().textContent).toBe('36');
    expect(result().classList.contains('is-preview')).toBe(false);
  });

  test('AC8 error messages replace result', () => {
    tap(['5', '÷', '0']);
    expect(document.querySelector('.calc-error').textContent).toMatch(/Divide by Zero/);
    tap(['clear', '1', '2', '+', 'equals']);
    expect(document.querySelector('.calc-error').textContent).toMatch(/Syntax Error/);
  });

  test('AC8 Use this amount inert while error shown', () => {
    tap(['5', '÷', '0']);
    expect(document.getElementById('calc-use').disabled).toBe(true);
    document.getElementById('create-field-amount').value = '';
    document.getElementById('calc-use').click();
    expect(document.getElementById('create-field-amount').value).toBe('');
  });

  test('AC9 editing after an error recovers', () => {
    tap(['5', '÷', '0', '5']);
    expect(expr()).toBe('5÷05');
    expect(document.querySelector('.calc-error')).toBeNull();
    expect(result().textContent).toBe('1');
  });

  test('AC10 exactly the 17 approved keys', () => {
    const keys = Array.from(document.querySelectorAll('#calculator-modal .calc-keypad .calc-key')).map((b) => b.dataset.key);
    expect(keys).toEqual(['clear', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'equals']);
  });

  test('AC13 live region announcements', () => {
    expect(document.getElementById('calc-live-region').getAttribute('aria-live')).toBe('polite');
    tap(['1', '2', '+', '8']);
    expect(live()).toBe('Expression 12+8, result 20');
    key('equals');
    expect(live()).toBe('Result 20, finalized');
    key('clear');
    expect(live()).toBe('Display cleared');
  });

  test('Use this amount writes the value and closes', () => {
    tap(['2', '4', '.', '5']);
    document.getElementById('calc-use').click();
    expect(document.getElementById('create-field-amount').value).toBe('24.5');
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
  });

  test('Use this amount rounds to 2 decimal places to satisfy validateAmount', () => {
    tap(['1', '0', '÷', '3']);
    document.getElementById('calc-use').click();
    expect(document.getElementById('create-field-amount').value).toBe('3.33');
  });

  test('Tab wraps focus inside the calculator dialog instead of escaping it', () => {
    const closeBtn = document.getElementById('calc-close');
    const useBtn = document.getElementById('calc-use');
    useBtn.disabled = false;
    useBtn.focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(closeBtn);

    closeBtn.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(useBtn);
  });

  test('reopening starts blank; Escape and overlay close', () => {
    tap(['1', '2', '3']);
    document.getElementById('calc-cancel').click();
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
    document.getElementById('open-calculator').click();
    expect(expr()).toBe('');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);

    document.getElementById('open-calculator').click();
    document.getElementById('calculator-overlay').click();
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
  });
});
