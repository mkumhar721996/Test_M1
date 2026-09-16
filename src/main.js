import { createWallet, placeBet } from './wallet.js';

function formatBalance(balance) {
  return balance.toLocaleString('en-US');
}

export function initGame(doc = document) {
  const wallet = createWallet();
  const root = doc.querySelector('#app');

  const balanceDisplay = doc.createElement('p');
  balanceDisplay.id = 'balance';
  balanceDisplay.className = 'u-text-lg';
  root.appendChild(balanceDisplay);

  const form = doc.createElement('form');
  form.id = 'bet-form';
  form.className = 'u-stack';

  const amountLabel = doc.createElement('label');
  amountLabel.setAttribute('for', 'bet-amount');
  amountLabel.className = 'label';
  amountLabel.textContent = 'Bet amount';
  form.appendChild(amountLabel);

  const amountInput = doc.createElement('input');
  amountInput.id = 'bet-amount';
  amountInput.type = 'number';
  amountInput.className = 'input';
  form.appendChild(amountInput);

  const submitButton = doc.createElement('button');
  submitButton.type = 'submit';
  submitButton.className = 'btn btn-primary';
  submitButton.textContent = 'Place bet';
  form.appendChild(submitButton);

  root.appendChild(form);

  function render() {
    balanceDisplay.textContent = `Balance: ${formatBalance(wallet.balance)} credits`;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const amount = Number(amountInput.value);
    const updated = placeBet(wallet, amount);
    wallet.balance = updated.balance;
    render();
  });

  render();

  return wallet;
}
