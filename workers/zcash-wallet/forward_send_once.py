"""Bounded first forward testnet payment and read-only operator fee-capital check.

Private configuration uses the existing observer cliCommand/readCommand/protoDir
schema. An existing send journal always refuses a second broadcast, including
uncertain outcomes. This is an operator test harness, not a public wallet API.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def capital_from_notes(notes, tip, held_txids):
    total = held = 0
    found = set()
    for pool in ('ironwood', 'orchard', 'sapling'):
        for note in notes.get(pool + '_notes', {}).get('note_summaries', []):
            if note.get('spend_status') != 'unspent':
                continue
            match = re.fullmatch(r'confirmed at block height (\d+)', note.get('status', ''))
            if not match or tip - int(match.group(1)) + 1 < 10:
                continue
            value = note.get('value')
            if type(value) is not int or value < 0:
                raise ValueError('Invalid atomic note amount')
            total += value
            if note['txid'] in held_txids:
                held += value
                found.add(note['txid'])
    if found != set(held_txids):
        raise ValueError('Every excluded customer transaction must have a confirmed unspent note')
    return {'totalSpendableZatoshis': str(total), 'excludedHeldZatoshis': str(held),
            'operatorFeeCapitalZatoshis': str(total - held)}


def validate_experiment(experiment):
    order = experiment.get('order', {})
    funding = order.get('funding', {})
    if (experiment.get('schemaVersion') != 1 or experiment.get('closed')
            or experiment.get('lastStatus', {}).get('status', 'AWAITING_FUNDS') != 'AWAITING_FUNDS'
            or experiment.get('branchId') != 'br-crimson-river-aobpimyq' or order.get('status') != 'AWAITING_FUNDS'
            or order.get('direction') != 'ZCASH_TO_BASE' or order.get('inputAmount') != '100000'
            or order.get('outputAmount') != '100000' or order.get('executionMode') != 'base-settlement-v1'
            or funding.get('network') != 'zcash-testnet'):
        raise ValueError('Exactly one executable 0.001 TAZ forward order is required')
    memo = funding.get('memo', '')
    value = json.loads(memo)
    if (set(value) != {'v', 'ref'} or type(value['v']) is not int or value['v'] != 1
            or not re.fullmatch(r'[0-9a-f-]{36}', value['ref'])
            or json.dumps(value, separators=(',', ':')) != memo or len(memo.encode()) > 512):
        raise ValueError('Noncanonical API memo')
    cutoff = funding.get('cutoffHeight')
    if not ((type(cutoff) is int and cutoff > 0) or (type(cutoff) is str and re.fullmatch(r'[1-9][0-9]*', cutoff))):
        raise ValueError('Canonical funding cutoff required')
    return funding


def durable_json(path, value, exclusive=False):
    path = Path(path)
    pending = path if exclusive else path.with_suffix(path.suffix + '.tmp')
    with pending.open('x') as stream:
        json.dump(value, stream)
        stream.flush()
        os.fsync(stream.fileno())
    if not exclusive:
        pending.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--root', required=True, help='Linux G1 root, also when invoked via WSL CLI prefix')
    parser.add_argument('--capital', action='store_true')
    parser.add_argument('--exclude-held-txid', action='append', default=[])
    parser.add_argument('--output', type=Path)
    parser.add_argument('--experiment', type=Path)
    parser.add_argument('--journal', type=Path)
    args = parser.parse_args()
    os.umask(0o077)
    config = json.loads(args.config.read_text())

    def run(command, payload=None, timeout=180):
        result = subprocess.run(command, input=json.dumps(payload) if payload else None,
                                capture_output=True, text=True, timeout=timeout)
        if result.returncode or 'error:' in result.stderr.lower():
            raise RuntimeError('Wallet command failed; inspect private state')
        return json.loads(result.stdout)

    sys.path.insert(0, str(Path(config['protoDir']).resolve()))
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    channel = grpc.secure_channel('testnet.zec.rocks:443', grpc.ssl_channel_credentials())
    service = services.CompactTxStreamerStub(channel)

    def tip_height():
        info = service.GetLightdInfo(messages.Empty(), timeout=20)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
            raise RuntimeError('Unexpected network or consensus branch')
        return service.GetLatestBlock(messages.ChainSpec(), timeout=20).height

    wallet = 'operator-b' if args.capital else 'sender-a'
    base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', args.root.rstrip('/') + '/zingo-wallets/' + wallet]
    if args.capital:
        if not args.output or not args.exclude_held_txid or any(not re.fullmatch(r'[0-9a-f]{64}', tx) for tx in args.exclude_held_txid):
            raise ValueError('Private output and explicit existing held transactions required')
        notes = run(base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
        status = run(base + ['--offline', '--nosync', 'sync', 'status'])
        ranges = status.get('scan_ranges', [])
        if not ranges or any(r['priority'] != 'Scanned' for r in ranges):
            raise RuntimeError('Incomplete operator scan')
        scanned = max(int(r['end_block']) for r in ranges) - 1
        tip = tip_height()
        if not 0 <= tip - scanned <= 6:
            raise RuntimeError('Operator scan stale')
        proof = {'schemaVersion': 1, 'network': 'zcash-testnet',
                 'observedAt': datetime.now(timezone.utc).isoformat(), 'scannedHeight': scanned,
                 **capital_from_notes(notes, scanned, args.exclude_held_txid)}
        if args.output.exists():
            durable_json(args.output, proof)
        else:
            durable_json(args.output, proof, exclusive=True)
        print(json.dumps(proof))
        return

    if not args.experiment or not args.journal:
        raise ValueError('Private experiment and exclusive journal required')
    if args.journal.exists():
        raise RuntimeError('Existing journal; reconcile original operation without resending')
    experiment = json.loads(args.experiment.read_text())
    funding = validate_experiment(experiment)
    checked = run(config['readCommand'], {'command': 'validate', 'address': funding['receiver']})
    if checked.get('network') != 'zcash-testnet' or checked.get('shielded') is not True or checked.get('receiver') != funding['receiver']:
        raise ValueError('Expected canonical SDK-validated shielded testnet receiver')
    # Synchronization is local wallet persistence only; no spending command yet.
    run(base + ['--server', 'https://testnet.zec.rocks:443', '--waitsync', 'notes', 'all'])
    proposal = run(base + ['--offline', '--nosync', 'send', funding['receiver'], '100000', funding['memo']])
    fee = proposal.get('fee')
    if type(fee) is not int or not 0 < fee <= 10000:
        raise ValueError('Fee must be a positive integer at or below 10,000 zatoshi')
    if tip_height() > int(funding['cutoffHeight']) - 2:
        raise RuntimeError('Insufficient canonical funding window; do not send')
    operation = {'schemaVersion': 1, 'orderId': experiment['order']['id'], 'state': 'started',
                 'amountZatoshis': '100000', 'feeZatoshis': str(fee),
                 'startedAt': datetime.now(timezone.utc).isoformat()}
    durable_json(args.journal, operation, exclusive=True)
    # Any CLI timeout/error now leaves the durable started journal in place.
    result = run(base + ['--nosync', '--server', 'https://testnet.zec.rocks:443', 'quicksend',
                        funding['receiver'], '100000', funding['memo']], timeout=240)
    txids = result.get('txids', [])
    if len(txids) != 1 or not re.fullmatch(r'[0-9a-f]{64}', txids[0]):
        raise RuntimeError('Unexpected send result; reconcile original operation')
    durable_json(args.journal, {**operation, 'state': 'broadcast', 'txid': txids[0]})
    print(json.dumps({'state': 'broadcast', 'amountZatoshis': '100000', 'feeZatoshis': str(fee), 'transactionCount': 1}))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Tracebacks/SubprocessError can include sensitive command arguments.
        print('Forward helper stopped; inspect private journal and reconcile before retry', file=sys.stderr)
        sys.exit(1)
