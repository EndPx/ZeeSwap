import { open, readFile, rename, unlink, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrivateData } from '../../private-data.ts';
import { invariant } from './policy.ts';
import type { RouteBooks } from './types.ts';

export interface RouteStore {
  /** Serializable, short and local: callbacks must never call provider/RPC/signer. */
  transaction<T>(run: (books: RouteBooks) => T): Promise<T>;
  read(): Promise<RouteBooks>;
}
export function emptyBooks(): RouteBooks {
  return { version: 1, revision: 0, dispatchPaused: false, plans: {}, ledger: [], balances: {}, receiptOwners: {}, nonceOwners: {}, locatorOwners: {}, sourceOwners: {}, incidents: [] };
}
/** Private encrypted local durability for isolated acceptance and recovery drills.
 * The lock is deliberately never stolen on a clock timeout: crash recovery must
 * reconcile journals before an operator removes a stale lock. Production remains
 * disabled; this does not claim Neon transactions or power-loss durability on all
 * Windows filesystems. Existing database migrations are completely independent. */
export class PrivateFileRouteStore implements RouteStore {
  private constructor(private readonly path: string, private readonly keys: PrivateData) {}
  static async create(path: string, keys: PrivateData, publicRoot: string) {
    invariant(isAbsolute(path), 'ROUTE_PRIVATE_ABSOLUTE_PATH_REQUIRED');
    const parent = await realpath(dirname(path)), publicPath = await realpath(publicRoot);
    const rel = relative(publicPath, parent);
    invariant(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), 'ROUTE_PRIVATE_STORE_MUST_BE_OUTSIDE_REPOSITORY');
    return new PrivateFileRouteStore(resolve(parent, basename(path)), keys);
  }
  private async load(): Promise<RouteBooks> {
    try {
      const result = this.keys.open(await readFile(this.path), 'route-books:v1') as RouteBooks;
      invariant(result.version === 1 && Number.isSafeInteger(result.revision) && result.revision >= 0, 'ROUTE_STORE_VERSION');
      return result;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyBooks(); throw error; }
  }
  async read() { return structuredClone(await this.load()); }
  async transaction<T>(run: (books: RouteBooks) => T): Promise<T> {
    const lockPath = `${this.path}.lock`, lock = await open(lockPath, 'wx', 0o600);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const books = await this.load(), result = run(books);
      invariant(!(result && typeof result === 'object' && 'then' in result), 'ROUTE_ASYNC_TRANSACTION_FORBIDDEN');
      books.revision++;
      const file = await open(temporary, 'wx', 0o600);
      try { await file.writeFile(this.keys.seal(books, 'route-books:v1')); await file.sync(); } finally { await file.close(); }
      await rename(temporary, this.path);
      if (process.platform !== 'win32') { const directory = await open(dirname(this.path), 'r'); try { await directory.sync(); } finally { await directory.close(); } }
      return structuredClone(result);
    } finally {
      await unlink(temporary).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
      await lock.close(); await unlink(lockPath);
    }
  }
}
