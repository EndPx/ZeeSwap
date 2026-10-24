//! Maintained SDK-only address validation and recipient-aware note decryption.
//! Sensitive input/output travels over a local pipe, never command-line keys.
use std::{collections::HashMap, io::{self, Read, Cursor}};
use serde::Deserialize;
use serde_json::json;
use zcash_client_backend::{decrypt_transaction, TransferType};
use zcash_keys::{address::UnifiedAddress, keys::UnifiedFullViewingKey};
use zcash_primitives::transaction::Transaction;
use zcash_protocol::{consensus::{BranchId, TEST_NETWORK}, memo::Memo};

#[derive(Deserialize)]
#[serde(tag="command", rename_all="snake_case", deny_unknown_fields)]
enum Request {
 Validate { address: String },
 Decrypt { ufvk: String, raw_hex: String, txid: String, height: u32 },
 DecryptOwnChange { ufvk: String, raw_hex: String, txid: String, height: u32 },
 ChefDecrypt { ufvk: String, raw_hex: String, txid: String, height: u32 },
 RecoverOutgoing { ufvk: String, raw_hex: String, txid: String, height: u32 },
}

fn run() -> Result<serde_json::Value, Box<dyn std::error::Error>> {
 let mut input=String::new();io::stdin().take(4_000_000).read_to_string(&mut input)?;
 let request=serde_json::from_str::<Request>(&input)?;
 let internal_only=matches!(&request,Request::DecryptOwnChange { .. });
 let chef=matches!(&request,Request::ChefDecrypt { .. });
 let outgoing=matches!(&request,Request::RecoverOutgoing { .. });
 match request {
  Request::Validate { address } => {
   let ua=match UnifiedAddress::decode(&TEST_NETWORK,&address){Ok(v)=>v,Err(_)=>return Ok(json!({"valid":false}))};
   if ua.expiry_height().is_some() || ua.expiry_time().is_some() { return Ok(json!({"valid":false})); }
   let orchard=match ua.orchard(){Some(v)=>v,None=>return Ok(json!({"valid":false}))};
   let canonical=UnifiedAddress::from_receivers(Some(*orchard),None,None,None,None).ok_or("receiver missing")?;
   Ok(json!({"network":"zcash-testnet","receiver":canonical.encode(&TEST_NETWORK),"shielded":true}))
  }
  Request::Decrypt { ufvk,raw_hex,txid,height } | Request::DecryptOwnChange { ufvk,raw_hex,txid,height } | Request::ChefDecrypt { ufvk,raw_hex,txid,height } | Request::RecoverOutgoing { ufvk,raw_hex,txid,height } => {
   let raw=hex::decode(raw_hex)?;let mut cursor=Cursor::new(&raw);
   let tx=Transaction::read(&mut cursor,BranchId::Nu7)?;
   if tx.txid().to_string()!=txid || cursor.position()!=raw.len() as u64 || tx.consensus_branch_id()!=BranchId::Nu7 {
    return Err("transaction mismatch".into());
   }
   let keys=HashMap::from([(0u32,UnifiedFullViewingKey::decode(&TEST_NETWORK,&ufvk)?)]);
   let decrypted=decrypt_transaction(&TEST_NETWORK,Some(height.into()),None,&tx,&keys);
   let transparent=tx.transparent_bundle().map_or(false,|b|!b.vin.is_empty()||!b.vout.is_empty());
   let pools=usize::from(tx.sapling_bundle().is_some())+usize::from(tx.orchard_bundle().is_some())+usize::from(tx.ironwood_bundle().is_some());
   let shielded_source=!transparent && tx.sprout_bundle().is_none() && pools==1;
   let mut notes=Vec::new();
   for (pool,outputs) in [("orchard",decrypted.orchard_outputs()),("ironwood",decrypted.ironwood_outputs())] {
    for out in outputs {
     let permitted=if outgoing {matches!(out.transfer_type(),TransferType::Outgoing|TransferType::AccountInternal)} else if internal_only {matches!(out.transfer_type(),TransferType::AccountInternal)} else {matches!(out.transfer_type(),TransferType::Incoming)};
     if !permitted {continue;}
     let receiver=UnifiedAddress::from_receivers(Some(out.note().0.recipient()),None,None,None,None).ok_or("receiver missing")?;
     let memo=match Memo::try_from(out.memo().clone()) {Ok(Memo::Text(t))=>Some(t.to_string()),_=>None};
     let mut note=json!({"txid":txid,"index":out.index(),"pool":pool,"amount":out.note().0.value().inner().to_string(),
       "receiver":receiver.encode(&TEST_NETWORK),"memo":memo,"shieldedSource":shielded_source});
     if internal_only {note["ownChange"]=json!(true);}
     if outgoing {
      let own_change=matches!(out.transfer_type(),TransferType::AccountInternal);
      note["ownChange"]=json!(own_change);
      note["recoveryType"]=json!(if own_change {"account-internal"} else {"outgoing"});
     }
     if chef {
      note["receiverBytes"]=json!(hex::encode(out.note().0.recipient().to_raw_address_bytes()));
      note["memoHex"]=json!(hex::encode(out.memo().as_array()));
     }
     notes.push(note);
    }
   }
   if outgoing {Ok(json!({"attestationMode":"operator-outgoing-recovery","notes":notes}))} else {Ok(json!({"notes":notes}))}
  }
 }
}
fn main() {
 match run() {Ok(value)=>println!("{value}"),Err(_)=>{eprintln!("Zcash read-only validation failed");std::process::exit(1);}}
}
