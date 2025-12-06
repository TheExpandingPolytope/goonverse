import { listen } from "@colyseus/tools";
import app from "./app.config.js";
import { config } from "./config.js";

// Start the server
listen(app, config.port);

