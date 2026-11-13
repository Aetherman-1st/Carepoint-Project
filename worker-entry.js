import { httpServerHandler } from 'cloudflare:node';

let backendPromise = null;

async function getBackend(env) {
  if (!backendPromise) {
    backendPromise = (async () => {
      globalThis.__cloudflareAssets = env.ASSETS || null;
      globalThis.__rateLimitBindings = {
        AUTH_IP_RATE_LIMITER: env.AUTH_IP_RATE_LIMITER,
        AUTH_EMAIL_RATE_LIMITER: env.AUTH_EMAIL_RATE_LIMITER,
        CONTACT_RATE_LIMITER: env.CONTACT_RATE_LIMITER
      };
      process.env.CF_WORKER = '1';
      process.env.SMTP_USER = env.SMTP_USER || '';
      process.env.SMTP_PASS = env.SMTP_PASS || '';
      process.env.MAIL_FROM = env.MAIL_FROM || process.env.MAIL_FROM || '';

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
