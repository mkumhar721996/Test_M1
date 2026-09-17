import { createFetchEngineClient } from './engine/engineClient';
import { GameView } from './components/GameView';

const engineClient = createFetchEngineClient('/api/engine');

export function App(): JSX.Element {
  return (
    <main className="u-p-4">
      <h1 className="card-title">Test M1</h1>
      <GameView engineClient={engineClient} />
    </main>
  );
}
