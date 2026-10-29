# Bridge fee-note setup: same-process SDK proposal

Prepared 29 October 2026. This records the correction to the setup command flow
and its local tests, not an actual signed or submitted fee-note transaction.

Root's actual VPS proposal returned a 20,000-zatoshi fee for three outputs. A
subsequent separate CLI `calculate` process failed with `No proposal found in the
wallet.` The proposal is held in the LightClient process, rather than durably
persisted for another CLI invocation. The failed attempt remains archived; no
signed export or broadcast followed from it.

The earlier cross-process instruction was incorrect. The replacement
`bridge_fee_setup_session.py` keeps one CLI process open and uses its supported
non-TTY REPL. It checks signer kind, the existing calculated cache and the exact
approved 400,000-zatoshi input, then sends only the literal three-output proposal.
It parses the actual fee, requires the explicitly reviewed fee and durably
fsyncs `SIGNING_INTENT` before writing `calculate` to that same process.

The resulting original export is retained before validation. Preparation accepts
only the original input, three external 10,000 outputs and shielded own change
equal to `400000 - 30000 - actualFee`. It never transmits. Independent raw
structure, outgoing recovery, memo, own-change and expiry checks remain required
before Root authorizes the separate original submission. A failed or existing
intent cannot become an automatic second calculation.

The standalone structural verifier has an explicit `--bridge-fee-setup` analysis
mode for literal ZIP-317 fees of 10,000, 15,000 or 20,000 zatoshis. Its default
ordinary bridge payout mode still requires exactly 10,000. The setup flag does
not confer authority to sign or submit, and normal bridge payout invocations do
not pass it.

Verification:

- Actual read-only VPS piped REPL: signer kind verified, `calculate --recover`
  returned an empty cache, and `quit` exited successfully. No proposal, new
  calculation or broadcast was invoked by this probe.
- Three synthetic Linux controller tests passed: durable intent precedes the
  calculation command, fee mismatch and unknown cache stop before calculation,
  a fragmented large export remains intact, and wrong signed output shape
  retains intent/original bytes while refusing another prepare.
- Rust literal default/setup fee-cap test passed. Builds used a new target
  directory and did not overwrite previously pinned binaries.

Root must review the controller, immutable approval and real signed output before
any network submission. These checks do not prove the fee notes exist onchain or
that a bridge reserve has been funded.
