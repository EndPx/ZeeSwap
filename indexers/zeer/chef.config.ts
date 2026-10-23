import { defineConfig, defineIndexer } from "@zeer-dev/chef";
import { projectNote } from "./projection.ts";
import type { ChefEntities } from "./chef.generated.ts";

const required = (key: string): string => { const value = process.env[key]; if (!value || /REPLACE|CHANGE_ME/.test(value)) throw Error(`Missing private config ${key}`); return value; };
const birthdayString = required("ZEESWAP_CHEF_BIRTHDAY");
if (!/^(0|[1-9][0-9]*)$/.test(birthdayString) || !Number.isSafeInteger(Number(birthdayString))) throw Error("Invalid explicit Chef birthday");
const accountId = required("ZEESWAP_CHEF_ACCOUNT_ID"), fingerprint = required("ZEESWAP_CHEF_KEY_FINGERPRINT");
const project = required("ZEESWAP_CHEF_PROJECT");
if (!/^zeeswap_shadow_[a-z0-9_]+$/.test(project)) throw Error("Dedicated shadow namespace required");

export default defineConfig<ChefEntities>({
  project, network: "testnet", startHeight: Number(birthdayString), schema: "./schema.graphql",
  handlerVersion: "zeeswap-private-shadow-notes-v1", reorgWindow: 200,
  prepUrlEnv: "ZEESWAP_CHEF_PREP_URL", prepTokenEnv: "ZEESWAP_CHEF_PREP_TOKEN", databaseUrlEnv: "ZEESWAP_CHEF_DATABASE_URL",
  shielded: { accountId, keyFingerprint: fingerprint, executableEnv: "ZEESWAP_CHEF_SCANNER_EXECUTABLE", keyFileEnv: "ZEESWAP_CHEF_UFVK_FILE" },
  sync: { pageSize: 16, batchSize: 1, transactionFilter: { shielded_pools: ["orchard", "ironwood"] } },
  indexer: defineIndexer<ChefEntities>({
    async receipt({ block, receipt, context }) {
      await context.entities.set("ReadableNote", projectNote({ block, receipt }, accountId, fingerprint));
    },
  }),
});
