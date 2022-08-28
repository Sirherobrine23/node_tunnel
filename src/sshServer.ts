#!/usr/bin/env node
import * as net from "node:net"
import * as ssh2 from "ssh2";
import { sshDb, comparePassword } from "./db";

export function startServer(port: number, sshKeys: string[], sshBanner?: string) {
  const sshServer = new ssh2.Server({hostKeys: sshKeys, banner: sshBanner});
  sshDb.updateMany({}, {$set: {currentConnections: 0}}).lean().catch(() => null).then(() => sshServer.listen(port, "0.0.0.0", () => console.log("SSH Listen on %o, Connection avaible.", (sshServer.address() as net.AddressInfo).port)));
  sshServer.on("error", () => null);
  // SSH Port forwards
  sshServer.on("connection", client => {
    let Username = "";
    client.on("error", () => null);
    client.on("ready", () => {
      client.on("session", (_, reject) => reject());
      // After auth is successful, we can start accepting any port forwarding requests.
      client.on("tcpip", (accept, _reject, {destIP: hostConnect, destPort: portConnect}) => {
        const tcp = net.createConnection({port: portConnect, host: hostConnect}), channel = accept();

        // Close the channel if the TCP connection closes.
        channel.once("close", () => tcp.end());
        tcp.once("close", () => channel.end());

        // Catch Connections Error
        channel.on("error", () => null);
        tcp.on("error", () => null);

        // Pipe the TCP connection to the channel vise-versa.
        tcp.pipe(channel);
        channel.pipe(tcp);

        // Collect data size transferred and update the db statistics.
        const updatedataTraffered = (byteSize: number) => sshDb.findOneAndUpdate({Username: Username}, {$inc: {dateTransfered: byteSize}}).lean().then(() => undefined).catch(() => undefined);
        channel.on("data", async (data: Buffer) => await updatedataTraffered(data.length));
        tcp.on("data", async data => await updatedataTraffered(data.length));
      });
    });

    // User Auth
    client.on("authentication", async (ctx) => {
      Username = ctx.username;
      // Thanks @mscdex (ssh2 Autor), Original Post: https://stackoverflow.com/a/36902453/11895959 (StackOverflow not git)
      if (ctx.method === "none") return ctx.reject(["password"]);
      const user = await sshDb.findOne({Username: Username}).lean();
      if (user) {
        if (user.maxConnections === 0||user.currentConnections === 0||!(user.maxConnections > user.currentConnections)) {
          if (ctx.method === "password") {
            if (comparePassword(ctx.password, user.Password)) {
              client.on("close", () => sshDb.findOneAndUpdate({Username: Username}, {$inc: {currentConnections: -1}}));
              await sshDb.findOneAndUpdate({Username: Username}, {$inc: {currentConnections: 1}});
              return ctx.accept();
            }
          }
        }
      }
      return ctx.reject();
    });
  });
}