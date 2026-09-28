/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'public', 'pipeline.html');

function fixtureHire(overrides) {
  return {
    id: 'hire_1',
    name: 'Jordan Reyes',
    department: 'Engineering',
    role: 'Software Engineer II',
    hireStage: 'offer_accepted',
    profileStatus: 'active',
    runHistory: [],
    run: { id: 'run_1', status: 'active', tasksDone: 3, arcRunUrl: 'https://arc.example.com/runs/run_1/eval' },
    ...overrides,
  };
}

describe('Pipeline dashboard — arc run-detail deep links', () => {
  beforeEach(() => {
    jest.resetModules();
    document.documentElement.innerHTML = fs.readFileSync(HTML_PATH, 'utf8');
  });

  test('AC1: dashboard shows a labelled arc deep link when the run URL is available', () => {
    const hire = fixtureHire();
    const { initPipelineApp } = require('../public/js/pipeline');
    initPipelineApp(document, [hire]);
    const link = document.querySelector('[data-arc-link]');
    expect(link.textContent).toContain('View run in arc');
    expect(link.getAttribute('href')).toBe('https://arc.example.com/runs/run_1/eval');
  });

  test("AC2: activating the arc link opens arc's view in a new tab and does not block default navigation", () => {
    const hire = fixtureHire();
    const { initPipelineApp } = require('../public/js/pipeline');
    initPipelineApp(document, [hire]);
    const link = document.querySelector('[data-arc-link]');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  test("AC3: the arc link href is exactly the run's own URL, nothing appended", () => {
    const rawUrl = 'https://arc.example.com/runs/run_1/eval';
    const hire = fixtureHire({ run: { id: 'run_1', status: 'active', tasksDone: 3, arcRunUrl: rawUrl } });
    const { initPipelineApp } = require('../public/js/pipeline');
    initPipelineApp(document, [hire]);
    const link = document.querySelector('[data-arc-link]');
    expect(link.getAttribute('href')).toBe(rawUrl);
    expect([...link.attributes].map((a) => a.name)).toEqual(
      expect.arrayContaining(['class', 'href', 'target', 'rel', 'data-arc-link'])
    );
    expect(link.hasAttribute('data-auth-token')).toBe(false);
  });

  test('AC4: link is disabled, not broken, when the run exists but has no arc URL yet', () => {
    const hire = fixtureHire({ run: { id: 'run_2', status: 'active', tasksDone: 0, arcRunUrl: null } });
    const { initPipelineApp } = require('../public/js/pipeline');
    initPipelineApp(document, [hire]);
    expect(document.querySelector('[data-arc-link]')).toBeNull();
    const btn = document.querySelector('.arc-link-btn');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.disabled).toBe(true);
  });

  test('AC4: link is absent, not broken, when the hire has no run yet', () => {
    const hire = fixtureHire({ hireStage: 'draft', run: null });
    const { initPipelineApp } = require('../public/js/pipeline');
    initPipelineApp(document, [hire]);
    expect(document.querySelector('[data-arc-link]')).toBeNull();
    expect(document.querySelector('.arc-link-btn')).toBeNull();
    expect(document.querySelector('.arc-link-absent')).not.toBeNull();
  });

  test('AC4/Security: a non-https or non-arc arcRunUrl is treated as unavailable, never rendered as a clickable link', () => {
    const hire = fixtureHire({ run: { id: 'run_3', status: 'active', tasksDone: 0, arcRunUrl: 'javascript:alert(document.cookie)' } });
    const { initPipelineApp } = require('../public/js/pipeline');
    initPipelineApp(document, [hire]);
    expect(document.querySelector('[data-arc-link]')).toBeNull();
    const btn = document.querySelector('.arc-link-btn');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.disabled).toBe(true);
  });

  test('AC5: no re-run/prompt-tuning/eval controls or iframes are embedded on the detail screen', () => {
    const hire = fixtureHire();
    const { initPipelineApp } = require('../public/js/pipeline');
    initPipelineApp(document, [hire]);
    document.querySelector('[data-open-detail]').click();

    expect(document.querySelectorAll('iframe').length).toBe(0);

    const interactiveEls = [...document.querySelectorAll('button, a')];
    const arcControlEls = interactiveEls.filter((el) => /re-run|prompt tuning|eval scoring/i.test(el.textContent));
    expect(arcControlEls).toHaveLength(0);

    expect(document.querySelector('.boundary-card').textContent).toMatch(/never embedded or proxied here/i);
  });
});
