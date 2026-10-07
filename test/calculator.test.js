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
  formatNumber,
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

  test('a leading unary minus (continuing from a negative finalized result) is not a syntax error', () => {
    let state = press(['2', '-', '5', 'equals']);
    expect(state.finalizedValue).toBe(-3);
    state = pressKey(state, '+');
    expect(state.expression).toBe('-3+');
    state = pressKey(state, '1');
    expect(state.expression).toBe('-3+1');
    expect(evaluate('-3+1')).toBe(-2);
    expect(evaluate('-3×4')).toBe(-12);
    state = pressKey(state, 'equals');
    expect(state).toMatchObject({ finalized: true, finalizedValue: -2 });
  });

  test('a bare or doubled leading minus is still a syntax error', () => {
    expect(() => evaluate('-')).toThrow(expect.objectContaining({ type: 'syntax' }));
    expect(() => evaluate('-+3')).toThrow(expect.objectContaining({ type: 'syntax' }));
  });

  test('formatNumber avoids exponential notation at small and large magnitudes', () => {
    expect(formatNumber(1e-7)).toBe('0.0000001');
    expect(formatNumber(1e-7)).not.toMatch(/e/i);
    expect(formatNumber(20)).toBe('20');
    expect(formatNumber(10 / 3)).toBe('3.333333333');
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

  test('AC10 exactly the 18 approved Basic keys', () => {
    const keys = Array.from(
      document.querySelectorAll('#calculator-modal .calc-keypad:not(.scientific-rows) .calc-key'),
    ).map((b) => b.dataset.key);
    expect(keys).toEqual(['clear', 'backspace', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', 'equals']);
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

  test('AC6 scrolls to keep the newest character visible once min font size overflows', () => {
    const el = document.getElementById('calc-expression');
    Object.defineProperty(el, 'clientWidth', { value: 100, configurable: true });
    Object.defineProperty(el, 'scrollWidth', { value: 240, configurable: true });
    let scrollLeft = 0;
    Object.defineProperty(el, 'scrollLeft', {
      get: () => scrollLeft,
      set: (v) => {
        scrollLeft = v;
      },
      configurable: true,
    });
    tap(['1', '2', '3']);
    expect(el.scrollLeft).toBe(el.scrollWidth);
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

    // Escape clears the expression instead of closing the dialog.
    tap(['4']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(expr()).toBe('');
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(false);

    document.getElementById('calculator-overlay').click();
    expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
  });

  describe('keyboard entry', () => {
    const type = (k, extra = {}) =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    const typeAll = (keys) => keys.forEach((k) => type(k));
    const sci = () => document.getElementById('tab-scientific').click();

    test('AC1 digit in Basic and Scientific', () => {
      type('7');
      expect(expr()).toBe('7');
      tap(['clear']);
      sci();
      type('7');
      expect(expr()).toBe('7');
    });

    test('AC2 operator appends after a number in both layouts', () => {
      tap(['1', '2']);
      type('+');
      expect(expr()).toBe('12+');
      sci();
      tap(['3']);
      type('*');
      expect(expr()).toBe('12+3×');
    });

    test('maps / to ÷ and - to subtract', () => {
      tap(['8']);
      type('/');
      type('-');
      expect(expr()).toBe('8-');
      type('/');
      expect(expr()).toBe('8÷');
    });

    test('AC3 Enter evaluates', () => {
      tap(['1', '2', '+', '8']);
      type('Enter');
      expect(result().textContent).toBe('20');
      expect(result().classList.contains('is-preview')).toBe(false);
    });

    test('AC4 Escape clears and modal stays open', () => {
      tap(['1', '2', '3']);
      type('Escape');
      expect(expr()).toBe('');
      expect(document.getElementById('calculator-modal-wrap').hidden).toBe(false);
      document.getElementById('calc-close').click();
      expect(document.getElementById('calculator-modal-wrap').hidden).toBe(true);
    });

    test('AC5 Backspace removes last character', () => {
      tap(['1', '2', '3']);
      type('Backspace');
      expect(expr()).toBe('12');
    });

    test('on-screen backspace key matches keyboard', () => {
      tap(['1', '2', 'backspace']);
      expect(expr()).toBe('1');
    });

    test('AC6 click then type is one expression', () => {
      key('1');
      key('+');
      type('2');
      type('Enter');
      expect(expr()).toBe('1+2');
      expect(result().textContent).toBe('3');
    });

    test('AC7 Backspace on empty is a no-op', () => {
      type('Backspace');
      expect(expr()).toBe('');
    });

    test('AC8/AC9 unmapped letter key changes nothing', () => {
      tap(['4', '2']);
      const before = live();
      type('q');
      expect(expr()).toBe('42');
      expect(live()).toBe(before);
    });

    test('AC10 typed letters never insert a function name', () => {
      sci();
      tap(['0', '.', '5', '+']);
      typeAll(['s', 'i', 'n']);
      expect(expr()).toBe('0.5+');
    });

    test('( ) ^ are mapped only in Scientific', () => {
      type('(');
      expect(expr()).toBe('');
      sci();
      type('(');
      expect(expr()).toBe('(');
    });

    test(') and ^ are Scientific-only too', () => {
      tap(['2']);
      typeAll([')', '^']);
      expect(expr()).toBe('2');
      sci();
      typeAll(['^', ')']);
      expect(expr()).toBe('2^)');
    });

    test('Scientific tab reveals keypad and preserves expression', () => {
      tap(['1', '2']);
      sci();
      expect(document.getElementById('scientific-keys').hidden).toBe(false);
      expect(document.getElementById('tab-scientific').getAttribute('aria-selected')).toBe('true');
      expect(expr()).toBe('12');
      document.getElementById('tab-basic').click();
      expect(document.getElementById('scientific-keys').hidden).toBe(true);
      expect(expr()).toBe('12');
    });

    test('leading operator ignored; second operator replaces', () => {
      type('+');
      expect(expr()).toBe('');
      tap(['1', '2']);
      typeAll(['+', '-']);
      expect(expr()).toBe('12-');
    });

    test('Backspace removes a trailing operator', () => {
      tap(['1', '2', '+']);
      type('Backspace');
      expect(expr()).toBe('12');
    });

    test('Backspace after a negative result edits the finalized value', () => {
      tap(['2', '-', '5']);
      type('Enter');
      expect(result().textContent).toBe('-3');
      type('Backspace');
      expect(expr()).toBe('-');
      expect(result().classList.contains('is-preview')).toBe(true);
    });

    test('Enter on a dangling operator shows Syntax Error', () => {
      tap(['1', '2', '+']);
      type('Enter');
      expect(document.querySelector('.calc-error').textContent).toMatch(/Syntax Error/);
    });

    test('digit after a result starts fresh; operator continues', () => {
      tap(['1', '2', '+', '8']);
      type('Enter');
      type('5');
      expect(expr()).toBe('5');
      tap(['clear', '1', '2', '+', '8']);
      type('Enter');
      type('+');
      expect(expr()).toBe('20+');
    });

    test('keydown is inert when the modal is closed', () => {
      document.getElementById('calc-cancel').click();
      type('5');
      document.getElementById('open-calculator').click();
      expect(expr()).toBe('');
    });

    test('second . in a segment is ignored', () => {
      tap(['3', '.', '1', '4']);
      type('.');
      expect(expr()).toBe('3.14');
    });

    test('Escape on empty stays empty and announces', () => {
      type('Escape');
      expect(expr()).toBe('');
      expect(live()).toBe('Display cleared');
    });

    test('keyboard digit recovers from an error', () => {
      tap(['5', '÷', '0']);
      expect(document.querySelector('.calc-error')).not.toBeNull();
      type('5');
      expect(expr()).toBe('5÷05');
      expect(document.querySelector('.calc-error')).toBeNull();
    });

    test('Ctrl/Cmd/Alt-held keys are unmapped', () => {
      tap(['1', '2', '3']);
      type('Backspace', { ctrlKey: true });
      type('Enter', { metaKey: true });
      type('Escape', { altKey: true });
      type('1', { ctrlKey: true });
      expect(expr()).toBe('123');
    });

    test('click a function button then continue on the keyboard', () => {
      sci();
      document.querySelector('.calc-key[data-key="sin("]').click();
      typeAll(['0', '.', '5']);
      expect(expr()).toBe('sin(0.5');
    });

    const enterOn = (el) => {
      const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev;
    };

    test('Enter on a focused Cancel/Close/Use/tab button is left to that button', () => {
      tap(['1', '+', '2']);
      ['calc-cancel', 'calc-close', 'calc-use', 'tab-scientific'].forEach((id) => {
        expect(enterOn(document.getElementById(id)).defaultPrevented).toBe(false);
      });
      expect(expr()).toBe('1+2');
      expect(result().classList.contains('is-preview')).toBe(true);
    });

    test('opening focuses the dialog panel, so Enter evaluates', () => {
      expect(document.activeElement).toBe(document.getElementById('calculator-modal'));
      typeAll(['1', '+', '2']);
      enterOn(document.activeElement);
      expect(result().textContent).toBe('3');
      expect(document.getElementById('calculator-modal-wrap').hidden).toBe(false);
    });

    test('click then type then Enter on the focused keypad key evaluates', () => {
      key('1');
      const plus = document.querySelector('.calc-key[data-key="+"]');
      plus.click();
      plus.focus();
      type('2');
      const ev = enterOn(plus);
      expect(ev.defaultPrevented).toBe(true);
      expect(expr()).toBe('1+2');
      expect(result().textContent).toBe('3');
      expect(result().classList.contains('is-preview')).toBe(false);
    });

    test('Layout resets to Basic on reopen', () => {
      sci();
      document.getElementById('calc-cancel').click();
      document.getElementById('open-calculator').click();
      expect(document.getElementById('scientific-keys').hidden).toBe(true);
      type('(');
      expect(expr()).toBe('');
    });
  });
});
