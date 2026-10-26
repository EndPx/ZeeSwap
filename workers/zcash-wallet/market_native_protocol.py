"""Market-reference testnet approvals. Source mock units and native units stay distinct."""
from datetime import datetime
import hashlib
import json
import re


def need(value, code):
    if not value: raise ValueError('MARKET_NATIVE_' + code)


def exact(value, fields):
    need(type(value) is dict and set(value) == set(fields.split()), 'FIELDS')


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def units(value):
    need(type(value) is str and re.fullmatch(r'[1-9][0-9]{0,77}', value), 'INTEGER_UNITS')
    return int(value)


def instant(value):
    need(type(value) is str and re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z', value), 'TIMESTAMP')
    return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)


def decimal18(value):
    need(type(value) is str and re.fullmatch(r'(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?', value), 'DECIMAL_PRICE')
    whole, _, fraction = value.partition('.')
    scaled = int(whole) * 10**18 + int(fraction.ljust(18, '0') or '0')
    need(scaled > 0, 'POSITIVE_PRICE')
    return scaled


def hex_id(value, width=64):
    need(type(value) is str and re.fullmatch('0x[0-9a-fA-F]{' + str(width) + '}', value)
         and int(value, 16) > 0, 'HEX_IDENTITY')


def validate_quote(q):
    exact(q, 'id direction executionMode priceMode inputAmount outputAmount recipient refundRecipient acceptedAt quoteExpiresAt pricing')
    need(q['direction'] in ('BASE_TO_ZCASH', 'ZCASH_TO_BASE') and q['priceMode'] == 'market-reference'
         and q['executionMode'] == ('base-escrow-v1' if q['direction'] == 'BASE_TO_ZCASH' else 'base-settlement-v1'), 'QUOTE_MODE')
    need(type(q['id']) is str and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', q['id']), 'QUOTE_ID')
    need(all(type(q[k]) is str and 1 <= len(q[k]) <= 512 for k in ('recipient', 'refundRecipient')), 'QUOTE_RECIPIENTS')
    p = q['pricing']
    exact(p, 'version snapshotId snapshotSha256 source pair side retrievedAt expiresAt acceptedAt locked rateNumerator rateDenominator sourcePairs')
    need(type(p['version']) is int and p['version'] == 1 and p['source'] == 'Kraken' and p['pair'] == 'ZEC/USDC'
         and p['locked'] is True and p['acceptedAt'] == q['acceptedAt'], 'LOCKED_SNAPSHOT')
    need(type(p['snapshotId']) is str and re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', p['snapshotId']), 'SNAPSHOT_ID')
    retrieved, expiry, accepted = map(instant, (p['retrievedAt'], p['expiresAt'], q['acceptedAt']))
    need(retrieved <= accepted < expiry <= retrieved + 30000 and accepted < instant(q['quoteExpiresAt']), 'ACCEPTANCE_WINDOW')
    legs = p['sourcePairs']
    need(type(legs) is list and len(legs) == 2, 'SOURCE_LEGS')
    for leg, pair, provider in zip(legs, ('ZEC/USD', 'USDC/USD'), ('XZECZUSD', 'USDCUSD')):
        exact(leg, 'pair providerPair bid ask mid')
        need(leg['pair'] == pair and leg['providerPair'] == provider and decimal18(leg['bid']) <= decimal18(leg['ask']), 'SOURCE_PAIR')
        need(type(leg['mid']) is str and re.fullmatch(r'(0|[1-9][0-9]*)\.[0-9]{12}', leg['mid'])
             and int(leg['mid'].replace('.', '')) == (decimal18(leg['bid']) + decimal18(leg['ask'])) * 10**12 // (2 * 10**18), 'SOURCE_MID')
    zec, usdc = legs
    payload = ['zeeswap-market-price-v1', p['snapshotId'], 'Kraken', 'ZEC/USDC', p['retrievedAt'], p['expiresAt'],
               'XZECZUSD', zec['bid'], zec['ask'], 'USDCUSD', usdc['bid'], usdc['ask']]
    expected = hashlib.sha256(json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    need(p['snapshotSha256'] == expected, 'SNAPSHOT_DIGEST')
    bid12 = decimal18(zec['bid']) * 10**12 // decimal18(usdc['ask'])
    ask_numerator = decimal18(zec['ask']) * 10**12
    ask_denominator = decimal18(usdc['bid'])
    ask12 = (ask_numerator + ask_denominator - 1) // ask_denominator
    reverse = q['direction'] == 'BASE_TO_ZCASH'
    numerator, denominator = (10**12, ask12) if reverse else (bid12, 10**12)
    need(p['side'] == ('inverse-ask' if reverse else 'bid') and units(p['rateNumerator']) == numerator
         and units(p['rateDenominator']) == denominator, 'CONSERVATIVE_RATE')
    source, destination = units(q['inputAmount']), units(q['outputAmount'])
    need(100000 <= source <= 10000000 and (10000 if reverse else 100000) <= destination <= 10000000, 'QUOTE_BOUNDS')
    output = source * numerator * 10**(8 if reverse else 6) // (denominator * 10**(6 if reverse else 8))
    need(output == destination, 'EXACT_DESTINATION')
    # Deliberately no current-time/provider check: an accepted liability never reprices.
    return digest(q)


def validate_request(request, approved_digest):
    if type(request) is dict and request.get('purpose') == 'market-refund-v1':
        return validate_market_refund(request, approved_digest)
    exact(request, 'version purpose orderId settlementId recipient amountZatoshi maxFeeZatoshi quote base')
    need(digest(request) == approved_digest, 'APPROVAL_DIGEST')
    need(type(request['version']) is int and request['version'] == 1 and request['purpose'] == 'market-reverse-v1', 'PURPOSE')
    validate_quote(request['quote'])
    q, base = request['quote'], request['base']
    need(q['direction'] == 'BASE_TO_ZCASH' and q['id'] == request['orderId'] and q['recipient'] == request['recipient']
         and q['outputAmount'] == request['amountZatoshi'] and request['maxFeeZatoshi'] == '10000', 'NATIVE_OUTPUT_BINDING')
    hex_id(request['settlementId'])
    exact(base, 'chainId contract token payer refundRecipient amountAtomic cancellationAvailableAt commitTxHash commitBlockNumber commitBlockHash')
    need(type(base['chainId']) is int and base['chainId'] == 84532 and base['amountAtomic'] == q['inputAmount']
         and base['refundRecipient'].lower() == q['refundRecipient'].lower(), 'SOURCE_INPUT_BINDING')
    for key in ('contract', 'token', 'payer', 'refundRecipient'): hex_id(base[key], 40)
    for key in ('commitTxHash', 'commitBlockHash'): hex_id(base[key])
    units(base['commitBlockNumber']); units(base['cancellationAvailableAt'])
    return approved_digest


def validate_market_refund(request, approved_digest):
    exact(request, 'version purpose kind orderId depositId settlementId recipient amountZatoshi maxFeeZatoshi quote source base')
    need(digest(request) == approved_digest, 'REFUND_APPROVAL_DIGEST')
    validate_quote(request['quote'])
    q=request['quote'];source=request['source']
    exact(source, 'depositId receivedAmount classification')
    need(q['direction']=='ZCASH_TO_BASE' and q['id']==request['orderId'] and request['purpose']=='market-refund-v1'
         and request['recipient']==q['refundRecipient'] and source['depositId']==request['depositId']
         and source['receivedAmount']==request['amountZatoshi'] and source['classification'] in ('EXACT','UNDER','OVER','LATE'), 'FULL_SOURCE_REFUND')
    if source['classification']=='EXACT':need(request['amountZatoshi']==q['inputAmount'],'EXACT_SOURCE_REFUND')
    # Retain every legacy native-refund request assertion without adding new fields
    # to its protocol. New market fields are authenticated independently above.
    from refund_preflight import validate_refund_request
    legacy={key:request[key] for key in ('version','kind','orderId','depositId','settlementId','recipient','amountZatoshi','maxFeeZatoshi','base')}
    validate_refund_request(legacy,digest(legacy))
    return approved_digest
