# G1 Neon project selection and connector preflight

Date: 2026-10-14 (Asia/Jakarta).

This records the initial read-only preflight. The later authorized database build
verified direct/pooled TLS and installed migrations; see [G2 database evidence](g2-database.md).

The user supplied the existing project and branch and requested installation of
the official Neon skills. No new Neon project or branch was created.

| Field | Verified value |
| --- | --- |
| Project name | ZeeSwap |
| Project ID | `raspy-truth-63998651` |
| Selected branch ID | `br-empty-meadow-aowxzfl5` |
| Branch name | `production` |
| Branch state | `ready`; primary/default; not protected |
| Database | `neondb` |
| Connector SQL role | `neondb_owner` |
| Reported PostgreSQL version | `18.6 (c021049)` |
| Application base tables in public | 0 |

[Selected branch in Neon Console](https://console.neon.tech/app/projects/raspy-truth-63998651/branches/br-empty-meadow-aowxzfl5).

## Skills

Executed the user-supplied command successfully:

```sh
npx neon@latest skills -s neon -s neon-postgres -y
```

The command resolved `neon@8.4.3` and installed project-local Codex skills under
`.agents/skills/neon` and `.agents/skills/neon-postgres`. `skills-lock.json` records
their upstream source and content hashes. The skills were read during this turn.

The CLI's default credential profile is missing. The already-authenticated Neon
MCP connector was therefore used for project inspection and the SQL preflight;
no new login, credentials, or API keys were requested or created.

## Verified access and limits

`describe_project`, `describe_branch` and a read-only `SELECT` succeeded against
the explicitly selected project/branch/database. The database tree included
`public.show_db_tree`, a helper function, and no application tables.

The connector query reported `pg_stat_ssl.ssl = false` for its database session.
This result does not establish the transport security of a future application's
direct connection (a connector/proxy can terminate TLS separately). No direct
application connection or TLS handshake was tested in this step. Do not mark
the backend's secure database connection as verified based on this MCP query.

No connection string was retrieved or written. No application schema, migrations,
roles, credentials, auth service or new branch was provisioned.

Next database work: obtain server-side configuration without logging credentials,
verify the application driver's TLS connection, define least-privilege roles and
versioned migrations, then test schema changes in an isolated development branch
before applying them to the selected primary branch. Neon owns business state;
Zcash wallet/scanner persistence remains a separate wallet-engine store.
