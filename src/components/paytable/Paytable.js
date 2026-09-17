import { loadEngineConfig, scalePayout } from '../../state/engineConfig.js';

const ERROR_MESSAGE = 'Paytable is currently unavailable.';

function lineCountsFor(symbols) {
  const counts = new Set();
  for (const symbol of symbols) {
    for (const count of Object.keys(symbol.payoutPerLine)) {
      counts.add(Number(count));
    }
  }
  return Array.from(counts).sort((a, b) => a - b);
}

function buildErrorSection(onDismiss) {
  const section = document.createElement('div');
  section.setAttribute('role', 'alert');
  section.setAttribute('data-testid', 'paytable-error');

  const message = document.createElement('p');
  message.textContent = ERROR_MESSAGE;
  section.appendChild(message);

  const dismissButton = document.createElement('button');
  dismissButton.setAttribute('type', 'button');
  dismissButton.classList.add('btn', 'btn-secondary', 'paytable-btn');
  dismissButton.textContent = 'Dismiss';
  dismissButton.setAttribute('aria-label', 'Dismiss paytable error message');
  dismissButton.setAttribute('data-testid', 'paytable-error-dismiss');
  dismissButton.tabIndex = 0;
  dismissButton.addEventListener('click', onDismiss);
  section.appendChild(dismissButton);

  return { section, focusableElements: [dismissButton] };
}

function buildTableSection(config, betState) {
  const counts = lineCountsFor(config.symbols);
  const focusableElements = [];

  const table = document.createElement('table');
  table.setAttribute('data-testid', 'paytable-table');

  const caption = document.createElement('caption');
  caption.textContent = 'Symbol payouts';
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  const symbolHeader = document.createElement('th');
  symbolHeader.setAttribute('scope', 'col');
  symbolHeader.textContent = 'Symbol';
  headRow.appendChild(symbolHeader);
  for (const count of counts) {
    const th = document.createElement('th');
    th.setAttribute('scope', 'col');
    th.textContent = `${count} of a kind`;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  config.symbols.forEach((symbol) => {
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.setAttribute('data-testid', `paytable-row-${symbol.id}`);

    const nameCell = document.createElement('td');
    nameCell.textContent = symbol.name;
    row.appendChild(nameCell);

    for (const count of counts) {
      const cell = document.createElement('td');
      cell.setAttribute('data-testid', `payout-${symbol.id}-${count}`);
      const multiplier = symbol.payoutPerLine[count];
      cell.textContent = multiplier == null ? '-' : String(scalePayout(multiplier, betState.getBetPerLine()));
      row.appendChild(cell);
    }

    tbody.appendChild(row);
    focusableElements.push(row);
  });
  table.appendChild(tbody);

  const paylinesHeading = document.createElement('h3');
  paylinesHeading.textContent = 'Pay-lines';

  const paylinesList = document.createElement('ul');
  paylinesList.setAttribute('data-testid', 'paytable-paylines');
  config.paylines.forEach((payline) => {
    const item = document.createElement('li');
    item.tabIndex = 0;
    item.setAttribute('data-testid', `paytable-payline-${payline.id}`);
    item.textContent = payline.description;
    paylinesList.appendChild(item);
    focusableElements.push(item);
  });

  const wrapper = document.createElement('div');
  wrapper.appendChild(table);
  wrapper.appendChild(paylinesHeading);
  wrapper.appendChild(paylinesList);

  const last = focusableElements[focusableElements.length - 1];
  if (last) last.setAttribute('data-testid', 'paytable-row-last');

  return { section: wrapper, focusableElements };
}

export function createPaytableController({ config, gameState, betState, mountPoint }) {
  let dialog = null;
  let trigger = null;
  let focusableElements = [];
  let errorDismissed = false;
  let keydownHandler = null;

  function trapFocus(event) {
    if (event.key !== 'Tab' || focusableElements.length === 0) return;
    const currentIndex = focusableElements.indexOf(document.activeElement);

    event.preventDefault();
    if (event.shiftKey) {
      const targetIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
      focusableElements[targetIndex].focus();
    } else {
      const targetIndex = currentIndex === -1 || currentIndex === focusableElements.length - 1 ? 0 : currentIndex + 1;
      focusableElements[targetIndex].focus();
    }
  }

  function render() {
    mountPoint.textContent = '';
    focusableElements = [];

    dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'paytable-title');
    dialog.setAttribute('data-testid', 'paytable-dialog');
    dialog.classList.add('paytable-dialog');

    const title = document.createElement('h2');
    title.id = 'paytable-title';
    title.textContent = 'Paytable';
    dialog.appendChild(title);

    const closeButton = document.createElement('button');
    closeButton.setAttribute('type', 'button');
    closeButton.classList.add('btn', 'btn-secondary', 'paytable-btn');
    closeButton.textContent = 'Close';
    closeButton.setAttribute('aria-label', 'Close paytable');
    closeButton.setAttribute('data-testid', 'paytable-close');
    closeButton.tabIndex = 0;
    closeButton.addEventListener('click', () => close());
    dialog.appendChild(closeButton);
    focusableElements.push(closeButton);

    const content = document.createElement('div');
    content.classList.add('paytable-content');
    content.setAttribute('data-testid', 'paytable-content');

    const parsedConfig = loadEngineConfig(config);
    if (!parsedConfig) {
      if (!errorDismissed) {
        const { section, focusableElements: errorFocusable } = buildErrorSection(() => {
          errorDismissed = true;
          render();
        });
        content.appendChild(section);
        focusableElements.push(...errorFocusable);
      }
    } else {
      const { section, focusableElements: tableFocusable } = buildTableSection(parsedConfig, betState);
      content.appendChild(section);
      focusableElements.push(...tableFocusable);
    }

    dialog.appendChild(content);
    mountPoint.appendChild(dialog);

    keydownHandler = trapFocus;
    dialog.addEventListener('keydown', keydownHandler);
  }

  function open(triggerElement) {
    if (gameState.getStatus() !== 'idle') return;
    errorDismissed = false;
    trigger = triggerElement;
    render();
    focusableElements[0]?.focus();
  }

  function close() {
    if (!dialog) return;
    if (keydownHandler) dialog.removeEventListener('keydown', keydownHandler);
    mountPoint.textContent = '';
    dialog = null;
    focusableElements = [];
    const toFocus = trigger;
    trigger = null;
    toFocus?.focus();
  }

  return {
    open,
    close,
    isOpen() {
      return dialog !== null;
    },
    dismissError() {
      errorDismissed = true;
      if (dialog) render();
    },
    getFocusableElements() {
      return focusableElements.slice();
    },
  };
}
