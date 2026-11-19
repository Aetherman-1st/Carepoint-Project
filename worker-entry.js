import { httpServerHandler } from 'cloudflare:node';

let backendPromise = null;

async function getBackend(env) {
  if (!backendPromise) {
    backendPromise = (async () => {
      globalThis.__cloudflareAssets = env.ASSETS || null;
      globalThis.__rateLimitBindings = {
        AUTH_IP_RATE_LIMITER: env.AUTH_IP_RATE_LIMITER,
        AUTH_EMAIL_RATE_LIMITER: env.AUTH_EMAIL_RATE_LIMITER,
        CONTACT_RATE_LIMITER: env.CONTACT_RATE_LIMITER,
        UPLOAD_RATE_LIMITER: env.UPLOAD_RATE_LIMITER
      };
      process.env.CF_WORKER = '1';
      process.env.SMTP_USER = env.SMTP_USER || '';
      process.env.SMTP_PASS = env.SMTP_PASS || '';
      process.env.SMTP_HOST = env.SMTP_HOST || '';
      process.env.SMTP_PORT = env.SMTP_PORT || '';
      process.env.SMTP_SECURE = env.SMTP_SECURE || '';
      process.env.MAIL_FROM = env.MAIL_FROM || process.env.MAIL_FROM || '';
      process.env.SUPABASE_URL = env.SUPABASE_URL || process.env.SUPABASE_URL || '';
      process.env.SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

      if (env.HYPERDRIVE && env.HYPERDRIVE.connectionString) {
        process.env.DATABASE_URL = env.HYPERDRIVE.connectionString;
        process.env.DB_SSL = 'false';
      }

      const { default: app } = await import('./app.js');
      app.listen(3000);
      return httpServerHandler({ port: 3000 });
    })();
  }

  return backendPromise;
}

export default {
  async fetch(request, env, ctx) {
    const backend = await getBackend(env);
    return backend.fetch(request, env, ctx);
  }
};
