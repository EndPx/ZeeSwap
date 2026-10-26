"""Bridge-only private request and note policy; no keys, SDK calls or broadcast."""
import hashlib
import json
from pathlib import PurePosixPath
import re
from datetime import datetime


def need(value, code):
    if not value:
        raise ValueError(code)


def exact(value, fields):
    need(type(value) is dict and set(value) == set(fields.split()), 'BRIDGE_FIELDS')


def hexa(value, width=64, prefix=True):
    need(type(value) is str and re.fullmatch(('0x' if prefix else '') + '[0-9a-f]{' + str(width) + '}', value)
         and int(value, 16) != 0, 'BRIDGE_HEX_IDENTITY')
    return value


def atomic(value, zero=False):
    need(type(value) is str and re.fullmatch('0|[1-9][0-9]{0,77}', value), 'BRIDGE_ATOMIC')
    need(zero or int(value) > 0, 'BRIDGE_POSITIVE')
    return int(value)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def anchor(value, now=None):
    exact(value, 'height hash observedAt')
    need(type(value['height']) is int and 0 < value['height'] <= 9007199254740991, 'BRIDGE_ANCHOR_HEIGHT')
    hexa(value['hash'], prefix=value['hash'].startswith('0x'))
    stamp = value['observedAt']
    need(type(stamp) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)', stamp), 'BRIDGE_ANCHOR_TIME')
    observed = datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp()
    if now is not None:
        need(0 <= now - observed <= 60, 'BRIDGE_STALE_ANCHOR')
    return observed


