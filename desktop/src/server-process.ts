// Entry point of the Electron utility process that runs the bundled server.
import path from "path";
import { AddressInfo } from "net";

const serverMain = path.join(__dirname, "..", "server-build", "server", "main.js");
const parentPort = (process as unknown as { parentPort: { postMessage(message: unknown): void } }).parentPort;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startServer } = require(serverMain);

startServer(0, "127.0.0.1")
  .then((server: { address(): AddressInfo }) => {
    parentPort.postMessage({ type: "ready", port: server.address().port });
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
