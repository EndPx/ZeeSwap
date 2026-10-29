"""Independent persisted-prefix proof. Never fetches a volatile latest block body."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys


def read_persisted(service, messages, source_id, first, last):
    if type(first) is not int or type(last) is not int or not 0 <= first <= last <= 0xffffffff or last - first >= 1000:
        raise ValueError('PERSISTED_RANGE_BOUND')
    info = service.GetLightdInfo(messages.Empty(), timeout=10)
    if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
        raise ValueError('PERSISTED_NETWORK_OR_BRANCH')
    latest = service.GetLatestBlock(messages.ChainSpec(), timeout=10).height
    if type(latest) is not int or not last <= latest <= 0xffffffff:
        raise ValueError('PERSISTED_SOURCE_BEHIND')
    headers = []
    for block in service.GetBlockRange(messages.BlockRange(start=messages.BlockID(height=first), end=messages.BlockID(height=last)), timeout=20):
        height = first + len(headers)
        if height > last or block.height != height or len(block.hash) != 32 or len(block.prevHash) != 32:
            raise ValueError('PERSISTED_RANGE_HEADER')
        header = {'height': height, 'hash': bytes(block.hash)[::-1].hex(), 'parentHash': bytes(block.prevHash)[::-1].hex(), 'time': datetime.fromtimestamp(block.time, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
        if headers and header['parentHash'] != headers[-1]['hash']:
            raise ValueError('PERSISTED_RANGE_PARENT')
        headers.append(header)
    if len(headers) != last - first + 1:
        raise ValueError('PERSISTED_RANGE_INCOMPLETE')
    return {'kind': 'independent-persisted-range-v1', 'sourceId': source_id, 'latestHeight': latest, 'fromHeight': first, 'throughHeight': last, 'headers': headers}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    config = json.loads(parser.parse_args().config.read_text())
    request = json.loads(sys.stdin.read(1024))
    if set(request) != {'command', 'fromHeight', 'throughHeight'} or request['command'] != 'persisted-range':
        raise ValueError('PERSISTED_REQUEST')
    if config['lightwalletd'] != 'testnet.zec.rocks:443':
        raise ValueError('PERSISTED_ENDPOINT')
    sys.path.insert(0, str(Path(config['protoDir']).resolve()))
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    with grpc.secure_channel(config['lightwalletd'], grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        print(json.dumps(read_persisted(service, messages, config['canonicalSourceId'], request['fromHeight'], request['throughHeight'])))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('CHEF_PERSISTED_RANGE_FAILED', file=sys.stderr)
        sys.exit(1)
