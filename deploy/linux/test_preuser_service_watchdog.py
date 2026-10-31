import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('watchdog', Path(__file__).with_name('preuser-service-watchdog.py'))
watchdog = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(watchdog)


class Effects:
    def __init__(self, fresh=True, active=False, gate=True, pending=False):
        self.value = {'status': 'AUTO_SOURCE_PREUSER_IDLE', 'safeToGracefullyStop': True,
                      'manualReview': False, 'pendingPublication': pending,
                      'sourceFresh': fresh, 'financialWorkerLease': active}
        self.states = {u: {'ActiveState': 'inactive', 'MainPID': '0'}
                       for u in (watchdog.WORKER, watchdog.NATIVE, watchdog.BASE)}
        if active:
            self.states[watchdog.WORKER] = {'ActiveState': 'active', 'MainPID': '123'}
        self.events = []
        self.marker = False
        self.gate_pass = gate
        self.budget = True
        self.result = {'status': 'AUTO_SOURCE_METADATA_COMMITTED_EXACT',
                       'resumeOrdinaryConsumers': True, 'pendingPublication': False}

    def inspect(self):
        self.events.append('inspect')
        return dict(self.value)

    def state(self, unit):
        return self.states[unit]

    def stop(self, unit):
        self.events.append(('stop', unit))
        self.states[unit] = {'ActiveState': 'inactive', 'MainPID': '0'}

    def start(self, unit):
        self.events.append(('start', unit))
        self.states[unit] = {'ActiveState': 'active', 'MainPID': '123'}

    def recover(self):
        self.events.append('recover-original')
        self.value['pendingPublication'] = self.result.get('pendingPublication', False)
        self.value['sourceFresh'] = self.result['status'] == 'AUTO_SOURCE_METADATA_COMMITTED_EXACT'
        return self.result

    def recovery_marker_present(self):
        return self.marker

    def gate(self):
        self.events.append('fresh-financial-gate')
        return self.gate_pass

    def ensure_recovery_marker(self):
        self.events.append('marker-block-financial')
        self.marker = True

    def clear_recovery_marker(self):
        self.events.append('marker-cleared-safe')
        self.marker = False

    def consume_start_budget(self):
        self.events.append('budget')
        return self.budget

    def reset_failed(self, unit):
        self.events.append(('reset-failed', unit))


