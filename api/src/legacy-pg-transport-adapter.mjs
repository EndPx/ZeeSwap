/** pg 8.23.1 standard Pool/Client APIs, with a connect-before-business fence.
 * No network or global mutation until the explicit preload installs these classes. */
const fail = code => { throw Error('LEGACY_MAIN_PG_' + code); };

export function legacyConnectionMapper(context, roles) {
  const mappings = new Map();
  for (const [field, role] of [['apiUrl','zee_app_api_20261023'],['workerUrl','zee_app_worker_20261023'],['readerUrl','zee_app_reader_20261023']]) {
    if (!roles.includes(role)) continue;
    const old = new URL(context.originRuntime[field]), next = new URL(context.credentials[field]);
    if (old.hostname !== context.receipt.origin.host || old.pathname !== '/' + context.receipt.origin.database ||
        decodeURIComponent(old.username) !== role || next.hostname !== '127.0.0.1' || next.port !== '55435' ||
        next.pathname !== old.pathname || decodeURIComponent(next.username) !== role ||
        next.searchParams.get('sslmode') !== 'verify-full') fail('EXACT_TRANSPORT_SCOPE_REQUIRED');
    mappings.set(role, {old, next, originalUrl: context.originRuntime[field]});
  }
  const ssl = () => ({rejectUnauthorized:true, servername:context.receipt.tls.serverName, ca:context.caPem});
  const validateMapped = input => {
    const m = mappings.get(input?.user);
    if (!m || input.host !== '127.0.0.1' || input.port !== 55435 ||
        input.database !== context.receipt.destination.database || input.password !== decodeURIComponent(m.next.password) ||
        input.connectionString !== undefined || input.connection || input.stream || input.replication || input.options ||
        input.ssl?.rejectUnauthorized !== true || input.ssl?.servername !== context.receipt.tls.serverName ||
        input.ssl?.ca !== context.caPem) fail('MAPPED_CONNECTION_CHANGED');
  };
  const mapConfig = value => {
    const c = typeof value === 'string' ? {connectionString:value} : {...value};
    if (!value || c.connection || c.stream || c.replication || c.options) fail('EXPLICIT_STANDARD_CONNECTION_REQUIRED');
    let original;
    if (c.connectionString !== undefined) {
      const m = [...mappings.values()].find(m => m.originalUrl === c.connectionString);
      if (!m) fail('ORIGIN_CONNECTION_REFUSED');
      original = {host:m.old.hostname, port:Number(m.old.port || 5432), database:decodeURIComponent(m.old.pathname.slice(1)),
        user:decodeURIComponent(m.old.username), password:decodeURIComponent(m.old.password)};
      for (const k of ['host','port','database','user','password'])
        if (c[k] !== undefined && c[k] !== original[k]) fail('AMBIGUOUS_CONNECTION');
    } else original = c;
    const m = mappings.get(original.user);
    if (!m || original.host !== context.receipt.origin.host || Number(original.port || 5432) !== 5432 ||
        original.database !== context.receipt.origin.database || original.password !== decodeURIComponent(m.old.password))
      fail('ORIGIN_CONNECTION_REFUSED');
    if (c.ssl !== undefined && (typeof c.ssl !== 'object' || c.ssl.rejectUnauthorized !== true)) fail('TLS_DOWNGRADE_REFUSED');
    const result = {...c, host:'127.0.0.1', port:55435, database:context.receipt.destination.database,
      user:original.user, password:decodeURIComponent(m.next.password), ssl:ssl()};
    delete result.connectionString;
    validateMapped(result);
    return result;
  };
  return {mapConfig, validateMapped};
}

