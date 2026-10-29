# Native source checkpoint fields in private order views

Forward private order and quote responses now optionally include
`source.scannedHeight`, `source.scannedAt` and `source.checkedAt`.
One read-only query obtains the actual Zcash scanner height, its original
`observed_at` and the database `clock_timestamp()` from the same statement.
Safe-integer and timestamp validation precede JSON serialization. The observer
stamp is preserved; a new read does not renew it or fabricate a funding time
cutoff. Existing nullable funding cutoff fields remain unchanged.

Production uses the existing worker pool supplied to the API for this SELECT,
because the API role has no direct scanner-table read grant. No database grant,
write, endpoint, order, financial-worker change or observer change is introduced.
Reverse views and legacy setups without that reader retain their existing shape.

Five focused offline tests passed, covering the authenticated order/quote DTO,
separate observer/read clocks, height-only funding with a null time cutoff,
reverse-view exclusion and invalid height/time values. API TypeScript passed.
This is API preparation evidence, not proof of a wallet broadcast or settlement.