class SupervisionTests(unittest.TestCase):
    def test_default_inspect_never_changes_actor_state(self):
        e = Effects(fresh=False)
        result = watchdog.supervise(e)
        self.assertEqual(result['status'], 'WATCHDOG_INSPECTED_PREUSER')
        self.assertFalse(result['actorAction'])
        self.assertEqual(e.events, ['inspect'])

    def test_active_financial_worker_never_signalled_or_restarted(self):
        e = Effects(fresh=False, active=True)
        result = watchdog.supervise(e, True)
        self.assertEqual(result['status'], 'WATCHDOG_WAIT_EXISTING_WORKER')
        self.assertEqual(e.events, ['inspect'])

    def test_stale_gate_cannot_reset_failed_or_start_worker(self):
        e = Effects(fresh=True, gate=False)
        result = watchdog.supervise(e, True)
        self.assertEqual(result['status'], 'WATCHDOG_WAIT_FRESH_IDLE_GATE')
        self.assertNotIn(('reset-failed', watchdog.WORKER), e.events)
        self.assertNotIn(('start', watchdog.WORKER), e.events)

    def test_recover_ack_resume_consumers_then_gate_and_only_then_worker(self):
        e = Effects(fresh=False)
        result = watchdog.supervise(e, True)
        self.assertEqual(result['status'], 'WATCHDOG_PREUSER_WORKER_START_REQUESTED')
        actions = [x for x in e.events if isinstance(x, tuple)]
        self.assertEqual(actions, [('stop', watchdog.NATIVE), ('stop', watchdog.BASE),
                                   ('start', watchdog.NATIVE), ('start', watchdog.BASE),
                                   ('reset-failed', watchdog.WORKER), ('start', watchdog.WORKER)])
        self.assertLess(e.events.index('recover-original'), e.events.index('fresh-financial-gate'))
        self.assertLess(e.events.index('fresh-financial-gate'), e.events.index('budget'))
        self.assertLess(e.events.index('marker-block-financial'), e.events.index(('stop', watchdog.NATIVE)))
        self.assertLess(e.events.index('recover-original'), e.events.index('marker-cleared-safe'))
        self.assertFalse(e.marker)

    def test_original_pending_or_manual_review_never_resumes_or_starts_worker(self):
        e = Effects(fresh=False)
        e.result = {'status': 'AUTO_SOURCE_MANUAL_REVIEW_REQUIRED',
                    'resumeOrdinaryConsumers': False, 'pendingPublication': True}
        result = watchdog.supervise(e, True)
        self.assertEqual(result['status'], 'WATCHDOG_RECOVERY_WAIT_OR_MANUAL')
        self.assertFalse(any(isinstance(x, tuple) and x[0] == 'start' for x in e.events))
        self.assertNotIn('fresh-financial-gate', e.events)
        self.assertTrue(e.marker)

    def test_read_failure_without_intent_resumes_consumers_without_financial_start(self):
        e = Effects(fresh=False)
        e.result = {'status': 'AUTO_SOURCE_RETRYABLE_READ_FAILURE',
                    'resumeOrdinaryConsumers': True, 'pendingPublication': False}
        result = watchdog.supervise(e, True)
        self.assertEqual(result['status'], 'WATCHDOG_RECOVERY_WAIT_OR_MANUAL')
        self.assertIn(('start', watchdog.NATIVE), e.events)
        self.assertIn(('start', watchdog.BASE), e.events)
        self.assertNotIn(('start', watchdog.WORKER), e.events)
        self.assertFalse(e.marker)

    def test_unknown_recovery_exception_preserves_marker_and_does_not_resume_consumers(self):
        e = Effects(fresh=False)
        def unknown():
            raise RuntimeError('unknown original publication state')
        e.recover = unknown
        with self.assertRaises(RuntimeError):
            watchdog.supervise(e, True)
        self.assertTrue(e.marker)
        self.assertFalse(any(isinstance(x, tuple) and x[0] == 'start' for x in e.events))

    def test_closed_guard_or_budget_failure_performs_no_financial_action(self):
        e = Effects()
        e.value.update(status='AUTO_SOURCE_NOT_ELIGIBLE', safeToGracefullyStop=False, manualReview=True)
        self.assertFalse(watchdog.supervise(e, True)['actorAction'])
        self.assertEqual(e.events, ['inspect'])
        e = Effects()
        e.budget = False
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_START_BACKOFF')
        self.assertNotIn(('reset-failed', watchdog.WORKER), e.events)
        self.assertNotIn(('start', watchdog.WORKER), e.events)

    def test_ineligible_closed_history_requires_execute_and_full_gate_before_worker_only_start(self):
        e = Effects()
        e.value.update(status='AUTO_SOURCE_NOT_ELIGIBLE', safeToGracefullyStop=False)
        self.assertFalse(watchdog.supervise(e)['actorAction'])
        self.assertEqual(e.events, ['inspect'])
        e.events.clear()
        result = watchdog.supervise(e, True)
        self.assertEqual(result['status'], 'WATCHDOG_VERIFIED_IDLE_WORKER_START_REQUESTED')
        self.assertTrue(result['actorAction'])
        self.assertEqual(e.events, ['inspect', 'fresh-financial-gate', 'budget',
                                  ('reset-failed', watchdog.WORKER), ('start', watchdog.WORKER)])

    def test_ineligible_manual_pending_marker_active_or_lease_never_restarts_any_actor(self):
        for change in ('manual', 'pending', 'marker', 'active', 'lease', 'unknown'):
            with self.subTest(change=change):
                e = Effects()
                e.value.update(status='AUTO_SOURCE_NOT_ELIGIBLE', safeToGracefullyStop=False)
                if change == 'manual': e.value['manualReview'] = True
                if change == 'pending': e.value['pendingPublication'] = True
                if change == 'marker': e.marker = True
                if change == 'active': e.states[watchdog.WORKER] = {'ActiveState': 'active', 'MainPID': '123'}
                if change == 'lease': e.value['financialWorkerLease'] = True
                if change == 'unknown': e.value['status'] = 'UNKNOWN'
                self.assertFalse(watchdog.supervise(e, True)['actorAction'])
                self.assertEqual(e.events, ['inspect'])

    def test_ineligible_actual_runner_missing_lease_requires_full_sql_gate(self):
        for gate in (True, False):
            with self.subTest(gate=gate):
                e = Effects(gate=gate)
                e.value.update(status='AUTO_SOURCE_NOT_ELIGIBLE', safeToGracefullyStop=False)
                del e.value['financialWorkerLease']
                result = watchdog.supervise(e, True)
                self.assertEqual(result['actorAction'], gate)
                self.assertIn('fresh-financial-gate', e.events)
                self.assertEqual(('start', watchdog.WORKER) in e.events, gate)
        e = Effects()
        e.value.update(status='AUTO_SOURCE_NOT_ELIGIBLE', financialWorkerLease='false')
        self.assertFalse(watchdog.supervise(e, True)['actorAction'])
        self.assertEqual(e.events, ['inspect'])

    def test_ineligible_gate_refusal_or_four_start_budget_never_resets_failed(self):
        for gate, budget in ((False, True), (True, False)):
            e = Effects(gate=gate)
            e.value.update(status='AUTO_SOURCE_NOT_ELIGIBLE', safeToGracefullyStop=False)
            e.budget = budget
            result = watchdog.supervise(e, True)
            self.assertEqual(result['status'], 'WATCHDOG_START_BACKOFF' if gate else 'WATCHDOG_WAIT_FRESH_IDLE_GATE')
            self.assertFalse(result['actorAction'])
            self.assertFalse(any(isinstance(x, tuple) for x in e.events))
            self.assertNotIn('recover-original', e.events)

    def test_start_budget_is_finite_and_recovers_after_window_without_permanent_lockout(self):
        starts = []
        for now in (1000, 1030, 1060, 1090):
            starts = watchdog.next_start_budget(starts, now)
        self.assertIsNone(watchdog.next_start_budget(starts, 1120))
        self.assertEqual(watchdog.next_start_budget(starts, 1300), [1030, 1060, 1090, 1300])
        with self.assertRaisesRegex(ValueError, 'START_HISTORY'):
            watchdog.next_start_budget([float('nan')], 1300)

    def test_root_reset_failed_skips_inactive_gc_unit_and_only_resets_failed_pid_zero(self):
        e = watchdog.RootEffects.__new__(watchdog.RootEffects)
        for state, should_reset in (('inactive', False), ('failed', True)):
            with self.subTest(state=state):
                e.state = lambda unit, state=state: {'ActiveState': state, 'MainPID': '0'}
                with patch.object(watchdog.subprocess, 'run') as run:
                    e.reset_failed(watchdog.WORKER)
                    if should_reset:
                        run.assert_called_once_with(['systemctl', 'reset-failed', watchdog.WORKER], check=True, timeout=10)
                    else:
                        run.assert_not_called()

    def test_root_reset_failed_refuses_active_transition_or_nonzero_pid(self):
        e = watchdog.RootEffects.__new__(watchdog.RootEffects)
        for state, pid in (('active', '123'), ('activating', '0'), ('deactivating', '0'), ('failed', '123')):
            with self.subTest(state=state, pid=pid):
                e.state = lambda unit, state=state, pid=pid: {'ActiveState': state, 'MainPID': pid}
                with patch.object(watchdog.subprocess, 'run') as run:
                    with self.assertRaisesRegex(ValueError, 'WORKER_NOT_INACTIVE'):
                        e.reset_failed(watchdog.WORKER)
                    run.assert_not_called()

    def test_operational_units_never_target_core_or_stop_financial(self):
        self.assertEqual(watchdog.BASE, 'zeeswap-testnet-envio-observer.service')
        with self.assertRaisesRegex(ValueError, 'NEVER_STOP_FINANCIAL'):
            watchdog.RootEffects.__new__(watchdog.RootEffects).stop(watchdog.WORKER)
        timer = Path(__file__).with_name('zeeswap-preuser-supervision.timer').read_text()
        self.assertIn('OnUnitInactiveSec=30s', timer)


