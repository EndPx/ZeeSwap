/** Linux transport identity checks. This module never opens/rebooks capital. */
import {readFile,lstat,realpath,readdir} from 'node:fs/promises';
import {posix} from 'node:path';
import {createHash} from 'node:crypto';
import type {BaseRegistry} from './base-contract.ts';
export type PinnedFile={path:string;sha256:string};
export interface LinuxOperatorProfile {
 version:1;profile:'zeeswap-linux-operator-20261023';
 identity:{projectId:string;branchId:string;database:string;host:string;operator:string;sourceFingerprint:string;chefAccountId:string;birthday:number;chainId:number;settlement:string;token:string;account:string};
 roots:{base:string;release:string;state:string;secrets:string};
 paths:{operatorWallet:string;watchWallet:string;operatorUfvk:string;walletLock:string;baseJournal:string;basePassword:string;baseKeystore:string};
 credentials:{operatorKeystore:PinnedFile;operatorPassword:PinnedFile};
 artifacts:Record<'reader'|'zingo'|'verify'|'cast'|'scanner',PinnedFile>;
 immutable:{openingProof:PinnedFile;chefOpeningProof:PinnedFile;operatorBinding:PinnedFile;runtime:PinnedFile;registry:PinnedFile;operatorUfvk:PinnedFile};
 configPins?:Record<string,PinnedFile>;
 transport?:{prefunding:true;sourceWritersStoppedAt:string;originalCodeCommit:string;walletTrees:{logicalId:'operator-spend-wallet'|'operator-view-wallet'|'operator-base-journal'|'operator-reverse-journals';path:string;files:{relative:string;sha256:string;bytes:number}[]}[]};
}
export const linuxRawSha256=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
function need(value:unknown,code:string):asserts value{if(!value)throw Error('LINUX_PROFILE_'+code);}
const inside=(p:string,root:string)=>p===root||p.startsWith(root+'/');
function linuxPath(p:unknown,root:string){need(typeof p==='string'&&posix.isAbsolute(p)&&p===posix.normalize(p)&&!p.includes('\\')&&!p.includes('\0')&&inside(p,root),'PATH_OUTSIDE_APPROVED_ROOT');}
export function validateLinuxProfileShape(p:LinuxOperatorProfile){
 need(p?.version===1&&p.profile==='zeeswap-linux-operator-20261023','WRONG_PROFILE');const i=p.identity;
 need(i?.projectId==='raspy-truth-63998651'&&i.branchId==='br-broad-pine-ao79wemx'&&i.database==='zee_app_20261023'&&i.host==='ep-red-thunder-aosp0w70.c-2.ap-southeast-1.aws.neon.tech'&&i.chainId===84532&&i.birthday===4532047,'WRONG_DATABASE_OR_NETWORK');
 need(i.operator?.toLowerCase()==='0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087'&&i.settlement?.toLowerCase()==='0xe99ac648f85450b8ddeaea088aa99749c5e16da3'&&i.token?.toLowerCase()==='0xd64c116352cef2adc9484098ae332fd9ba339a63'&&i.account==='zeeswap-live-20261023-operator','WRONG_OPERATOR_OR_CONTRACT');
 need(/^[0-9a-f]{64}$/.test(i.sourceFingerprint)&&typeof i.chefAccountId==='string'&&i.chefAccountId.length>0,'EXPLICIT_PRIVATE_SOURCE_IDENTITY');
 need(p.roots?.base==='/opt/zeeswap-testnet'&&p.roots.state===p.roots.base+'/state'&&p.roots.secrets===p.roots.base+'/secrets'&&/^\/opt\/zeeswap-testnet\/releases\/[a-z0-9][a-z0-9._-]{1,79}$/.test(p.roots.release),'WRONG_ROOTS');
 const expected={operatorWallet:p.roots.state+'/operator-wallet',watchWallet:p.roots.state+'/deposit-view',operatorUfvk:p.roots.secrets+'/operator.ufvk',walletLock:p.roots.state+'/operator-wallet.lock',baseJournal:p.roots.state+'/base-signer-journal',basePassword:p.roots.secrets+'/operator-password',baseKeystore:p.roots.base+'/home/.foundry/keystores/'+i.account};
 for(const [key,value] of Object.entries(expected))need(p.paths?.[key as keyof typeof expected]===value,'WRONG_PHYSICAL_'+key.toUpperCase());
 need(p.credentials?.operatorKeystore.path===p.paths.baseKeystore&&p.credentials.operatorPassword.path===p.paths.basePassword&&Object.keys(p.credentials).sort().join(',')==='operatorKeystore,operatorPassword','ONLY_OPERATOR_CREDENTIALS_ALLOWED');for(const item of Object.values(p.credentials)){linuxPath(item.path,p.roots.base);need(/^[0-9a-f]{64}$/.test(item.sha256),'BAD_OPERATOR_CREDENTIAL_DIGEST');}
 for(const item of Object.values(p.artifacts)){linuxPath(item.path,p.roots.release+'/bin');need(/^[0-9a-f]{64}$/.test(item.sha256)&&!item.path.endsWith('.exe'),'BAD_NATIVE_ARTIFACT');}
 need(Object.keys(p.artifacts).sort().join(',')==='cast,reader,scanner,verify,zingo','NATIVE_ARTIFACT_SET');
 for(const item of Object.values(p.immutable)){linuxPath(item.path,p.roots.secrets);need(/^[0-9a-f]{64}$/.test(item.sha256),'BAD_IMMUTABLE_DIGEST');}
 for(const item of Object.values(p.configPins??{})){linuxPath(item.path,p.roots.secrets);need(/^[0-9a-f]{64}$/.test(item.sha256),'BAD_CONFIG_PIN');}
 need(p.immutable.operatorUfvk.path===p.paths.operatorUfvk,'UFVK_PATH_MISMATCH');
 if(p.transport){need(p.transport.prefunding===true&&Number.isFinite(Date.parse(p.transport.sourceWritersStoppedAt))&&/^[0-9a-f]{40}$/.test(p.transport.originalCodeCommit),'PREFUNDING_TRANSPORT_PROOF_REQUIRED');const names=new Set<string>();for(const tree of p.transport.walletTrees){need(['operator-spend-wallet','operator-view-wallet','operator-base-journal','operator-reverse-journals'].includes(tree.logicalId)&&!names.has(tree.logicalId),'USER_OR_DEPLOYER_TRANSFER_FORBIDDEN');names.add(tree.logicalId);const expectedTree={'operator-spend-wallet':p.paths.operatorWallet,'operator-view-wallet':p.paths.watchWallet,'operator-base-journal':p.paths.baseJournal,'operator-reverse-journals':p.roots.state+'/reverse-orders'};need(tree.path===expectedTree[tree.logicalId],'WRONG_LOGICAL_WALLET_DESTINATION');if(tree.logicalId==='operator-spend-wallet'||tree.logicalId==='operator-view-wallet')need(tree.files.length>0,'MISSING_ORIGINAL_WALLET_STATE');linuxPath(tree.path,p.roots.state);for(const file of tree.files)need(typeof file.relative==='string'&&!posix.isAbsolute(file.relative)&&file.relative===posix.normalize(file.relative)&&!file.relative.split('/').includes('..')&&!file.relative.includes('\\')&&/^[0-9a-f]{64}$/.test(file.sha256)&&Number.isSafeInteger(file.bytes)&&file.bytes>=0,'INVALID_WALLET_TREE_INVENTORY');}need(names.size===4,'ALL_FOUR_OPERATOR_STATE_TREES_REQUIRED');}
 return p;
}
async function pinned(item:PinnedFile,privateFile:boolean){const info=await lstat(item.path);need(info.isFile()&&!info.isSymbolicLink(),'PINNED_FILE_OR_SYMLINK');need(await realpath(item.path)===item.path,'PINNED_ANCESTOR_SYMLINK');if(privateFile)need((info.mode&0o027)===0,'PRIVATE_FILE_PERMISSIONS');const bytes=await readFile(item.path);need(linuxRawSha256(bytes)===item.sha256,'PINNED_BYTES_CHANGED');return bytes;}
export async function verifyLinuxOperatorProfile(path:string){
 need(process.platform==='linux','NATIVE_LINUX_REQUIRED');const profileBytes=await readFile(path),profile=validateLinuxProfileShape(JSON.parse(profileBytes.toString()) as LinuxOperatorProfile);
 need(path===profile.roots.secrets+'/linux-operator-profile.private.json','EXACT_PROFILE_PATH');const profileStat=await lstat(path);need(profileStat.isFile()&&(profileStat.mode&0o027)===0&&!profileStat.isSymbolicLink()&&await realpath(path)===path,'PROFILE_PERMISSIONS');
 for(const item of Object.values(profile.configPins??{}))await pinned(item,true);for(const item of Object.values(profile.artifacts))await pinned(item,false);for(const item of Object.values(profile.credentials))await pinned(item,true);
 const immutable=Object.fromEntries(await Promise.all(Object.entries(profile.immutable).map(async([name,item])=>[name,await pinned(item,true)]))) as Record<keyof LinuxOperatorProfile['immutable'],Buffer>;
 const runtime=JSON.parse(immutable.runtime.toString()),registry=JSON.parse(immutable.registry.toString()) as BaseRegistry,opening=JSON.parse(immutable.openingProof.toString()),binding=JSON.parse(immutable.operatorBinding.toString());
 need(runtime.projectId===profile.identity.projectId&&runtime.branchId===profile.identity.branchId&&runtime.database===profile.identity.database,'RUNTIME_TARGET');
 for(const [field,role] of [['apiUrl','zee_app_api_20261023'],['workerUrl','zee_app_worker_20261023']]){const u=new URL(runtime[field!]);need(u.hostname===profile.identity.host&&u.pathname==='/'+profile.identity.database&&decodeURIComponent(u.username)===role,'RUNTIME_ROLE_OR_DATABASE');}
 need(registry.chainId===84532&&registry.operator.toLowerCase()===profile.identity.operator.toLowerCase()&&registry.contracts.ZeeSwapSettlement.address.toLowerCase()===profile.identity.settlement.toLowerCase()&&registry.contracts.MockUSDC.address.toLowerCase()===profile.identity.token.toLowerCase(),'REGISTRY_IDENTITY');
 need(opening.version===1&&opening.branchId===profile.identity.branchId&&opening.database===profile.identity.database&&opening.binding.sourceFingerprint===profile.identity.sourceFingerprint&&opening.binding.registrySha256===profile.immutable.registry.sha256,'ORIGINAL_OPENING_BINDING');
 need(binding.ledgerOpeningProofSha256===profile.immutable.openingProof.sha256&&binding.chefOpeningProofSha256===profile.immutable.chefOpeningProof.sha256&&binding.ufvkSha256===profile.immutable.operatorUfvk.sha256&&binding.sourceFingerprint===profile.identity.sourceFingerprint&&binding.chefAccountId===profile.identity.chefAccountId,'LOGICAL_OPERATOR_BINDING');
 need(linuxRawSha256(immutable.operatorUfvk.toString().trim())===profile.identity.sourceFingerprint,'ACTUAL_UFVK_IDENTITY');
 const keystore=JSON.parse((await readFile(profile.paths.baseKeystore)).toString());need(typeof keystore.address==='string'&&('0x'+keystore.address.replace(/^0x/,'' )).toLowerCase()===profile.identity.operator.toLowerCase(),'OPERATOR_KEYSTORE_IDENTITY');
 return{profile,profileSha256:linuxRawSha256(profileBytes),runtime,registry,opening};
}
export async function verifyLinuxWalletTransport(profile:LinuxOperatorProfile){
 need(profile.transport,'TRANSPORT_INVENTORY_REQUIRED');async function walk(root:string,prefix=''):Promise<string[]>{const result:string[]=[];for(const entry of await readdir(posix.join(root,prefix),{withFileTypes:true})){need(!entry.isSymbolicLink(),'WALLET_TREE_SYMLINK');const relative=posix.join(prefix,entry.name);if(entry.isDirectory())result.push(...await walk(root,relative));else{need(entry.isFile(),'WALLET_TREE_SPECIAL_FILE');result.push(relative);}}return result.sort();}for(const tree of profile.transport.walletTrees){need(JSON.stringify(await walk(tree.path))===JSON.stringify(tree.files.map(f=>f.relative).sort()),'WALLET_TREE_EXTRA_OR_MISSING_FILES');for(const f of tree.files){const p=posix.join(tree.path,f.relative);linuxPath(p,tree.path);const info=await lstat(p);need(info.isFile()&&!info.isSymbolicLink()&&info.size===f.bytes&&await realpath(p)===p,'WALLET_COPY_FILE_OR_SYMLINK');need(linuxRawSha256(await readFile(p))===f.sha256,'WALLET_COPY_BYTES_CHANGED');}}
 // Wallet copy hashes are a handoff-only check. Runtime identity checks above
 // intentionally permit later valid allocator/sync/settlement state changes.
}
