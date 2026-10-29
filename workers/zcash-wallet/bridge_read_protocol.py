"""Pure bounded bridge incoming-read policy. No wallet or chain authority here."""
from datetime import datetime
import hashlib
import json
import re
from bridge_protocol import need, exact, hexa, atomic, path_inside, evm_address

MODULES = ('bridge_native_read', 'bridge_read_protocol', 'bridge_protocol', 'bridge_native_wallet',
           'prepared_raw', 'reverse_preflight', 'outgoing_recovery', 'testnet_policy_capital')


def uint32_height(value):
    """CLI scan-range heights are canonical decimal strings; other RPCs use ints."""
    need((type(value) is int or type(value) is str and re.fullmatch(r'0|[1-9][0-9]{0,9}', value))
         and 0 <= int(value) <= 0xffffffff, 'BRIDGE_READ_UINT32_HEIGHT')
    return int(value)


def complete_scan_height(ranges, birthday):
    need(type(ranges) is list and 0 < len(ranges) <= 128, 'BRIDGE_READ_COMPLETE_SCAN')
    intervals = []
    for r in ranges:
        need(type(r) is dict and r.get('priority') == 'Scanned', 'BRIDGE_READ_COMPLETE_SCAN')
        start, end = uint32_height(r.get('start_block')), uint32_height(r.get('end_block'))
        need(start < end, 'BRIDGE_READ_SCAN_INTERVAL')
        intervals.append((start, end))
    intervals.sort()
    need(intervals[0][0] <= birthday < intervals[0][1], 'BRIDGE_READ_BIRTHDAY_COVERAGE')
    end = intervals[0][1]
    for start, next_end in intervals[1:]:
        need(start == end, 'BRIDGE_READ_SCAN_GAP_OR_OVERLAP')
        end = next_end
    # Preserve the existing SDK range convention: exclusive end, as used by
    # bridge_native_wallet.native_capital and the other qualified native readers.
    return end - 1


def validate_read_profile(p):
    exact(p, 'version mode serviceUid root viewingWallet ufvkFile walletUfvkSha256 journalRoot birthdayHeight receiver principalAccount feeAccount swapAccount feeNotes cli reader protoDir protobuf modules')
    need(p['version'] == 1 and type(p['version']) is int and p['mode'] == 'BRIDGE_NATIVE_READ_TESTNET'
         and type(p['serviceUid']) is int and p['serviceUid'] > 0, 'BRIDGE_READ_PROFILE')
    need(p['root'] == '/opt/zeeswap-bridge-testnet' and p['journalRoot'] == p['root'] + '/incoming', 'BRIDGE_READ_ROOT')
    for key in ('viewingWallet', 'ufvkFile', 'journalRoot', 'protoDir'):
        path_inside(p[key], p['root'])
        need(not re.search(r'g5|operator-b|reverse-capital|/swap', p[key][len(p['root']):]), 'BRIDGE_READ_ISOLATION')
    need(type(p['birthdayHeight']) is int and 0 < p['birthdayHeight'] <= 0xffffffff, 'BRIDGE_READ_BIRTHDAY')
    need(type(p['receiver']) is str and 1 <= len(p['receiver']) <= 512, 'BRIDGE_READ_RECEIVER')
    hexa(p['walletUfvkSha256'], prefix=False)
    accounts = [p[k] for k in ('principalAccount', 'feeAccount', 'swapAccount')]
    need(all(type(a) is str and 0 < len(a) <= 128 for a in accounts) and len(set(accounts)) == 3, 'BRIDGE_READ_ACCOUNTS')
    need(type(p['feeNotes']) is list and len(p['feeNotes']) <= 32, 'BRIDGE_READ_FEE_NOTES')
    seen = set()
    for n in p['feeNotes']:
        exact(n, 'pool txid index value')
        hexa(n['txid'], prefix=False); atomic(n['value'])
        need(n['pool'] == 'ironwood' and type(n['index']) is int and 0 <= n['index'] <= 0xffffffff, 'BRIDGE_READ_FEE_NOTE')
        key = n['pool'], n['txid'], n['index']
        need(key not in seen, 'BRIDGE_READ_DUPLICATE_FEE_NOTE'); seen.add(key)
    exact(p['modules'], ' '.join(MODULES))
    exact(p['protobuf'], 'service_pb2 service_pb2_grpc compact_formats_pb2')
    for name, pin in p['protobuf'].items():
        exact(pin, 'path sha256'); hexa(pin['sha256'], prefix=False)
        need(pin['path'] == p['protoDir'] + '/' + name + '.py', 'BRIDGE_READ_PROTOBUF_PATH')
    for key, pin in list(p['modules'].items()) + [(key, p[key]) for key in ('cli', 'reader')]:
        exact(pin, 'path sha256'); path_inside(pin['path'], p['root']); hexa(pin['sha256'], prefix=False)
        if key in MODULES:
            need(pin['path'].endswith('/' + key + '.py'), 'BRIDGE_READ_MODULE_NAME')
    return p


