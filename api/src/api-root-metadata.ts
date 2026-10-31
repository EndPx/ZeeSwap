/** API-visible approval metadata only. Signer configs and worker Root files
 * retain their independent secret-file permission checks. */
export function requireApiRootMetadataPermissions(stat:{uid:number;gid:number;mode:number}):void{
 const permissions=stat.mode&0o7777;
 if(!Number.isSafeInteger(stat.uid)||!Number.isSafeInteger(stat.gid)||!Number.isSafeInteger(stat.mode)
  ||stat.uid!==0||stat.gid<0||stat.mode<0
  ||!(permissions===0o600||(permissions===0o640&&stat.gid===978)))throw Error('LINUX_API_FAST_ROOT_METADATA_PERMISSIONS');
}