def validate_request(request, approved_digest):
    exact(request, 'version purpose intentId orderId bridgeId recipient amountZatoshi maxFeeZatoshi payoutCommitment salt commitmentInput base paired')
    need(type(approved_digest) is str and digest(request) == approved_digest, 'BRIDGE_APPROVAL_DIGEST')
    need(type(request['version']) is int and request['version'] == 1
         and request['purpose'] in ('bridge-redemption', 'bridge-refund'), 'BRIDGE_PURPOSE')
    hexa(request['intentId'], prefix=False)
    need(type(request['orderId']) is str and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', request['orderId']), 'BRIDGE_ORDER')
    for key in ('bridgeId', 'payoutCommitment'):
        hexa(request[key])
    hexa(request['salt'], prefix=False)
    need(10000 <= atomic(request['amountZatoshi']) <= 100000000 and request['maxFeeZatoshi'] == '10000', 'BRIDGE_PRINCIPAL_FEE_BOUNDS')
    need(type(request['recipient']) is str and 1 <= len(request['recipient']) <= 512, 'BRIDGE_PRIVATE_RECIPIENT')
    i = request['commitmentInput']
    reverse = request['purpose'] == 'bridge-redemption'
    exact(i, 'direction amountAtomic recipient payer' if reverse else 'direction amountAtomic recipient refundRecipient')
    need(i['direction'] == ('ZEETAZ_TO_TAZ' if reverse else 'TAZ_TO_ZEETAZ')
         and i['amountAtomic'] == request['amountZatoshi']
         and i['recipient' if reverse else 'refundRecipient'] == request['recipient'], 'BRIDGE_PRIVATE_TERMS')
    commitment = '0x' + hashlib.sha256(json.dumps([
        'bridge-private-order-v1', request['salt'], request['orderId'], i['direction'], i['amountAtomic'],
        i['recipient'], i.get('refundRecipient'), i.get('payer')
    ], separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    need(request['bridgeId'] == commitment == request['payoutCommitment'], 'BRIDGE_SALTED_COMMITMENT')
    intent = hashlib.sha256(json.dumps(['bridge-delivery-v1', request['orderId'], commitment], separators=(',', ':')).encode()).hexdigest()
    need(request['intentId'] == intent, 'BRIDGE_DELIVERY_INTENT_BINDING')
    base = request['base']
    exact(base, 'chainId contract runtimeCodeHash payer amountAtomic transactionHash blockNumber blockHash operator authorizer admin')
    need(type(base['chainId']) is int and base['chainId'] == 84532 and base['amountAtomic'] == request['amountZatoshi'], 'BRIDGE_BASE_CHAIN_AMOUNT')
    for key in ('contract', 'operator', 'authorizer', 'admin'):
        hexa(base[key], 40)
    for key in ('runtimeCodeHash', 'transactionHash', 'blockHash'):
        hexa(base[key])
    need(base['admin'] not in (base['operator'], base['authorizer']), 'BRIDGE_ADMIN_SEPARATION')
    if reverse:
        hexa(base['payer'], 40)
        need(base['payer'] == i['payer'], 'BRIDGE_BURN_PAYER')
    else:
        need(base['payer'] is None, 'BRIDGE_REFUND_PAYER')
        hexa(i['recipient'], 40)
    exact(request['paired'], 'base zcash')
    for value in request['paired'].values():
        anchor(value)
    need(atomic(base['blockNumber']) <= request['paired']['base']['height'], 'BRIDGE_BASE_FINALITY_HEIGHT')
    return approved_digest


def note_identity(note):
    return note['pool'], note['txid'], note['index'], note['value']


def validate_allocations(notes, amount):
    need(type(notes) is list and 2 <= len(notes) <= 32, 'BRIDGE_PRINCIPAL_FEE_NOTES')
    principal, fee, seen = 0, 0, set()
    for n in notes:
        exact(n, 'pool txid index value role')
        need(n['pool'] == 'ironwood' and type(n['index']) is int and 0 <= n['index'] <= 0xffffffff
             and n['role'] in ('principal', 'fee'), 'BRIDGE_NOTE_ROLE')
        hexa(n['txid'], prefix=False)
        key = n['pool'], n['txid'], n['index']
        need(key not in seen, 'BRIDGE_DUPLICATE_NOTE')
        seen.add(key)
        value = atomic(n['value'])
        if n['role'] == 'principal': principal += value
        else: fee += value
    need(principal == atomic(amount) and fee == 10000, 'BRIDGE_EXACT_SEPARATE_ENTITLEMENTS')


def actual_notes(notes, coins, scanned, allocations):
    """Count actual mature UNSPENT notes, including reserved principal, never receipt sums."""
    need(type(scanned) is int and scanned >= 10 and type(notes) is dict and type(coins) is dict, 'BRIDGE_NATIVE_SCAN')
    need(not any(n.get('spend_status') == 'unspent' for n in coins.get('transparent_coins', [])), 'BRIDGE_TRANSPARENT_CAPITAL')
    found = []
    for pool in ('sapling', 'orchard', 'ironwood'):
        for n in notes.get(pool + '_notes', {}).get('note_summaries', []):
            if n.get('spend_status') != 'unspent':
                # Do not silently reinterpret pending Calculated spends as controlled capital.
                need(n.get('spend_status') == 'spent', 'BRIDGE_UNRESOLVED_SPEND_STATUS')
                continue
            height = re.fullmatch(r'confirmed at block height (\d+)', str(n.get('status', '')))
            need(pool == 'ironwood' and n.get('scope') in ('internal', 'external') and height
                 and type(n.get('value')) is int and n['value'] > 0 and type(n.get('output_index')) is int,
                 'BRIDGE_NATIVE_UNSPENT')
            height = int(height[1])
            need(height > 0 and scanned - height + 1 >= 10, 'BRIDGE_NATIVE_CONFIRMATIONS')
            row = dict(pool=pool, txid=n['txid'], index=n['output_index'], value=str(n['value']))
            matched = [a for a in allocations if note_identity(a) == note_identity(row)]
            need(len(matched) == 1, 'BRIDGE_UNAPPROVED_PHYSICAL_NOTE')
            found.append({**row, 'role': matched[0]['role'], 'height': height, 'ownChange': n['scope'] == 'internal'})
    need(len(found) == len(allocations) and len({note_identity(n) for n in found}) == len(found), 'BRIDGE_PHYSICAL_ALLOCATION_MISMATCH')
    return found


def path_inside(path, root):
    need(type(path) is str and type(root) is str and path.startswith(root + '/')
         and str(PurePosixPath(path)) == path and '..' not in PurePosixPath(path).parts, 'BRIDGE_PRIVATE_PATH')


def validate_profile(profile, request):
    exact(profile, 'version mode enabled serviceUid root signingWallet viewingWallet ufvkFile walletUfvkSha256 principalAccount feeAccount swapAccount journalRoot approvedRequest approvedDigest capitalNotes cli reader verifier node tsxLoader preflight baseProfile protoDir modules')
    need(type(profile['version']) is int and profile['version'] == 1 and profile['mode'] == 'BRIDGE_NATIVE_TESTNET'
         and type(profile['enabled']) is bool and type(profile['serviceUid']) is int and profile['serviceUid'] > 0, 'BRIDGE_NATIVE_PROFILE')
    root = profile['root']
    need(type(root) is str and re.fullmatch(r'/opt/zeeswap-bridge-testnet(?:-[a-z0-9-]+)?', root), 'BRIDGE_DEDICATED_ROOT')
    for key in ('signingWallet', 'viewingWallet', 'ufvkFile', 'journalRoot', 'protoDir'):
        path_inside(profile[key], root)
        need(not re.search(r'/[^/]*(?:g5|swap|reverse-capital|operator-b|zeeswap-g1)', profile[key][len(root):]), 'BRIDGE_SWAP_REUSE_FORBIDDEN')
    need(profile['signingWallet'] != profile['viewingWallet'] and profile['journalRoot'] == root + '/orders', 'BRIDGE_WALLET_ISOLATION')
    hexa(profile['walletUfvkSha256'], prefix=False)
    accounts = [profile[k] for k in ('principalAccount', 'feeAccount', 'swapAccount')]
    need(all(type(a) is str and 1 <= len(a) <= 128 for a in accounts) and len(set(accounts)) == 3, 'BRIDGE_LEDGER_ISOLATION')
    for key in ('approvedRequest', 'cli', 'reader', 'verifier', 'node', 'tsxLoader', 'preflight', 'baseProfile'):
        pin = profile[key]
        exact(pin, 'path sha256')
        path_inside(pin['path'], root)
        hexa(pin['sha256'], prefix=False)
    exact(profile['modules'], 'bridge_native_wallet bridge_protocol prepared_raw reverse_preflight outgoing_recovery testnet_policy_capital')
    for key, pin in profile['modules'].items():
        exact(pin, 'path sha256')
        path_inside(pin['path'], root)
        need(PurePosixPath(pin['path']).name == key + '.py', 'BRIDGE_MODULE_FILENAME')
        hexa(pin['sha256'], prefix=False)
    need(profile['approvedRequest']['path'] == root + '/orders/' + request['orderId'] + '/approved.private.json', 'BRIDGE_REQUEST_PATH')
    validate_request(request, profile['approvedDigest'])
    validate_allocations(profile['capitalNotes'], request['amountZatoshi'])
    return profile


def validate_authority(proof, request, profile, now):
    need(type(proof) is dict and proof.get('version') == 1 and proof.get('status') == 'BRIDGE_AUTHORITY_VERIFIED'
         and proof.get('bridgeProofVerified') is True, 'BRIDGE_FINALIZED_AUTHORITY')
    for key in ('orderId', 'purpose', 'bridgeId'):
        need(proof.get(key) == request[key], 'BRIDGE_AUTHORITY_BINDING')
    need(proof.get('approvedDigest') == profile['approvedDigest']
         and proof.get('principalAccount') == profile['principalAccount'] and proof.get('feeAccount') == profile['feeAccount'], 'BRIDGE_AUTHORITY_ACCOUNTS')
    pair = proof.get('paired')
    exact(pair, 'base zcash')
    need(proof.get('zcashRequiresNativeRecheck') is True and pair['zcash'] == request['paired']['zcash'], 'BRIDGE_NATIVE_ZCASH_RECHECK_REQUIRED')
    for key in ('base', 'zcash'):
        anchor(pair[key], now if key == 'base' else None)
        need(pair[key]['height'] >= request['paired'][key]['height'], 'BRIDGE_AUTHORITY_REGRESSION')
        if pair[key]['height'] == request['paired'][key]['height']:
            need(pair[key]['hash'] == request['paired'][key]['hash'], 'BRIDGE_AUTHORITY_FORK')
    return pair
