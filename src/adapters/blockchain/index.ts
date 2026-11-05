/**
 * Blockchain adapter: anchors one passport event as a non-revocable EAS attestation.
 * Only hashes and numbers go on-chain, never personal data (PRD section 9).
 */
export interface AnchorInput {
  racketId: string;
  seq: number;
  eventType: number;
  eventHash: string;
  prevHash: string;
}

export interface ChainAdapter {
  anchor(event: AnchorInput): Promise<{ attestationUid: string }>;
}

/** In-memory fake for tests and local development. Set `failNext` to simulate an outage. */
export function createFakeChain(): ChainAdapter & { anchored: AnchorInput[]; failNext: boolean } {
  const state = {
    anchored: [] as AnchorInput[],
    failNext: false,
    async anchor(event: AnchorInput) {
      if (state.failNext) {
        state.failNext = false;
        throw new Error("Simulated chain outage");
      }
      state.anchored.push(event);
      return { attestationUid: `0xfake${event.seq.toString(16).padStart(60, "0")}` };
    },
  };
  return state;
}
