import type pg from 'pg';
import { transaction } from '../db.ts';
import { PrivateData } from '../private-data.ts';
import { emptyBooks, type Books } from './model.ts';

export interface BridgeStore { read():Promise<Books>; update<T>(run:(books:Books)=>Promise<T>|T):Promise<T> }
/** One serialized encrypted bridge book: no privileges or foreign keys into swap books.
 * Deliberately bounded to 1000 orders until a separately reviewed archival design exists.
 * Every worker/API mutation takes the same PostgreSQL row lock, across processes.
 */
export class BridgeRepository implements BridgeStore {
 private table:string;
 constructor(private pool:pg.Pool,private keys:PrivateData,schema='zee_bridge'){
  if(schema!=='zee_bridge'&&!/^bridge_test_[a-f0-9]{24}$/.test(schema))throw Error('BRIDGE_INVALID_SCHEMA');this.table=`${schema}.books`;
 }
 async read():Promise<Books>{
  const row=(await this.pool.query(`SELECT payload FROM ${this.table} WHERE singleton`)).rows[0];
  if(!row)throw Error('BRIDGE_NOT_PROVISIONED');return this.keys.open(row.payload,'bridge:books:v1') as Books;
 }
 async update<T>(run:(books:Books)=>Promise<T>|T):Promise<T>{return transaction(this.pool,async c=>{
  const row=(await c.query(`SELECT revision,payload FROM ${this.table} WHERE singleton FOR UPDATE`)).rows[0];
  if(!row)throw Error('BRIDGE_NOT_PROVISIONED');const books=this.keys.open(row.payload,'bridge:books:v1') as Books;
  const result=await run(books);if(Object.keys(books.orders).length>1000)throw Error('BRIDGE_BOOK_CAPACITY');
  await c.query(`UPDATE ${this.table} SET revision=revision+1,payload=$1 WHERE singleton AND revision=$2`,[this.keys.seal(books,'bridge:books:v1'),row.revision]);return result;
 });}
 /** Provisioning is a separate explicit operator step; this method never enables admission. */
 async initializePaused():Promise<void>{await this.pool.query(`INSERT INTO ${this.table}(singleton,payload) VALUES(true,$1) ON CONFLICT(singleton) DO NOTHING`,[this.keys.seal(emptyBooks(),'bridge:books:v1')]);}
}
