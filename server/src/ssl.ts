/**
 * Supabase terminates TLS with its own CA chain at the pooler, so hosted
 * connections need SSL with verification switched off. A plain Postgres server
 * (the docker compose one) refuses the SSL handshake outright, so opt out for
 * local hosts and for any URL that asks for `sslmode=disable`.
 */
export function sslConfig(url: string): { rejectUnauthorized: boolean } | false {
  try {
    const { hostname, searchParams } = new URL(url);
    if (searchParams.get('sslmode') === 'disable') return false;
    if (['localhost', '127.0.0.1', '::1'].includes(hostname)) return false;
  } catch {
    // Unparseable URL: fall through and let pg surface the real error.
  }
  return { rejectUnauthorized: false };
}
