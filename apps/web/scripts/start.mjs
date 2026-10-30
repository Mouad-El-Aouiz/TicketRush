process.env.PORT ??= '3001';
process.env.HOSTNAME=process.env.WEB_HOST??'127.0.0.1';
await import('../.next/standalone/apps/web/server.js');
