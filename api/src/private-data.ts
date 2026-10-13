import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

export class PrivateData {
  constructor(private readonly encryptionKey: Buffer, private readonly lookupKey: Buffer) {
    if (encryptionKey.length !== 32 || lookupKey.length !== 32 || encryptionKey.equals(lookupKey))
      throw new Error('Two independent 32-byte keys required');
  }
  seal(value: unknown, context: string): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, nonce);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
  }
  open(value: Buffer, context: string): unknown {
    if (value.length <= 28) throw new Error('Invalid encrypted payload');
    const cipher = createDecipheriv('aes-256-gcm', this.encryptionKey, value.subarray(0,12));
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(value.subarray(12,28));
    return JSON.parse(Buffer.concat([cipher.update(value.subarray(28)),cipher.final()]).toString('utf8'));
  }
  lookup(domain: string, value: string): Buffer {
    return createHmac('sha256', this.lookupKey).update(JSON.stringify([domain,value])).digest();
  }
}

export const accessHash = (token: string): Buffer => createHash('sha256').update(token).digest();
export const newAccessToken = (): string => randomBytes(32).toString('base64url');
