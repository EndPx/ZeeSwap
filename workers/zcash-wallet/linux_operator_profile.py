"""Read-only identity and relocation checks for the isolated Linux operator.
Wallet tree hashes are handoff-only; runtime binds the immutable logical UFVK.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

PROFILE = '/opt/zeeswap-testnet/secrets/linux-operator-profile.private.json'
NAME = 'zeeswap-linux-operator-20261023'


def need(value, message):
    if not value:
        raise ValueError('LINUX_OPERATOR_' + message)


def sha_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as stream:
        for data in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(data)
    return digest.hexdigest()


def inside(path, root):
    return isinstance(path, str) and str(Path(path)) == path and path.startswith(root + '/') and '..' not in Path(path).parts


def root_reviewed(path):
    need(Path(path).lstat().st_uid == 0, 'ROOT_CAPITAL_REVIEW_REQUIRED')


def pinned(item, private=True):
    path = Path(item['path'])
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and not path.is_symlink() and str(path.resolve()) == str(path), 'PINNED_FILE_OR_SYMLINK')
    need(not private or info.st_mode & 0o027 == 0, 'PRIVATE_PERMISSIONS')
    need(re.fullmatch('[0-9a-f]{64}', item['sha256']) and sha_file(path) == item['sha256'], 'PINNED_BYTES_CHANGED')
    return path.read_bytes() if private else None


def validate_operator_binding(binding, profile):
    """Exact transported metadata; no repinning may change logical authority."""
    critical = {'ledgerOpeningProofSha256': profile['immutable']['openingProof']['sha256'],
                'chefOpeningProofSha256': profile['immutable']['chefOpeningProof']['sha256'],
                'sourceFingerprint': profile['identity']['sourceFingerprint'],
                'ufvkSha256': profile['immutable']['operatorUfvk']['sha256'],
                'chefAccountId': profile['identity']['chefAccountId']}
    need(isinstance(binding, dict) and set(binding) == set(critical) | {
        'version', 'purpose', 'originalOpeningProofRewritten'}, 'OPERATOR_BINDING_SHAPE')
    need(type(binding['version']) is int and binding['version'] == 1
         and binding['purpose'] == 'logical-prefunding-operator-relocation-binding'
         and binding['originalOpeningProofRewritten'] is False, 'OPERATOR_BINDING_METADATA')
    need(all(binding[key] == expected for key, expected in critical.items()), 'OPERATOR_BINDING_IDENTITY')


def load_operator_profile(path, expected_sha):
    need(path == PROFILE and re.fullmatch('[0-9a-f]{64}', expected_sha or ''), 'EXACT_PROFILE_REQUIRED')
    p = json.loads(pinned({'path': path, 'sha256': expected_sha}))
    need(p.get('version') == 1 and p.get('profile') == NAME, 'PROFILE_VERSION')
    i, roots, paths = p['identity'], p['roots'], p['paths']
    need(i['projectId'] == 'raspy-truth-63998651' and i['branchId'] == 'br-broad-pine-ao79wemx'
         and i['database'] == 'zee_app_20261023' and i['chainId'] == 84532 and i['birthday'] == 4532047, 'DATABASE_NETWORK')
    need(i['operator'].lower() == '0x24faff408e7bb3c0ab076aecc8fd3c00bd8b3087'
         and i['settlement'].lower() == '0xe99ac648f85450b8ddeaea088aa99749c5e16da3'
         and i['token'].lower() == '0xd64c116352cef2adc9484098ae332fd9ba339a63'
         and i['account'] == 'zeeswap-live-20261023-operator', 'OPERATOR_CONTRACT')
    need(re.fullmatch('[0-9a-f]{64}', i['sourceFingerprint']) and isinstance(i['chefAccountId'], str) and i['chefAccountId'], 'PRIVATE_SOURCE_IDENTITY')
    base = '/opt/zeeswap-testnet'
    need(roots['base'] == base and roots['state'] == base + '/state' and roots['secrets'] == base + '/secrets'
         and re.fullmatch(base + '/releases/[a-z0-9][a-z0-9._-]{1,79}', roots['release']), 'ROOTS')
    expected = {'operatorWallet': roots['state'] + '/operator-wallet', 'watchWallet': roots['state'] + '/deposit-view',
                'operatorUfvk': roots['secrets'] + '/operator.ufvk', 'walletLock': roots['state'] + '/operator-wallet.lock',
                'baseJournal': roots['state'] + '/base-signer-journal', 'basePassword': roots['secrets'] + '/operator-password',
                'baseKeystore': base + '/home/.foundry/keystores/' + i['account']}
    need(paths == expected, 'PHYSICAL_PATHS')
    for field in ('operatorWallet', 'watchWallet'):
        wallet = Path(paths[field])
        need(wallet.is_dir() and not wallet.is_symlink() and str(wallet.resolve()) == paths[field], 'WALLET_RELOCATION_OR_SYMLINK')
    need(set(p['artifacts']) == {'reader', 'zingo', 'verify', 'cast', 'scanner'}, 'ARTIFACT_SET')
    for artifact in p['artifacts'].values():
        need(inside(artifact['path'], roots['release'] + '/bin'), 'ARTIFACT_PATH')
        pinned(artifact, False)
    for config in p.get('configPins', {}).values():
        need(inside(config['path'], roots['secrets']), 'CONFIG_PATH')
        pinned(config)
    immutable = {}
    for name, item in p['immutable'].items():
        need(inside(item['path'], roots['secrets']), 'IMMUTABLE_PATH')
        immutable[name] = pinned(item)
    need(p['immutable']['operatorUfvk']['path'] == paths['operatorUfvk'], 'UFVK_PATH')
    need(hashlib.sha256(immutable['operatorUfvk'].strip()).hexdigest() == i['sourceFingerprint'], 'ACTUAL_UFVK_IDENTITY')
    opening, binding = json.loads(immutable['openingProof']), json.loads(immutable['operatorBinding'])
    need(opening['version'] == 1 and opening['branchId'] == i['branchId'] and opening['database'] == i['database']
         and opening['binding']['sourceFingerprint'] == i['sourceFingerprint']
         and opening['binding']['registrySha256'] == p['immutable']['registry']['sha256'], 'ORIGINAL_OPENING_BINDING')
    validate_operator_binding(binding, p)
    registry = json.loads(immutable['registry'])
    need(registry['chainId'] == 84532 and registry['operator'].lower() == i['operator'].lower()
         and registry['contracts']['ZeeSwapSettlement']['address'].lower() == i['settlement'].lower()
         and registry['contracts']['MockUSDC']['address'].lower() == i['token'].lower(), 'REGISTRY_BINDING')
    need(os.environ.get('HOME') == base + '/home', 'ISOLATED_HOME')
    return p


def validate_native_config(config, profile, purpose):
    need(purpose in ('reverse', 'refund') and config.get('liveProfile') == NAME
         and config.get('nativePurpose') == purpose and config.get('recipientProofMode') == 'operator-outgoing-recovery'
         and 'recipientUfvkFile' not in config, 'NATIVE_MODE')
    paths, roots, artifacts = profile['paths'], profile['roots'], profile['artifacts']
    for field, expected in [('walletDir', paths['operatorWallet']), ('operatorUfvkFile', paths['operatorUfvk']),
                            ('lockPath', paths['walletLock']), ('capitalUfvkSha256', profile['identity']['sourceFingerprint'])]:
        need(config.get(field) == expected, 'NATIVE_' + field.upper())
    for field, artifact in [('cliCommand', 'zingo'), ('readCommand', 'reader'), ('verifyCommand', 'verify')]:
        need(config.get(field) == [artifacts[artifact]['path']], 'NATIVE_COMMAND')
    need(inside(config.get('protoDir'), roots['release']), 'PROTO_PATH')
    approved = Path(config['approvedRequest'])
    order_id = approved.parent.name
    need(re.fullmatch('[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', order_id), 'ORDER_ID')
    directory = roots['state'] + ('/reverse-orders/' if purpose == 'reverse' else '/refund-orders/') + order_id
    need(str(approved) == directory + '/approved.private.json' and config['journalPath'] == directory + ('/payout-intent.private.json' if purpose == 'reverse' else '/refund-intent.private.json'), 'ORDER_PATHS')
    need(config.get('capitalApprovalPath') == directory + '/capital-approval.private.json', 'PER_ORDER_CAPITAL_PATH')
    capital = json.loads(pinned({'path': config['capitalApprovalPath'], 'sha256': config['capitalApprovalSha256']}))
    root_reviewed(config['capitalApprovalPath'])
    need(capital.get('version') == 1 and capital.get('orderId') == order_id
         and capital.get('sourceFingerprint') == profile['identity']['sourceFingerprint']
         and capital.get('openingProofSha256') == profile['immutable']['chefOpeningProof']['sha256'], 'PER_ORDER_CAPITAL_IDENTITY')
    pinned({'path': str(approved), 'sha256': config['approvedRequestSha256']})
    pin = profile.get('configPins', {}).get('reverseProfile' if purpose == 'reverse' else 'refundProfile')
    need(pin and config.get('rootConfigPath') == pin['path'], 'PINNED_ROOT_CONFIG')
    root = json.loads(pinned(pin))
    need(root.get('operatorProfile') == PROFILE and root.get('python') == roots['base'] + '/tools/python/bin/python', 'ROOT_TRANSPORT')
    scripts = root['scripts']
    names = {'native': 'linux_native_wallet.py', 'profile': 'linux_operator_profile.py', 'supervisor': 'owned_wallet_call.py',
             'preparedKernel': 'prepared_raw.py', 'refundKernel': 'refund_raw.py', 'outgoingKernel': 'outgoing_recovery.py',
             'preflight': 'reverse_preflight.py' if purpose == 'reverse' else 'refund_preflight.py'}
    for name, filename in names.items():
        need(scripts[name]['path'] == roots['release'] + '/app/workers/zcash-wallet/' + filename, 'RELEASE_SCRIPT')
        pinned(scripts[name], False)
    guard_name = 'reverse-linux-broadcast-guard.ts' if purpose == 'reverse' else 'refund-linux-broadcast-guard.ts'
    need(scripts['guard']['path'] == roots['release'] + '/app/api/scripts/' + guard_name, 'GUARD_SCRIPT')
    pinned(scripts['guard'], False)
    need(root['node']['path'].startswith(('/usr/bin/', roots['base'] + '/tools/')), 'NODE_PATH')
    pinned(root['node'], False)
    preflight = directory + '/preflight.private.json'
    checked = json.loads(pinned({'path': preflight, 'sha256': config['preflightConfigSha256']}))
    registry = json.loads(pinned(profile['immutable']['registry']))
    need(checked == {'readCommand': [artifacts['reader']['path']], 'rpcUrl': registry['rpcUrl'],
                     'hashCommand': [artifacts['cast']['path'], 'keccak']}, 'PREFLIGHT_CONFIG')
    need(config['preflightCommand'] == [root['python'], scripts['preflight']['path'], '--config', preflight,
                                       '--approved-request', str(approved), '--approved-digest', config['approvedDigest'],
                                       '--registry', profile['immutable']['registry']['path']], 'PREFLIGHT_COMMAND')
    guard = directory + '/guard.private.json'
    checked_guard = json.loads(pinned({'path': guard, 'sha256': config['guardConfigSha256']}))
    need(checked_guard == {'configPath': pin['path'], 'orderId': order_id, 'statePath': directory + '/state.private.json',
                          'approvedRequest': str(approved), 'approvedDigest': config['approvedDigest']}, 'GUARD_CONFIG')
    loader = Path(roots['release'] + '/app/api/node_modules/tsx/dist/loader.mjs').as_uri()
    need(config['beforeBroadcastGuardCommand'] == [root['node']['path'], '--import', loader, scripts['guard']['path'], guard], 'GUARD_COMMAND')
    return order_id
