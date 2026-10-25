"""LOCAL ext4 journal bridge. Receives no connection string and performs no SQL."""
import hashlib,json,os,pwd,re,sys
from pathlib import Path
ROOT=Path('/home/albary/zeeswap-service-admin-20261026-r1')
NAMES={'installation-intent.private.json','installation-completed.private.json','allocation-intent.private.json','allocation-after.private.json','allocation-completed.private.json','activation-intent.private.json','activation-completed.private.json'}
def need(v):
    if not v:raise ValueError('LOCAL_SERVICE_JOURNAL_REFUSED')
def syncdir(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)
def run(request):
    need(sys.platform.startswith('linux') and os.getuid()==pwd.getpwnam('albary').pw_uid and set(request)=={'version','action','namespace','name','scriptSha256','text'})
    need(type(request['version']) is int and request['version']==1 and request['action'] in ('write','read','exists') and re.fullmatch('[a-z0-9][a-z0-9_-]{0,63}',request['namespace']) and request['name'] in NAMES)
    need(hashlib.sha256(Path(__file__).read_bytes().replace(b'\r\n',b'\n')).hexdigest()==request['scriptSha256'])
    os.umask(0o077)
    if not ROOT.exists():ROOT.mkdir(mode=0o700);syncdir(ROOT.parent)
    need(ROOT.resolve()==ROOT and ROOT.is_dir() and ROOT.stat().st_uid==os.getuid() and ROOT.stat().st_mode&0o777==0o700)
    directory=ROOT/request['namespace']
    if not directory.exists():directory.mkdir(mode=0o700);syncdir(ROOT)
    need(directory.resolve()==directory and directory.is_dir() and directory.stat().st_uid==os.getuid() and directory.stat().st_mode&0o777==0o700)
    path=directory/request['name']
    if request['action']=='write':
        text=request['text'];need(isinstance(text,str) and len(text.encode())<=16000000);value=json.loads(text);need(isinstance(value,dict) and value.get('version')==1)
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as stream:stream.write(text);stream.flush();os.fsync(stream.fileno())
        syncdir(directory)
    if not path.exists():need(request['action']=='exists');return {'exists':False}
    st=path.lstat();need(path.is_file() and not path.is_symlink() and path.resolve()==path and st.st_uid==os.getuid() and st.st_mode&0o777==0o600 and st.st_size<=16000000)
    if request['action']=='exists':return {'exists':True}
    text=path.read_text();return {'sha256':hashlib.sha256(text.encode()).hexdigest(),'text':text}
if __name__=='__main__':
    try:
        raw=sys.stdin.buffer.read(16001000);need(len(raw)<=16000000);print(json.dumps(run(json.loads(raw))))
    except BaseException:print('LOCAL_SERVICE_JOURNAL_STOP_ORIGINAL_ONLY',file=sys.stderr);sys.exit(1)
