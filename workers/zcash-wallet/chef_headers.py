"""Bounded independent lightwalletd header reader. Never opens wallet storage."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    request = json.loads(sys.stdin.read(1024))
    expected = {'sample': {'command'}, 'header': {'command', 'height'}, 'range': {'command', 'fromHeight', 'throughHeight'}}
    if request.get('command') not in expected or set(request) != expected[request['command']]:
        raise ValueError('Invalid header request')
    if request['command'] == 'header' and (type(request['height']) is not int or not 0 <= request['height'] <= 0xffffffff):
        raise ValueError('Invalid height')
    if request['command'] == 'range' and (type(request['fromHeight']) is not int or type(request['throughHeight']) is not int or not 0 <= request['fromHeight'] <= request['throughHeight'] <= 0xffffffff or request['throughHeight'] - request['fromHeight'] >= 1000):
        raise ValueError('Invalid range')
    sys.path.insert(0, str(Path(config['protoDir']).resolve()))
    import grpc
    import service_pb2 as messages
    import service_pb2_grpc as services
    with grpc.secure_channel(config['lightwalletd'], grpc.ssl_channel_credentials()) as channel:
        service = services.CompactTxStreamerStub(channel)
        info = service.GetLightdInfo(messages.Empty(), timeout=10)
        if info.chainName != 'test' or info.consensusBranchId.lower() != '77190ad9':
            raise ValueError('Network or branch mismatch')
        def project(block, height):
            if block.height != height or len(block.hash) != 32 or len(block.prevHash) != 32:
                raise ValueError('Invalid block header')
            return {'height': height, 'hash': bytes(block.hash)[::-1].hex(), 'parentHash': bytes(block.prevHash)[::-1].hex(),
                    'time': datetime.fromtimestamp(block.time, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
        if request['command'] == 'range':
            headers = []
            stream = service.GetBlockRange(messages.BlockRange(start=messages.BlockID(height=request['fromHeight']), end=messages.BlockID(height=request['throughHeight'])), timeout=20)
            for block in stream:
                height = request['fromHeight'] + len(headers)
                if height > request['throughHeight']:
                    raise ValueError('Excess range')
                header = project(block, height)
                if headers and header['parentHash'] != headers[-1]['hash']:
                    raise ValueError('Non-contiguous range')
                headers.append(header)
            if len(headers) != request['throughHeight'] - request['fromHeight'] + 1:
                raise ValueError('Incomplete range')
            print(json.dumps({'headers': headers}))
            return
        height = info.blockHeight if request['command'] == 'sample' else request['height']
        header = project(service.GetBlock(messages.BlockID(height=height), timeout=10), height)
        result = header if request['command'] == 'header' else {'head': header, 'sourceId': config['canonicalSourceId'],
                  'checkedAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')}
        print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('CHEF_CANONICAL_HEADER_FAILED', file=sys.stderr)
        sys.exit(1)
