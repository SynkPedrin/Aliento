import pg from 'pg';

// Fechas como texto 'YYYY-MM-DD' (sin conversión de zona), numéricos y bigint como número.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

function wrap(runner) {
  return {
    rows: async (text, params) => (await runner.query(text, params)).rows,
    one: async (text, params) => (await runner.query(text, params)).rows[0] ?? null,
    exec: async (text, params) => (await runner.query(text, params)).rowCount,
  };
}

/**
 * Acceso a Postgres (Supabase).
 *  - `service`: consultas de sistema (rol del pool; ignora RLS). Solo para webhooks,
 *    cuestionario anónimo, catálogo, administración y tareas internas.
 *  - `asUser(userId, fn)`: transacción con rol `authenticated` y `auth.uid() = userId`,
 *    de modo que las políticas RLS se aplican a todo dato personal.
 *  - `tx(fn)`: transacción de servicio.
 */
export function createDb(connectionString, { max = 10 } = {}) {
  if (!connectionString) throw new Error('Falta SUPABASE_DB_URL (cadena de conexión de Postgres).');
  // Local: sin TLS. Remoto (Supabase): TLS obligatorio. El certificado del pooler no se valida
  // contra una CA del sistema, así que se quita sslmode de la URL y se configura aquí.
  const url = new URL(connectionString);
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('supa');
  const pool = new pg.Pool({
    connectionString: url.toString(), max,
    ssl: local ? false : { rejectUnauthorized: false },
    idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000,
  });
  pool.on('error', (err) => console.error('[db] Error en conexión inactiva:', err.message));

  async function transaction(setup, fn, { userScoped = false } = {}) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query("set local statement_timeout = '8s'"); // ninguna consulta bloquea la función
      if (setup) await setup(client);
      const q = wrap(client);
      if (userScoped) {
        // Consultas privilegiadas dentro de una transacción de usuario: SIEMPRE en la misma conexión.
        // Pedir otra conexión al pool mientras se retiene esta provoca un bloqueo mutuo bajo carga.
        const sudo = async (method, text, params) => {
          await client.query('reset role');
          try { return await wrap(client)[method](text, params); } finally { await client.query('set local role authenticated'); }
        };
        q.sudo = { rows: (t, p) => sudo('rows', t, p), one: (t, p) => sudo('one', t, p), exec: (t, p) => sudo('exec', t, p) };
      }
      const out = await fn(q);
      await client.query('commit');
      return out;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    pool,
    service: wrap(pool),
    tx: (fn) => transaction(null, fn),
    asUser: (userId, fn) => transaction(async (client) => {
      if (!userId) throw new Error('asUser sin usuario');
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claims', $1, true)",
        [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    }, fn, { userScoped: true }),
    end: () => pool.end(),
  };
}