export function rejectLegacyOriginXidQuery(args) {
  const text = typeof args[0] === 'string' ? args[0] : args[0]?.text;
  if (typeof text !== 'string' || args[0]?.submit) fail('STANDARD_SQL_QUERY_REQUIRED');
  const sql = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
  if (/\b(?:pg_xact_status|pg_xact_commit_timestamp(?:_origin)?|pg_last_committed_xact)\b/i.test(sql))
    fail('ORIGIN_XID_QUERY_REFUSED');
  if (/\b(?:SET|RESET)\s+(?:(?:LOCAL|SESSION)\s+)?(?:ROLE|SESSION\s+AUTHORIZATION)\b/i.test(sql) ||
      /\bset_config\s*\(\s*['"](?:role|session_authorization)['"]/i.test(sql)) fail('ROLE_SWITCH_REFUSED');
}

function callbackOf(args) {
  for (let n = args.length - 1; n >= 0; n--) if (typeof args[n] === 'function') return args[n];
  return typeof args[0]?.callback === 'function' ? args[0].callback : undefined;
}

export function createLegacyPgAdapters(pg, hooks) {
  const OriginalClient = pg.Client, OriginalPool = pg.Pool;
  const mapped = Symbol('root-scoped-pg-config'), marker = Object.freeze({});
  const states = new WeakMap(), verified = new WeakSet();
  function configFor(input) {
    if (input?.[mapped] === marker) {
      hooks.validateMapped(input);
      return input;
    }
    const output = hooks.mapConfig(input);
    Object.defineProperty(output, mapped, {value: marker, enumerable: true});
    return output;
  }
  class GuardedClient extends OriginalClient {
    constructor(config) {
      const actual = configFor(config);
      super(actual);
      let resolve, reject;
      const ready = new Promise((a, b) => { resolve = a; reject = b; });
      ready.catch(() => {});
      states.set(this, {ready, resolve, reject, connecting: false, role: actual.user});
    }
    connect(callback) {
      const state = states.get(this);
      const run = async () => {
        if (state.connecting || verified.has(this)) fail('CLIENT_ALREADY_CONNECTED');
        state.connecting = true;
        try {
          await hooks.recheck();
          await new Promise((resolve, reject) => OriginalClient.prototype.connect.call(this,
            error => error ? reject(error) : resolve()));
          const raw = (...args) => OriginalClient.prototype.query.apply(this, args);
          await hooks.verify(this, state.role, raw);
          verified.add(this);
          state.resolve();
          return this;
        } catch (error) {
          state.reject(error);
          await Promise.resolve(OriginalClient.prototype.end.call(this)).catch(() => {});
          throw error;
        }
      };
      if (callback) { run().then(() => callback(), error => callback(error)); return; }
      return new this._Promise((resolve, reject) => run().then(resolve, reject));
    }
    query(...args) {
      const callback = callbackOf(args), state = states.get(this);
      const run = async () => {
        rejectLegacyOriginXidQuery(args);
        await state.ready;
        await hooks.recheck();
        if (!verified.has(this)) fail('UNVERIFIED_CLIENT');
        return OriginalClient.prototype.query.apply(this, args);
      };
      if (callback) { run().catch(error => callback(error)); return; }
      return new this._Promise((resolve, reject) => run().then(resolve, reject));
    }
  }
  class GuardedPool extends OriginalPool {
    constructor(config) {
      const actual = configFor(config), userVerify = actual.verify;
      if (userVerify !== undefined && typeof userVerify !== 'function') fail('INVALID_VERIFY_CALLBACK');
      const verify = function(client, callback) {
        if (!(client instanceof GuardedClient) || !verified.has(client)) {
          callback(Error('LEGACY_MAIN_PG_UNVERIFIED_POOL_CLIENT')); return;
        }
        if (userVerify) return userVerify.call(this, client, callback);
        callback();
      };
      // pg.Pool's BoundPool closes over its original Client constructor. Merely
      // replacing pg.Client is insufficient: pg-pool must receive options.Client.
      super({...actual, Client: GuardedClient, verify});
      Object.defineProperty(this, 'Client', {value: GuardedClient, writable: false, configurable: false});
      Object.defineProperty(this.options, 'Client', {value: GuardedClient, writable: false, configurable: false});
      Object.defineProperty(this.options, 'verify', {value: verify, writable: false, configurable: false});
    }
  }
  return {Client: GuardedClient, Pool: GuardedPool};
}

export function installLegacyPgAdapters(pg, adapters) {
  Object.defineProperty(pg, 'Client', {value: adapters.Client, writable: false, configurable: false});
  Object.defineProperty(pg, 'Pool', {value: adapters.Pool, writable: false, configurable: false});
  Object.defineProperty(pg, 'native', {get() { fail('NATIVE_DRIVER_REFUSED'); }, configurable: false});
}
