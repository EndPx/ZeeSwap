/** PostgreSQL to_jsonb(bytea) emits one backslash followed by x and lowercase hex.
 * Do not accept raw hashes, Buffer's JSON shape, doubled escaping or partial hex. */
export function decodePgJsonbBytea(value:unknown,bytes?:number):Buffer {
 const prefix=String.fromCharCode(92,120);
 if(typeof value!=='string'||!value.startsWith(prefix))throw Error('INVALID_PG_JSONB_BYTEA');
 const hex=value.slice(2);
 if(hex.length===0||hex.length>32000000||hex.length%2!==0||!/^[0-9a-f]+$/.test(hex)||(bytes!==undefined&&hex.length!==bytes*2))throw Error('INVALID_PG_JSONB_BYTEA');
 return Buffer.from(hex,'hex');
}
