"""Separate market-reference native protocol; legacy fixture and bridge guards stay intact."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
from linux_operator_profile import PROFILE, load_operator_profile, pinned, root_reviewed
from market_native_protocol import validate_request, need
from prepared_raw import Adapter, private_error
from outgoing_recovery import MODE

ROOT_CONFIG = '/opt/zeeswap-testnet/secrets/market-reverse-profile.private.json'
SCRIPTS = {'native': 'market_native_wallet.py', 'protocol': 'market_native_protocol.py',
           'supervisor': 'market_owned_wallet.py', 'profile': 'linux_operator_profile.py',
           'preparedKernel': 'prepared_raw.py', 'outgoingKernel': 'outgoing_recovery.py',
           'basePreflightKernel': 'reverse_preflight.py', 'preflight': 'market_reverse_preflight.py'}


def initialize(adapter, config):
    p = load_operator_profile(config.get('linuxProfilePath'), config.get('linuxProfileSha256'))
    purpose=config.get('nativePurpose');refund=purpose=='market-refund-v1'
    root_path=ROOT_CONFIG.replace('market-reverse','market-refund') if refund else ROOT_CONFIG
    need(purpose in ('market-reverse-v1','market-refund-v1') and config.get('rootConfigPath') == root_path, 'PROFILE_PURPOSE')
    root_reviewed(root_path)
    root = json.loads(pinned({'path': root_path, 'sha256': config['rootConfigSha256']}))
    need(root.get('version') == 1 and root.get('mode') == ('MARKET_REFERENCE_REFUND_TESTNET' if refund else 'MARKET_REFERENCE_NATIVE_TESTNET') and type(root.get('enabled')) is bool
         and root.get('operatorProfile') == PROFILE and root.get('python') == p['roots']['base'] + '/tools/python/bin/python', 'ROOT_PROFILE')
    need(root.get('marketPolicySha256') == config['marketContext']['policySha256'], 'ROOT_MARKET_POLICY')
    expected_dir = p['roots']['state'] + ('/market-refund-orders/' if refund else '/market-reverse-orders/')
    request_path = Path(config['approvedRequest']); order_id = request_path.parent.name
    directory = expected_dir + order_id
    need(str(request_path) == directory + '/approved.private.json' and request_path.parent.resolve() == request_path.parent
         and config['journalPath'] == directory + ('/refund-intent.private.json' if refund else '/payout-intent.private.json'), 'ORDER_PATHS')
    request = json.loads(pinned({'path': str(request_path), 'sha256': config['approvedRequestSha256']}))
    validate_request(request, config['approvedDigest'])
    need(order_id == request['orderId'] and config['walletDir'] == p['paths']['operatorWallet']
         and config['operatorUfvkFile'] == p['paths']['operatorUfvk'] and config['lockPath'] == p['paths']['walletLock']
         and config['capitalUfvkSha256'] == p['identity']['sourceFingerprint']
         and config['recipientProofMode'] == MODE and 'recipientUfvkFile' not in config, 'ISOLATED_OPERATOR_IDENTITY')
    for field, artifact in [('cliCommand', 'zingo'), ('readCommand', 'reader'), ('verifyCommand', 'verify')]:
        need(config.get(field) == [p['artifacts'][artifact]['path']], 'FIXED_NATIVE_COMMAND')
    need(config['protoDir'] == root['protoDir'] and config['protoDir'].startswith(p['roots']['release'] + '/'), 'PROTO_PATH')
    scripts={**SCRIPTS,**({'native':'market_refund_wallet.py','supervisor':'market_refund_owned_wallet.py','preflight':'market_refund_preflight.py',
                         'marketWalletKernel':'market_native_wallet.py','refundKernel':'refund_raw.py','refundPreflightKernel':'refund_preflight.py'} if refund else {})}
    for name, filename in scripts.items():
        pin = root['scripts'][name]
        need(pin['path'] == p['roots']['release'] + '/app/workers/zcash-wallet/' + filename, 'SCRIPT_PATH')
        pinned(pin, False)
    guard = root['scripts']['guard']
    need(guard['path'] == p['roots']['release'] + '/app/api/scripts/'+('market-refund-native-guard.ts' if refund else 'market-native-guard.ts'), 'GUARD_PATH')
    pinned(guard, False); pinned(root['node'], False)
    root_reviewed(config['capitalApprovalPath'])
    need(config['capitalApprovalPath'] == directory + '/capital-approval.private.json', 'CAPITAL_PATH')
    capital = json.loads(pinned({'path': config['capitalApprovalPath'], 'sha256': config['capitalApprovalSha256']}))
    need(capital.get('version') == 1 and capital.get('purpose') == purpose and capital.get('orderId') == order_id
         and capital.get('approvedDigest') == config['approvedDigest'] and capital.get('sourceFingerprint') == p['identity']['sourceFingerprint']
         and capital.get('marketPolicySha256') == config['marketContext']['policySha256']
         and capital.get('notes') == config['approvedCapitalNotes'], 'ROOT_CAPITAL_ENTITLEMENT')
    checked = json.loads(pinned({'path': directory + '/preflight.private.json', 'sha256': config['preflightConfigSha256']}))
    registry = json.loads(pinned(p['immutable']['registry']))
    need(checked == {'readCommand': [p['artifacts']['reader']['path']], 'rpcUrl': registry['rpcUrl'],
                     'hashCommand': [p['artifacts']['cast']['path'], 'keccak']}, 'PREFLIGHT_CONFIG')
    need(config['preflightCommand'] == [root['python'], root['scripts']['preflight']['path'], '--config', directory + '/preflight.private.json',
         '--approved-request', str(request_path), '--approved-digest', config['approvedDigest'], '--registry', p['immutable']['registry']['path']], 'PREFLIGHT_COMMAND')
    loader = Path(p['roots']['release'] + '/app/api/node_modules/tsx/dist/loader.mjs').as_uri()
    prefix = [root['node']['path'], '--import', loader, guard['path'], directory + '/guard.private.json']
    need(config['authorizationCommand'] == prefix + ['authority'] and config['beforeBroadcastGuardCommand'] == prefix + ['broadcast'], 'FINITE_GUARD_COMMAND')
    state = json.loads(Path(directory + '/state.private.json').read_text())
    need(state.get('approvedDigest') == config['approvedDigest'] and state.get('marketContext') == config['marketContext']
         and state.get('operatorProfileSha256') == config['linuxProfileSha256'], 'IMMUTABLE_WORKER_STATE')
    adapter.config, adapter.request, adapter.profile, adapter.enabled = config, request, p, root['enabled']
    adapter.base = config['cliCommand'] + ['--chain', 'testnet', '--data-dir', config['walletDir']]
    adapter.path = Path(config['journalPath'])


class MarketAdapter(Adapter):
    def __init__(self, config):
        initialize(self, config)

    def commitment(self):
        proof = self.run(self.config['preflightCommand'])
        need(proof.get('commitmentVerified') is True and proof.get('orderId') == self.request['orderId']
             and proof.get('approvedDigest') == self.config['approvedDigest'] and proof.get('purpose') == 'market-reverse-v1', 'FINALIZED_BASE_AUTHORITY')
        guard = self.run(self.config['authorizationCommand'])
        need(guard.get('authorized') is True and guard.get('orderId') == self.request['orderId']
             and guard.get('approvedDigest') == self.config['approvedDigest'], 'LIVE_ACCEPTED_QUOTE_FENCE')

    def run(self, command, payload=None, timeout=240):
        calculate = self.base + ['--nosync', '--server', 'https://testnet.zec.rocks:443', 'calculate',
                                 self.request['recipient'], self.request['amountZatoshi']]
        if command == calculate:
            intent = json.loads(self.path.read_text())
            need(intent.get('state') == 'SIGNING_INTENT' and intent.get('request') == self.request
                 and intent.get('approvedDigest') == self.config['approvedDigest'], 'DURABLE_CALCULATION_INTENT')
            self.commitment()
        return super().run(command, payload, timeout)

    def execute(self, command):
        need(command in ('prepare', 'recover', 'broadcast', 'receipt'), 'COMMAND')
        need(command not in ('prepare', 'broadcast') or self.enabled, 'FINANCIAL_PROFILE_DISABLED')
        validate_request(self.request, self.config['approvedDigest'])
        if command == 'broadcast' and self.path.exists():
            state = json.loads(self.path.read_text())
            need(state.get('state') == 'PREPARED' and state.get('request') == self.request
                 and state.get('approvedDigest') == self.config['approvedDigest'], 'UNKNOWN_BROADCAST_RECONCILIATION')
        return super().execute(command)


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--config', required=True, type=Path)
    args = parser.parse_args()
    need(sys.platform.startswith('linux'), 'LINUX_ONLY')
    os.umask(0o077)
    config = json.loads(args.config.read_text())
    adapter = MarketAdapter(config)
    need(str(args.config) == str(adapter.path.parent / 'prepared.private.json'), 'PREPARED_CONFIG_PATH')
    state = json.loads((adapter.path.parent / 'state.private.json').read_text())
    need(state.get('nativeConfigSha256') == hashlib.sha256(args.config.read_bytes()).hexdigest(), 'NATIVE_CONFIG_PIN')
    data = sys.stdin.read(8193)
    need(len(data) <= 8192, 'INPUT_BOUND')
    payload = json.loads(data)
    need(type(payload) is dict and set(payload) == {'command'}, 'PRIVATE_COMMAND')
    lock_path = Path(config['lockPath'])
    need(not lock_path.is_symlink() and lock_path.parent.resolve() == lock_path.parent, 'WALLET_LOCK')
    with open(lock_path, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        adapter.lock_fd = lock.fileno()
        try: print(json.dumps(adapter.execute(payload['command'])))
        except Exception as error:
            private_error(adapter.path.with_name('market-native-error.private.json'), error)
            raise


if __name__ == '__main__':
    try: main()
    except Exception:
        print('MARKET_NATIVE_REFUSED_RECONCILE_ORIGINAL_INTENT', file=sys.stderr)
        sys.exit(1)
