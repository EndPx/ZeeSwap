"""Fixed R4 original-byte recovery proof. Never prepares or broadcasts.

The operator invokes this only while the core incident and reconciliation are
latched. The existing adapter performs independent Rust verification and incoming
recipient-key decryption. Its recover path exports the original durable SDK
calculation and may persist PREPARED; it never calculates another transaction.
All output is private and must be consumed by the narrow TS recovery operator.
"""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'workers' / 'zcash-wallet'))
from prepared_raw import Adapter

PINS = {
    'cliCommand': 'ef1cbce8186feb852388cf56bb412a28285d57a75041d25efab1f74b9ef6b5d1',
    'verifyCommand': 'df9ac9a919bea5f02c2609292478a9c4b25e52dbe67c168e2405b517a71936e2',
    'readCommand': 'fda8623aa1ad759976865e45bca797f50fd7cd45fe8730cf4abf03527ae3aba1',
}


def validate_original(config, request, marker, journal, prepared=None):
    if (marker.get('version') != 1 or marker.get('boundary') != 'SDK_DURABLE_BEFORE_ADAPTER_PREPARED'
            or marker.get('orderId') != request['orderId'] or marker.get('approvedDigest') != config['approvedDigest']
            or journal.get('state') not in ('SIGNING_INTENT', 'PREPARED')
            or journal.get('request') != request or journal.get('approvedDigest') != config['approvedDigest']
            or journal.get('capitalNotes') != config['approvedCapitalNotes']
            or len(config['approvedCapitalNotes']) != 1 or config['approvedCapitalNotes'][0]['value'] != '110000'
            or request.get('amountZatoshi') != '100000' or request.get('maxFeeZatoshi') != '10000'):
        raise ValueError('Original approved R4 durable intent required')
    if prepared is not None:
        if (prepared.get('txid') != marker['txid']
                or hashlib.sha256(bytes.fromhex(prepared['rawTransaction'])).hexdigest() != marker['rawSha256']
                or prepared.get('feeZatoshi') != '10000' or prepared.get('selectedNotes') != config['approvedCapitalNotes']
                or any(o.get('ownChange') is True and o.get('amount') != '0' for o in prepared['outputs'])):
            raise ValueError('Original marker bytes and exact funded capital required')


def require_not_found(adapter, marker):
    import grpc
    channel, service, messages = adapter.network()
    try:
        try:
            service.GetTransaction(messages.TxFilter(hash=bytes.fromhex(marker['txid'])[::-1]), timeout=20)
        except grpc.RpcError as error:
            if error.code() == grpc.StatusCode.NOT_FOUND:
                tip = service.GetLatestBlock(messages.ChainSpec(), timeout=20).height
                return tip
            raise
        raise ValueError('Fault transaction already known; separate original transaction reconciliation required')
    finally:
        channel.close()


def verify_zero_change(adapter, prepared, tip):
    key = adapter.run(adapter.base + ['--offline', '--nosync', 'export_ufvk'])['ufvk']
    if hashlib.sha256(key.encode()).hexdigest() != adapter.config['capitalUfvkSha256']:
        raise ValueError('Original capital incoming viewing identity required')
    decoded = adapter.sdk({'command': 'decrypt_own_change', 'ufvk': key, 'raw_hex': prepared['rawTransaction'],
                           'txid': prepared['txid'], 'height': tip})
    del key
    own = [o for o in prepared['outputs'] if o.get('ownChange') is True]
    notes = decoded.get('notes', [])
    if len(own) != 1 or len(notes) != 1:
        raise ValueError('Exact authenticated internal zero change required')
    out, note = own[0], notes[0]
    if (out['amount'] != '0' or note.get('amount') != '0' or note.get('txid') != prepared['txid']
            or note.get('pool') != 'ironwood' or note.get('index') != out['index']
            or note.get('ownChange') is not True or note.get('shieldedSource') is not True
            or adapter.sdk({'command': 'validate', 'address': note['receiver']}) != adapter.sdk({'command': 'validate', 'address': out['recipient']})):
        raise ValueError('Actual original zero ciphertext does not match SDK output')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    if args.config.resolve() != Path('/home/albary/zeeswap-g5-retry/order-04/prepared.json'):
        raise ValueError('Fixed fourth reverse wallet configuration required')
    config = json.loads(args.config.read_text())
    for name, expected in PINS.items():
        command = config[name]
        if len(command) != 1 or hashlib.sha256(Path(command[0]).read_bytes()).hexdigest() != expected:
            raise ValueError('Pinned SDK and independent verifier binaries required')
    with open(config['lockPath'], 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adapter = Adapter(config)
        adapter.lock_fd = lock.fileno()
        marker_path = Path(config['journalPath'] + '.g5-sdk-crash.private.json')
        marker_bytes = marker_path.read_bytes()
        marker = json.loads(marker_bytes)
        original = json.loads(adapter.path.read_text())
        validate_original(config, adapter.request, marker, original, original.get('prepared'))
        require_not_found(adapter, marker)
        prepared = adapter.execute('recover')
        validate_original(config, adapter.request, marker, json.loads(adapter.path.read_text()), prepared)
        tip = require_not_found(adapter, marker)
        verify_zero_change(adapter, prepared, tip)
        if int(prepared['expiryHeight']) < tip + 20 or marker_path.read_bytes() != marker_bytes:
            raise ValueError('Safe original expiry and unchanged one-shot fault marker required')
        print(json.dumps({'version': 1, 'status': 'G5_ORIGINAL_SDK_FAULT_RECOVERED_NOT_BROADCAST',
                          'prepared': prepared, 'tipHeight': tip, 'marker': marker,
                          'pins': PINS, 'notFound': True}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Original SDK fault proof refused; retain original wallet and journals', file=sys.stderr)
        sys.exit(1)
