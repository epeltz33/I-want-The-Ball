import { createGameServer } from './app.js';

const port = Number(process.env.PORT) || 3000;
const { httpServer } = createGameServer();

httpServer.listen(port, () => {
  console.log(`I Want The Ball listening on http://localhost:${port}`);
});
