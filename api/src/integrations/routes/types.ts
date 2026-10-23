import type { QuoteEnvelope, ProviderStatus } from './one-click.ts';
import type { RouteRegistry } from './policy.ts';

export type CustomerOutcome = 'OPEN' | 'DELIVERED' | 'REFUNDED';
export type RouteState = 'WAIT_SOURCE' | 'PREPARING' | 'QUOTED' | 'FUNDING_PREPARED' | 'FUNDING_SIGNED' | 'FUNDING_SUBMITTED' | 'ROUTING' | 'RECONCILING' | 'CLOSED';
export interface CustomerTerms {
  id: string; acceptedDigest: string; policyDigest: string; sourceKind: 'ZCASH' | 'EVM';
  settlementVersion: 'V1' | 'V2';
  sourceAsset: string; principalAtomic: string; outputAsset: string; outputAtomic: string;
  recipient: string; refundRecipient: string; sourceCutoff: number; cancellationAvailableAtMs: number;
  acceptUntilMs: number; acceptedAtMs: number;
}
export interface RoutePlan {
  terms: CustomerTerms; registry: RouteRegistry; requiredTreasuryOutput: string; cap: string; gasCaps: Record<string, string>;
  gasSpent: Record<string, string>;
  state: RouteState; customer: CustomerOutcome; sourceFinal: boolean; sourceIdentity: string | null;
  eligibleAtMs: number | null; attempts: Attempt[]; operation: FundingOperation | null;
  inputSpent: string; inputRecovered: string; inputConsumed: string; recognizedLoss: string; outputReceived: string;
  sourceReorg: boolean; cancellationProof: string | null; reverseCommitmentProof: string | null;
  customerProof: string | null; histories: { atMs: number; reason: string; digest: string }[];
  reversePayoutOperationId: string | null; abortNonce: number | null;
}
export interface Attempt {
  number: number; requestDigest: string; requestedAtMs: number; result: 'REQUESTED' | 'UNKNOWN' | 'QUOTED' | 'ABANDONED';
  quote: QuoteEnvelope | null; statuses: { status: ProviderStatus; atMs: number; digest: string }[];
}
export interface FundingOperation {
  id: string; digest: string; attempt: number; fence: number; sender: string; nonce: number;
  chainId: number; token: string; recipient: string; amount: string; gasAsset: string; gasCap: string;
  journalId: string | null; signedHash: string | null; journalDigest: string | null; finalProof: string | null; signedAtMs: number | null;
}
export interface LedgerEntry { id: string; asset: string; debit: string; credit: string; amount: string; evidenceDigest: string; }
export interface RouteBooks {
  version: 1; revision: number; dispatchPaused: boolean; plans: Record<string, RoutePlan>; ledger: LedgerEntry[];
  balances: Record<string, string>; receiptOwners: Record<string, string>; nonceOwners: Record<string, string>;
  locatorOwners: Record<string, string>; sourceOwners: Record<string, string>; incidents: { plan: string; reason: string; digest: string }[];
}
export interface FinalReceipt {
  evidence: 'fixture' | 'production'; canonical: true; finalized: true;
  economicIdentity: string; occurrence: string; asset: string; vault: string; amount: string;
  /** Transaction-local transfer/output ordinal, independent of block logIndex. */
  chainIdentity: string; transferIndex: number;
  transactionHash: string; proofDigest: string;
  success?: boolean; gas?: { asset: string; amount: string };
}
/** Implementations independently verify real chain/journal state. Caller booleans
 * are deliberately absent from engine entry points: hints are opaque selectors. */
export interface RouteProofs {
  dispatchReady(plan: RoutePlan): Promise<boolean>;
  source(plan: RoutePlan, hint: unknown): Promise<FinalReceipt & { inclusion: number }>;
  treasury(plan: RoutePlan, kind: 'FUNDING' | 'OUTPUT' | 'RETURN', hint: unknown): Promise<FinalReceipt & { attributedLocator: string }>;
  journal(plan: RoutePlan, hint: unknown): Promise<{ operationDigest: string; fence: number; hash: string; journalId: string; journalDigest: string; signedAtMs: number }>;
  cancellation(plan: RoutePlan, hint: unknown): Promise<{ finalizedState: 'CANCELLED' | 'REFUNDED'; latestState: 'CANCELLED' | 'REFUNDED'; settlementId: string; proofDigest: string; journalFenced: boolean; allAttemptsReconciled: boolean; refundFeeCapacity: boolean; canonicalTimeMs: number;
    guardedAbort?: { mode: 'V2_ABORT'; operationId: string; nonce: number; noSuccessfulOrValidPayouts: boolean; expiryCanonical: boolean; eventDigest: string; recoveryDigest: string } }>;
  reverseCommitment(plan: RoutePlan, hint: unknown): Promise<{ finalizedState: 'PAYOUT_COMMITTED'; latestState: 'PAYOUT_COMMITTED'; settlementId: string; payoutOperationId: string; proofDigest: string }>;
  customer(plan: RoutePlan, branch: 'DELIVERED' | 'REFUNDED', hint: unknown): Promise<FinalReceipt & { settlementId: string; terminalState: 'PAID' | 'SETTLED' | 'REFUNDED' }>;
  /** Full independent signer journal inventory. On restore this includes missing
   * intents/signatures; a SQL snapshot by itself can never clear this guard. */
  recovery(books: RouteBooks): Promise<{ booksDigest: string; safe: boolean; evidence: 'fixture' | 'production' }>;
  cost(plan: RoutePlan, kind: 'CONSUMED' | 'LOSS', amount: string, hint: unknown): Promise<{ operationId: string; kind: 'CONSUMED' | 'LOSS'; amount: string; proofDigest: string; evidence: 'fixture' | 'production' }>;
}
