#!/usr/bin/env node
import * as net from "node:net"
import * as fs from "node:fs"
import * as ssh2 from "ssh2";
import * as daemonSocket from "./socket";
import * as services from "./service";

const keysPath = "/data/keys.json";
const __SSH_INSTANCE = process.env.NODE_APP_INSTANCE || "0";
const showSSHLog = process.env.SHOWSSHLOGS === "true";
const userConnections: {[user: string]: number} = {};
async function startServer() {
  const bannerFile = fs.readFileSync("./Banner.html", "utf8");
  console.log(bannerFile);
  const sshConfig: ssh2.ServerConfig = {hostKeys: []};
  if (!fs.existsSync(keysPath)) {
    if (__SSH_INSTANCE === "0") {
      console.error("Generating keys...");
      const keys = await services.CreateSSHKeys();
      fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
      console.error("Keys generated.");
      sshConfig.hostKeys.push(keys.dsa.priv, keys.ecdsa.priv, keys.ed25519.priv, keys.rsa.priv);
    }
  } else {
    const keys: services.sshHostKeys = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    sshConfig.hostKeys.push(keys.dsa.priv, keys.ecdsa.priv, keys.ed25519.priv, keys.rsa.priv);
  }
  const sshServer = new ssh2.Server(sshConfig);
  sshServer.on("error", err => services.log("Server catch error: %s", String(err)));
  sshServer.on("connection", client => {
    let Username = "Unknown Client";
    client.on("error", err => services.log("Client catch error: %s", String(err)));
    client.on("authentication", async (ctx) => {
      Username = ctx.username;
      if (ctx.method === "none") {
        // Thanks @mscdex (ssh2 Autor), Original Post: https://stackoverflow.com/a/36902453/11895959 (StackOverflow not git)
        if (showSSHLog) services.log("%s use only password!", Username);
        return ctx.reject(["password"]);
      }
      if (userConnections[Username] === undefined) userConnections[Username] = 0;
      const user = await daemonSocket.getUsers(true).then(user => user.find(user => user.Username === Username));
      let authSuccess = false;
      if (user) {
        if (ctx.method === "password") {
          const rePass = daemonSocket.DecryptPassword(user.Password);
          if (rePass === ctx.password) {
            const currentConnections = userConnections[Username];
            if (user.maxConnections === 0) authSuccess = true;
            else if (currentConnections === 0) authSuccess = true;
            else {
              if (user.maxConnections > currentConnections) authSuccess = false;
            }
          }
        }
      }
      if (authSuccess) {
        services.log("%s authenticated!", Username);
        userConnections[Username]++;
        client.on("close", () => {
          services.log("%s disconnected!", Username);
          if (Username === "Unknown Client") return;
          userConnections[Username]--;
        });
        return ctx.accept();
      }
      services.log("Auth Failed: %s", Username);
      return ctx.reject();
    });
    client.on("ready", () => {
      // After auth is successful, we can start accepting any port forwarding requests.
      client.on("tcpip", (accept, _reject, info) => {
        const { destIP, destPort } = info;
        if (showSSHLog) services.log("%s wants to forward %s:%d", Username, destIP, destPort);
        daemonSocket.io.emit("ssh-forward", {user: Username, ip: destIP, port: destPort});
        const tcp = net.createConnection({port: destPort, host: destIP}), channel = accept();
        // Close the channel if the TCP connection closes.
        channel.once("close", () => tcp.end()); tcp.once("close", () => channel.end());
        // Catch all on any TCP and Client errors
        const catchErr = (err: Error, sock: net.Socket|ssh2.ServerChannel) => {
          if (showSSHLog) services.log("%s: Catch!, ip:port: %s:%d, err: %s", Username, destIP, destPort, String(err));
          sock.end();
        };
        channel.once("error", err => catchErr(err, tcp));
        tcp.once("error", err => catchErr(err, channel));
        // Pipe the TCP connection to the channel vise-versa.
        tcp.pipe(channel).pipe(tcp);
      });
    });
    // Only port forwarding is supported, so we can reject any other kind of request.
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
