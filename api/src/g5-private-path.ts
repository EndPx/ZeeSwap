/** Resolve a native Linux reference beside its actual WSL configuration.
 * Keep the reference in the JSON unchanged: native Python consumes /home paths.
 * The Windows coordinator must access that path through the same distribution.
 */
export function resolveG5ReferencedPrivatePath(configPath:string,reference:string){
 if(typeof configPath!=='string'||typeof reference!=='string')throw Error('G5_PRIVATE_REFERENCE_PATH_REQUIRED');
 const config=configPath.replaceAll('\\','/'),path=reference.replaceAll('\\','/');
 const valid=(p:string)=>{if(p.split('/').some(segment=>segment==='..'||segment==='.'))throw Error('G5_PRIVATE_REFERENCE_TRAVERSAL');};
 valid(config);valid(path);
 const anchor=config.match(/^\/\/(wsl\.localhost|wsl\$)\/([^/]+)(?=\/)/i);
 if(path.startsWith('/')&&!path.startsWith('//')&&!path.startsWith('/mnt/')&&anchor)return `//${anchor[1]}/${anchor[2]}${path}`;
 if(path.startsWith('/')&&!path.startsWith('//'))return path;
 if(/^[A-Za-z]:\//.test(path))return path;
 if(/^\/\/(wsl\.localhost|wsl\$)\/[^/]+\//i.test(path))return path;
 throw Error('G5_PRIVATE_ABSOLUTE_REFERENCE_REQUIRED');
}
