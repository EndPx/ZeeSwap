"""PRIVATE USER exact raw preparation. No broadcast API; existing intent forbids signing again."""
import argparse,fcntl,hashlib,json,os,re,subprocess,sys
from pathlib import Path
NS='market-user-circle-20261027-r1';HOME=None;JOURNAL=None;CAST=None;PAYER=None;TOKEN=None;SETTLEMENT=None;RPC='https://base-sepolia-rpc.publicnode.com'

def need(v,c):
    if not v:raise ValueError(c)
def sha(b):return hashlib.sha256(b).hexdigest()
def fresh(path,value):
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
    d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(d)
    finally:os.close(d)
def validate(c,r):
    global HOME,JOURNAL,CAST,PAYER,TOKEN,SETTLEMENT
    HOME=Path(c['actorHome']);JOURNAL=HOME/'evm';CAST=c['cast'];PAYER=c['payer'].lower();TOKEN=c['token'].lower();SETTLEMENT=c['settlement'].lower()
    g=c.get('guardCommand',[]);need(len(g)==6 and g[1]=='--import' and g[4]=='guard-reverse' and g[3].replace('\\','/').endswith('/api/scripts/market-user-circle.mjs') and g[5].replace('\\','/').endswith('/'+NS+'/user-actor.config.private.json'),'FIXED_REVERSE_GUARD')
    need(c.get('namespace')==NS and HOME.is_absolute() and HOME.name==NS and Path(CAST).is_absolute() and 'g5' not in c.get('account','').lower() and Path(c['passwordFile']).is_absolute() and c.get('rpcUrl')==RPC and all(re.fullmatch('0x[a-f0-9]{40}',v) and v!='0x'+'0'*40 for v in (PAYER,TOKEN,SETTLEMENT)),'ROOT_ACTOR_SCOPE')
    need(r.get('namespace')==NS and r.get('kind') in ('approve','fund') and type(r.get('nonce')) is int and 0<=r['nonce']<2**53 and r.get('payer','').lower()==PAYER and r.get('to','').lower()==(TOKEN if r['kind']=='approve' else SETTLEMENT) and r.get('gas')=='450000' and r.get('gasPrice')=='20000000' and r.get('value')=='0' and r.get('maxFeeWei')=='10000000000000' and re.fullmatch('0x[0-9a-f]+',r.get('data','')),'EXACT_USER_RAW_REQUEST')
    funding=r.get('funding',{});terms=funding.get('terms',{})
    need(funding.get('network')=='base-sepolia' and funding.get('chainId')==84532 and funding.get('contract','').lower()==SETTLEMENT and funding.get('token','').lower()==TOKEN and terms.get('amount')=='1000000' and terms.get('payer','').lower()==PAYER and terms.get('refundRecipient','').lower()==PAYER and terms.get('token','').lower()==TOKEN,'EXACT_ACCEPTED_FUNDING_TUPLE')
    actual=hashlib.sha256(json.dumps(funding,sort_keys=True,separators=(',',':')).encode()).hexdigest();need(r.get('requestDigest')==actual,'ACTUAL_FUNDING_DIGEST')
    approve='0x095ea7b3'+SETTLEMENT[2:].rjust(64,'0')+format(1000000,'064x')
    need(r['data']==(approve if r['kind']=='approve' else funding.get('calldata')),'EXACT_APPROVAL_OR_FUND_CALL')
