"""Closed diagnostics for the fixed once-only source actor; never error text."""
import json
import os
from pathlib import Path
import subprocess
import sys

PHASES = {'ARGUMENTS', 'CONFIG_READ', 'RUN_BINDING', 'BINARY_PIN', 'LOCK_ACQUIRE', 'SYNC_INTENT_CHECK',
          'SDK_SYNC', 'VIEW_KEY', 'REFUND_RECEIVER', 'SCAN_STATUS', 'COINS', 'NOTES', 'NETWORK_INFO', 'NETWORK_TIP',
          'SYNC_WRITE', 'FUNDING_READ', 'FUNDING_BINDING', 'INITIAL_FUNDING_BINDING', 'FINAL_FUNDING_BINDING', 'RECEIVER', 'PROPOSE', 'INTENT_WRITE', 'SEND', 'RESULT_WRITE',
          'LOCK_RELEASE', 'AUDIT_EXPORT', 'AUDIT_CANONICAL', 'AUDIT_WRITE', 'VIEW_LOCK', 'VIEW_NOTES', 'SCAN_FRESHNESS', 'FUND_SCAN_CATCHUP', 'PRE_PROPOSAL_FUNDING_BINDING'}
CODES = {'G5_SOURCE_REFUND_RECIPIENT_NOT_OWNED', 'G5_SOURCE_NETWORK', 'G5_SOURCE_RECEIVER', 'G5_SOURCE_FIXED_INTENT_PATH_REQUIRED', 'G5_SOURCE_RUN_FROZEN_OR_CHANGED', 'G5_SOURCE_EXACT_FEE', 'G5_SOURCE_PRIVATE_PATHS_REQUIRED', 'G5_SOURCE_SCAN_STALE', 'G5_SOURCE_RUN_REFUND_BINDING', 'G5_SOURCE_TRANSPARENT_CAPITAL_REFUSED', 'G5_SOURCE_UFVK_BINDING', 'G5_SOURCE_PREQUOTE_SYNC_BINDING', 'G5_SOURCE_RUN_BINDING', 'G5_SOURCE_CORE_SLOT_BINDING', 'G5_SOURCE_FUNDING_BINDING', 'G5_SOURCE_ORIGINAL_OPERATION_RECOVERY_REQUIRED', 'G5_SOURCE_BINARY_PIN', 'G5_SOURCE_PREQUOTE_SYNC_STALE', 'G5_SOURCE_WALLET_BINDING', 'G5_SOURCE_FIXED_SYNC_PATH_REQUIRED', 'G5_SOURCE_SEQUENCE', 'G5_SOURCE_FIXED_CORE_FUNDING_PATH', 'G5_SOURCE_ABSOLUTE_PRIVATE_PATH', 'G5_SOURCE_UNKNOWN_OUTCOME_RECOVER_ORIGINAL', 'G5_SOURCE_WALLET_COMMAND_FAILED', 'G5_SOURCE_NOTE_BINDING', 'G5_SOURCE_APPROVED_NOTE_MISMATCH', 'G5_SOURCE_MINIMUM_EIGHT_BLOCK_WINDOW', 'G5_SOURCE_EXACT_ONE_NOTE', 'G5_SOURCE_COMPLETE_SCAN_REQUIRED'}
CODES.update({'G5_SOURCE_AUDIT_LITERAL_SEQUENCE_REQUIRED','G5_SOURCE_ARCHIVED_ATTEMPT_ARTIFACT_REQUIRED','G5_SOURCE_ARGUMENTS_REQUIRED','G5_SOURCE_AUDIT_PROCESS_UNRESOLVED','G5_SOURCE_AUDIT_PROCESS_ACTIVE','G5_SOURCE_AUDIT_VIEW_PENDING','G5_SOURCE_AUDIT_VIEW_BINDING','G5_SOURCE_AUDIT_CUTOFF_NOT_RECONCILED','G5_SOURCE_AUDIT_PENDING_CALCULATION','G5_SOURCE_AUDIT_LITERAL_SEVENTH_REQUIRED','G5_SOURCE_AUDIT_CANONICAL_CHANGED','G5_SOURCE_AUDIT_ORIGINAL_ARTIFACT_CHANGED','SOURCE_RPC_UNAVAILABLE', 'SOURCE_RPC_DEADLINE', 'SOURCE_SDK_TIMEOUT', 'SOURCE_JSON_INVALID',
              'SOURCE_FILE_MISSING', 'SOURCE_FILE_PERMISSION', 'SOURCE_ACTOR_REFUSED', 'G5_SOURCE_OWNED_LOCK_CHANGED','G5_SOURCE_SCAN_TIP_INVALID'})


