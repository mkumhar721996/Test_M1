export interface SpinResult {
  spinId: string;
  reelPositions: number[];
  winAmount: number;
}

export interface EngineClient {
  requestSpin(): Promise<SpinResult>;
  retrySpin(spinId: string): Promise<SpinResult>;
}

async function parseSpinResponse(response: Response): Promise<SpinResult> {
  if (!response.ok) {
    throw new Error(`Engine request failed with status ${response.status}`);
  }
  return (await response.json()) as SpinResult;
}

export function createFetchEngineClient(baseUrl: string): EngineClient {
  return {
    async requestSpin(): Promise<SpinResult> {
      const response = await fetch(`${baseUrl}/spins`, { method: 'POST' });
      return parseSpinResponse(response);
    },
    async retrySpin(spinId: string): Promise<SpinResult> {
      const response = await fetch(`${baseUrl}/spins/${spinId}/retry`, { method: 'POST' });
      return parseSpinResponse(response);
    },
  };
}
