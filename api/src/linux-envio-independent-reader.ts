/** Explicit Root transport approval. Source certificates retain their original
 * PublicNode identity; consumer reads use the genuinely separate Official RPC. */
import {readFile,lstat,realpath} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {object,requireThat} from './integrations/observation/types.ts';
export type IndependentReaderApproval={version:1;status:'ROOT_ENVIO_INDEPENDENT_CONSUMER_RPC_APPROVED';operatorProfileSha256:string;envioProfileSha256:string;handoffSha256:string;generation:string;projectionDigest:string;sourceProofSourceId:'base-sepolia-publicnode-normal-rpc';sourceId:'base-sepolia-official-independent-rpc';url:'https://sepolia.base.org';headerBatchSize:10;maxMethodsPerSecond:24;publicCommit:string;qualifiedAt:string;qualification:{path:string;sha256:string}};
export function validateIndependentReaderApproval(p:IndependentReaderApproval,expected:Pick<IndependentReaderApproval,'operatorProfileSha256'|'envioProfileSha256'|'handoffSha256'|'generation'|'projectionDigest'>){
 object(p,['version','status','operatorProfileSha256','envioProfileSha256','handoffSha256','generation','projectionDigest','sourceProofSourceId','sourceId','url','headerBatchSize','maxMethodsPerSecond','publicCommit','qualifiedAt','qualification']);
 requireThat(p.version===1&&p.status==='ROOT_ENVIO_INDEPENDENT_CONSUMER_RPC_APPROVED'&&Object.entries(expected).every(([k,v])=>p[k as keyof typeof expected]===v),'INDEPENDENT_READER_IDENTITY');
 requireThat(p.sourceProofSourceId==='base-sepolia-publicnode-normal-rpc'&&p.sourceId==='base-sepolia-official-independent-rpc'&&p.url==='https://sepolia.base.org'&&p.headerBatchSize===10&&p.maxMethodsPerSecond===24&&/^[a-f0-9]{40}$/.test(p.publicCommit)&&Number.isFinite(Date.parse(p.qualifiedAt))&&Date.parse(p.qualifiedAt)<=Date.now(),'INDEPENDENT_READER_SCOPE');return p;
}
export async function loadIndependentReaderApproval(expected:Parameters<typeof validateIndependentReaderApproval>[1]){
 const path=process.env.ZEESWAP_ENVIO_CONSUMER_RPC_PROOF,sha256=process.env.ZEESWAP_ENVIO_CONSUMER_RPC_SHA256;requireThat(Boolean(path)===Boolean(sha256),'INDEPENDENT_READER_SELECTOR_PAIR');if(!path)return undefined;
 requireThat(path==='/opt/zeeswap-testnet/state/envio/independent-consumer-rpc.private.json'&&/^[a-f0-9]{64}$/.test(sha256!),'INDEPENDENT_READER_SELECTOR');
 async function pin(p:{path:string;sha256:string}){requireThat(p.path.startsWith('/opt/zeeswap-testnet/')&&!p.path.includes('..')&&/^[a-f0-9]{64}$/.test(p.sha256),'INDEPENDENT_READER_PIN');const s=await lstat(p.path);requireThat(s.isFile()&&!s.isSymbolicLink()&&s.uid===0&&s.gid===978&&(s.mode&0o027)===0&&s.size<=16000000&&await realpath(p.path)===p.path,'INDEPENDENT_READER_ROOT_FILE');const b=await readFile(p.path);requireThat(createHash('sha256').update(b).digest('hex')===p.sha256,'INDEPENDENT_READER_RAW_PIN');return b;}
 const approval=validateIndependentReaderApproval(JSON.parse((await pin({path,sha256:sha256!})).toString()),expected);await pin(approval.qualification);return{approval,pin:{path,sha256:sha256!}};
}