def incoming_order(o):
    exact(o, 'id salt direction amountAtomic recipient refundRecipient commitment expiresAt')
    need(type(o['id']) is str and re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', o['id']), 'BRIDGE_READ_ORDER')
    hexa(o['salt'], prefix=False)
    need(o['direction'] == 'TAZ_TO_ZEETAZ' and 10000 <= atomic(o['amountAtomic']) <= 100000000, 'BRIDGE_READ_DIRECTION_AMOUNT')
    evm_address(o['recipient'])
    need(type(o['refundRecipient']) is str and 0 < len(o['refundRecipient']) <= 512, 'BRIDGE_READ_REFUND')
    expected = '0x' + hashlib.sha256(json.dumps(['bridge-private-order-v1', o['salt'], o['id'], o['direction'],
        o['amountAtomic'], o['recipient'], o['refundRecipient'], None], separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    need(expected == o['commitment'], 'BRIDGE_READ_COMMITMENT')
    need(type(o['expiresAt']) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z', o['expiresAt']), 'BRIDGE_READ_EXPIRY')
    return datetime.fromisoformat(o['expiresAt'].replace('Z', '+00:00')).timestamp()


def candidate_notes(notes, coins, scanned, birthday):
    need(type(scanned) is int and scanned >= birthday and type(notes) is dict and type(coins) is dict, 'BRIDGE_READ_SCAN')
    need(not any(n.get('spend_status') == 'unspent' for n in coins.get('transparent_coins', [])), 'BRIDGE_READ_TRANSPARENT')
    rows, seen = [], set()
    for pool in ('sapling', 'orchard', 'ironwood'):
        for n in notes.get(pool + '_notes', {}).get('note_summaries', []):
            need(len(rows) < 128, 'BRIDGE_READ_NOTE_BOUND')
            need(n.get('spend_status') in ('unspent', 'spent'), 'BRIDGE_READ_UNRESOLVED_SPEND')
            height = re.fullmatch(r'confirmed at block height (\d+)', str(n.get('status', '')))
            need(pool == 'ironwood' and height and n.get('scope') in ('external', 'internal')
                 and type(n.get('value')) is int and n['value'] > 0 and type(n.get('output_index')) is int
                 and 0 <= n['output_index'] <= 0xffffffff, 'BRIDGE_READ_NOTE')
            height = int(height[1]); hexa(n['txid'], prefix=False)
            need(birthday <= height <= scanned and scanned - height + 1 >= 10, 'BRIDGE_READ_CONFIRMATIONS')
            key = pool, n['txid'], n['output_index']
            need(key not in seen, 'BRIDGE_READ_DUPLICATE_NOTE'); seen.add(key)
            rows.append(dict(pool=pool, txid=n['txid'], index=n['output_index'], value=str(n['value']),
                             height=height, ownChange=n['scope'] == 'internal', unspent=n['spend_status'] == 'unspent'))
    need(sum(n['unspent'] for n in rows) <= 32, 'BRIDGE_READ_CAPITAL_BOUND')
    return rows


def bind_decoded(row, decoded):
    matches = [n for n in decoded.get('notes', []) if n.get('txid') == row['txid'] and n.get('pool') == row['pool']
               and n.get('index') == row['index'] and n.get('amount') == row['value'] and n.get('shieldedSource') is True
               and n.get('ownChange', False) == row['ownChange']]
    need(len(matches) == 1, 'BRIDGE_READ_INDEPENDENT_DECRYPT')
    return matches[0]
