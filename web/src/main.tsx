import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../design-system/tokens.css';
import '../../design-system/prototype-utils.css';
import './styles/app.css';
import { App } from './App';

const container = document.getElementById('root')!;
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
