import { buildApp } from './factory.js';

const { app, config } = buildApp();

app.listen(config.port, (err) => {
  if (err) throw err;
  console.log(`[aliento] Servidor en ${config.appUrl} (puerto ${config.port})`);
});
