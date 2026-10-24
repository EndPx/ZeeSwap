/** Reuses the frozen export implementation with pinned Linux-only inputs. */
import {loadLinuxEnvioProfile} from '../src/linux-envio-profile.ts';
const path=process.argv[2];if(process.argv.length!==3||!path)throw Error('LINUX_ENVIO_EXPLICIT_PROFILE_REQUIRED');
const {profile,source,credential,token}=await loadLinuxEnvioProfile(path);
process.env[source.databaseUrlEnv]=credential.databaseUrl;process.env[source.tokenEnv]=token;
process.argv[2]=profile.exportProfile.path;
await import('./envio-export-server.ts');
