export function atomic(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error('Canonical nonnegative atomic string required');
  return BigInt(value);
}
export function toAtomic(value: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals<0 || decimals>18 || !/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) || value.length>100)
    throw new Error('Invalid decimal amount');
  const [whole, fraction=''] = value.split('.');
  if (fraction.length>decimals) throw new Error('Too many decimal places');
  return atomic((BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0') || '0')).toString()).toString();
}
export function fixtureOutput(input: string, direction: 'ZCASH_TO_BASE'|'BASE_TO_ZCASH'): string {
  const amount = atomic(input);
  if (amount<100000n || amount>10000000n) throw new Error('Outside testnet input limits');
  const output = direction==='ZCASH_TO_BASE' ? amount*100n*10n**6n/10n**8n : amount*10n**8n/(100n*10n**6n);
  if (output<=0n) throw new Error('Zero output');
  return output.toString();
}
