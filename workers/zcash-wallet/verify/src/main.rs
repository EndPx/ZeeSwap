//! Structural inspection of an already-broadcast G1 testnet transaction.
//! Network inclusion and the private recipient receipt are checked separately.
use std::{env, fs, io::Cursor};
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::BranchId;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        return Err("Usage: zeeswap-g1-verify RAW_TRANSACTION EXPECTED_TXID".into());
    }
    let bytes = fs::read(&args[1])?;
    let mut reader = Cursor::new(bytes.as_slice());
    let tx = Transaction::read(&mut reader, BranchId::Nu7)?;
    if reader.position() != bytes.len() as u64 || tx.txid().to_string() != args[2] {
        return Err("Transaction identity mismatch or trailing data".into());
    }
    if tx.consensus_branch_id() != BranchId::Nu7 {
        return Err("Unexpected consensus branch".into());
    }
    let transparent_inputs = tx.transparent_bundle().map_or(0, |b| b.vin.len());
    let transparent_outputs = tx.transparent_bundle().map_or(0, |b| b.vout.len());
    let sapling: i64 = tx.sapling_bundle().map_or(0, |b| (*b.value_balance()).into());
    let orchard: i64 = tx.orchard_bundle().map_or(0, |b| (*b.value_balance()).into());
    let ironwood: i64 = tx.ironwood_bundle().map_or(0, |b| (*b.value_balance()).into());
    let same_pool = transparent_inputs == 0 && transparent_outputs == 0
        && tx.sprout_bundle().is_none() && tx.sapling_bundle().is_none()
        && tx.orchard_bundle().is_none() && tx.ironwood_bundle().is_some()
        && sapling == 0 && orchard == 0 && ironwood == 10_000;
    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "txid": tx.txid().to_string(), "version": format!("{:?}", tx.version()),
        "branch": format!("{:?}", tx.consensus_branch_id()),
        "transparent_inputs": transparent_inputs, "transparent_outputs": transparent_outputs,
        "sapling_value_balance_zatoshis": sapling,
        "orchard_value_balance_zatoshis": orchard,
        "ironwood_value_balance_zatoshis": ironwood,
        "ironwood_only_with_10000_zatoshi_fee": same_pool,
        "scope": "Structural check; not standalone proof of recipient or consensus validity"
    }))?);
    if !same_pool {
        return Err("G1 same-pool / fee-only privacy check did not pass".into());
    }
    Ok(())
}