class ClosedEffects(Effects):
    closed_enabled = True

    def __init__(self, fresh=True, active=False, paused=True):
        super().__init__(fresh=fresh, active=active)
        self.info = {'status': 'CLOSED_SERVICE_QUALIFIED', 'paused': paused,
                     'warm': not paused, 'open': False, 'sourceFresh': fresh,
                     'financialWorkerLease': active}
        self.refused = None

    def closed(self, action, execute=False):
        self.events.append(('closed', action, execute))
        if action == self.refused:
            return {'status': 'CLOSED_SERVICE_REFUSED'}
        if action == 'inspect':
            return dict(self.info)
        if action == 'pause':
            self.info.update(paused=True, warm=False)
            return {'status': 'CLOSED_SERVICE_PAUSED'}
        if action == 'resume':
            self.info.update(paused=False, warm=True)
            return {'status': 'CLOSED_SERVICE_DISPATCH_PREPARED'}
        return {'status': 'POLICY_CLOSED_IDLE_RESTART_ALLOWED' if action == 'gate' else 'CLOSED_SERVICE_INTAKE_CHECKED'}

    def stop_closed_worker(self):
        self.events.append('stop-verified-closed-worker')
        self.states[watchdog.WORKER] = {'ActiveState': 'inactive', 'MainPID': '0'}


