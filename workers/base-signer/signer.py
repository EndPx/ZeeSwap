"""Restricted Base Sepolia signer. JSON stdin/stdout; no broadcast and no key export.

An independent fsynced journal survives application database restores. Keep this
directory and the encrypted cast keystore private. One OS owner is not a sandbox.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from signer_diagnostics import SignerTrace, OwnedReadTimeout, OwnedFinalityWait, READ_STAGES, owned_signer_lock

FIELDS = {"id", "token", "recipient", "amount", "nonce", "deadline"}
TYPES = [{"name": k, "type": t} for k, t in [
    ("id", "bytes32"), ("token", "address"), ("recipient", "address"),
    ("amount", "uint256"), ("nonce", "uint256"), ("deadline", "uint256")]]


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def save(path, value):
    temporary = path.with_suffix(".tmp")
    with open(temporary, "w", encoding="utf-8") as output:
        os.chmod(temporary, 0o600)
        output.write(canonical(value)); output.flush(); os.fsync(output.fileno())
    os.replace(temporary, path)
    descriptor = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def cast_object(text):
    value = json.loads(text)
    envelope = {'schema_version', 'success', 'data', 'errors', 'warnings'}
    if isinstance(value, dict) and envelope.intersection(value):
        if (set(value) != envelope or type(value.get('schema_version')) is not int or value['schema_version'] != 1
                or value.get('success') is not True or value.get('errors') != []
                or not isinstance(value.get('warnings'), list) or not isinstance(value.get('data'), dict)):
            raise ValueError('Invalid finalized header')
        value = value['data']
    if not isinstance(value, dict): raise ValueError('Invalid finalized header')
    return value


def rpc_integer(value):
    if type(value) is str and re.fullmatch(r'0x[0-9a-fA-F]+|0|[1-9][0-9]*', value):
        value = int(value, 16 if value.startswith('0x') else 10)
    if type(value) is not int or not 0 <= value < 2**256: raise ValueError('Invalid finalized header')
    return value


def finalized_header(text):
    value = cast_object(text)
    number, block_hash = rpc_integer(value.get('number')), value.get('hash')
    if (number >= 2**63 or type(block_hash) is not str or not re.fullmatch(r'0x[0-9a-fA-F]{64}', block_hash)):
        raise ValueError('Invalid finalized header')
    return {'number': number, 'hash': block_hash.lower()}


def require_reserve_ahead(config, terms, auth, root, identifier, finalized, cast, trace):
    """Authenticate this signer's existing RESERVE; never infer lag from state 0."""
    def require(condition):
        if not condition: raise ValueError('Original reserve proof invalid')
    trace.stage = 'PAY_RESERVE_JOURNAL'
    reserve = json.loads((root / (identifier + '.RESERVE.tx.json')).read_text())
    require(trace.safe_read() and reserve.get('terms') == terms
            and type(reserve.get('nonce')) is int and reserve['nonce'] >= 0
            and reserve.get('gas') == '450000' and reserve.get('gasPrice') == '20000000'
            and reserve.get('maxCost') == '10000000000000'
            and isinstance(reserve.get('raw'), str) and re.fullmatch(r'0x(?:[0-9a-fA-F]{2})+', reserve['raw'])
            and isinstance(reserve.get('hash'), str) and re.fullmatch(r'0x[0-9a-fA-F]{64}', reserve['hash'])
            and isinstance(auth.get('signature'), str) and re.fullmatch(r'0x[0-9a-fA-F]{130}', auth['signature']))
    tuple_ = '(' + ','.join(terms[k] for k in ('id','token','recipient','amount','nonce','deadline')) + ')'
    expected = cast('calldata', 'reservePayout((bytes32,address,address,uint256,uint256,uint256),bytes)', tuple_, auth['signature'], stage='CALLDATA')
    require(reserve.get('data') == expected and cast('keccak', reserve['raw'], stage='RAW_HASH').lower() == reserve['hash'].lower())
    tx_hash = reserve['hash'].lower()
    tx = cast_object(cast('tx', tx_hash, '--json', '--rpc-url', config['rpcUrl'], stage='PAY_RESERVE_TX_READ', read=True))
    receipt = cast_object(cast('receipt', tx_hash, '--json', '--rpc-url', config['rpcUrl'], stage='PAY_RESERVE_RECEIPT_READ', read=True))
    height = rpc_integer(receipt.get('blockNumber'))
    require(height > finalized['number'] and tx.get('hash','').lower() == tx_hash
            and receipt.get('transactionHash','').lower() == tx_hash
            and rpc_integer(receipt.get('status')) == 1
            and tx.get('from','').lower() == config['operator'].lower()
            and receipt.get('from','').lower() == config['operator'].lower()
            and tx.get('to','').lower() == config['settlement'].lower()
            and receipt.get('to','').lower() == config['settlement'].lower()
            and tx.get('input') == expected and rpc_integer(tx.get('type')) == 0
            and rpc_integer(tx.get('chainId')) == 84532 and rpc_integer(tx.get('nonce')) == reserve['nonce']
            and rpc_integer(tx.get('value')) == 0 and rpc_integer(tx.get('gas')) == 450000
            and rpc_integer(tx.get('gasPrice')) == 20000000 and rpc_integer(tx.get('blockNumber')) == height
            and tx.get('blockHash','').lower() == receipt.get('blockHash','').lower())
    gas_used, gas_price, l1_fee = (rpc_integer(receipt.get(k)) for k in ('gasUsed','effectiveGasPrice','l1Fee'))
    require(0 < gas_used <= 450000 and 0 < gas_price <= 20000000
            and gas_used * gas_price + l1_fee <= int(reserve['maxCost']))
    topic = cast('keccak', 'PayoutReserved(bytes32,address,uint256)', stage='RAW_HASH').lower()
    logs = receipt.get('logs')
    require(isinstance(logs, list))
    matching = [v for v in logs if isinstance(v, dict) and v.get('address','').lower() == config['settlement'].lower()
                and isinstance(v.get('topics'), list) and v['topics'] and v['topics'][0].lower() == topic]
    require(len(matching) == 1)
    event = matching[0]
    require(event.get('removed') is False and event.get('transactionHash','').lower() == tx_hash
            and rpc_integer(event.get('blockNumber')) == height and event.get('blockHash','').lower() == receipt['blockHash'].lower()
            and event.get('topics') == [topic, terms['id'], '0x' + '0'*24 + terms['recipient'][2:].lower()]
            and event.get('data') == '0x' + format(int(terms['amount']), '064x'))
    anchor_text = cast('block', str(height), '--json', '--rpc-url', config['rpcUrl'], stage='PAY_RESERVE_ANCHOR_READ', read=True)
    anchor = finalized_header(anchor_text)
    require(anchor['number'] == height and anchor['hash'] == receipt['blockHash'].lower()
            and tx_hash in [v.lower() for v in cast_object(anchor_text).get('transactions',[]) if isinstance(v,str)])
    latest_text = cast('block', 'latest', '--json', '--rpc-url', config['rpcUrl'], stage='PAY_LATEST_HEAD_READ', read=True)
    latest = finalized_header(latest_text)
    timestamp = rpc_integer(cast_object(latest_text).get('timestamp'))
    require(latest['number'] >= height and -5 <= time.time() - timestamp <= 60)
    state = cast('call', config['settlement'], 'states(bytes32)(uint8)', terms['id'], '--block', str(latest['number']), '--rpc-url', config['rpcUrl'], stage='PAY_LATEST_STATE_READ', read=True)
    values = cast('call', config['settlement'], 'payouts(bytes32)(address,uint256,uint256)', terms['id'], '--block', str(latest['number']), '--rpc-url', config['rpcUrl'], stage='PAY_LATEST_RECORD_READ', read=True).splitlines()
    require(state == '1' and payout_matches(values, terms))
    for header in (finalized, anchor, latest):
        require(finalized_header(cast('block', str(header['number']), '--json', '--rpc-url', config['rpcUrl'], stage='PAY_CANONICAL_READ', read=True)) == header)
    require(trace.safe_read() and -5 <= time.time() - timestamp <= 60)
    trace.stage = 'PAY_RESERVE_AHEAD'
    raise OwnedFinalityWait()


