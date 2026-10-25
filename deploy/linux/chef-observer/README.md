# Application Chef observer: fatal reconciliation supervision

This policy applies only to `zeeswap-testnet-chef-observer.service`, the native
application consumer. The Chef Core Docker follower/query API and Envio units
have independent supervision. Do not apply this drop-in to those services.

The consumer's existing fatal reconciliation set now exits **78**. After a
connected fatal cursor/generation/canonical conflict, one invocation requests
the existing `zee.enter_reconciliation()` once and stops for operator review.
An unknown SQL acknowledgement remains fatal; it is not retried. The database
function's semantics and monotonic epoch behavior are unchanged. Existing safe
source/head waits remain inside the ordinary observer loop. Other errors retain
exit one; normal completion retains exit zero.

The shipped service template and `10-fatal-review.conf` set:

```ini
[Service]
RestartPreventExitStatus=78
```

With the existing `Restart=on-failure`, this prevents automatic restart after
that fatal exit. It is not a global exactly-once guarantee: manually starting an
unrecovered consumer could request reconciliation again. Keep it stopped until
the persisted-state audit and any explicitly authorized recovery are complete.

## Future VPS operator installation

No service was changed by preparing these files. Root must preserve the current
journal, restart count, exit status, exact control epoch/version and financial
snapshot before changing supervision. Install the reviewed CLI/helper bytes and
verify their published hashes. Keep the application consumer stopped throughout
the incident audit; source Core following is a separate service.

For this exact application unit, the intended drop-in location is:

```text
/etc/systemd/system/zeeswap-testnet-chef-observer.service.d/10-fatal-review.conf
```

After placing the reviewed drop-in, Root reloads systemd and inspects the merged
configuration with `systemctl cat zeeswap-testnet-chef-observer.service` and
`systemctl show zeeswap-testnet-chef-observer.service -p Restart -p RestartPreventExitStatus`.
Verify exit 78 is prevented, the original restart policy is otherwise retained,
and no other unit was changed. This configuration inspection does not authorize
consumer restart or repair metadata.

Actual supervision acceptance requires a controlled, isolated fixture process
returning exit 78 under the reviewed policy, verifying that it is not restarted.
Do not deliberately trigger reconciliation against the live financial database
as a supervision test. Retain any actual policy verification as separate operator
evidence; local Node tests do not prove systemd behavior on the VPS.

After an independent audit and separately authorized recovery, restart the
consumer explicitly once. Verify original/current cursor and canonical anchors,
fresh ordinary cycles, exact paused controls/books and unchanged authorization
scope. If it exits 78 again, leave it stopped and inspect the new private
diagnostic. Do not clear/reseed a cursor, reset an epoch, mutate SQL manually or
remove recovery markers to bypass the refusal.
