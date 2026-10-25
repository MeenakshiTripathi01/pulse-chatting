import http from 'node:http';

async function start() {
  // Imported dynamically so configuration errors are reported cleanly by the catch below.
  const { config } = await import('./config/env.js');
  const { connectDatabase, disconnectDatabase } = await import('./config/db.js');
  const { createApp } = await import('./app.js');
  const { createSocketServer } = await import('./socket/index.js');

  await connectDatabase(config.mongoUri);
  console.log('[db] Connected to MongoDB');

  const app = createApp();
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  app.set('io', io);

  httpServer.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[server] Port ${config.port} is already in use. Set a different PORT.`);
    } else {
      console.error('[server] Failed to start:', error.message);
    }
    process.exit(1);
  });

  httpServer.listen(config.port, () => {
    console.log(`[server] Listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = async (signal) => {
    console.log(`[server] ${signal} received, shutting down...`);
    io.close();
    httpServer.close();
    await disconnectDatabase();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((error) => {
  console.error(`[server] Startup failed: ${error.message}`);
  process.exit(1);
});
