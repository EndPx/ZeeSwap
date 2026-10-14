import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { atomic, fixtureOutput } from './amounts.ts';
import { PrivateData, accessHash, newAccessToken } from './private-data.ts';
import { publicSettlementId } from './base-contract.ts';

type Queryable = Pick<pg.Pool,'query'>;
export type Direction = 'ZCASH_TO_BASE'|'BASE_TO_ZCASH';
export interface QuoteInput {
  direction: Direction; inputAmount: string; payoutFee: string; refundFee: string;
  recipient: string; refundRecipient: string; depositReceiver: string;
  executionMode?: 'base-settlement-v1'|'base-escrow-v1'; baseContract?: string; payer?: string;
}
export interface DepositInput {
  network: 'zcash-testnet'|'base-sepolia'; txid: string; index: number;
  pool?: 'sapling'|'orchard'|'ironwood'; emitter?: string;
  reference: string; receiver: string; amount: string; height: number;
  blockHash: string; blockTime: Date; shielded: boolean;
  memo?: string;
}
export function depositIdentity(value: DepositInput): string {
  if (!/^[0-9a-f]{64}$/.test(value.txid) || !Number.isSafeInteger(value.index) || value.index<0)
    throw new Error('Invalid transaction output identity');
  if (value.network==='zcash-testnet') {
    if (!['sapling','orchard','ironwood'].includes(value.pool || '')) throw new Error('Shielded pool required');
    return JSON.stringify(['zcash-testnet',value.txid,value.pool,value.index]);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(value.emitter || '')) throw new Error('Emitting contract required');
  return JSON.stringify(['base-sepolia',84532,value.txid,value.index,value.emitter!.toLowerCase()]);
}
export function makeMemo(reference: string): string { return JSON.stringify({v:1,ref:reference}); }
export function parseMemo(memo: string): string {
  if (Buffer.byteLength(memo)>512) throw new Error('Memo too long');
  const value = JSON.parse(memo);
  if (!value || value.v!==1 || !/^[0-9a-f-]{36}$/.test(value.ref) || makeMemo(value.ref)!==memo)
    throw new Error('Invalid canonical deposit memo');
  return value.ref;
}

/** Server-only storage boundary. The trusted chain adapter must validate decoded
 * receivers, network/token/contract, receipts and finality before calling it. */
export class Repository {
  constructor(private readonly db: Queryable, private readonly privateData: PrivateData) {}
  async issueQuote(input: QuoteInput, credential?: string) {
    if (!input.recipient || !input.refundRecipient || !input.depositReceiver) throw new Error('Destinations required');
    if (atomic(input.payoutFee)<=0n || atomic(input.refundFee)<=0n) throw new Error('Fee reserves required');
    const id=randomUUID(), reference=randomUUID(), token=credential || newAccessToken(), settlementId=randomUUID();
    if(input.executionMode==='base-escrow-v1'){
      if(input.direction!=='BASE_TO_ZCASH'||!input.payer)throw Error('Reverse payer required');
      input={...input,depositReceiver:`escrow:${publicSettlementId(settlementId)}`};
    }
    const output=fixtureOutput(input.inputAmount,input.direction), forward=input.direction==='ZCASH_TO_BASE';
    const payload=this.privateData.seal({...input,outputAmount:output,reference,settlementId},`quote:${id}:v1`);
    await this.db.query(`WITH stamp AS MATERIALIZED (SELECT clock_timestamp() AS issued)
      INSERT INTO zee.quotes(id,direction,source_asset,destination_asset,input_amount,output_amount,
      payout_fee_asset,payout_fee,refund_fee_asset,refund_fee,private_payload,deposit_reference_hash,receiver_hash,access_hash,settlement_id,execution_mode,base_contract,created_at,expires_at)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,issued,issued+interval '120 seconds' FROM stamp`,
      [id,input.direction,forward?'TAZ':'mockUSDC',forward?'mockUSDC':'TAZ',input.inputAmount,output,
       forward?'baseETH':'TAZ',input.payoutFee,forward?'TAZ':'baseETH',input.refundFee,payload,
       this.privateData.lookup('reference',reference),this.privateData.lookup('receiver',input.depositReceiver),accessHash(token),settlementId,input.executionMode||'observe-only',input.baseContract||null]);
    return {id,reference,accessToken:token,outputAmount:output,memo:makeMemo(reference)};
  }
  async privateQuote(id: string, token: string) {
    const result=await this.db.query('SELECT private_payload FROM zee.quotes WHERE id=$1 AND access_hash=$2',[id,accessHash(token)]);
    if (!result.rowCount) throw new Error('Order unavailable');
    return this.privateData.open(result.rows[0].private_payload,`quote:${id}:v1`);
  }
  async accept(id: string, token: string) {
    // Authenticated service boundary; never expose accept_quote directly to clients.
    await this.privateQuote(id,token);
    return (await this.db.query('SELECT zee.accept_quote($1) AS id',[id])).rows[0].id as string;
  }
  async observe(input: DepositInput) {
    const identity=depositIdentity(input); atomic(input.amount);
    if (!Number.isSafeInteger(input.height) || input.height<0 || !/^[0-9a-f]{64}$/.test(input.blockHash)) throw new Error('Invalid block');
    const id=randomUUID();
    return (await this.db.query('SELECT zee.observe_deposit($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS id',[
      id,this.privateData.lookup('deposit',identity),input.network,this.privateData.lookup('reference',input.reference),
      this.privateData.lookup('receiver',input.receiver),input.amount,input.height,input.blockHash,input.blockTime,input.shielded,
      this.privateData.seal(input,`deposit:${identity}:v1`)
    ])).rows[0].id as string;
  }
  async confirm(depositId: string) { return (await this.db.query('SELECT zee.confirm_deposit($1) AS id',[depositId])).rows[0].id as string; }
}
