const path = require("path");
const express = require("@feathersjs/express");
const { createServer } = require("http");
//const { Server } = require("socket.io");
const compression = require("compression");
const feathers = require("@feathersjs/feathers");
const socketio = require("@feathersjs/socketio");
const morgan = require("morgan");
const fs = require("fs");
const { createRequestHandler } = require("@remix-run/express");

const MODE = process.env.NODE_ENV;
const BUILD_DIR = path.join(process.cwd(), "server/build");

if (!fs.existsSync(BUILD_DIR)) {
  console.warn(
    "Build directory doesn't exist, please run `npm run dev` or `npm run build` before starting the server."
  );
}

const app = express(feathers());

// And then attach the socket.io server to the HTTP server
app.configure(
  socketio(function (io) {
    io.on("connection", function (socket) {
      // from this point you are on the WS connection with a specific client
      console.log(socket.id, "connected");

      socket.emit("confirmation", "connected!");

      socket.on("event", (data) => {
        console.log(socket.id, data);
        socket.emit("event", "pong");
      });
    });
  })
);

// Then you can use `io` to listen the `connection` event and get a socket
// from a client
app.on("connection", (connection) => {
  app.channel("everybody").join(connection);
});

app.use(compression());
// Register an in-memory messages service
// You may want to be more aggressive with this caching
app.use(express.static("public", { maxAge: "1h" }));

// Remix fingerprints its assets so we can cache forever
app.use(express.static("public/build", { immutable: true, maxAge: "1y" }));

app.use(morgan("tiny"));
app.all(
  "*",
  MODE === "production"
    ? createRequestHandler({ build: require("./build") })
    : (req, res, next) => {
        purgeRequireCache();
        const build = require("./build");
        return createRequestHandler({ build, mode: MODE })(req, res, next);
      }
);

const port = process.env.PORT || 3000;
// Publish all events to the `everybody` channel
app.publish((data) => app.channel("everybody"));

// You need to create the HTTP server from the Express app
const httpServer = createServer(app);
// For good measure let's create a message
// So our API doesn't look so empty
// instead of running listen on the Express app, do it on the HTTP server
httpServer.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

////////////////////////////////////////////////////////////////////////////////
function purgeRequireCache() {
  // purge require cache on requests for "server side HMR" this won't let
  // you have in-memory objects between requests in development,
  // alternatively you can set up nodemon/pm2-dev to restart the server on
  // file changes, we prefer the DX of this though, so we've included it
  // for you by default
  for (const key in require.cache) {
    if (key.startsWith(BUILD_DIR)) {
      delete require.cache[key];
    }
  }
}
