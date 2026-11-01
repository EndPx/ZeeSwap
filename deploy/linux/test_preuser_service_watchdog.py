import importlib.util
import json
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
        self.value['sourceStale'] = not fresh
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
    def test_transient_freshness_miss_never_fences_active_open_worker(self):
        e = ClosedEffects(fresh=False, active=True, paused=False)
        e.info.update(warm=False, open=True)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_EXISTING_WORKER')
        self.assertEqual(e.events, [('closed', 'inspect', False)])

    def test_transient_freshness_miss_keeps_warm_worker_for_actual_intake_gate(self):
        e = ClosedEffects(fresh=False, active=True, paused=False)
        e.refused = 'intake'
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_ACTUAL_CAPITAL')
        self.assertEqual(e.events, [('closed', 'inspect', False), ('closed', 'intake', True)])

    def test_native_only_staleness_does_not_interrupt_base_for_metadata_recovery(self):
        e = ClosedEffects(fresh=False)
        e.value['sourceStale'] = False
        for unit in (watchdog.NATIVE, watchdog.BASE):
            e.states[unit] = {'ActiveState': 'active', 'MainPID': '123'}
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CLOSED_SOURCE_FRESHNESS')
        self.assertEqual(e.events, [('closed', 'inspect', False), 'inspect'])

    def test_pending_original_is_reconciled_even_when_base_is_fresh(self):
        e = ClosedEffects(fresh=False)
        e.value.update(sourceStale=False, pendingPublication=True)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_WORKER_START_REQUESTED')
        self.assertIn('recover-original', e.events)

    def test_unknown_base_staleness_cannot_authorize_metadata_recovery(self):
        e = ClosedEffects(fresh=False)
        del e.value['sourceStale']
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CLOSED_SOURCE_FRESHNESS')
        self.assertNotIn('recover-original', e.events)

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


class ContinuousEffects(ClosedEffects):
    continuous_enabled = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.info['pendingPublication'] = False
        self.proceeds = {'status': 'CONTINUOUS_PROCEEDS_RECONCILED', 'pendingPublication': False, 'credited': 0}

    def reconcile_proceeds(self):
        self.events.append('reconcile-proceeds')
        return self.proceeds


