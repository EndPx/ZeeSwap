# Chef historical selection and the live undo floor

The operator's first application recovery attempt refused `INVALID_RANGE` before
appending a historical proof or publishing an application checkpoint. The source
was current, but the selected historical chunk ended before the source's actual
current undo floor. The ordinary range validator correctly rejects that
combination for a normal rolling replacement. A historical coverage proof needs
separate evidence of the full current checkpoint.

The bounded recovery path now carries an explicit `ChefHistoricalWitness`
outside the selected `ReplaceRange`. It records the actual full checkpoint
header, actual undo floor, project, generation, revision, canonical source/check
time and exact selected range/content digest. The adapter creates it only after
coherent before/after Chef status and independent verification of the actual full
checkpoint hash. The recorded floor remains the real status value; it is never
clamped or rewritten to fit the selected historical chunk.

Only the named historical validator accepts this explicit proof. It binds the
witness to the batch and expected project/policy, requires the real floor to fit
the actual full checkpoint, and bounds that checkpoint by the independently
sampled source head. The ordinary `validateRange` entry remains strict, including
its original floor-versus-selected-through requirement. Both paths share the
same complete range-content validation: contiguous headers, source freshness,
read duration, selected coverage, digests, exact observations and limits.

The finite adapter passes the witness explicitly through the native wallet
bridge and private recovery journal. The bridge still requires the existing SDK
classification and exact decoded output binding; opening-capital exclusion is
unchanged. The journal includes the witness in its hash chain and validates it
again on restart. A missing witness cannot admit an otherwise-invalid historical
range. Older strict-valid journal proofs remain readable.

Before any aggregate SQL candidate, every distinct stored full-checkpoint
witness is independently rechecked against the canonical reader. These witness
headers remain separate from the published snapshot's selected headers: a full
checkpoint may be ahead of a fixed historical target. Full contiguous birthday
coverage, overlap checks, current-target checks, fresh source lag, all money
anchors and output checks remain required. Partial coverage never renews
application readiness or produces an admitted SQL checkpoint.

Local targeted validation passed **46/46**, zero skipped or failed, across Chef
recovery, wallet bridge, anchor compaction and observation-adapter suites. The
recovery suite includes:

- A 1,000-block historical selection ending below the real current undo floor,
  admitted only with its actual independently verified checkpoint witness.
- Explicit rejection by both ordinary validation and the ordinary bridge path.
- Wrong project/generation/revision, altered floor/content binding, missing
  selected headers, missing witness and forged checkpoint refusal.
- Witness mutation detected on journal restart and independent canonical witness
  reorg refusal before aggregate publication.
- A complete 2,500-block recovery, including durable restart and overlapping
  chunks without skipped heights; partial coverage remains non-admitting.
- Existing SDK output/classification, canonical source, capacity, cursor and
  ordinary rolling validation regressions.

This is local code/test evidence. It does not claim the operator's deployed
recovery has completed or that admission or financial controls are active. The
source config, original birthday/account, pinned package, scanner and official
64-file runtime were not changed by this fix.
