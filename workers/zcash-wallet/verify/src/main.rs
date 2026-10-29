//! Structural inspection of an already-broadcast G1 testnet transaction.
//! Network inclusion and the private recipient receipt are checked separately.
use std::{env, fs, io::Cursor};
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::BranchId;

fn permitted_fee(fee: i64, bridge_fee_setup: bool) -> bool {
    if bridge_fee_setup { matches!(fee, 10_000 | 15_000 | 20_000) } else { fee == 10_000 }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    let bridge_fee_setup = args.len() == 4 && args[3] == "--bridge-fee-setup";
    if args.len() != 3 && !bridge_fee_setup {
        return Err("Usage: zeeswap-g1-verify RAW_TRANSACTION EXPECTED_TXID [--bridge-fee-setup]".into());
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
    let same_pool_shape = transparent_inputs == 0 && transparent_outputs == 0
        && tx.sprout_bundle().is_none() && tx.sapling_bundle().is_none()
        && tx.orchard_bundle().is_none() && tx.ironwood_bundle().is_some()
        && sapling == 0 && orchard == 0;
    let same_pool = same_pool_shape && ironwood == 10_000;
    let verified = same_pool_shape && permitted_fee(ironwood, bridge_fee_setup);
    println!("{}", serde_json::to_string_pretty(&serde_json::json!({
        "txid": tx.txid().to_string(), "version": format!("{:?}", tx.version()),
        "expiry_height": u32::from(tx.expiry_height()),
        "branch": format!("{:?}", tx.consensus_branch_id()),
        "transparent_inputs": transparent_inputs, "transparent_outputs": transparent_outputs,
        "sapling_value_balance_zatoshis": sapling,
        "orchard_value_balance_zatoshis": orchard,
        "ironwood_value_balance_zatoshis": ironwood,
        "ironwood_only_with_10000_zatoshi_fee": same_pool,
        "bridge_fee_setup_verified": bridge_fee_setup && verified,
        "scope": if bridge_fee_setup { "Bounded bridge setup structure only; recipient/input/change approval and authority to submit are separate" } else { "Structural check; not standalone proof of recipient or consensus validity" }
    }))?);
    if !verified {
        return Err("G1 same-pool / fee-only privacy check did not pass".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::permitted_fee;
    #[test]
    fn default_cap_is_unchanged_and_setup_has_literal_zip317_cap() {
        for fee in [-1, 0, 5_000, 9_999, 10_001, 14_999, 15_001, 19_999, 20_001, 25_000] {
            assert!(!permitted_fee(fee, true));
            assert!(!permitted_fee(fee, false));
        }
        assert!(permitted_fee(10_000, false));
        for fee in [10_000, 15_000, 20_000] { assert!(permitted_fee(fee, true)); }
        assert!(!permitted_fee(15_000, false));
        assert!(!permitted_fee(20_000, false));
    }
}
