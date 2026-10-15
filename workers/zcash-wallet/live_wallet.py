"""Local pipe adapter: validates/allocates receivers and emits real view-only scans.
Never expose this command or its output as a public HTTP endpoint.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import traceback


class CompletedReadOnlyProviderWait(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


class ScannerState:
    def __init__(self):
        self.phase = 'CONFIG_READ'
        self.code = 'READ_ONLY_SCANNER_FAILED_RECONCILE'
        self.command = 'UNKNOWN'
        self.uncertain = False
        self.sdk_active = False
        self.lock_released = False
        self.diagnostic_path = None
        self.rpc_status = None

    def rpc(self, grpc, phase, call):
        self.phase = phase
        try:
            return call()
        except grpc.RpcError as error:
            code = error.code()
            statuses = ('OK', 'CANCELLED', 'UNKNOWN', 'INVALID_ARGUMENT', 'DEADLINE_EXCEEDED', 'NOT_FOUND',
                        'ALREADY_EXISTS', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION',
                        'ABORTED', 'OUT_OF_RANGE', 'UNIMPLEMENTED', 'INTERNAL', 'UNAVAILABLE', 'DATA_LOSS', 'UNAUTHENTICATED')
            self.rpc_status = code.name if code.name in statuses else 'UNKNOWN'
            if code in (grpc.StatusCode.UNAVAILABLE, grpc.StatusCode.DEADLINE_EXCEEDED):
                raise CompletedReadOnlyProviderWait('GRPC_' + code.name) from None
            self.code = 'GRPC_OTHER_RECONCILE'
            raise

    def envelope(self, error):
        waiting = (isinstance(error, CompletedReadOnlyProviderWait)
                   and self.command == 'snapshot' and not self.uncertain
                   and not self.sdk_active and self.lock_released
                   and self.phase in ('LIGHTD_INFO', 'SCAN_TIP', 'RECONCILIATION_BLOCK', 'RECEIPT_BLOCK', 'RECEIPT_TRANSACTION')
                   and error.code in ('GRPC_UNAVAILABLE', 'GRPC_DEADLINE_EXCEEDED'))
        return {'version': 1, 'status': 'WALLET_READ_ONLY_WAIT' if waiting else 'WALLET_READ_ONLY_ERROR',
                'command': self.command, 'phase': self.phase,
                'code': error.code if waiting else self.code,
                'uncertain': self.uncertain, 'lockReleased': self.lock_released,
                'processCompleted': True}


def private_diagnostic(state, error, envelope):
    if state.diagnostic_path is None:
        return
    frames = traceback.extract_tb(error.__traceback__)
    value = {**envelope, 'observedAt': datetime.now(timezone.utc).isoformat(),
             'frames': [{'file': Path(frame.filename).name, 'line': frame.lineno,
                         'function': frame.name} for frame in frames[-8:]]}
    classes = ('RuntimeError', 'ValueError', 'TypeError', 'FileExistsError', 'PermissionError',
               'TimeoutExpired', 'OSError', 'CompletedReadOnlyProviderWait', 'JSONDecodeError')
    value['exceptionClass'] = type(error).__name__ if type(error).__name__ in classes else 'Other'
    if state.rpc_status is not None:
        value['rpcStatus'] = state.rpc_status
    # No exception message, command arguments, provider URL, raw bytes, key,
    # receiver or memo is included. This path is beside the private sentinel.
    path = state.diagnostic_path
    temporary = path.with_name(path.name + '.tmp.' + str(os.getpid()))
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(value, stream, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def main(state):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config',type=Path,required=True)
    args=parser.parse_args()
    config=json.loads(args.config.read_text())
    state.diagnostic_path=Path(config['lockPath']+'.diagnostic.private.json')
    state.phase='REQUEST_READ'
    request=json.loads(sys.stdin.read(8192))
    state.command=request.get('command') if request.get('command') in ('validate','allocate','snapshot') else 'UNKNOWN'
    def run(command,payload=None,phase='SDK_COMMAND'):
        state.phase=phase
        state.sdk_active=True
        try:
            result=subprocess.run(command,input=json.dumps(payload) if payload else None,
                                  capture_output=True,text=True,timeout=180)
        except subprocess.TimeoutExpired:
            state.uncertain=True
            state.code='SDK_TIMEOUT_RECONCILE'
            raise RuntimeError('Timed-out wallet process requires reconciliation')
        except OSError:
            state.code='SDK_START_FAILED_RECONCILE'
            raise
        finally:
            state.sdk_active=False
        if result.returncode or 'error:' in result.stderr.lower():
            state.code='SDK_PROCESS_FAILED_RECONCILE'
            raise RuntimeError('Local wallet operation failed')
        try:return json.loads(result.stdout)
        except (ValueError,TypeError):
            state.code='SDK_OUTPUT_INVALID_RECONCILE'
            raise
    def sdk(payload,phase): return run(config['readCommand'],payload,phase)
    if request.get('command')=='validate':
        print(json.dumps(sdk({'command':'validate','address':request['address']},'VALIDATE_ADDRESS')));return
    if request.get('command') not in ('allocate','snapshot'):
        raise ValueError('Read-only command required')
    lock=Path(config['lockPath']);lock.parent.mkdir(parents=True,exist_ok=True)
    state.phase='LOCK_ACQUIRE'
    try:descriptor=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    except FileExistsError:
        state.code='SCANNER_LOCK_EXISTS_RECONCILE'
        raise
    os.close(descriptor)
    try:
        base=config['cliCommand']+['--chain','testnet','--data-dir',config['walletDir']]
        kind=run(base+['--offline','--nosync','wallet_kind'],phase='WALLET_KIND')
        if kind.get('kind')!='Loaded from unified full viewing key':
            raise RuntimeError('Dedicated viewing-only wallet required')
        if request['command']=='allocate':
            address=run(base+['--offline','--nosync','new_address','o'],phase='ALLOCATE_ADDRESS')
            checked=sdk({'command':'validate','address':address['encoded_address']},'ALLOCATE_VALIDATE')
            print(json.dumps(checked));return

        notes=run(base+['--server','https://testnet.zec.rocks:443','--waitsync','notes','all'],phase='SDK_NOTES')
        status=run(base+['--offline','--nosync','sync','status'],phase='SDK_SCAN_STATUS')
        ranges=status.get('scan_ranges',[])
        if not ranges or any(r['priority']!='Scanned' for r in ranges):
            raise RuntimeError('Incomplete wallet scan')
        scanned=max(int(r['end_block']) for r in ranges)-1
        key=run(base+['--offline','--nosync','export_ufvk'],phase='SDK_VIEWING_KEY')['ufvk']
        state.phase='GRPC_IMPORT'
        sys.path.insert(0,str(Path(config['protoDir']).resolve()))
        import grpc
        import service_pb2 as messages
        import service_pb2_grpc as services
        with grpc.secure_channel('testnet.zec.rocks:443',grpc.ssl_channel_credentials()) as channel:
            service=services.CompactTxStreamerStub(channel)
            info=state.rpc(grpc,'LIGHTD_INFO',lambda:service.GetLightdInfo(messages.Empty(),timeout=20))
            if info.chainName!='test' or info.consensusBranchId.lower()!='77190ad9':
                raise RuntimeError('Unexpected network or consensus branch')
            if info.blockHeight-scanned>6:
                raise RuntimeError('Wallet scan is behind the observed chain tip')
            tip=state.rpc(grpc,'SCAN_TIP',lambda:service.GetBlock(messages.BlockID(height=scanned),timeout=20))
            blocks={scanned:tip}
            checks=request.get('checkHeights',[])+[max(0,scanned-9)]
            if len(checks)>503 or any(type(h) is not int or h<0 for h in checks):
                raise ValueError('Invalid reconciliation heights')
            for height in checks:
                # A provider or SDK can temporarily lag a persisted checkpoint.
                # Do not advertise blocks the wallet has not scanned. The DB
                # publisher returns WAIT without renewing its old checkpoint.
                if height>scanned:continue
                if height not in blocks:blocks[height]=state.rpc(grpc,'RECONCILIATION_BLOCK',lambda:service.GetBlock(messages.BlockID(height=height),timeout=20))
            received={}
            for pool in ('ironwood','orchard','sapling'):
                for note in notes.get(pool+'_notes',{}).get('note_summaries',[]):
                    match=re.fullmatch(r'confirmed at block height (\d+)',note['status'])
                    if note['scope']=='external' and match:
                        received[note['txid']]=int(match.group(1))
            outputs=[]
            for txid,height in received.items():
                if height>scanned:continue
                if height not in blocks:blocks[height]=state.rpc(grpc,'RECEIPT_BLOCK',lambda:service.GetBlock(messages.BlockID(height=height),timeout=20))
                block=blocks[height]
                if not any(bytes(tx.txid)[::-1].hex()==txid for tx in block.vtx):
                    raise RuntimeError('Receipt not present in canonical compact block')
                raw=state.rpc(grpc,'RECEIPT_TRANSACTION',lambda:service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(txid)[::-1]),timeout=20))
                if raw.height!=height:raise RuntimeError('Conflicting mined height')
                decoded=sdk({'command':'decrypt','ufvk':key,'raw_hex':raw.data.hex(),'txid':txid,'height':height},'DECRYPT_OUTPUT')
                for note in decoded['notes']:
                    outputs.append({**note,'height':height,'blockHash':bytes(block.hash)[::-1].hex(),
                                    'blockTime':datetime.fromtimestamp(block.time,timezone.utc).isoformat()})
            del key
            state.phase='SNAPSHOT_EMIT'
            print(json.dumps({'schemaVersion':1,'network':'zcash-testnet','consensusBranch':'77190ad9',
                'observedAt':datetime.now(timezone.utc).isoformat(),'scannedHeight':scanned,
                'tipHash':bytes(tip.hash)[::-1].hex(),
                'blocks':[{'height':h,'hash':bytes(b.hash)[::-1].hex(),
                           'time':datetime.fromtimestamp(b.time,timezone.utc).isoformat()} for h,b in blocks.items()],
                'outputs':outputs}))
    finally:
        if not state.uncertain:
            try:lock.unlink();state.lock_released=True
            except OSError:
                state.phase='LOCK_RELEASE';state.code='SCANNER_LOCK_RELEASE_FAILED_RECONCILE'
                raise


def entrypoint():
    state=ScannerState()
    try:main(state);return 0
    except Exception as error:
        envelope=state.envelope(error)
        try:private_diagnostic(state,error,envelope)
        except Exception:pass
        print(json.dumps(envelope))
        print('Read-only wallet adapter failed; no checkpoint published',file=sys.stderr)
        return 75 if envelope['status']=='WALLET_READ_ONLY_WAIT' else 1


if __name__=='__main__':
    sys.exit(entrypoint())