def prepare(c,r,pin,cast,recover=False):
    validate(c,r);path=JOURNAL/(r['kind']+'-nonce-intent.private.json');rawpath=JOURNAL/(r['kind']+'-original.raw.private')
    if path.exists():
        old=json.loads(path.read_text());need(old=={'version':1,'requestSha256':pin,'request':r},'ORIGINAL_NONCE_INTENT_CHANGED')
        need(recover,'PREVIOUS_SIGN_INTENT_RECOVER_RAW_ONLY')
    else:
        need(not recover and not rawpath.exists(),'NO_ORIGINAL_RAW_TO_RECOVER')
        need(cast('chain-id','--rpc-url',RPC)=='84532' and cast('wallet','address','--account',c['account'],'--password-file',c['passwordFile']).lower()==PAYER,'CHAIN_AND_USER')
        latest=cast('nonce',PAYER,'--block','latest','--rpc-url',RPC);pending=cast('nonce',PAYER,'--block','pending','--rpc-url',RPC)
        need(latest==pending==str(r['nonce']),'EXACT_DYNAMIC_NONCE')
        c['_guard'](r)
        fresh(path,{'version':1,'requestSha256':pin,'request':r})
        # stdout goes directly to an exclusive durable original file. A lost ACK can
        # recover these bytes; missing/partial output never permits another mktx.
        fd=os.open(rawpath,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        d=os.open(JOURNAL,os.O_RDONLY|os.O_DIRECTORY);os.fsync(d);os.close(d)
        with os.fdopen(fd,'wb') as f:
            result=subprocess.run([CAST,'mktx',r['to'],r['data'],'--legacy','--gas-limit','450000','--gas-price','20000000','--nonce',str(r['nonce']),'--chain','84532','--value','0','--rpc-url',RPC,'--account',c['account'],'--password-file',c['passwordFile']],stdout=f,stderr=subprocess.PIPE,timeout=90,pass_fds=(c['_lockFd'],))
            f.flush();os.fsync(f.fileno());d=os.open(JOURNAL,os.O_RDONLY|os.O_DIRECTORY);os.fsync(d);os.close(d);need(result.returncode==0,'ORIGINAL_SIGN_UNKNOWN_RECOVER_ONLY')
    need(rawpath.is_file() and not rawpath.is_symlink() and rawpath.stat().st_size<=2000,'ORIGINAL_RAW_BOUND')
    raw=rawpath.read_text().strip();need(re.fullmatch('0x[0-9a-fA-F]+',raw),'ORIGINAL_RAW_INCOMPLETE_STOP')
    return {'raw':raw,'nonce':r['nonce'],'kind':r['kind'],'requestSha256':pin}
def broadcast_intent(c,r,pin,raw_sha):
    validate(c,r);need(re.fullmatch('[a-f0-9]{64}',raw_sha),'RAW_BROADCAST_PIN')
    intent=json.loads((JOURNAL/(r['kind']+'-nonce-intent.private.json')).read_text());need(intent=={'version':1,'requestSha256':pin,'request':r},'ORIGINAL_NONCE_INTENT_CHANGED')
    rawpath=JOURNAL/(r['kind']+'-original.raw.private');need(rawpath.is_file() and not rawpath.is_symlink() and rawpath.stat().st_size<=2000,'ORIGINAL_RAW_BOUND')
    raw=rawpath.read_text().strip();need(re.fullmatch('0x(?:[0-9a-fA-F]{2})+',raw) and sha(bytes.fromhex(raw[2:]))==raw_sha,'ORIGINAL_RAW_BROADCAST_CHANGED')
    c['_guard'](r)
    marker=JOURNAL/(r['kind']+'-broadcast-unknown.private.json');need(not marker.exists(),'DURABLE_BROADCAST_INTENT_RECONCILE_ONLY')
    fresh(marker,{'version':1,'namespace':NS,'requestSha256':pin,'rawSha256':raw_sha,'nonce':r['nonce'],'kind':r['kind'],'broadcastOutcome':'UNKNOWN'})
    return {'status':'DURABLE_BASE_BROADCAST_INTENT','requestSha256':pin,'rawSha256':raw_sha,'nonce':r['nonce'],'kind':r['kind']}

def main():
    p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--config',required=True);p.add_argument('--config-sha256',required=True);p.add_argument('--request',required=True);p.add_argument('--request-sha256',required=True);p.add_argument('--actor-config-sha256',required=True);p.add_argument('--broadcast-intent',action='store_true');p.add_argument('--raw-sha256');p.add_argument('--recover',action='store_true');p.add_argument('--owned-child',action='store_true');a=p.parse_args();os.umask(0o077)
    import pwd
    need(sys.platform.startswith('linux') and os.getuid()==pwd.getpwnam('albary').pw_uid,'USER_WSL_ONLY')
    if not a.owned_child:
        sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'workers/zcash-wallet'))
        from owned_wallet_call import run_owned,OwnedProcessCleanError
        try:result=run_owned([sys.executable,str(Path(__file__).resolve()),*sys.argv[1:],'--owned-child'],'',120)
        except OwnedProcessCleanError:
            print(json.dumps({'status':'OWNED_PROCESS_CLEANED','kind':'base-user','groupReaped':True}),file=sys.stderr);raise
        print(json.dumps({'status':'OWNED_PROCESS_CLEANED','kind':'base-user','groupReaped':True}),file=sys.stderr)
        need(result.returncode==0,'OWNED_BASE_USER_REFUSED');sys.stdout.write(result.stdout);return
    cb=Path(a.config).read_bytes();rb=Path(a.request).read_bytes();need(sha(cb)==a.config_sha256 and sha(rb)==a.request_sha256,'EXACT_PRIVATE_PINS');c=json.loads(cb);r=json.loads(rb);validate(c,r)
    need(sha(Path(sys.executable).read_bytes())==c['pythonSha256'],'PINNED_PYTHON')
    need(sha(Path(CAST).read_bytes())==c['castSha256'] and sha(Path(c['guardCommand'][0]).read_bytes())==c['guardNodeSha256'],'PINNED_CAST_AND_GUARD_NODE');JOURNAL.mkdir(parents=True,mode=0o700,exist_ok=True);need(JOURNAL.resolve()==JOURNAL and JOURNAL.stat().st_mode&0o777==0o700,'PRIVATE_NEW_JOURNAL')
    with open(c['nonceLockPath'],'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);c['_lockFd']=lock.fileno()
        def cast(*args):
            result=subprocess.run([CAST,*args],capture_output=True,text=True,timeout=30,check=True,pass_fds=(lock.fileno(),));need(len(result.stdout)<=1048576,'READ_BOUND');return result.stdout.strip()
        def guard(request):
            result=subprocess.run(c['guardCommand']+[a.actor_config_sha256],capture_output=True,text=True,timeout=30,check=True,pass_fds=(lock.fileno(),));need(len(result.stdout)<=8192,'GUARD_BOUND')
            actual=json.loads(result.stdout);need(actual=={'authorized':True,'namespace':NS,'orderId':request['orderId'],'policySha256':request['policySha256'],'activeEpoch':request['activeEpoch'],'requestDigest':request['requestDigest']},'CURRENT_OWN_REVERSE_POLICY_GUARD')
        c['_guard']=guard
        need(not(a.recover and a.broadcast_intent),'EXPLICIT_SEPARATE_STEP')
        if a.broadcast_intent:print(json.dumps(broadcast_intent(c,r,a.request_sha256,a.raw_sha256)))
        else:print(json.dumps(prepare(c,r,a.request_sha256,cast,a.recover)))
if __name__=='__main__':
    try:main()
    except BaseException:print('PUBLIC_USER_BASE_STOP_RECOVER_ORIGINAL_RAW_ONLY',file=sys.stderr);sys.exit(1)
