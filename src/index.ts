#!/usr/bin/env node
import * as net from "node:net"
import * as fs from "node:fs"
import * as ssh2 from "ssh2";
import * as db from "./db";
import * as services from "./service";

const showSSHLog = process.env.SHOWSSHLOGS === "true";
const PMINSTANCE = process.env.NODE_APP_INSTANCE || "0";
async function getKeys() {
  const keysPath = "/data/keys.json";
  if (!fs.existsSync(keysPath) && PMINSTANCE === "0") {
    console.error("Generating keys...");
    const keys = await services.CreateSSHKeys();
    fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
    console.error("Keys generated.");
    return [keys.dsa.priv, keys.ecdsa.priv, keys.ed25519.priv, keys.rsa.priv];
  }
  const keys: services.sshHostKeys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
  return [keys.dsa.priv, keys.ecdsa.priv, keys.ed25519.priv, keys.rsa.priv];
}

function catchErr(sock: net.Socket|ssh2.ServerChannel, err: Error, Username: string, destIP: string, destPort: number) {
  if (showSSHLog) services.log("%s: Catch!, ip:port: %s:%d, err: %s", Username, destIP, destPort, String(err));
  sock.end();
};

async function startServer() {
  const sshServer = new ssh2.Server({
    hostKeys: await getKeys(),
    banner: `<span style="color: green;">Success connection</span>, <a href="https://github.com/OFVp-Project/SSH-Server">Code Source</a>`,
  });
  sshServer.on("error", err => services.log("Server catch error: %s", String(err)));
  sshServer.on("connection", client => {
    let Username = "Unknown Client";
    let userID = "";
    client.on("error", err => services.log("Client catch error: %s", String(err)));
    client.on("authentication", async (ctx) => {
      Username = ctx.username;
      if (ctx.method === "none") {
        // Thanks @mscdex (ssh2 Autor), Original Post: https://stackoverflow.com/a/36902453/11895959 (StackOverflow not git)
        if (showSSHLog) services.log("%s use only password!", Username);
        return ctx.reject(["password"]);
      }
      const user = await db.sshSchema.findOne({Username: Username}).lean();
      userID = user.UserID;
      let authSuccess = false;
      if (user) {
        if (ctx.method === "password") {
          if (db.comparePassword(ctx.password, user.Password)) {
            if (user.maxConnections === 0) authSuccess = true;
            else if (user.currentConnections === 0) authSuccess = true;
            else if (user.maxConnections > user.currentConnections) authSuccess = false;
          }
        }
      }
      if (authSuccess) {
        await db.sshSchema.findOneAndUpdate({UserID: user.UserID}, {$inc: {currentConnections: 1}});
        services.log("%s authenticated!", Username);
        client.on("close", async () => {
          await db.sshSchema.findOneAndUpdate({UserID: user.UserID}, {$inc: {currentConnections: -1}});
          services.log("%s disconnected!", Username);
        });
        return ctx.accept();
      }
      services.log("Auth Failed: %s", Username);
      return ctx.reject();
    });
    client.on("ready", () => {
      client.on("session", (_, reject) => reject());
      // After auth is successful, we can start accepting any port forwarding requests.
      client.on("tcpip", (accept, _reject, {destIP: hostConnect, destPort: portConnect}) => {
        if (showSSHLog) services.log("%s wants to forward %s:%d", Username, hostConnect, portConnect);
        const tcp = net.createConnection({port: portConnect, host: hostConnect}), channel = accept();

        // Close the channel if the TCP connection closes.
        channel.once("close", () => tcp.end());
        tcp.once("close", () => channel.end());

        // Catch Connections Error
        channel.once("error", err => catchErr(tcp, err, Username, hostConnect, portConnect));
        tcp.once("error", err => catchErr(channel, err, Username, hostConnect, portConnect));

        // Pipe the TCP connection to the channel vise-versa.
        tcp.pipe(channel);
        channel.pipe(tcp);

        // Collect data sixe transferred and update the channel statistics.
        channel.on("data", async data => await db.sshSchema.findOneAndUpdate({UserID: userID}, {$inc: {traffic: {transfered: data.length}}}));
        tcp.on("data", async data => await db.sshSchema.findOneAndUpdate({UserID: userID}, {$inc: {traffic: {transfered: data.length}}}));
      });
    });
  });
  db.sshSchema.updateMany({}, {$set: {currentConnections: 0}}).lean().catch(err => services.log("UpdateMany error: %s", String(err)));
  sshServer.listen(22, "0.0.0.0", function() {
    console.log("Listening on port %o", sshServer.address());
    services.startBadvpn();
  });
}

db.default.connection.on("error", err => services.log("DB catch error: %s", String(err)));
db.default.connection.on("connected", () => startServer().catch(err => {
  console.error(err);
  process.exit(1);
}));
