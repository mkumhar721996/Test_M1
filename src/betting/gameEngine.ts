export type GameEngineResult =
  | { success: true; payout: number; outcome: unknown }
  | { success: false; error: string };

export interface GameEngine {
  spin(bet: number): Promise<GameEngineResult>;
}
