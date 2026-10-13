import { connect } from '../src/db.ts';
import { config } from './config.ts';
const settings = config(process.argv.includes('--production'));
const pool = connect(settings.adminUrl, 1);
try {
  const client = await pool.connect();
  try {
    const stream = (client as unknown as { connection: { stream: { encrypted?: boolean; authorized?: boolean; getProtocol?: () => string } } }).connection.stream;
    if (!stream.encrypted || !stream.authorized) throw new Error('Verified TLS connection required');
    const result = await client.query('SELECT current_database() AS database, current_user AS role, current_setting(\'server_version\') AS version');
    console.log(JSON.stringify({ branchId: settings.branchId, tlsVerified: true, tlsProtocol: stream.getProtocol?.(), ...result.rows[0] }));
  } finally { client.release(); }
} finally { await pool.end(); }