def payout_matches(values, terms):
    return (len(values) == 3 and values[0].lower() == terms['recipient'].lower()
            and int(values[1].split()[0]) == int(terms['amount']) and int(values[2].split()[0]) == int(terms['deadline']))


CAST_TIMEOUT_SECONDS = 25


def run(config, request, trace=None):
    trace = trace or SignerTrace()
    trace.bind(request)
    trace.stage = 'REQUEST_VALIDATE'
    def cast(*parts, stage=None, read=False):
        if stage: trace.stage = stage
        trace.read_child_completed = False
        try:
            result = subprocess.run([config["cast"], *parts], capture_output=True, text=True,
                                    timeout=CAST_TIMEOUT_SECONDS, check=True,
                                    pass_fds=() if trace.lock_fd is None else (trace.lock_fd,))
            trace.read_child_completed = True
            return result.stdout.strip()
        except subprocess.TimeoutExpired:
            # subprocess.run kills and waits its direct child before raising.
            trace.read_child_completed = True
            if read and trace.stage in READ_STAGES and trace.safe_read():
                raise OwnedReadTimeout(trace.stage) from None
            raise


    if set(request) != {"command", "terms", "phase"} or request["phase"] not in ("RESERVE", "PAY") or request["command"] not in ("authorize", "prepare") or request["command"] == "authorize" and request["phase"] != "RESERVE":
        raise ValueError("Unsupported signer request")
    terms = request["terms"]
    if set(terms) != FIELDS or not re.fullmatch(r"0x[0-9a-f]{64}", terms["id"]):
        raise ValueError("Invalid terms")
    if terms["token"].lower() != config["token"].lower():
        raise ValueError("Wrong asset")
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", terms["recipient"]) or int(terms["recipient"], 16) == 0 or terms["recipient"].lower() == config["settlement"].lower():
        raise ValueError("Invalid recipient")
    for name in ("amount", "nonce", "deadline"):
        if not isinstance(terms[name], str) or not re.fullmatch(r"0|[1-9][0-9]{0,77}", terms[name]) or int(terms[name]) >= 2**256:
            raise ValueError("Invalid integer")
    if not 100_000 <= int(terms["amount"]) <= 10_000_000:
        raise ValueError("Amount outside prototype limits")
    if not config["rpcUrl"].startswith("https://") or cast("chain-id", "--rpc-url", config["rpcUrl"], stage="CHAIN_ID_READ", read=True) != "84532":
        raise ValueError("Wrong network")
    wallet_args = ["--account", config["account"], "--password-file", config["passwordFile"]]
    if cast("wallet", "address", *wallet_args, stage="WALLET_ADDRESS").lower() != config["operator"].lower():
        raise ValueError("Wrong signer")
    # Verify immutable deployed code before signing anything.
    for address, expected, label in ((config["settlement"], config["settlementCodeHash"], "SETTLEMENT"), (config["token"], config["tokenCodeHash"], "TOKEN")):
        code = cast("code", address, "--rpc-url", config["rpcUrl"], stage=label+"_CODE_READ", read=True)
        if cast("keccak", code, stage=label+"_CODE_HASH") != expected:
            raise ValueError("Deployment changed")
    root = Path(config["journalRoot"])
    trace.stage = "JOURNAL_ROOT"
    if not root.exists(): trace.mutate("JOURNAL_ROOT")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with owned_signer_lock(root, trace) as lock:
        identifier = hashlib.sha256(terms["id"].encode()).hexdigest()
        auth_path = root / (identifier + ".auth.json")
        if auth_path.exists():
            trace.stage = "AUTH_READ"
            auth = json.loads(auth_path.read_text())
            if auth["terms"] != terms:
                raise ValueError("Immutable authorization conflict")
        else:
            if not int(time.time()) < int(terms["deadline"]) <= int(time.time()) + 86460:
                raise ValueError("Invalid authorization lifetime")
            typed = {"domain": {"name": "ZeeSwapSettlement", "version": "1", "chainId": 84532,
                     "verifyingContract": config["settlement"]}, "types": {"Payout": TYPES}, "primaryType": "Payout", "message": terms}
            # File input keeps typed payloads out of process arguments.
            typed_path = root / (identifier + ".typed.json")
            trace.mutate("TYPED_SAVE")
            save(typed_path, typed)
            trace.mutate("AUTH_SIGN")
            trace.signing_started = True
            signature = cast("wallet", "sign", "--data", "--from-file", str(typed_path), *wallet_args, stage="AUTH_SIGN")
            if not re.fullmatch(r"0x[0-9a-fA-F]{130}", signature):
                raise ValueError("Invalid signature result")
            auth = {"terms": terms, "signature": signature}
            trace.mutate("AUTH_SAVE")
            save(auth_path, auth)
        if request["command"] == "authorize":
            return {"signature": auth["signature"]}
        phase = request["phase"]
        path = root / (identifier + "." + phase + ".tx.json")
        if path.exists():
            trace.stage = "TX_READ"
            prepared = json.loads(path.read_text())
            if prepared["terms"] != terms:
                raise ValueError("Immutable transaction conflict")
        else:
            if int(time.time()) >= int(terms["deadline"]):
                raise ValueError("Authorization expired")
            if phase == "PAY":
                finalized = finalized_header(cast("block", "finalized", "--json", "--rpc-url", config["rpcUrl"], stage="PAY_HEAD_READ", read=True))
                block = str(finalized['number'])
                state = cast("call", config["settlement"], "states(bytes32)(uint8)", terms["id"], "--block", block, "--rpc-url", config["rpcUrl"], stage="PAY_STATE_READ", read=True)
                values = cast("call", config["settlement"], "payouts(bytes32)(address,uint256,uint256)", terms["id"], "--block", block, "--rpc-url", config["rpcUrl"], stage="PAY_RECORD_READ", read=True).splitlines()
                if state != "1" or not payout_matches(values, terms):
                    if (state == '0' and len(values) == 3 and values[0].lower() == '0x'+'0'*40
                            and int(values[1].split()[0]) == 0 and int(values[2].split()[0]) == 0 and trace.safe_read()):
                        require_reserve_ahead(config, terms, auth, root, identifier, finalized, cast, trace)
                    raise ValueError("Finalized reservation missing or changed")
                canonical = finalized_header(cast("block", block, "--json", "--rpc-url", config["rpcUrl"], stage="PAY_CANONICAL_READ", read=True))
                if canonical != finalized:
                    raise ValueError("Canonical finalized header changed")
            trace.mutate("NONCE_READ")
            trace.nonce_started = True
            pending = int(cast("nonce", config["operator"], "--block", "pending", "--rpc-url", config["rpcUrl"], stage="NONCE_READ"))
            trace.stage = "NONCE_SCAN"
            for record in root.glob("*.tx.json"):
                previous = json.loads(record.read_text())
                if previous["nonce"] >= pending:
                    raise ValueError("Earlier signer nonce unresolved")
            if phase == "RESERVE":
                tuple_ = "(" + ",".join(terms[k] for k in ("id", "token", "recipient", "amount", "nonce", "deadline")) + ")"
                data = cast("calldata", "reservePayout((bytes32,address,address,uint256,uint256,uint256),bytes)", tuple_, auth["signature"], stage="CALLDATA")
            else:
                data = cast("calldata", "executePayout(bytes32)", terms["id"], stage="CALLDATA")
            prepared = {"terms": terms, "nonce": pending, "data": data, "gas": "450000", "gasPrice": "20000000", "maxCost": "10000000000000"}
            trace.mutate("TX_INTENT_SAVE")
            save(path, prepared)
        if "raw" not in prepared:
            trace.mutate("MKTX")
            trace.signing_started = True
            prepared["raw"] = cast("mktx", config["settlement"], prepared["data"], "--legacy",
                "--gas-limit", prepared["gas"], "--gas-price", prepared["gasPrice"], "--nonce", str(prepared["nonce"]),
                "--chain", "84532", "--value", "0", "--rpc-url", config["rpcUrl"], *wallet_args, stage="MKTX")
            prepared["hash"] = cast("keccak", prepared["raw"], stage="RAW_HASH")
            trace.mutate("TX_SAVE")
            save(path, prepared)
        trace.stage = "OUTPUT"
        return {k: prepared[k] for k in ("raw", "hash", "nonce", "maxCost")}


