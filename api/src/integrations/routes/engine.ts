import { atomic, buildRequest, digest, inputCap, integer, invariant, sourceTimely, validateQuote, validateRegistry, type RouteRegistry } from './policy.ts';
import type { QuoteEnvelope, QuoteProvider } from './one-click.ts';
import type { RouteStore } from './store.ts';
import type { CustomerTerms, FinalReceipt, RouteBooks, RoutePlan, RouteProofs } from './types.ts';

const account = (asset: string, name: string) => `${asset}|${name}`;
const cash = (vault: string) => `cash:${vault.toLowerCase()}`;
function balance(books: RouteBooks, asset: string, name: string) { return BigInt(books.balances[account(asset, name)] ?? '0'); }
function post(books: RouteBooks, id: string, asset: string, debit: string, credit: string, amount: string, evidenceDigest: string) {
  atomic(amount); invariant(!books.ledger.some(entry => entry.id === id), 'ROUTE_LEDGER_DUPLICATE');
  invariant(/^[0-9a-f]{64}$/.test(evidenceDigest), 'ROUTE_EVIDENCE_DIGEST_REQUIRED');
  books.ledger.push({ id, asset, debit, credit, amount, evidenceDigest });
  books.balances[account(asset, debit)] = (balance(books, asset, debit) + BigInt(amount)).toString();
  books.balances[account(asset, credit)] = (balance(books, asset, credit) - BigInt(amount)).toString();
}
function get(books: RouteBooks, id: string) { const plan = books.plans[id]; invariant(plan, 'ROUTE_PLAN_MISSING'); return plan; }
function remaining(plan: RoutePlan) { return BigInt(plan.inputSpent) - BigInt(plan.inputRecovered) - BigInt(plan.inputConsumed) - BigInt(plan.recognizedLoss); }
function holds(books: RouteBooks, asset: string, vault: string) {
  let total = 0n;
  for (const plan of Object.values(books.plans)) {
    if (plan.state === 'CLOSED') continue;
    if (!plan.operation?.finalProof && plan.registry.origin.key === asset && plan.registry.originVault.toLowerCase() === vault.toLowerCase()) total += BigInt(plan.cap);
    if (plan.customer === 'OPEN' && plan.registry.destination.key === asset && plan.registry.destinationVault.toLowerCase() === vault.toLowerCase()) total += BigInt(plan.outputReceived);
    // Reverse Zcash fulfillment comes from a separate native capital pool.
    if (plan.customer === 'OPEN' && plan.terms.outputAsset !== plan.registry.destination.key && asset === plan.terms.outputAsset && vault === 'customer-payout') total += BigInt(plan.terms.outputAtomic);
    if (vault === 'fees') total += BigInt(plan.gasCaps[asset] ?? '0') - BigInt(plan.gasSpent[asset] ?? '0');
  }
  return total;
}
function available(books: RouteBooks, asset: string, vault: string) { return balance(books, asset, cash(vault)) - holds(books, asset, vault); }
function history(plan: RoutePlan, atMs: number, reason: string, evidence: unknown) { plan.histories.push({ atMs, reason, digest: digest(evidence) }); }
function incident(books: RouteBooks, plan: RoutePlan, reason: string, evidence: unknown) {
  plan.state = 'RECONCILING'; books.incidents.push({ plan: plan.terms.id, reason, digest: digest(evidence) });
}
function gasExpense(books: RouteBooks, plan: RoutePlan, receipt: FinalReceipt, id: string) {
  const gas = receipt.gas!; atomic(gas.amount, false);
  const total = BigInt(plan.gasSpent[gas.asset] ?? '0') + BigInt(gas.amount);
  invariant(plan.gasCaps[gas.asset] && total <= BigInt(plan.gasCaps[gas.asset]), 'ROUTE_AGGREGATE_GAS_CAP_EXCEEDED');
  invariant(balance(books, gas.asset, cash('fees')) >= BigInt(gas.amount), 'ROUTE_FEE_CAPITAL_DEFICIT');
  if (gas.amount !== '0') post(books, id, gas.asset, 'operator-gas-expense', cash('fees'), gas.amount, receipt.proofDigest);
  plan.gasSpent[gas.asset] = total.toString();
}
function allocate(books: RouteBooks, receipt: FinalReceipt, owner: string) {
  invariant(!books.receiptOwners[receipt.economicIdentity], 'ROUTE_RECEIPT_ALREADY_ALLOCATED');
  books.receiptOwners[receipt.economicIdentity] = owner;
}
/** This orchestrator has no signer or broadcaster. It prepares bounded intents,
 * acknowledges independently journaled effects and reconciles verified receipts.
 * All dispatch paths remain fixture-only until external activation is reviewed. */
