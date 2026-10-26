"""Market-only finalized Base COMMIT proof; never invokes a signer or wallet write."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from market_native_protocol import validate_request, need
from reverse_preflight import verify_commitment, rpc_call


def main():
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--approved-request', required=True, type=Path)
    parser.add_argument('--approved-digest', required=True)
    parser.add_argument('--registry', required=True, type=Path)
    args = parser.parse_args()
    config, request = json.loads(args.config.read_text()), json.loads(args.approved_request.read_text())
    validate_request(request, args.approved_digest)
    def command(prefix, payload=None):
        result = subprocess.run(prefix, input=json.dumps(payload) if payload else None,
                                capture_output=True, text=True, timeout=60, check=True)
        need(len(result.stdout) <= 4000000, 'PREFLIGHT_OUTPUT')
        return result.stdout.strip()
    checked = json.loads(command(config['readCommand'], {'command': 'validate', 'address': request['recipient']}))
    need(checked == {'network': 'zcash-testnet', 'shielded': True, 'receiver': request['recipient']}, 'SDK_RECIPIENT')
    need(config['rpcUrl'].startswith('https://'), 'PREFLIGHT_TLS')
    # Reuse only the canonical Base escrow proof. The legacy equality/bounds
    # validator is not called or modified; this request has a distinct protocol.
    proof = verify_commitment(request, json.loads(args.registry.read_text()),
                              lambda method, params: rpc_call(config['rpcUrl'], method, params),
                              lambda code: command(config['hashCommand'] + [code]))
    proof.update(approvedDigest=args.approved_digest, orderId=request['orderId'], purpose='market-reverse-v1')
    print(json.dumps(proof))


if __name__ == '__main__':
    try: main()
    except Exception:
        print('MARKET_NATIVE_FINALIZED_BASE_PROOF_REFUSED', file=sys.stderr)
        sys.exit(1)
