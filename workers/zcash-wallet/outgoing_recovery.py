"""Custodial operator OVK recovery validation, not recipient-wallet attestation.
Only the maintained native SDK returns Outgoing and AccountInternal categories.
"""
import re


MODE = 'operator-outgoing-recovery'


def validate_outgoing_recovery(decoded, request, prepared, sdk):
    if set(decoded) != {'attestationMode', 'notes'} or decoded['attestationMode'] != MODE or not isinstance(decoded['notes'], list):
        raise ValueError('Explicit operator outgoing attestation required')
    approved = sdk({'command': 'validate', 'address': request['recipient']})
    if approved.get('network') != 'zcash-testnet' or approved.get('shielded') is not True:
        raise ValueError('Approved shielded recipient required')
    outputs = []
    seen = set()
    for note in decoded['notes']:
        if (set(note) != {'txid', 'index', 'pool', 'amount', 'receiver', 'memo', 'shieldedSource', 'ownChange', 'recoveryType'}
                or note['txid'] != prepared['txid'] or note['pool'] != 'ironwood' or type(note['index']) is not int or note['index'] < 0
                or note['index'] in seen or not isinstance(note['amount'], str) or not re.fullmatch(r'0|[1-9][0-9]*', note['amount'])
                or note['shieldedSource'] is not True or type(note['ownChange']) is not bool
                or note['recoveryType'] != ('account-internal' if note['ownChange'] else 'outgoing')):
            raise ValueError('Native recovered output identity/type required')
        seen.add(note['index'])
        receiver = sdk({'command': 'validate', 'address': note['receiver']})
        if receiver.get('network') != 'zcash-testnet' or receiver.get('shielded') is not True:
            raise ValueError('Recovered shielded receiver required')
        outputs.append((note['index'], receiver['receiver'], note['amount'], note['ownChange']))
    external = [output for output in outputs if output[3] is False]
    if len(external) != 1 or external[0][1] != approved['receiver'] or external[0][2] != request['amountZatoshi']:
        raise ValueError('Recovered exact outgoing recipient/amount required')
    journal_outputs = []
    for note in prepared['outputs']:
        receiver = sdk({'command': 'validate', 'address': note['recipient']})
        journal_outputs.append((note['index'], receiver['receiver'], note['amount'], note.get('ownChange') is True))
    if sorted(outputs) != sorted(journal_outputs):
        raise ValueError('Every prepared output must match native recovered ciphertext/change')
    if prepared['feeZatoshi'] != '10000' or sum(int(note['value']) for note in prepared['selectedNotes']) != sum(int(output[2]) for output in outputs) + 10000:
        raise ValueError('Recovered input/output/change/fee conservation required')
    return {'attestationMode': MODE, 'recoveredOutputs': len(outputs), 'recipientOutputIndex': external[0][0]}


def recover_operator_outputs(config, request, prepared, height, sdk):
    from pathlib import Path
    import hashlib
    if config.get('recipientProofMode') != MODE or 'recipientUfvkFile' in config:
        raise ValueError('Explicit separate operator proof mode required')
    key = Path(config['operatorUfvkFile']).read_text().strip()
    if hashlib.sha256(key.encode()).hexdigest() != config['capitalUfvkSha256']:
        raise ValueError('Operator outgoing key identity mismatch')
    decoded = sdk({'command': 'recover_outgoing', 'ufvk': key, 'raw_hex': prepared['rawTransaction'], 'txid': prepared['txid'], 'height': height})
    del key
    return validate_outgoing_recovery(decoded, request, prepared, sdk)
