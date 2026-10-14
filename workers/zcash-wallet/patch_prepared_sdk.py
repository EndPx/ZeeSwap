"""Reproduce ZeeSwap's narrow export patch on the pinned zingolib checkout.

Never runs a wallet or broadcasts. The source patch adds calculate --recover;
normal calculation persists the wallet before exposing signed bytes.
"""
from pathlib import Path
import subprocess
import sys

PIN = '0243894aee9b615c091cf27499c58cdfe325d05f'


def main():
    root = Path(sys.argv[1])
    if subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip() != PIN:
        raise SystemExit('Pinned zingolib revision required')
    path = root / 'zingo-cli/src/commands.rs'
    source = path.read_text()
    if 'zeeswap_prepared_v1' in source:
        raise SystemExit('Prepared export patch already applied')
    source = source.replace('OrchardNote, SaplingNote, SyncMode',
                            'OrchardNote, SaplingNote, SyncMode, OutputInterface, OutgoingNoteInterface, NoteInterface')
    source = source.replace('use zcash_keys::address::Address;', 'use zcash_keys::address::{Address, UnifiedAddress};')
    start = source.index('async fn calculate(lightclient:')
    end = source.index('\n/// The `change_server`', start)
    source = source[:start] + RUST + source[end:]
    source = source.replace('    Calculate,', '    Calculate { #[arg(long)] recover: bool, args: Vec<String> },')
    source = source.replace('CliCommand::Calculate => "Calculate"', 'CliCommand::Calculate { .. } => "Calculate"')
    source = source.replace('| CliCommand::Calculate\n', '| CliCommand::Calculate { .. }\n')
    source = source.replace('        CliCommand::Calculate,', '        CliCommand::Calculate { recover: false, args: Vec::new() },')
    source = source.replace('CliCommand::Calculate => calculate(lightclient).await,',
                            'CliCommand::Calculate { recover, args } => calculate(lightclient, recover, &args).await,')
    path.write_text(source)


RUST = r'''
// zeeswap_prepared_v1: private signed export; never transmits.
async fn calculate(lightclient: &mut LightClient, recover: bool, args: &[String]) -> Result<String, CommandError> {
    if recover && !args.is_empty() {
        return Err(usage("calculate", "Recovery cannot supply new destinations"));
    }
    if !recover {
        if !args.is_empty() {
            let proposal = send("calculate", args, lightclient).await?;
            let fee = json::parse(&proposal).map_err(not_yet_typed)?;
            if fee["fee"].as_u64() != Some(10_000) {
                return Err(usage("calculate", "Only a 10000 zatoshi proposal is authorized"));
            }
        }
        lightclient.calculate_stored_proposal().await.map_err(not_yet_typed)?;
        // Stop the saver and explicitly propagate file/directory durability errors.
        lightclient.shutdown_save_task().await.map_err(not_yet_typed)?;
        lightclient.flush().await.map_err(not_yet_typed)?;
        std::fs::File::open(lightclient.wallet_path()).map_err(not_yet_typed)?.sync_all().map_err(not_yet_typed)?;
        std::fs::File::open(lightclient.wallet_dir().map_err(not_yet_typed)?).map_err(not_yet_typed)?.sync_all().map_err(not_yet_typed)?;
    }
    let wallet = lightclient.wallet().read().await;
    let mut prepared = Vec::new();
    for record in wallet.wallet_transactions.values().filter(|r| matches!(
        r.status(), zingo_status::confirmation_status::ConfirmationStatus::Calculated(_))) {
        let txid = record.txid();
        let tx = record.transaction();
        let mut raw = Vec::new();
        tx.write(&mut raw).map_err(not_yet_typed)?;
        let selected = wallet.wallet_outputs::<IronwoodNote>().into_iter()
            .filter(|n| n.spending_transaction() == Some(txid))
            .map(|n| object! {
                "pool" => "ironwood", "txid" => n.output_id().txid().to_string(),
                "index" => n.output_id().output_index(), "value" => n.value().to_string()
            }).collect::<Vec<_>>();
        let mut outputs = record.outgoing_ironwood_notes().iter().map(|n| {
            Ok(object! {
                "recipient" => n.encoded_recipient(&wallet.chain_type()).map_err(not_yet_typed)?,
                "index" => n.output_id().output_index(),
                "amount" => n.value().to_string(),
                "ownChange" => record.ironwood_notes().iter().any(|own|
                    own.output_id() == n.output_id() && own.key_id().scope == zip32::Scope::Internal)
            })
        }).collect::<Result<Vec<_>, CommandError>>()?;
        // The pinned SDK excludes internal change from its outgoing list.
        // Include actual incoming-internal notes from this same transaction;
        // they were authenticated/decrypted by the wallet's internal IVK.
        for own in record.ironwood_notes().iter().filter(|own|
            own.key_id().scope == zip32::Scope::Internal &&
            !record.outgoing_ironwood_notes().iter().any(|n| n.output_id() == own.output_id())) {
            let address = UnifiedAddress::from_receivers(Some(own.note().recipient()), None, None, None, None)
                .ok_or_else(|| usage("calculate", "Internal receiver missing"))?;
            outputs.push(object! {
                "recipient" => address.encode(&wallet.chain_type()),
                "index" => own.output_id().output_index(),
                "amount" => own.value().to_string(), "ownChange" => true
            });
        }
        prepared.push(object! {
            "txid" => txid.to_string(),
            "rawTransaction" => raw.iter().map(|b| format!("{b:02x}")).collect::<String>(),
            "feeZatoshi" => wallet.calculate_transaction_fee(record).map_err(not_yet_typed)?.into_u64().to_string(),
            "expiryHeight" => u32::from(tx.expiry_height()).to_string(),
            "selectedNotes" => selected, "outputs" => outputs
        });
    }
    prepared.sort_by_key(|p| p["txid"].as_str().unwrap().to_owned());
    Ok(object! { "version" => "zeeswap_prepared_v1", "transactions" => prepared }.pretty(JSON_INDENT))
}
'''


if __name__ == '__main__':
    main()
