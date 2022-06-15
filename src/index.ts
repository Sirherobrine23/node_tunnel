#!/usr/bin/env node
import * as net from "node:net"
import * as fs from "node:fs"
import * as ssh2 from "ssh2";
import * as daemonSocket from "./socket";
import * as services from "./service";
const __SSH_INSTANCE = process.env.NODE_APP_INSTANCE || "0";
const keysPath = "/data/keys.json";
async function startServer() {
  const sshConfig: ssh2.ServerConfig = {
    debug: console.log,
    hostKeys: []
  }
  if (process.env.NODE_ENV === "production") delete sshConfig.debug;
  if (!fs.existsSync(keysPath)) {
    if (__SSH_INSTANCE === "0") {
      console.error("Generating keys...");
      const keys = await services.CreateSSHKeys();
      fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
      console.error("Keys generated.");
      sshConfig.hostKeys = [keys.dsa.priv, keys.ecdsa.priv, keys.ed25519.priv, keys.rsa.priv];
    }
  } else {
    const keys: services.sshHostKeys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    sshConfig.hostKeys = [keys.dsa.priv, keys.ecdsa.priv, keys.ed25519.priv, keys.rsa.priv];
  }
  const sshServer = new ssh2.Server(sshConfig);
  const userConnections: {[user: string]: number} = {};
  sshServer.on("connection", client => {
    console.log("[SSH Server %s] Client connected!", __SSH_INSTANCE);
    let Username = "Unknown Client";
    client.on("close", () => {
      console.log("[SSH Server %s] %s disconnected!", __SSH_INSTANCE, Username);
      if (Username === "Unknown Client") return;
      if (userConnections[Username]) {
        userConnections[Username]--;
      }
    });
    client.on("authentication", async (ctx) => {
      Username = ctx.username;
      if (ctx.method !== "password") return ctx.reject();
      const { password } = ctx;
      userConnections[Username] = (userConnections[Username] || 0) + 1;
      const user = await daemonSocket.getUsers(true).then(user => user.find(user => user.Username === Username));
      if (!user) {
        console.log("[SSH Server %s] %s failed to authenticate!", __SSH_INSTANCE, Username)
        return ctx.reject();
      }
      const authOk = daemonSocket.DecryptPassword(user.Password) === password;
      if (!authOk) {
        console.log("[SSH Server %s] %s failed to authenticate!", __SSH_INSTANCE, Username)
        return ctx.reject();
      }
      const connections = (userConnections[Username] || 0);
      if (user.maxConnections !== 0) {
        if (user.maxConnections > connections) {
          console.log("[SSH Server %s] %s failed to authenticate!", __SSH_INSTANCE, Username)
        return ctx.reject();
        }
      }
      console.log("[SSH Server %s] %s authenticated!", __SSH_INSTANCE, Username);
      ctx.accept();
      return;
    });
    client.on("ready", () => {
      client.on("tcpip", (accept, reject, info) => {
        console.log("[SSH Server %s] Client wants to open a TCP connection!", __SSH_INSTANCE);
        console.log(info);
        const tcp = net.createConnection({port: info.destPort, host: info.destIP});
        const channel = accept();
        tcp.pipe(channel);
        channel.pipe(tcp);
      });
    });
    client.on("session", accept => accept().once("exec", accept => {
      const stream = accept();
      stream.write("Port forwarding only!\n");
      stream.exit(0);
      stream.end();
    }));
  });
  sshServer.listen(22, "0.0.0.0", function() {
    console.log("Listening on port %o", sshServer.address().port);
    services.startBadvpn();
  });
}
daemonSocket.io.once("connect", () => startServer().catch(err => {
  console.error(err);
  process.exit(1);
}));