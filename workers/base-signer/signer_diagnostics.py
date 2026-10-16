"""Closed forward signer diagnostics. No exception text or process arguments."""
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
import subprocess

STAGES = {'ARGUMENTS','INPUT_READ','CONFIG_READ','REQUEST_VALIDATE','CHAIN_ID_READ','WALLET_ADDRESS','SETTLEMENT_CODE_READ','SETTLEMENT_CODE_HASH','TOKEN_CODE_READ','TOKEN_CODE_HASH','JOURNAL_ROOT','LOCK_ACQUIRE','LOCK_RELEASE','AUTH_READ','TYPED_SAVE','AUTH_SIGN','AUTH_SAVE','PAY_HEAD_READ','PAY_STATE_READ','PAY_RECORD_READ','PAY_CANONICAL_READ','NONCE_READ','NONCE_SCAN','CALLDATA','TX_INTENT_SAVE','TX_READ','MKTX','RAW_HASH','TX_SAVE','OUTPUT','PAY_RESERVE_JOURNAL','PAY_RESERVE_TX_READ','PAY_RESERVE_RECEIPT_READ','PAY_RESERVE_ANCHOR_READ','PAY_LATEST_HEAD_READ','PAY_LATEST_STATE_READ','PAY_LATEST_RECORD_READ','PAY_RESERVE_AHEAD'}
READ_STAGES = {'CHAIN_ID_READ','SETTLEMENT_CODE_READ','TOKEN_CODE_READ','PAY_HEAD_READ','PAY_STATE_READ','PAY_RECORD_READ','PAY_CANONICAL_READ','PAY_RESERVE_TX_READ','PAY_RESERVE_RECEIPT_READ','PAY_RESERVE_ANCHOR_READ','PAY_LATEST_HEAD_READ','PAY_LATEST_STATE_READ','PAY_LATEST_RECORD_READ'}
POLICIES = {'Unsupported signer request':'REQUEST_INVALID','Invalid terms':'TERMS_INVALID','Wrong asset':'ASSET_CHANGED','Invalid recipient':'RECIPIENT_INVALID','Invalid integer':'INTEGER_INVALID','Amount outside prototype limits':'AMOUNT_OUT_OF_BOUNDS','Wrong network':'NETWORK_CHANGED','Wrong signer':'SIGNER_CHANGED','Deployment changed':'DEPLOYMENT_CHANGED','Immutable authorization conflict':'AUTHORIZATION_CONFLICT','Invalid authorization lifetime':'AUTHORIZATION_LIFETIME_INVALID','Invalid signature result':'SIGNATURE_INVALID','Immutable transaction conflict':'TRANSACTION_CONFLICT','Authorization expired':'AUTHORIZATION_EXPIRED','Finalized reservation missing or changed':'RESERVATION_CHANGED','Earlier signer nonce unresolved':'NONCE_UNRESOLVED','Invalid finalized header':'FINALIZED_HEADER_INVALID','Canonical finalized header changed':'FINALIZED_HEADER_CHANGED','Request too large':'REQUEST_TOO_LARGE','Invalid signer arguments':'ARGUMENTS_INVALID'}
CODES = set(POLICIES.values()) | {'CAST_READ_TIMEOUT','CAST_TIMEOUT_HARD','CAST_NONZERO','FILE_MISSING','FILE_PERMISSION','JSON_INVALID','SIGNER_FAILURE','RESERVE_AHEAD_OF_FINALIZED','ORIGINAL_RESERVE_INVALID'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'))


class OwnedReadTimeout(Exception):
    def __init__(self, stage):
        super().__init__('Owned signer read timeout')
        self.stage = stage


class OwnedFinalityWait(Exception):
    stage = 'PAY_RESERVE_AHEAD'


class SignerTrace:
    def __init__(self):
        self.command = 'UNKNOWN'
        self.phase = 'UNKNOWN'
        self.request_digest = None
        self.stage = 'ARGUMENTS'
        self.new_mutation = False
        self.signing_started = False
        self.nonce_started = False
        self.read_child_completed = False
        self.lock_fd = None
        self.lock_held = False
        self.primary = None
        self.cleanup = []

    def bind(self, request):
        self.request_digest = hashlib.sha256(canonical(request).encode()).hexdigest()
        if isinstance(request, dict):
            self.command = request.get('command') if request.get('command') in ('authorize','prepare') else 'UNKNOWN'
            self.phase = request.get('phase') if request.get('phase') in ('RESERVE','PAY') else 'UNKNOWN'

    def mutate(self, stage):
        self.stage = stage
        self.new_mutation = True

    def safe_read(self):
        return not self.new_mutation and not self.signing_started and not self.nonce_started

    def packet(self, error, stage=None):
        stage = stage or getattr(error, 'stage', None) or self.stage
        if isinstance(error, OwnedFinalityWait): code = 'RESERVE_AHEAD_OF_FINALIZED'
        elif isinstance(error, OwnedReadTimeout): code = 'CAST_READ_TIMEOUT'
        elif isinstance(error, subprocess.TimeoutExpired): code = 'CAST_TIMEOUT_HARD'
        elif isinstance(error, subprocess.CalledProcessError): code = 'CAST_NONZERO'
        elif isinstance(error, FileNotFoundError): code = 'FILE_MISSING'
        elif isinstance(error, PermissionError): code = 'FILE_PERMISSION'
        elif isinstance(error, json.JSONDecodeError): code = 'JSON_INVALID'
        else: code = 'ORIGINAL_RESERVE_INVALID' if str(error) == 'Original reserve proof invalid' else POLICIES.get(str(error), 'SIGNER_FAILURE')
        value = {'version':1,'status':'BASE_SIGNER_DIAGNOSTIC','command':self.command,'phase':self.phase,
                 'requestDigest':self.request_digest,'stage':stage if stage in STAGES else 'ARGUMENTS','code':code}
        if isinstance(error, subprocess.CalledProcessError) and type(error.returncode) is int and -255 <= error.returncode <= 255:
            value['castExit'] = error.returncode
        return value

    def record(self, error, stage=None):
        packet = self.packet(error, stage)
        if self.primary is None: self.primary = packet
        elif stage == 'LOCK_RELEASE' and len(self.cleanup) < 3: self.cleanup.append(packet)

    def wait(self, error):
        if (not isinstance(error, (OwnedReadTimeout, OwnedFinalityWait)) or (isinstance(error, OwnedReadTimeout) and error.stage not in READ_STAGES) or not self.safe_read()
                or not self.read_child_completed or self.lock_held or self.command not in ('authorize','prepare')
                or self.phase not in ('RESERVE','PAY') or not self.request_digest):
            return None
        return {'version':1,'status':'BASE_SIGNER_FINALITY_WAIT' if isinstance(error, OwnedFinalityWait) else 'BASE_SIGNER_READ_WAIT','command':self.command,'phase':self.phase,
                'requestDigest':self.request_digest,'stage':error.stage,'code':'RESERVE_AHEAD_OF_FINALIZED' if isinstance(error, OwnedFinalityWait) else 'CAST_READ_TIMEOUT',
                'noNewMutation':True,'signingStarted':False,'nonceStarted':False,'readChildCompleted':True,'lockHeld':False}


@contextmanager
def owned_signer_lock(root, trace):
    path = root / 'signer.lock'
    if not path.exists(): trace.mutate('LOCK_ACQUIRE')
    trace.stage = 'LOCK_ACQUIRE'
    lock = open(path, 'a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        trace.lock_fd = lock.fileno()
        trace.lock_held = True
        try:
            yield lock
        except Exception as error:
            trace.record(error)
            raise
    finally:
        try:
            lock.close()
            trace.lock_held = False
            trace.lock_fd = None
        except Exception as error:
            trace.record(error, 'LOCK_RELEASE')
            raise
