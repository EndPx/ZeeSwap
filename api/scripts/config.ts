import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function config(primary=false): { adminUrl: string; branchId: string; branchName: string; projectId: string } {
  const path = process.env.ZEE_DB_CONFIG || fileURLToPath(new URL(primary?'../../.deploy-local/neon-primary.json':'../../.deploy-local/neon-g2.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function requireDevelopment() {
  const value = config();
  const targets:Record<string,{name:string;host:string}>={
   'br-small-sound-aozx7xa6':{name:'zeeswap-g4-live-reverse',host:'ep-damp-thunder-aorajb6z.c-2.ap-southeast-1.aws.neon.tech'},
   'br-crimson-river-aobpimyq':{name:'zeeswap-g4-live-forward',host:'ep-winter-frog-ao0z5ayy.c-2.ap-southeast-1.aws.neon.tech'},
   'br-wispy-dawn-aorsbba5':{name:'zeeswap-g3-settlement-tests',host:'ep-broad-math-aoxcd482.c-2.ap-southeast-1.aws.neon.tech'},
   'br-solitary-flower-ao8ccjex':{name:'zeeswap-g2-database',host:'ep-small-resonance-aom8dm9z.c-2.ap-southeast-1.aws.neon.tech'},
   'br-muddy-waterfall-aoqd8o9b':{name:'zeeswap-g2-tests',host:'ep-polished-hill-ao5ulo5g.c-2.ap-southeast-1.aws.neon.tech'}
  };
  const target=targets[value.branchId];
  if (value.projectId!=='raspy-truth-63998651' || !target || value.branchName!==target.name || new URL(value.adminUrl).hostname!==target.host)
    throw new Error('This runner is restricted to the dedicated G2 development branch');
  return value;
}

export function requirePrimary() {
 const value=config(true);
 if(value.projectId!=='raspy-truth-63998651' || value.branchId!=='br-empty-meadow-aowxzfl5' || value.branchName!=='production'
    || !new URL(value.adminUrl).hostname.startsWith('ep-billowing-block-aogdpcal.')) throw new Error('Wrong selected primary target');
 return value;
}
