-- Explicit same-quota 24-hour renewal. Installed only inside the original-XID publication transaction.
DO $$ BEGIN
 IF current_user<>'zee_app_admin_20261023' OR to_regclass('zee.testnet_policy_predecessors') IS NULL
 THEN RAISE EXCEPTION 'SERVICE_RENEWAL_ADMIN_INSTALLED_0030_REQUIRED';END IF;
END $$;
CREATE TABLE zee.testnet_policy_renewal_authorizations(
 policy_sha256 zee.digest PRIMARY KEY,
 parent_policy_sha256 zee.digest NOT NULL UNIQUE CHECK(encode(parent_policy_sha256,'hex')='d6998cc7c70205938b1cf97e5b3e40ab90346d3a91f5f5a3e5ae0c0d4ee3509c'),
 authorization_id uuid NOT NULL UNIQUE,root_authorization_sha256 zee.digest NOT NULL,
 human_approval_sha256 zee.digest NOT NULL CHECK(encode(human_approval_sha256,'hex')='d009b4d8d8b726653206ead6a8519edda19cf77c881895aee3b67a5042199aa4'),
 approval_sha256 zee.digest NOT NULL,
 original_activation_xid xid8 NOT NULL CHECK(original_activation_xid='195922'::xid8),
 reconciliation_xid xid8 NOT NULL CHECK(reconciliation_xid='250387'::xid8),
 paused_epoch bigint NOT NULL CHECK(paused_epoch=239),paused_xmin text NOT NULL CHECK(paused_xmin='250387'),
 carried_quotes integer NOT NULL CHECK(carried_quotes=1),carried_forward integer NOT NULL CHECK(carried_forward=1),carried_reverse integer NOT NULL CHECK(carried_reverse=0),
 old_expires_at timestamptz NOT NULL CHECK(old_expires_at='2026-10-30T08:13:20.732Z'::timestamptz),
 policy_verified_at timestamptz NOT NULL,new_expires_at timestamptz NOT NULL,
 root_approved_at timestamptz NOT NULL,root_expires_at timestamptz NOT NULL,
 created_xid xid8 NOT NULL DEFAULT pg_current_xact_id(),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(policy_sha256<>parent_policy_sha256),
 CHECK(new_expires_at=policy_verified_at+interval '24 hours'),
 CHECK(policy_verified_at>=old_expires_at AND policy_verified_at>=root_approved_at),
 CHECK(root_expires_at>root_approved_at AND root_expires_at<=root_approved_at+interval '30 minutes'),
 CHECK(root_approved_at<=created_at+interval '5 seconds' AND root_expires_at>created_at AND policy_verified_at<=created_at+interval '5 seconds')
);
CREATE TRIGGER policy_renewal_immutable BEFORE UPDATE OR DELETE ON zee.testnet_policy_renewal_authorizations FOR EACH ROW EXECUTE FUNCTION zee.immutable();
REVOKE ALL ON zee.testnet_policy_renewal_authorizations FROM PUBLIC,zeeswap_api,zeeswap_worker,zeeswap_reader;
REVOKE ALL ON zee.testnet_policy_renewal_authorizations FROM CURRENT_USER;
GRANT SELECT,INSERT ON zee.testnet_policy_renewal_authorizations TO CURRENT_USER;
GRANT SELECT ON zee.testnet_policy_renewal_authorizations TO zeeswap_worker,zeeswap_reader;
CREATE OR REPLACE FUNCTION zee.check_testnet_policy_predecessor() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,zee AS $$
DECLARE p zee.root_testnet_service_policies;n zee.root_testnet_service_policies;c zee.runtime_control;control_xmin text;nq bigint;nf bigint;nr bigint;renewal boolean;
BEGIN
 SELECT * INTO STRICT p FROM zee.root_testnet_service_policies WHERE policy_sha256=NEW.predecessor_sha256 FOR KEY SHARE;
 SELECT * INTO STRICT n FROM zee.root_testnet_service_policies WHERE policy_sha256=NEW.policy_sha256 FOR KEY SHARE;
 SELECT xmin::text INTO STRICT control_xmin FROM zee.runtime_control WHERE singleton FOR UPDATE;
 SELECT * INTO STRICT c FROM zee.runtime_control WHERE singleton;
 SELECT EXISTS(SELECT 1 FROM zee.testnet_policy_renewal_authorizations a WHERE a.policy_sha256=NEW.policy_sha256 AND a.parent_policy_sha256=NEW.predecessor_sha256 AND a.created_xid=pg_current_xact_id() AND a.original_activation_xid=NEW.original_activation_xid AND a.reconciliation_xid=NEW.reconciliation_xid AND a.old_expires_at=p.expires_at AND a.policy_verified_at=n.created_at AND a.new_expires_at=n.expires_at AND a.root_expires_at>clock_timestamp() AND a.approval_sha256=NEW.approval_sha256) INTO renewal;
 IF n.active_epoch<>p.active_epoch+2 OR c.epoch<>p.active_epoch+1 OR control_xmin<>NEW.reconciliation_xid::text
 OR c.accepting_orders OR c.dispatch_enabled OR NOT c.reconciliation_required
 OR (n.expires_at<>p.expires_at AND NOT renewal) OR n.expires_at<=clock_timestamp() OR n.created_at<=p.created_at
 OR NEW.original_activation_xid<>p.created_xid OR n.created_xid<>pg_current_xact_id()
 OR (n.profile_sha256,n.source_identity_digest,n.capital_allocation_sha256,n.public_commit,n.settlement_contract,n.token_contract,n.amount_atomic,n.forward_cap,n.reverse_cap,n.global_concurrency,n.quote_cap,n.forward_cutoff_blocks,n.min_lead_blocks,n.native_principal_budget,n.base_principal_budget,n.native_fee_budget,n.base_fee_budget)
 IS DISTINCT FROM (p.profile_sha256,p.source_identity_digest,p.capital_allocation_sha256,p.public_commit,p.settlement_contract,p.token_contract,p.amount_atomic,p.forward_cap,p.reverse_cap,p.global_concurrency,p.quote_cap,p.forward_cutoff_blocks,p.min_lead_blocks,p.native_principal_budget,p.base_principal_budget,p.native_fee_budget,p.base_fee_budget)
 THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_SCOPE';END IF;
 IF pg_xact_status(NEW.original_activation_xid)<>'committed' OR pg_xact_status(NEW.reconciliation_xid)<>'committed' THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_ORIGINAL_XIDS';END IF;
 SELECT count(*) INTO nq FROM zee.testnet_policy_quotes WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(NEW.predecessor_sha256));
 SELECT count(*) FILTER(WHERE direction='ZCASH_TO_BASE'),count(*) FILTER(WHERE direction='BASE_TO_ZCASH') INTO nf,nr FROM zee.testnet_policy_admissions WHERE policy_sha256 IN(SELECT zee.testnet_policy_lineage(NEW.predecessor_sha256));
 IF (nq,nf,nr) IS DISTINCT FROM (NEW.carried_quotes::bigint,NEW.carried_forward::bigint,NEW.carried_reverse::bigint) THEN RAISE EXCEPTION 'SERVICE_SUCCESSOR_CARRY_CHANGED';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION zee.check_testnet_policy_predecessor() FROM PUBLIC;