class ContinuousSupervisionTests(unittest.TestCase):
    def test_native_recovery_configuration_requires_both_pins_and_continuous_authority(self):
        for config in ({'nativeRecoveryEntry': {}}, {'nativeRecoveryConfig': {}},
                       {'nativeRecoveryEntry': {}, 'nativeRecoveryConfig': {}},
                       {'closedAuthority': {}, 'closedEntry': {}, 'continuousAuthority': {},
                        'continuousEntry': {}, 'nativeRecoveryEntry': {}}):
            with self.subTest(config=config), self.assertRaisesRegex(ValueError, 'NATIVE_RECOVERY_CONFIG'):
                watchdog.RootEffects(config, {})

    def native_effects(self):
        e = ContinuousEffects(fresh=False)
        e.native_recovery_enabled = True
        e.info['fullyClosed'] = True
        e.value['sourceStale'] = False
        e.states[watchdog.BASE] = {'ActiveState': 'active', 'MainPID': '321'}
        e.native_result = {'status': 'NATIVE_CLOSED_TIP_RECOVERY_COMMITTED_EXACT',
                           'pendingPublication': False, 'resumeOrdinaryConsumer': True,
                           'financialAction': False}
        def recover():
            e.events.append('native-recover-original')
            return e.native_result
        e.recover_native = recover
        return e

    def test_native_repair_success_starts_only_native_then_waits_for_real_source_freshness(self):
        e = self.native_effects()
        result = watchdog.supervise(e, True)
        self.assertEqual(result['status'], 'WATCHDOG_NATIVE_RECOVERED_CONSUMER_START_REQUESTED')
        self.assertEqual([x for x in e.events if isinstance(x, tuple) and x[0] in ('start', 'stop', 'reset-failed')], [('start', watchdog.NATIVE)])
        self.assertLess(e.events.index('native-recover-original'), e.events.index(('start', watchdog.NATIVE)))
        self.assertNotIn(('closed', 'resume', True), e.events)
        self.assertFalse(e.value['sourceFresh'])

    def test_native_active_consumer_and_inspect_only_never_run_repair(self):
        e = self.native_effects()
        self.assertEqual(watchdog.supervise(e)['status'], 'WATCHDOG_INSPECTED_CLOSED')
        self.assertNotIn('native-recover-original', e.events)
        e = self.native_effects()
        e.states[watchdog.NATIVE] = {'ActiveState': 'active', 'MainPID': '456'}
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CLOSED_SOURCE_FRESHNESS')
        self.assertNotIn('native-recover-original', e.events)

    def test_native_repair_refuses_funded_unknown_lease_or_pending_original(self):
        for change in ('funded', 'unknown', 'lease', 'marker', 'source-lease'):
            with self.subTest(change=change):
                e = self.native_effects()
                if change == 'funded': e.info['fullyClosed'] = False
                if change == 'unknown': del e.info['fullyClosed']
                if change == 'lease': e.info['financialWorkerLease'] = True
                if change == 'marker': e.marker = True
                if change == 'source-lease': e.value['financialWorkerLease'] = True
                watchdog.supervise(e, True)
                self.assertNotIn('native-recover-original', e.events)
                self.assertFalse(any(isinstance(x, tuple) and x[0] in ('start', 'stop') for x in e.events))

    def test_native_repair_unknown_or_conflicting_result_cannot_resume_any_actor(self):
        for change in ({'status': 'NATIVE_CLOSED_TIP_RECOVERY_REFUSED'}, {'pendingPublication': True},
                       {'resumeOrdinaryConsumer': False}, {'financialAction': True},
                       {'pendingPublication': 'false'}):
            with self.subTest(change=change):
                e = self.native_effects()
                e.native_result.update(change)
                self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CLOSED_NATIVE_RECOVERY')
                self.assertIn('native-recover-original', e.events)
                self.assertFalse(any(isinstance(x, tuple) and x[0] in ('start', 'stop') for x in e.events))

    def test_native_repair_rechecks_closed_state_before_consumer_start(self):
        e = self.native_effects()
        def changed():
            e.events.append('native-recover-original')
            e.info['fullyClosed'] = False
            return e.native_result
        e.recover_native = changed
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_NATIVE_RECOVERED_WAIT_RECHECK')
        self.assertNotIn(('start', watchdog.NATIVE), e.events)

    def test_root_native_adapter_uses_exact_pinned_python_entry_with_a_bounded_timeout(self):
        e = watchdog.RootEffects.__new__(watchdog.RootEffects)
        e.c = {'nativeRecoveryEntry': {'path': '/protected/entry.private.py', 'sha256': 'a' * 64},
               'nativeRecoveryConfig': {'path': '/protected/config.private.json', 'sha256': 'b' * 64}}
        e.env = {'SAFE_FIXTURE': '1'}
        result = type('Result', (), {'returncode': 0, 'stdout': '{"status":"NATIVE_CLOSED_TIP_RECOVERY_COMMITTED_EXACT"}', 'stderr': ''})()
        with patch.object(e, 'verify') as verify, patch.object(watchdog.subprocess, 'run', return_value=result) as run:
            e.recover_native()
            verify.assert_called_once_with()
            run.assert_called_once_with(['/usr/bin/python3', '/protected/entry.private.py', '--config', '/protected/config.private.json', '--config-sha256', 'b' * 64, '--execute'], cwd=watchdog.ROOT, env=e.env, capture_output=True, text=True, timeout=180)

    def test_root_verification_pins_native_entry_and_mode_bound_zero_observation_configuration(self):
        e = watchdog.RootEffects.__new__(watchdog.RootEffects)
        e.closed_enabled = e.continuous_enabled = e.native_recovery_enabled = True
        pin = lambda path: {'path': path, 'sha256': 'a' * 64}
        prefix = str(watchdog.ROOT / 'releases/test/app/api/scripts')
        e.config_pin = pin('/config')
        e.c = {'workerConfig': pin(str(watchdog.ROOT / 'secrets/testnet-policy-worker.private.json')),
               'sourceConfig': pin('/source'), 'closedAuthority': pin('/closed'),
               'closedEntry': pin(prefix + '/recover-testnet-closed-service.ts'),
               'gateEntry': pin(prefix + '/check-testnet-policy-idle-restart.ts'),
               'sourceEntry': pin(prefix + '/recover-automatic-testnet-source.ts'),
               'continuousAuthority': pin('/mode'), 'continuousEntry': pin(prefix + '/administer-continuous-demo.ts'),
               'nativeRecoveryEntry': pin('/native.private.py'), 'nativeRecoveryConfig': pin('/native-config')}
        policy = pin('/policy')
        records = {e.c['workerConfig']['path']: {'policy': policy}, '/source': {'policy': policy, 'authority': pin('/source-auth')},
                   '/mode': {'version': 1, 'purpose': 'ROOT_CONTINUOUS_TESTNET_DEMO', 'parentClosedAuthority': e.c['closedAuthority']},
                   '/source-auth': {'version': 4, 'continuousMode': e.c['continuousAuthority'], 'continuousInspector': e.c['continuousEntry'], 'closedRecovery': e.c['closedAuthority']}}
        native = {'version': 1, 'purpose': 'ROOT_CLOSED_NATIVE_TIP_RECOVERY', 'continuousMode': e.c['continuousAuthority'], 'maxRangeBlocks': 5000, 'maxObservations': 0}
        def read(pin, secret=False):
            return json.dumps(native if pin['path'] == '/native-config' else records.get(pin['path'], {})).encode()
        with patch.object(watchdog, 'pinned', side_effect=read) as read_pin:
            e.verify()
            self.assertIn(unittest.mock.call(e.c['nativeRecoveryEntry'], True), read_pin.call_args_list)
            self.assertIn(unittest.mock.call(e.c['nativeRecoveryConfig'], True), read_pin.call_args_list)
            for change in ({'continuousMode': pin('/other-mode')}, {'maxRangeBlocks': 5001}, {'maxObservations': 1}, {'maxObservations': False}):
                original = dict(native)
                native.update(change)
                with self.assertRaisesRegex(ValueError, 'NATIVE_RECOVERY_BINDING'):
                    e.verify()
                native.clear()
                native.update(original)

    def test_continuous_configuration_requires_paired_pins_and_parent_closed_path(self):
        for config in [{'continuousAuthority': {}}, {'closedAuthority': {}, 'closedEntry': {}, 'continuousAuthority': {}}, {'closedAuthority': {}, 'closedEntry': {}, 'continuousEntry': {}}]:
            with self.assertRaisesRegex(ValueError, 'WATCHDOG_CONTINUOUS_CONFIG'):
                watchdog.RootEffects(config, {})

    def test_qualified_idle_open_worker_reconciles_before_any_intake_check(self):
        e = ContinuousEffects(active=True, paused=False)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_INTAKE_CHECKED')
        self.assertEqual(e.events, [('closed', 'inspect', False), 'reconcile-proceeds', ('closed', 'inspect', False), ('closed', 'intake', True)])

    def test_actual_credit_is_one_bounded_action_without_worker_signal(self):
        e = ContinuousEffects(active=True, paused=False)
        e.proceeds['credited'] = 2
        self.assertEqual(watchdog.supervise(e, True), {'status': 'WATCHDOG_CONTINUOUS_PROCEEDS_RECONCILED', 'credited': 2, 'actorAction': True})
        self.assertEqual(e.events, [('closed', 'inspect', False), 'reconcile-proceeds'])

    def test_pending_unknown_or_conflicting_original_blocks_start_and_credit(self):
        for change in [True, None, 'false']:
            e = ContinuousEffects()
            e.info['pendingPublication'] = change
            self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CONTINUOUS_PROCEEDS')
            self.assertEqual(e.events, [('closed', 'inspect', False)])
        for result in [{'status': 'CONTINUOUS_DEMO_ORIGINAL_TRANSACTION_PENDING', 'pendingPublication': True}, {'status': 'CONTINUOUS_PROCEEDS_RECONCILED', 'credited': 0}, {'status': 'CONTINUOUS_PROCEEDS_REFUSED'}, {'status': 'CONTINUOUS_PROCEEDS_RECONCILED', 'pendingPublication': False, 'credited': True}]:
            e = ContinuousEffects(active=True, paused=False)
            e.proceeds = result
            self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_WAIT_CONTINUOUS_PROCEEDS')
            self.assertNotIn(('closed', 'intake', True), e.events)

    def test_stale_sample_inspection_and_financial_refusal_never_credit_or_stop(self):
        e = ContinuousEffects(fresh=False, active=True, paused=False)
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_INTAKE_CHECKED')
        self.assertNotIn('reconcile-proceeds', e.events)
        self.assertNotIn('stop-verified-closed-worker', e.events)
        e = ContinuousEffects(active=True, paused=False)
        e.refused = 'inspect'
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_CLOSED_REFUSED')
        self.assertNotIn('reconcile-proceeds', e.events)
        e = ContinuousEffects()
        self.assertEqual(watchdog.supervise(e)['status'], 'WATCHDOG_INSPECTED_CLOSED')
        self.assertNotIn('reconcile-proceeds', e.events)

    def test_continuous_backoff_does_not_append_generation(self):
        e = ContinuousEffects()
        e.budget = False
        self.assertEqual(watchdog.supervise(e, True)['status'], 'WATCHDOG_START_BACKOFF')
        self.assertNotIn(('closed', 'resume', True), e.events)

    def test_wire_adapter_selects_exact_continuous_entry_and_action(self):
        e = watchdog.RootEffects.__new__(watchdog.RootEffects)
        e.continuous_enabled = True
        e.c = {'continuousAuthority': {'path': '/mode', 'sha256': 'a' * 64}}
        with patch.object(e, 'run_entry', return_value=(0, {'status': 'CLOSED_SERVICE_QUALIFIED'})) as call:
            e.closed('inspect')
            call.assert_called_once_with('continuousEntry', ['/mode', 'a' * 64, 'closed-inspect'], 60)
        with patch.object(e, 'run_entry', return_value=(0, {'status': 'CONTINUOUS_PROCEEDS_RECONCILED', 'credited': 0, 'pendingPublication': False})) as call:
            e.reconcile_proceeds()
            call.assert_called_once_with('continuousEntry', ['/mode', 'a' * 64, 'reconcile', '--execute'], 60)


if __name__ == '__main__':
    unittest.main()