class SourceReadUnavailable(Exception):
    def __init__(self, code, phase):
        super().__init__('Source read unavailable')
        self.source_code = code
        self.source_phase = phase


class SourceScanBehind(ValueError):
    def __init__(self, scanned, tip):
        super().__init__('G5_SOURCE_SCAN_STALE')
        self.source_phase = 'SCAN_FRESHNESS'
        self.scanned_height = scanned
        self.tip_height = tip


class SourceActorState:
    def __init__(self):
        self.command = None
        self.sequence = None
        self.phase = 'ARGUMENTS'
        self.sdk_active = False
        self.sdk_completed = False
        self.uncertain = False
        self.proposal_started = False
        self.intent_created = False
        self.lock_acquired = False
        self.lock_released = False


def absent(path):
    try:
        os.lstat(path)
    except FileNotFoundError:
        return True
    return False


def diagnostic_packet(error, state, phase=None):
    phase = phase or getattr(error, 'source_phase', None) or state.phase
    if isinstance(error, SourceReadUnavailable) and error.source_code in ('SOURCE_RPC_UNAVAILABLE', 'SOURCE_RPC_DEADLINE'):
        code = error.source_code
    elif str(error) in CODES:
        code = str(error)
    elif isinstance(error, subprocess.TimeoutExpired):
        code = 'SOURCE_SDK_TIMEOUT'
    elif isinstance(error, json.JSONDecodeError):
        code = 'SOURCE_JSON_INVALID'
    elif isinstance(error, FileNotFoundError):
        code = 'SOURCE_FILE_MISSING'
    elif isinstance(error, PermissionError):
        code = 'SOURCE_FILE_PERMISSION'
    else:
        code = 'SOURCE_ACTOR_REFUSED'
    return {'version': 1, 'status': 'G5_SOURCE_ACTOR_DIAGNOSTIC',
            'command': state.command if state.command in ('sync', 'fund', 'audit-unfunded') else 'initialization',
            'phase': phase if phase in PHASES else 'ARGUMENTS', 'code': code,
            **({'scannedHeight': error.scanned_height, 'tipHeight': error.tip_height} if isinstance(error, SourceScanBehind) else {}),
            **({'sequence': state.sequence} if type(state.sequence) is int and state.sequence in range(1, 20, 2) else {})}


def report(error, state, phase=None):
    if getattr(error, '_source_reported', False):
        return
    try:
        print(json.dumps(diagnostic_packet(error, state, phase)), file=sys.stderr, flush=True)
        error._source_reported = True
    except Exception:
        pass


def prefund_wait(error, state, private_root):
    scan_wait = (isinstance(error, SourceScanBehind) and type(error.scanned_height) is int
                 and type(error.tip_height) is int and 0 <= error.scanned_height < error.tip_height - 1)
    rpc_wait = (isinstance(error, SourceReadUnavailable) and error.source_code in ('SOURCE_RPC_UNAVAILABLE','SOURCE_RPC_DEADLINE')
                and error.source_phase in ('NETWORK_INFO','NETWORK_TIP'))
    if (not (scan_wait or rpc_wait) or state.command != 'sync'
            or type(state.sequence) is not int or state.sequence not in range(1, 20, 2)
            or not state.sdk_completed or state.sdk_active or state.uncertain or state.proposal_started or state.intent_created
            or not state.lock_acquired or not state.lock_released):
        return None
    root = Path(private_root)
    if not all(absent(root / name) for name in ('source-funding-intent.private.json', 'source-funding-intent.private.json.result.json', 'source-actor.lock')):
        return None
    return {'version': 1, 'status': 'SOURCE_PREFUND_WAIT', 'command': 'sync', 'sequence': state.sequence,
            'phase': error.source_phase, 'code': 'G5_SOURCE_SCAN_STALE' if scan_wait else error.source_code,
            **({'scannedHeight': error.scanned_height, 'tipHeight': error.tip_height} if scan_wait else {}), 'sdkCompleted': True, 'sdkActive': False,
            'uncertain': False, 'proposalStarted': False, 'intentCreated': False,
            'intentAbsent': True, 'resultAbsent': True, 'lockReleased': True}