class SignerArguments(argparse.ArgumentParser):
    def error(self, _message):
        raise ValueError('Invalid signer arguments')


def main(trace):
    os.umask(0o077)
    parser = SignerArguments()
    parser.add_argument("--config", required=True, type=Path)
    args = parser.parse_args()
    trace.stage = 'INPUT_READ'
    request = sys.stdin.read(16385)
    if len(request) > 16384:
        raise ValueError("Request too large")
    request = json.loads(request)
    trace.bind(request)
    trace.stage = 'CONFIG_READ'
    config = json.loads(args.config.read_text())
    print(json.dumps(run(config, request, trace)))


if __name__ == "__main__":
    trace = SignerTrace()
    try:
        main(trace)
    except Exception as error:
        trace.record(error)
        for packet in [trace.primary, *trace.cleanup]:
            if packet:
                try: print(json.dumps(packet), file=sys.stderr)
                except Exception: pass
        wait = trace.wait(error)
        if wait:
            print(json.dumps(wait))
            sys.exit(76 if isinstance(error, OwnedFinalityWait) else 75)
        # Never print cast errors, signed payloads, passwords, or private mappings.
        try: print("BASE_SIGNER_UNAVAILABLE: inspect private journal and operator configuration", file=sys.stderr)
        except Exception: pass
        sys.exit(1)
