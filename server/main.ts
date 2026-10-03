import cors from "cors";
import express from "express";
import { Request, Response } from "express";
import expressWs from "express-ws";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import session from "express-session";
import MemoryStore from "memorystore";
import path from "path";
import { Server } from "http";

import winston from "winston";
import expressWinston from "express-winston";

import router from "./routes/api";

let ews = expressWs(express());
const mStore = MemoryStore(session);
const app = ews.app;
// Render (and most container platforms) provide the port at runtime. Keep the
// local-development default so `npm run dev` continues to work unchanged.
const port = Number(process.env.PORT) || 8080;
// The desktop app binds to 127.0.0.1 so nothing is reachable from the network.
const host = process.env.HOST || "0.0.0.0";

const isProd = process.env.NODE_ENV == "production";

/*
  Setup the session and cookie parser.
  Based on - https://stackoverflow.com/a/55597997/1403643
*/
app.use(
  cors({
    origin: [process.env.ORIGIN || "http://localhost:8080"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true, // enable set cookie
  })
);

const secret = process.env.SESSION_SECRET || "secret";
app.use(bodyParser.json());
app.use(cookieParser(secret));
app.use(
  session({
    secret: secret,
    store: new mStore({
      checkPeriod: 86400000, // Prune expired entries every 24h
    }),
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: false,
      secure: isProd,
    },
    resave: false,
    saveUninitialized: true,
  })
);

app.use(function (req: Request, res: Response, next: CallableFunction) {
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE");
  res.header("Access-Control-Allow-Origin", process.env.ORIGIN);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-   Type, Accept, Authorization"
  );
  next();
});

if (isProd) app.set("trust proxy", 1);

app.use(
  expressWinston.logger({
    transports: [new winston.transports.Console()],
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.json()
    ),
    expressFormat: true,
    colorize: false,
  })
);

// To fix 304 responses.
app.disable("etag");

// Keep the public API under /api in every environment. The Vite development
// proxy forwards this prefix unchanged, matching the production container.
const routePrefix = process.env.ROUTE_PREFIX || "/api";
app.use(routePrefix, router);

// The production image puts Vite's built files in `server/public`. Serving
// them from the same Express process keeps the API, WebSocket and browser on
// one origin, which is required for the session cookie and Google OAuth flow.
const webRoot = process.env.WEB_ROOT || path.join(__dirname, "../../public");
app.use(express.static(webRoot));
app.get("/{*path}", (req: Request, res: Response, next) => {
  if (req.path.startsWith(`${routePrefix}/`) || req.path === routePrefix) {
    return next();
  }
  res.sendFile(path.join(webRoot, "index.html"));
});

/** Starts listening; resolves with the server once the port is bound (0 picks a free port). */
export function startServer(listenPort = port, listenHost = host): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(listenPort, listenHost, () => {
      const address = server.address();
      console.log(`Listening on ${listenHost}:${typeof address === "object" && address ? address.port : listenPort}`);
      resolve(server);
    });
    server.on("error", reject);
  });
}

// Started directly (container, `npm run dev`) rather than embedded by the desktop app.
if (require.main === module) {
  startServer().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
