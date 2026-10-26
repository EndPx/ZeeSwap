"""PRIVATE one-order USER payer. Existing wallet kernels, new policy namespace only."""
import argparse,hashlib,json,os,re,sys,subprocess
from pathlib import Path
REPO=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(REPO/'workers/zcash-wallet'))
from live_payer_send import Payer,approved_capital_matches
from prepared_raw import durable
NS='market-user-circle-20261027-r1'
WALLET=None
HOME=None

def need(v,c):
    if not v:raise ValueError(c)
def digest(v):return hashlib.sha256(json.dumps(v,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def validate_request(r,pin):
    need(digest(r)==pin and r.get('version')==1 and r.get('profile')==NS and r.get('branchId')=='br-broad-pine-ao79wemx' and r.get('amountZatoshi')=='100000' and r.get('maxFeeZatoshi')=='10000','EXACT_NEW_USER_REQUEST')
    need(re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',r.get('orderId','')) and re.fullmatch('[a-f0-9]{64}',r.get('policySha256','')) and re.fullmatch('[1-9][0-9]*',r.get('activeEpoch','')) and type(r.get('cutoffHeight')) is int and type(r.get('acceptedSourceHeight')) is int and r['cutoffHeight']==r['acceptedSourceHeight']+40,'ACCEPTED_POLICY_CUTOFF')
    memo=json.loads(r['memo']);need(set(memo)=={'v','ref'} and type(memo['v']) is int and memo['v']==1 and re.fullmatch('[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}',memo['ref']) and json.dumps(memo,separators=(',',':'))==r['memo'],'CANONICAL_MEMO')
    return r

def require_lead(cutoff,height):need(type(height) is int and height>0 and 12<=cutoff-height<=40,'TWELVE_BLOCK_SOURCE_LEAD')
def require_broadcast_state(state):need(state=='PREPARED','ORIGINAL_UNKNOWN_BROADCAST_RECONCILE_ONLY')
class PolicyPayer(Payer):
    def __init__(self,c,request,pin,actor_sha):
        global WALLET, HOME
        WALLET=c.get('walletDir');HOME=Path(c['actorHome'])
        need(c.get('version')==1 and c.get('namespace')==NS and isinstance(WALLET,str) and Path(WALLET).is_absolute() and 'zeeswap-g5' not in WALLET and HOME.is_absolute() and HOME.name==NS,'ISOLATED_ACTOR_PATHS')
        need(len(c.get('cliCommand',[]))==1 and len(c.get('readCommand',[]))==1 and len(c.get('verifyCommand',[]))==1,'PINNED_ACTOR_COMMANDS')
        g=c.get('guardCommand',[]);need(len(g)==6 and g[1]=='--import' and g[4]=='guard-forward' and g[3].replace('\\','/').endswith('/api/scripts/market-user-circle.mjs') and g[5].replace('\\','/').endswith('/'+NS+'/user-actor.config.private.json'),'FIXED_READONLY_GUARD')
        self.c=c;self.request=validate_request(request,pin);self.c['approvedDigest']=pin
        self.path=Path(c['journalPath']);need(self.path==HOME/'native-payer.private.json' and self.path.parent.resolve()==self.path.parent,'NEW_USER_JOURNAL_ONLY')
        need(len(c['approvedFundingNotes'])>0 and sum(int(n['value']) for n in c['approvedFundingNotes'])>=110000 and approved_capital_matches(c['approvedFundingNotes'],c['approvedFundingNotes']),'TWO_EXACT_POST_REFUND_NOTES')
        self.base=c['cliCommand']+['--chain','testnet','--data-dir',WALLET];self.actor_sha=actor_sha
    def policy_guard(self):
        command=self.c['guardCommand']+[self.actor_sha]
        result=super().run(command,timeout=30)
        need(result=={'authorized':True,'namespace':NS,'orderId':self.request['orderId'],'policySha256':self.request['policySha256'],'activeEpoch':self.request['activeEpoch'],'requestDigest':self.c['approvedDigest']},'CURRENT_OWN_POLICY_GUARD')
    def current_tip(self):
        sys.path.insert(0,self.c['protoDir']);import grpc;import service_pb2 as msg;import service_pb2_grpc as svc
        with grpc.secure_channel('testnet.zec.rocks:443',grpc.ssl_channel_credentials()) as channel:
            service=svc.CompactTxStreamerStub(channel);info=service.GetLightdInfo(msg.Empty(),timeout=20);need(info.chainName=='test' and info.consensusBranchId.lower()=='77190ad9','TESTNET_ONLY');return service.GetLatestBlock(msg.ChainSpec(),timeout=20).height
    def input_canonical(self):
        # The initial actual USER warm proof binds both old change and returned principal.
        warm_raw=Path(self.c['warmProof']['path']).read_bytes();need(hashlib.sha256(warm_raw).hexdigest()==self.c['warmProof']['sha256'],'USER_WARM_RAW_PIN')
        warm=json.loads(warm_raw);need(warm.get('status')=='ROOT_MARKET_ACTOR_IDENTITY_CAPITAL_VERIFIED' and warm.get('namespace')==NS and warm.get('nonG5') is True and warm.get('originalJournalsClosed') is True and warm.get('walletDir')==WALLET and warm.get('ufvkSha256')==self.c['ufvkSha256'] and int(warm.get('capitalBalanceZatoshi','0'))>=110000 and warm.get('pendingCalculatedCount')==0 and warm.get('transactionsCreated',0)==0,'INITIAL_USER_WARM')
        expected=warm['expectedProvenance'];need(len(expected)>0 and approved_capital_matches([{k:n[k] for k in ('pool','txid','index','value')} for n in expected],self.c['approvedFundingNotes']),'USER_INPUT_PROVENANCE')
        sys.path.insert(0,self.c['protoDir']);import grpc;import service_pb2 as msg;import service_pb2_grpc as svc
        key=Path(self.c['ufvkFile']).read_text().strip();need(hashlib.sha256(key.encode()).hexdigest()==self.c['ufvkSha256'],'SAME_USER_UFVK')
        with grpc.secure_channel('testnet.zec.rocks:443',grpc.ssl_channel_credentials()) as channel:
            service=svc.CompactTxStreamerStub(channel);tip=service.GetLatestBlock(msg.ChainSpec(),timeout=20).height
            for note in expected:
                raw=service.GetTransaction(msg.TxFilter(hash=bytes.fromhex(note['txid'])[::-1]),timeout=20);block=service.GetBlock(msg.BlockID(height=note['height']),timeout=20)
                need(raw.height==note['height'] and bytes(block.hash)[::-1].hex()==note['blockHash'] and tip-note['height']+1>=10 and any(bytes(t.txid)[::-1].hex()==note['txid'] for t in block.vtx),'CURRENT_INPUT_CANONICAL')
                decoded=self.sdk({'command':'decrypt_own_change' if note['ownChange'] else 'decrypt','ufvk':key,'raw_hex':raw.data.hex(),'txid':note['txid'],'height':note['height']})
                matches=[n for n in decoded['notes'] if n['pool']=='ironwood' and n['txid']==note['txid'] and n['index']==note['index'] and n['amount']==note['value'] and n['shieldedSource'] is True and n['receiver']==note['receiver']]
                need(len(matches)==1 and service.GetBlock(msg.BlockID(height=note['height']),timeout=20).hash==block.hash,'ACTUAL_USER_INPUT_DECRYPT_RECHECK')
        del key
    def run(self,command,payload=None,timeout=180):
        # This hook runs AFTER the inherited full SDK sync, directly before calculate.
        if command==self.base+['--nosync','--server','https://testnet.zec.rocks:443','calculate',self.request['recipient'],'100000',self.request['memo']]:
            self.input_canonical();self.policy_guard();require_lead(self.request['cutoffHeight'],self.current_tip())
        return super().run(command,payload,timeout)
    def incoming(self,txid,amount):
        need(re.fullmatch('[a-f0-9]{64}',txid) and re.fullmatch('[1-9][0-9]*',amount) and 10000<=int(amount)<=10000000,'EXACT_INCOMING_SELECTOR');g=list(self.c['guardCommand']);g[4]='guard-incoming';reply=super().run(g+[self.actor_sha],timeout=30);need(reply.get('authorized') is True and reply.get('namespace')==NS and reply.get('txid')==txid and reply.get('amountZatoshi')==amount and reply.get('receiver')==self.c['payerReceiver'],'ROOT_BOUND_INCOMING');sys.path.insert(0,self.c['protoDir']);import grpc;import service_pb2 as msg;import service_pb2_grpc as svc
        key=Path(self.c['ufvkFile']).read_text().strip();need(hashlib.sha256(key.encode()).hexdigest()==self.c['ufvkSha256'],'SAME_USER_UFVK')
        with grpc.secure_channel('testnet.zec.rocks:443',grpc.ssl_channel_credentials()) as channel:
            service=svc.CompactTxStreamerStub(channel);info=service.GetLightdInfo(msg.Empty(),timeout=20);need(info.chainName=='test' and info.consensusBranchId.lower()=='77190ad9','TESTNET_ONLY');tip=service.GetLatestBlock(msg.ChainSpec(),timeout=20).height
            raw=service.GetTransaction(msg.TxFilter(hash=bytes.fromhex(txid)[::-1]),timeout=20);need(0<raw.height<=tip and tip-raw.height+1>=10,'ACTUAL_INCOMING_TEN_CONFIRMATIONS');block=service.GetBlock(msg.BlockID(height=raw.height),timeout=20);need(any(bytes(t.txid)[::-1].hex()==txid for t in block.vtx),'INCOMING_CANONICAL_INCLUSION')
            decoded=self.sdk({'command':'decrypt','ufvk':key,'raw_hex':raw.data.hex(),'txid':txid,'height':raw.height});canonical=self.sdk({'command':'validate','address':self.c['payerReceiver']})
            matches=[n for n in decoded['notes'] if n['txid']==txid and n['pool']=='ironwood' and n['amount']==amount and n['shieldedSource'] is True and not n.get('ownChange',False) and self.sdk({'command':'validate','address':n['receiver']})==canonical]
            need(len(matches)==1 and service.GetBlock(msg.BlockID(height=raw.height),timeout=20).hash==block.hash,'EXACT_USER_REVERSE_INCOMING')
            return {'status':'USER_REVERSE_SOURCE_FINALIZED','txid':txid,'amountZatoshi':amount,'height':raw.height,'blockHash':bytes(block.hash)[::-1].hex(),'confirmations':tip-raw.height+1,'confirmed':True}
    def execute(self,command):
        if command=='prepare':self.policy_guard()
        if command!='broadcast':return super().execute(command)
        intent=json.loads(self.path.read_text());need(intent.get('approvedDigest')==self.c['approvedDigest'] and intent.get('request')==self.request,'ORIGINAL_REQUEST_BINDING');require_broadcast_state(intent.get('state'))
        tip=self.current_tip();prepared=self.verify({'version':'zeeswap_prepared_v1','transactions':[intent['prepared']]},intent,tip,False)
        self.policy_guard();tip=self.current_tip();require_lead(self.request['cutoffHeight'],tip);need(int(prepared['expiryHeight'])>=tip+20,'ORIGINAL_EXPIRY_SAFE')
        sys.path.insert(0,self.c['protoDir']);import grpc;import service_pb2 as msg;import service_pb2_grpc as svc
        durable(self.path,{**intent,'state':'BROADCAST_UNKNOWN'})
        with grpc.secure_channel('testnet.zec.rocks:443',grpc.ssl_channel_credentials()) as channel:
            result=svc.CompactTxStreamerStub(channel).SendTransaction(msg.RawTransaction(data=bytes.fromhex(prepared['rawTransaction'])),timeout=30)
        need(result.errorCode==0,'ORIGINAL_BROADCAST_UNKNOWN_NO_RESEND');durable(self.path,{**intent,'state':'BROADCAST_ACKNOWLEDGED'})
        return {'status':'PAYER_BROADCAST_ACKNOWLEDGED','txid':prepared['txid'],'amountZatoshi':'100000','feeZatoshi':'10000'}

def main():
    import fcntl
    p=argparse.ArgumentParser(allow_abbrev=False);p.add_argument('--config',required=True);p.add_argument('--config-sha256',required=True);p.add_argument('--approved-request',required=True);p.add_argument('--approved-digest',required=True);p.add_argument('--actor-config-sha256',required=True);p.add_argument('--command',required=True,choices=['prepare','recover','broadcast','receipt','incoming']);p.add_argument('--incoming-txid');p.add_argument('--incoming-amount');p.add_argument('--owned-child',action='store_true');a=p.parse_args();os.umask(0o077)
    import pwd
    need(sys.platform.startswith('linux') and os.getuid()==pwd.getpwnam('albary').pw_uid,'ACTUAL_USER_ONLY')
    if not a.owned_child:
        from owned_wallet_call import run_owned,OwnedProcessCleanError
        try:result=run_owned([sys.executable,str(Path(__file__).resolve()),*sys.argv[1:],'--owned-child'],'',690 if a.command=='prepare' else 175)
        except OwnedProcessCleanError:
            print(json.dumps({'status':'OWNED_PROCESS_CLEANED','kind':'native','groupReaped':True}),file=sys.stderr);raise
        print(json.dumps({'status':'OWNED_PROCESS_CLEANED','kind':'native','groupReaped':True}),file=sys.stderr)
        need(result.returncode==0,'OWNED_PAYER_REFUSED');sys.stdout.write(result.stdout);return
    raw=Path(a.config).read_bytes();need(hashlib.sha256(raw).hexdigest()==a.config_sha256,'PRIVATE_CONFIG_PIN');c=json.loads(raw)
    need(hashlib.sha256(Path(sys.executable).read_bytes()).hexdigest()==c['pythonSha256'],'PINNED_PYTHON')
    # Every executable and reused kernel is pinned; no caller arbitrary command is accepted.
    expected={str(Path(__file__).resolve()),str(REPO/'workers/zcash-wallet/live_payer_send.py'),str(REPO/'workers/zcash-wallet/prepared_raw.py'),str(REPO/'workers/zcash-wallet/outgoing_recovery.py'),str(REPO/'workers/zcash-wallet/owned_wallet_call.py'),*c['cliCommand'],*c['readCommand'],*c['verifyCommand'],c['guardCommand'][0]}
    need(expected <= {p['path'] for p in c['codePins']},'COMPLETE_USER_KERNEL_CODE_PINS')
    need(next(p['sha256'] for p in c['codePins'] if p['path']==c['guardCommand'][0])==c['guardNodeSha256'],'PINNED_USER_GUARD_EXECUTABLE')
    for pin in c['codePins']:
        path=Path(pin['path']);need(path.is_file() and path.resolve()==path and hashlib.sha256(path.read_bytes()).hexdigest()==pin['sha256'],'USER_CODE_PIN')
    payer=PolicyPayer(c,json.loads(Path(a.approved_request).read_text()),a.approved_digest,a.actor_config_sha256)
    payer.path.parent.mkdir(mode=0o700,exist_ok=True);need(payer.path.parent.stat().st_uid==os.getuid() and payer.path.parent.stat().st_mode&0o777==0o700,'PRIVATE_USER_NAMESPACE')
    with open(c['lockPath'],'a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);payer.lock_fd=lock.fileno();print(json.dumps(payer.incoming(a.incoming_txid,a.incoming_amount) if a.command=='incoming' else payer.execute(a.command)))
if __name__=='__main__':
    try:main()
    except BaseException:print('PUBLIC_SERVICE_USER_STOP_RECONCILE_ORIGINAL_JOURNAL',file=sys.stderr);sys.exit(1)