class ClosedSupervisionTests(unittest.TestCase):
    def test_inspect_never_mutates_even_when_sources_stale(self):
        e = ClosedEffects(fresh=False)
        self.assertEqual(watchdog.supervise(e)['status'], 'WATCHDOG_INSPECTED_CLOSED')
        self.assertEqual(e.events, [('closed', 'inspect', False)])

    def test_metadata_ack_precedes_dispatch_and_gate_and_start(self):
        e = ClosedEffects(fresh=False)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_WORKER_START_REQUESTED')
        self.assertLess(e.events.index('recover-original'), e.events.index(('closed', 'resume', True)))
        self.assertLess(e.events.index(('closed', 'resume', True)), e.events.index(('closed', 'gate', False)))
        self.assertLess(e.events.index(('closed', 'gate', False)), e.events.index(('start', watchdog.WORKER)))
        self.assertNotIn(('closed', 'intake', True), e.events)

    def test_pause_and_exact_closed_recheck_required_before_stop(self):
        e = ClosedEffects(fresh=False, active=True)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_IDLE_WORKER_STOPPED')
        self.assertLess(e.events.index(('closed', 'pause', True)), e.events.index('stop-verified-closed-worker'))
        e = ClosedEffects(fresh=False, active=True)
        e.refused = 'pause'
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CLOSED_FENCE')
        self.assertNotIn('stop-verified-closed-worker', e.events)

    def test_live_funded_or_changed_books_never_signalled(self):
        e = ClosedEffects(fresh=False, active=True)
        e.refused = 'inspect'
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_REFUSED')
        self.assertEqual(e.events, [('closed', 'inspect', False)])

    def test_pending_original_or_failed_closed_resume_cannot_start(self):
        e = ClosedEffects(fresh=False)
        e.result = {'status': 'AUTO_SOURCE_MANUAL_REVIEW_REQUIRED', 'pendingPublication': True, 'resumeOrdinaryConsumers': False}
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_RECOVERY_WAIT')
        self.assertNotIn(('closed', 'resume', True), e.events)
        self.assertNotIn(('start', watchdog.WORKER), e.events)
        e = ClosedEffects()
        e.refused = 'resume'
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CLOSED_RESUME')
        self.assertNotIn(('start', watchdog.WORKER), e.events)

    def test_warm_actual_worker_may_only_enable_intake(self):
        e = ClosedEffects(active=True, paused=False)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_INTAKE_CHECKED')
        self.assertEqual(e.events, [('closed', 'inspect', False), ('closed', 'intake', True)])

    def test_inactive_unpaused_generation_is_fenced_before_source_inspection(self):
        e = ClosedEffects(paused=False)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_WORKER_START_REQUESTED')
        self.assertLess(e.events.index(('closed', 'pause', True)), e.events.index('inspect'))

    def test_start_backoff_does_not_append_a_new_dispatch_generation(self):
        e = ClosedEffects()
        e.budget = False
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_START_BACKOFF')
        self.assertNotIn(('closed', 'resume', True), e.events)
        self.assertNotIn(('start', watchdog.WORKER), e.events)


if __name__ == '__main__':
    unittest.main()
