import './styles/app.css';
import { GameApp } from './ui/GameApp';

const root = document.getElementById('app');
if (root) {
  new GameApp(root);
}