export class RouteEngine {
  private reconciledRevision: number | null = null;
  constructor(private readonly store: RouteStore, private readonly provider: QuoteProvider, private readonly proofs: RouteProofs,
    private readonly options: { environment: 'fixture' | 'production'; enableFixtureDispatch?: boolean; now: () => number }) {}
  private now() { const now = this.options.now(); integer(now); return now; }
  private async dispatch(plan?: RoutePlan) {
    invariant(this.options.environment === 'fixture' && this.options.enableFixtureDispatch === true, 'ROUTE_PRODUCTION_DISPATCH_DISABLED');
    invariant(this.reconciledRevision !== null, 'ROUTE_STARTUP_RECONCILIATION_REQUIRED');
    const books = await this.store.read();
    invariant(!books.dispatchPaused, 'ROUTE_PROVIDER_MODE_PAUSED');
    invariant(books.revision === this.reconciledRevision, 'ROUTE_BOOKS_CHANGED_RECONCILE_FIRST');
    if (plan) invariant(await this.proofs.dispatchReady(plan), 'ROUTE_OBSERVER_OR_CAPITAL_NOT_READY');
  }
  private verify(receipt: FinalReceipt) {
    invariant(receipt.evidence === this.options.environment && receipt.canonical === true && receipt.finalized === true,
      'ROUTE_CANONICAL_FINAL_RECEIPT_REQUIRED');
    invariant(receipt.economicIdentity.length > 0 && receipt.occurrence.length > 0 && receipt.transactionHash.length > 0 && /^[0-9a-f]{64}$/.test(receipt.proofDigest), 'ROUTE_RECEIPT_IDENTITY_REQUIRED');
    integer(receipt.transferIndex);
    invariant(receipt.economicIdentity === digest([receipt.chainIdentity, receipt.transactionHash.toLowerCase(), receipt.transferIndex]), 'ROUTE_ECONOMIC_IDENTITY_MISMATCH');
    atomic(receipt.amount, false);
  }
  private async mutation<T>(run: (books: RouteBooks) => T, requireReconciled = false): Promise<T> {
    const previous = this.reconciledRevision;
    const committed = await this.store.transaction(books => {
      const stillReconciled = previous !== null && previous === books.revision;
      invariant(!requireReconciled || stillReconciled, 'ROUTE_BOOKS_CHANGED_RECONCILE_FIRST');
      invariant(!requireReconciled || !books.dispatchPaused, 'ROUTE_PROVIDER_MODE_PAUSED');
      const result = run(books); return { result, revision: books.revision + 1, stillReconciled };
    });
    this.reconciledRevision = committed.stillReconciled ? committed.revision : null;
    return committed.result;
  }
  private async plan(id: string) { return get(await this.store.read(), id); }
  private async checked<T>(snapshot: RoutePlan, run: (books: RouteBooks, plan: RoutePlan) => T, requireReconciled = false) {
    return this.mutation(books => { const current = get(books, snapshot.terms.id); invariant(digest(current) === digest(snapshot), 'ROUTE_CONCURRENT_CHANGE_RETRY'); return run(books, current); }, requireReconciled);
  }
  async reconcileStartup() {
    this.reconciledRevision = null;
    const books = await this.store.read(), result = await this.proofs.recovery(books);
    invariant(result.safe && result.evidence === this.options.environment && result.booksDigest === digest(books), 'ROUTE_EXTERNAL_JOURNALS_NOT_RECONCILED');
    invariant((await this.store.read()).revision === books.revision, 'ROUTE_RECOVERY_SNAPSHOT_CHANGED');
    this.reconciledRevision = books.revision;
  }
  /** Fixture capital only; production opening balances need their own verifier. */
  async seedFixtureCapital(asset: string, vault: string, amount: string) {
    invariant(this.options.environment === 'fixture', 'ROUTE_FIXTURE_CAPITAL_ONLY');
    return this.mutation(books => post(books, `opening:${asset}:${vault}`, asset, cash(vault), 'opening-equity', amount, digest({ fixture: true, asset, vault, amount })));
  }
  async preview(registry: RouteRegistry, outputAtomic: string): Promise<QuoteEnvelope> {
    validateRegistry(registry, this.options.environment);
    const now = this.now(); return this.provider.quote(buildRequest(registry, outputAtomic, true, now + 600_000), now);
  }
  async accept(terms: CustomerTerms, registry: RouteRegistry, preview: QuoteEnvelope, requiredTreasuryOutput: string, gasCaps: Record<string, string>) {
    await this.dispatch(); validateRegistry(registry, this.options.environment);
    const now = this.now();
    for (const value of [terms.principalAtomic, terms.outputAtomic, requiredTreasuryOutput]) atomic(value);
    invariant(terms.id.length > 0 && !['__proto__','constructor','prototype'].includes(terms.id) && /^[0-9a-f]{64}$/.test(terms.acceptedDigest) && /^[0-9a-f]{64}$/.test(terms.policyDigest), 'ROUTE_IMMUTABLE_TERMS_REQUIRED');
    invariant(['ZCASH','EVM'].includes(terms.sourceKind) && ['V1','V2'].includes(terms.settlementVersion) && terms.recipient.length > 0 && terms.refundRecipient.length > 0 && terms.sourceAsset.length > 0 && terms.outputAsset.length > 0, 'ROUTE_CUSTOMER_TERMS_INVALID');
    for (const time of [terms.acceptedAtMs, terms.acceptUntilMs, terms.sourceCutoff, terms.cancellationAvailableAtMs]) integer(time);
    invariant(terms.acceptedAtMs === now && now < terms.acceptUntilMs && terms.acceptUntilMs - now <= 120_000, 'ROUTE_CUSTOMER_ACCEPT_EXPIRED');
    invariant(preview.evidence === this.options.environment && digest(preview.wire) === preview.digest, 'ROUTE_PREVIEW_EVIDENCE_INVALID');
    const request = buildRequest(registry, requiredTreasuryOutput, true, Date.parse(preview.quote.request.deadline));
    validateQuote(preview.quote, request, now, undefined, preview.receivedAtMs);
    for (const amount of Object.values(gasCaps)) atomic(amount);
    invariant(Object.keys(gasCaps).length > 0, 'ROUTE_FEE_CAPACITY_REQUIRED');
    invariant(terms.sourceKind === 'ZCASH' ? !!gasCaps[terms.sourceAsset] : !!gasCaps[terms.outputAsset], 'ROUTE_ZCASH_FEE_CAPACITY_REQUIRED');
    const cap = inputCap(preview.quote.amountIn);
    return this.mutation(books => {
      invariant(!Object.hasOwn(books.plans, terms.id), 'ROUTE_ORDER_EXISTS');
      invariant(Object.values(books.plans).filter(plan => plan.state !== 'CLOSED').length < 1, 'ROUTE_GLOBAL_EXPOSURE_LIMIT');
      invariant(available(books, registry.origin.key, registry.originVault) >= BigInt(cap), 'ROUTE_CAPITAL_UNAVAILABLE');
      for (const [asset, units] of Object.entries(gasCaps)) invariant(available(books, asset, 'fees') >= BigInt(units), 'ROUTE_FEE_CAPITAL_UNAVAILABLE');
      if (terms.outputAsset !== registry.destination.key) invariant(available(books, terms.outputAsset, 'customer-payout') >= BigInt(terms.outputAtomic), 'ROUTE_CUSTOMER_OUTPUT_CAPITAL_UNAVAILABLE');
      else invariant(BigInt(requiredTreasuryOutput) >= BigInt(terms.outputAtomic), 'ROUTE_REQUIRED_OUTPUT_TOO_SMALL');
      const plan: RoutePlan = { terms: structuredClone(terms), registry: structuredClone(registry), requiredTreasuryOutput, cap, gasCaps: structuredClone(gasCaps), gasSpent: {},
        state: 'WAIT_SOURCE', customer: 'OPEN', sourceFinal: false, sourceIdentity: null, eligibleAtMs: null, attempts: [], operation: null,
        inputSpent: '0', inputRecovered: '0', inputConsumed: '0', recognizedLoss: '0', outputReceived: '0', sourceReorg: false,
        cancellationProof: null, reverseCommitmentProof: null, reversePayoutOperationId: null, abortNonce: null, customerProof: null, histories: [] };
      history(plan, now, 'ACCEPTED', { terms, preview: preview.digest, registry, cap, gasCaps }); books.plans[terms.id] = plan; return plan;
    }, true);
  }
  async confirmSource(id: string, hint: unknown) {
    const snapshot = await this.plan(id), receipt = await this.proofs.source(snapshot, hint); this.verify(receipt);
    invariant(receipt.asset === snapshot.terms.sourceAsset && receipt.amount === snapshot.terms.principalAtomic && sourceTimely(snapshot.terms.sourceKind, receipt.inclusion, snapshot.terms.sourceCutoff), 'ROUTE_SOURCE_NOT_EXACT_TIMELY');
    return this.checked(snapshot, (books, plan) => {
      invariant(!plan.sourceFinal && plan.customer === 'OPEN', 'ROUTE_SOURCE_ALREADY_CONFIRMED');
      invariant(!books.sourceOwners[receipt.economicIdentity], 'ROUTE_SOURCE_ALREADY_ALLOCATED');
      allocate(books, receipt, `${id}:source`); books.sourceOwners[receipt.economicIdentity] = id;
      plan.sourceIdentity = receipt.economicIdentity; plan.sourceFinal = true; plan.eligibleAtMs = this.now(); plan.state = 'PREPARING';
      post(books, `${id}:source`, receipt.asset, `segregated:${id}`, `customer-liability:${id}`, receipt.amount, receipt.proofDigest);
      history(plan, this.now(), 'SOURCE_FINAL', receipt); return plan;
    });
  }
  async executionQuote(id: string) {
    const snapshot = await this.plan(id); await this.dispatch(snapshot); const now = this.now();
    const request = buildRequest(snapshot.registry, snapshot.requiredTreasuryOutput, false, now + 600_000);
    const number = await this.checked(snapshot, (_books, plan) => {
      invariant(plan.sourceFinal && !plan.sourceReorg && !plan.cancellationProof && plan.customer === 'OPEN' && !plan.operation, 'ROUTE_SOURCE_OR_UNSIGNED_REQUIRED');
      invariant(plan.eligibleAtMs !== null && now - plan.eligibleAtMs <= 900_000 && plan.attempts.length < 3, 'ROUTE_PREPARATION_BUDGET_EXHAUSTED');
      const last = plan.attempts.at(-1);
      invariant(!last || last.result === 'UNKNOWN' || last.result === 'ABANDONED', 'ROUTE_UNUSED_QUOTE_MUST_BE_ABANDONED');
      if (last) invariant(now - last.requestedAtMs >= [5_000,15_000,30_000][last.number - 1], 'ROUTE_PREPARATION_BACKOFF');
      const number = plan.attempts.length + 1; plan.attempts.push({ number, requestDigest: digest(request), requestedAtMs: now, result: 'REQUESTED', quote: null, statuses: [] });
      plan.state = 'PREPARING'; return number;
    }, true);
    try {
      const result = await this.provider.quote(request, now); validateQuote(result.quote, request, this.now(), snapshot.cap, result.receivedAtMs);
      invariant(result.evidence === this.options.environment && digest(result.wire) === result.digest, 'ROUTE_EXECUTION_EVIDENCE_INVALID');
      return await this.mutation(books => {
        const plan = get(books, id), attempt = plan.attempts[number - 1];
        invariant(attempt.result === 'REQUESTED' && !plan.operation && plan.customer === 'OPEN', 'ROUTE_ATTEMPT_CHANGED');
        const locator = result.quote.depositAddress!.toLowerCase(); invariant(!books.locatorOwners[locator], 'ROUTE_DEPOSIT_ADDRESS_REUSED');
        books.locatorOwners[locator] = `${id}:${number}`; attempt.quote = structuredClone(result); attempt.result = 'QUOTED'; plan.state = 'QUOTED'; return result;
      });
    } catch (error) {
      await this.mutation(books => { const plan = get(books, id), attempt = plan.attempts[number - 1]; if (attempt.result === 'REQUESTED') attempt.result = 'UNKNOWN';
        if (/INVALID_SIGNATURE|ECHO_MISMATCH|HTTP_40[13]|SCHEMA_|NET_POLICY|NET_SEMANTICS/.test((error as Error).message)) {
          books.dispatchPaused = true; incident(books, plan, 'PROVIDER_VALIDATION_FAILED', { requestDigest: attempt.requestDigest });
        }
        history(plan, this.now(), 'QUOTE_REFUSED_OR_UNKNOWN', { requestDigest: attempt.requestDigest }); });
      throw error;
    }
  }
  async abandonUnsigned(id: string) {
    return this.mutation(books => { const plan = get(books, id), attempt = plan.attempts.at(-1);
      invariant(!plan.operation && attempt && attempt.result !== 'REQUESTED', 'ROUTE_CANNOT_ABANDON_POSSIBLE_FUNDING');
      attempt.result = 'ABANDONED'; plan.state = 'PREPARING'; });
  }
  async prepareFunding(id: string, sender: string, nonce: number, gasAsset: string, fence: number) {
    const snapshot = await this.plan(id); await this.dispatch(snapshot); integer(nonce); integer(fence);
    return this.checked(snapshot, (books, plan) => {
      const attempt = plan.attempts.at(-1); invariant(plan.state === 'QUOTED' && attempt?.quote && !plan.operation && plan.customer === 'OPEN' && !plan.sourceReorg && !plan.cancellationProof, 'ROUTE_FUNDING_NOT_ALLOWED');
      const envelope = attempt.quote; validateQuote(envelope.quote, envelope.quote.request, this.now(), plan.cap, envelope.receivedAtMs);
      invariant(/^0x[0-9a-fA-F]{40}$/.test(sender) && sender.toLowerCase() === plan.registry.originVault.toLowerCase() && fence > 0, 'ROUTE_SIGNER_OR_FENCE_INVALID');
      const gasCap = plan.gasCaps[gasAsset]; invariant(gasCap, 'ROUTE_GAS_ASSET_NOT_RESERVED');
      const nonceKey = `${plan.registry.origin.chainId}:${sender.toLowerCase()}:${nonce}`; invariant(!books.nonceOwners[nonceKey], 'ROUTE_NONCE_ALREADY_OWNED');
      const instruction = { id: `${id}:provider-funding`, attempt: attempt.number, fence, sender, nonce, chainId: plan.registry.origin.chainId,
        token: plan.registry.origin.contract, recipient: envelope.quote.depositAddress!, amount: envelope.quote.amountIn, gasAsset, gasCap };
      plan.operation = { ...instruction, digest: digest(instruction), journalId: null, signedHash: null, journalDigest: null, finalProof: null, signedAtMs: null };
      books.nonceOwners[nonceKey] = plan.operation.id; plan.state = 'FUNDING_PREPARED'; history(plan, this.now(), 'FUNDING_INTENT', instruction); return plan.operation;
    }, true);
  }
  async acknowledgeSigned(id: string, hint: unknown) {
    const snapshot = await this.plan(id), result = await this.proofs.journal(snapshot, hint);
    return this.checked(snapshot, (_books, plan) => {
      const operation = plan.operation; invariant(operation && plan.state === 'FUNDING_PREPARED' && result.operationDigest === operation.digest && result.fence === operation.fence,
        'ROUTE_JOURNAL_OR_FENCE_MISMATCH');
      invariant(/^0x[0-9a-fA-F]{64}$/.test(result.hash) && result.journalId.length > 0 && /^[0-9a-f]{64}$/.test(result.journalDigest), 'ROUTE_SIGNED_JOURNAL_REQUIRED');
      operation.signedHash = result.hash; operation.journalId = result.journalId; operation.journalDigest = result.journalDigest; operation.signedAtMs = result.signedAtMs;
      plan.state = 'FUNDING_SIGNED'; history(plan, this.now(), 'SIGNED_ORIGINAL', result);
    });
  }
  async noteBroadcast(id: string, result: 'SUBMITTED' | 'UNKNOWN') {
    return this.mutation(books => { const plan = get(books, id); invariant(plan.operation?.signedHash, 'ROUTE_SIGNED_ORIGINAL_REQUIRED');
      invariant(!plan.operation.finalProof, 'ROUTE_ALREADY_FINAL'); plan.state = result === 'UNKNOWN' ? 'RECONCILING' : 'FUNDING_SUBMITTED'; history(plan, this.now(), `BROADCAST_${result}`, { operation: plan.operation.id }); });
  }
  async observeProvider(id: string) {
    const snapshot = await this.plan(id), attempt = snapshot.attempts.at(-1); invariant(attempt?.quote, 'ROUTE_LOCATOR_MISSING');
    const quote = attempt.quote;
    let result;
    try { result = await this.provider.status({ address: quote.quote.depositAddress!, memo: quote.quote.depositMemo }, quote.digest, this.now()); }
    catch (error) {
      await this.mutation(books => { const plan = get(books, id);
        if (/UNKNOWN_STATUS|INVALID_SIGNATURE|LOCATOR_MISMATCH|HTTP_40[13]|SCHEMA_/.test((error as Error).message)) books.dispatchPaused = true;
        incident(books, plan, 'PROVIDER_STATUS_UNAVAILABLE_OR_UNSUPPORTED', { originalQuoteDigest: quote.digest });
      }); throw error;
    }
    return this.checked(snapshot, (books, plan) => {
      plan.attempts.at(-1)!.statuses.push({ status: result.status, atMs: result.updatedAtMs, digest: result.digest });
      if (['FAILED','REFUNDED','INCOMPLETE_DEPOSIT'].includes(result.status)) incident(books, plan, `PROVIDER_${result.status}`, result);
      // SUCCESS deliberately grants no balance, final state or customer permission.
      return result.status;
    });
  }
  async reviewProgress(id: string): Promise<'WAIT' | 'RECONCILE_AND_GUARDED_CANCEL' | 'OPERATOR_INCIDENT'> {
    const snapshot = await this.plan(id), started = snapshot.operation?.signedAtMs;
    if (started === null || started === undefined || snapshot.state === 'CLOSED') return 'WAIT';
    const elapsed = this.now() - started;
    if (elapsed < 1_800_000) return 'WAIT';
    const action = elapsed >= 7_200_000 ? 'OPERATOR_INCIDENT' : 'RECONCILE_AND_GUARDED_CANCEL';
    await this.checked(snapshot, (books, plan) => { incident(books, plan, action, { operationId: plan.operation!.id, elapsed }); });
    return action;
  }
  async confirmTreasury(id: string, kind: 'FUNDING' | 'OUTPUT' | 'RETURN', hint: unknown) {
    const snapshot = await this.plan(id), receipt = await this.proofs.treasury(snapshot, kind, hint); this.verify(receipt);
    const operation = snapshot.operation; invariant(operation?.signedHash, 'ROUTE_SIGNED_FUNDING_REQUIRED');
    invariant(receipt.attributedLocator.toLowerCase() === operation.recipient.toLowerCase(), 'ROUTE_RECEIPT_ATTRIBUTION_REQUIRED');
    return this.checked(snapshot, (books, plan) => {
      const operation = plan.operation!;
      if (kind === 'FUNDING') {
        invariant(!operation.finalProof && receipt.asset === plan.registry.origin.key && receipt.vault.toLowerCase() === operation.recipient.toLowerCase()
          && receipt.transactionHash.toLowerCase() === operation.signedHash!.toLowerCase(), 'ROUTE_FUNDING_RECEIPT_MISMATCH');
        invariant(receipt.success === true || receipt.success === false, 'ROUTE_FUNDING_RESULT_REQUIRED');
        invariant(receipt.amount === (receipt.success ? operation.amount : '0'), 'ROUTE_EXACT_FUNDING_AMOUNT_REQUIRED');
        invariant(receipt.gas && receipt.gas.asset === operation.gasAsset && atomic(receipt.gas.amount, false) <= BigInt(operation.gasCap), 'ROUTE_GAS_CAP_EXCEEDED');
        allocate(books, receipt, `${id}:funding`); operation.finalProof = receipt.proofDigest;
        if (receipt.amount !== '0') { post(books, `${id}:funding`, receipt.asset, `route-exposure:${id}`, cash(plan.registry.originVault), receipt.amount, receipt.proofDigest); plan.inputSpent = receipt.amount; }
        gasExpense(books, plan, receipt, `${id}:funding-gas`);
        plan.state = receipt.success ? 'ROUTING' : 'RECONCILING';
      } else {
        invariant(operation.finalProof && BigInt(plan.inputSpent) > 0n, 'ROUTE_FINAL_FUNDING_REQUIRED');
        const asset = kind === 'OUTPUT' ? plan.registry.destination.key : plan.registry.origin.key;
        const vault = kind === 'OUTPUT' ? plan.registry.destinationVault : plan.registry.refundVault;
        invariant(receipt.asset === asset && receipt.vault.toLowerCase() === vault.toLowerCase() && atomic(receipt.amount) > 0n, 'ROUTE_TREASURY_ENDPOINT_MISMATCH');
        allocate(books, receipt, `${id}:${kind}`);
        if (kind === 'RETURN') {
          const units = BigInt(receipt.amount), open = remaining(plan);
          invariant(units <= BigInt(plan.inputSpent) - BigInt(plan.inputRecovered) - BigInt(plan.inputConsumed), 'ROUTE_RETURN_EXCEEDS_EXPOSURE');
          const fromExposure = units < open ? units : open, recoveredLoss = units - fromExposure;
          if (fromExposure > 0n) post(books, `${id}:return:${receipt.economicIdentity}`, asset, cash(vault), `route-exposure:${id}`, fromExposure.toString(), receipt.proofDigest);
          if (recoveredLoss > 0n) {
            post(books, `${id}:loss-recovery:${receipt.economicIdentity}`, asset, cash(vault), 'operator-loss-expense', recoveredLoss.toString(), receipt.proofDigest);
            plan.recognizedLoss = (BigInt(plan.recognizedLoss) - recoveredLoss).toString();
          }
          plan.inputRecovered = (BigInt(plan.inputRecovered) + BigInt(receipt.amount)).toString();
        } else {
          post(books, `${id}:output:${receipt.economicIdentity}`, asset, cash(vault), `route-output-clearing:${id}`, receipt.amount, receipt.proofDigest);
          plan.outputReceived = (BigInt(plan.outputReceived) + BigInt(receipt.amount)).toString();
          if (BigInt(plan.outputReceived) < BigInt(plan.requiredTreasuryOutput)) incident(books, plan, 'PARTIAL_OUTPUT', receipt);
        }
      }
      history(plan, this.now(), `FINAL_${kind}`, receipt); return plan;
    });
  }
  async recordCost(id: string, kind: 'CONSUMED' | 'LOSS', amount: string, hint: unknown) {
    // Explicit bounded accounting decision only. It cannot authorize a transfer.
    atomic(amount); const snapshot = await this.plan(id), proof = await this.proofs.cost(snapshot, kind, amount, hint);
    invariant(proof.evidence === this.options.environment && proof.operationId === snapshot.operation?.id && proof.kind === kind && proof.amount === amount
      && /^[0-9a-f]{64}$/.test(proof.proofDigest), 'ROUTE_COST_EVIDENCE_REQUIRED');
    return this.checked(snapshot, (books, plan) => { invariant(BigInt(amount) <= remaining(plan), 'ROUTE_COST_EXCEEDS_EXPOSURE');
      if (kind === 'CONSUMED') invariant(BigInt(plan.outputReceived) >= BigInt(plan.requiredTreasuryOutput), 'ROUTE_OUTPUT_REQUIRED_FOR_CONSUMPTION');
      const target = kind === 'LOSS' ? 'recognizedLoss' : 'inputConsumed';
      post(books, `${id}:${kind}:${proof.proofDigest}`, plan.registry.origin.key, kind === 'LOSS' ? 'operator-loss-expense' : `route-input-clearing:${id}`, `route-exposure:${id}`, amount, proof.proofDigest);
      plan[target] = (BigInt(plan[target]) + BigInt(amount)).toString();
    });
  }
  async cancelCustomer(id: string, hint: unknown) {
    const snapshot = await this.plan(id), proof = await this.proofs.cancellation(snapshot, hint);
    invariant(proof.settlementId === id && proof.finalizedState === proof.latestState && proof.journalFenced && proof.allAttemptsReconciled && proof.refundFeeCapacity && /^[0-9a-f]{64}$/.test(proof.proofDigest), 'ROUTE_FINAL_CANCELLATION_AND_JOURNAL_REQUIRED');
    if (snapshot.terms.sourceKind === 'ZCASH') invariant(proof.finalizedState === 'CANCELLED', 'ROUTE_PAYOUT_TOMBSTONE_REQUIRED');
    else {
      invariant(proof.finalizedState === 'REFUNDED' && proof.canonicalTimeMs >= snapshot.terms.cancellationAvailableAtMs, 'ROUTE_CANONICAL_REFUND_DEADLINE_REQUIRED');
      if (snapshot.reverseCommitmentProof) {
        const abort = proof.guardedAbort;
        invariant(snapshot.terms.settlementVersion === 'V2' && abort?.mode === 'V2_ABORT', 'ROUTE_COMMITTED_REVERSE_ABORT_UNSUPPORTED');
        integer(abort.nonce);
        invariant(abort.operationId === snapshot.reversePayoutOperationId && abort.noSuccessfulOrValidPayouts === true && abort.expiryCanonical === true
          && /^[0-9a-f]{64}$/.test(abort.eventDigest) && /^[0-9a-f]{64}$/.test(abort.recoveryDigest) && snapshot.abortNonce === null, 'ROUTE_GUARDED_ABORT_PROOF_REQUIRED');
      } else invariant(!proof.guardedAbort, 'ROUTE_UNEXPECTED_ABORT');
    }
    return this.checked(snapshot, (_books, plan) => { invariant(plan.customer === 'OPEN' && plan.sourceFinal && !plan.sourceReorg && !plan.cancellationProof, 'ROUTE_SOURCE_REFUND_NOT_ALLOWED');
      plan.cancellationProof = proof.proofDigest; plan.abortNonce = proof.guardedAbort?.nonce ?? null; history(plan, this.now(), 'CUSTOMER_BRANCH_CANCELLED', proof); });
  }
  async commitReverse(id: string, hint: unknown) {
    const snapshot = await this.plan(id); await this.dispatch(snapshot);
    invariant(snapshot.terms.sourceKind === 'EVM' && snapshot.sourceFinal && !snapshot.sourceReorg && !snapshot.cancellationProof && snapshot.customer === 'OPEN' && BigInt(snapshot.outputReceived) >= BigInt(snapshot.requiredTreasuryOutput), 'ROUTE_REVERSE_COMMIT_NOT_ALLOWED');
    const proof = await this.proofs.reverseCommitment(snapshot, hint);
    invariant(proof.settlementId === id && proof.finalizedState === 'PAYOUT_COMMITTED' && proof.latestState === 'PAYOUT_COMMITTED' && /^[0-9a-f]{64}$/.test(proof.proofDigest), 'ROUTE_CANONICAL_COMMITMENT_REQUIRED');
    invariant(proof.payoutOperationId.length > 0, 'ROUTE_REVERSE_PAYOUT_OPERATION_REQUIRED');
    return this.checked(snapshot, (_books, plan) => { invariant(!plan.reverseCommitmentProof, 'ROUTE_REVERSE_COMMIT_ALREADY_RECORDED'); plan.reverseCommitmentProof = proof.proofDigest; plan.reversePayoutOperationId = proof.payoutOperationId; }, true);
  }
  async confirmCustomer(id: string, branch: 'DELIVERED' | 'REFUNDED', hint: unknown) {
    const snapshot = await this.plan(id), receipt = await this.proofs.customer(snapshot, branch, hint); this.verify(receipt);
    invariant(receipt.settlementId === id && receipt.asset === (branch === 'DELIVERED' ? snapshot.terms.outputAsset : snapshot.terms.sourceAsset)
      && receipt.vault === (branch === 'DELIVERED' ? snapshot.terms.recipient : snapshot.terms.refundRecipient)
      && receipt.amount === (branch === 'DELIVERED' ? snapshot.terms.outputAtomic : snapshot.terms.principalAtomic), 'ROUTE_CUSTOMER_EXACT_RECEIPT_REQUIRED');
    invariant(receipt.gas && snapshot.gasCaps[receipt.gas.asset] && atomic(receipt.gas.amount, false) <= BigInt(snapshot.gasCaps[receipt.gas.asset]), 'ROUTE_CUSTOMER_FEE_PROOF_REQUIRED');
    return this.checked(snapshot, (books, plan) => {
      invariant(plan.customer === 'OPEN' && plan.sourceFinal && !plan.sourceReorg, 'ROUTE_CUSTOMER_ALREADY_TERMINAL_OR_SOURCE_REORG');
      if (branch === 'REFUNDED') {
        invariant(plan.cancellationProof && receipt.terminalState === 'REFUNDED', 'ROUTE_CUSTOMER_REFUND_BRANCH_UNPROVED');
        post(books, `${id}:customer-refund`, receipt.asset, `customer-liability:${id}`, `segregated:${id}`, receipt.amount, receipt.proofDigest);
      } else {
        invariant(!plan.cancellationProof && BigInt(plan.outputReceived) >= BigInt(plan.requiredTreasuryOutput), 'ROUTE_DELIVERY_NOT_ELIGIBLE');
        invariant(plan.terms.sourceKind === 'ZCASH' ? receipt.terminalState === 'PAID' : !!plan.reverseCommitmentProof && receipt.terminalState === 'SETTLED', 'ROUTE_FINAL_CUSTOMER_BRANCH_REQUIRED');
        const vault = plan.terms.outputAsset === plan.registry.destination.key ? plan.registry.destinationVault : 'customer-payout';
        invariant(balance(books, receipt.asset, cash(vault)) >= BigInt(receipt.amount), 'ROUTE_PAYOUT_CAPITAL_DEFICIT');
        post(books, `${id}:customer-output`, receipt.asset, `customer-fulfillment:${id}`, cash(vault), receipt.amount, receipt.proofDigest);
        post(books, `${id}:source-liability-cleared`, plan.terms.sourceAsset, `customer-liability:${id}`, `exchange-clearing:${id}`, plan.terms.principalAtomic, receipt.proofDigest);
        post(books, `${id}:source-acquired`, plan.terms.sourceAsset, cash('acquired-source'), `segregated:${id}`, plan.terms.principalAtomic, receipt.proofDigest);
      }
      gasExpense(books, plan, receipt, `${id}:customer-gas`);
      allocate(books, receipt, `${id}:customer:${branch}`); plan.customer = branch; plan.customerProof = receipt.proofDigest; history(plan, this.now(), `CUSTOMER_${branch}`, receipt); return plan;
    });
  }
  async markIncident(id: string, reason: 'SOURCE_REORG' | 'PROVIDER_UNKNOWN' | 'RESTORE' | 'TIMEOUT' | 'CONTRADICTORY_RECEIPT', evidenceDigest: string) {
    await this.mutation(books => { const plan = get(books, id); if (reason === 'SOURCE_REORG') plan.sourceReorg = true;
      incident(books, plan, reason, { evidenceDigest }); });
    if (reason === 'RESTORE') this.reconciledRevision = null;
  }
  async close(id: string) {
    return this.mutation(books => { const plan = get(books, id);
      invariant(plan.customer !== 'OPEN' && !plan.sourceReorg && remaining(plan) === 0n && (!plan.operation || !!plan.operation.finalProof), 'ROUTE_BOOKS_STILL_OPEN');
      invariant(balance(books, plan.terms.sourceAsset, `customer-liability:${id}`) === 0n && balance(books, plan.terms.sourceAsset, `segregated:${id}`) === 0n, 'ROUTE_CUSTOMER_LIABILITY_REMAINS');
      plan.state = 'CLOSED'; return plan;
    });
  }
  async snapshot() { return this.store.read(); }
}
