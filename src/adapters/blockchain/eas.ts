import type { AnchorInput, ChainAdapter } from "./index";

/**
 * EAS on Base Sepolia (testnet only).
 *
 * NOT IMPLEMENTED YET. This is the placeholder for PRD requirement PP-3.
 * Schema: bytes32 racketId, uint32 seq, uint8 eventType, bytes32 eventHash, bytes32 prevHash.
 * Register it once with the EAS SchemaRegistry (revocable = false), put the UID in
 * PASSPORT_EAS_SCHEMA_UID, then implement `anchor` with viem and the EAS contract ABI.
 * Keep the operator key in an environment variable on a dedicated, testnet-only wallet.
 */
export interface EasConfig {
  rpcUrl: string;
  operatorPrivateKey: `0x${string}`;
  schemaUid: `0x${string}`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createEasChain(config: EasConfig): ChainAdapter {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async anchor(event: AnchorInput) {
      throw new Error("EAS adapter is not implemented yet (PRD PP-3). Use the fake chain until it is.");
    },
  };
}
