#!/usr/bin/env node
import * as net from "node:net";
import * as fs from "node:fs";

type payload = {
  raw?: string,
  method: string,
  httpVersion: string,
  path: string,
  header: {[key: string]: string},
  second?: payload
};

function parsePayload(data: string): payload {
  const connectionPayload: payload = {
    raw: data,
    method: "",
    httpVersion: "",
    path: "",
    header: {}
  }
  const Method = /^(GET|POST|CONNECT|HEAD|PUT|DELETE|OPTIONS|TRACE|PATCH|PROPFIND|PROPPATCH)\s+(.*)\s+HTTP\/(.*)/;
  const Header = /([0-9A-Za-z\._-\s@]+):([\s\S\:]+)/;
  for (const line of data.trim().split(/\r?\n/g)) {
    if (Header.test(line.trim())) {
      const [, key, value] = line.trim().match(Header);
      connectionPayload.header[key.trim()] = value.trim();
    } else if (Method.test(line)) {
      const dataPay = line.match(Method);
      if (dataPay) {
        if (connectionPayload.method && connectionPayload.path && connectionPayload.httpVersion) {
          connectionPayload.second = parsePayload(data);
          return connectionPayload;
        } else {
          connectionPayload.method = dataPay[1];
          connectionPayload.path = dataPay[2];
          connectionPayload.httpVersion = dataPay[3].trim();
        }
      }
    }
    if (line.trim() === "") return connectionPayload;
    data = data.replace(line, "");
  };
  return connectionPayload;
}

export async function start(cmdOptions: {logFile: string, ssh: string, code: string, httpVersion: string, message: string, port: number}) {
  fs.writeFileSync(cmdOptions.logFile, "");
  const ssh = {host: cmdOptions.ssh.split(":")[0], port: parseInt(cmdOptions.ssh.split(":")[1])};
  async function connectionHandler(client: net.Socket, sshHost: string, sshPort: number) {
    const clientIpPort = client.remoteAddress+":"+client.remotePort;
    client.once("close", () => fs.appendFileSync(cmdOptions.logFile, `[Client: ${clientIpPort}]: Close connection\n`));
    client.on("error", err => fs.appendFileSync(cmdOptions.logFile, `[${clientIpPort} -> ${sshHost}:${sshPort}]: ${String(err)}\n`));
    const data = await new Promise<string>(resolve => client.once("data", (data) => resolve(data.toString())));
    const target = net.createConnection({port: sshPort, host: sshHost});
    client.once("close", () => target.end());
    target.once("close", () => client.end());
    target.on("ready", () => {
      client.write(`HTTP/${cmdOptions.httpVersion} ${cmdOptions.code} ${cmdOptions.message}\r\n\r\n`);
      target.on("error", err => fs.appendFileSync(cmdOptions.logFile, `[${sshHost}:${sshPort} -> ${clientIpPort}]: ${String(err)}\n`));
      client.pipe(target);
      target.pipe(client);
    });
    fs.appendFileSync(cmdOptions.logFile, `[Client: ${clientIpPort}]: Connected\n`);
    const payloadObject = JSON.stringify(parsePayload(data), null, 2).split("\n").join(`\n[Client: ${clientIpPort}]: `)
    fs.appendFileSync(cmdOptions.logFile, `[Client: ${clientIpPort}]: Payload Recived:\n[Client: ${clientIpPort}]: ${payloadObject}\n`);
    return new Promise<boolean>(resolve => {
      target.once("close", resolve);
      client.once("close", resolve);
    });
  }

  // Create TCP socket server
  const serverListen = net.createServer();
  serverListen.setMaxListeners(0);
  serverListen.listen(cmdOptions.port, "0.0.0.0", () => console.log("wsSSH: web proxy listen on port %d", cmdOptions.port));
  serverListen.on("connection", (connection) => connectionHandler(connection, ssh.host, ssh.port).catch(console.trace));
  serverListen.on("error", (err: Error) => console.log("wsSSH: %s\n", String(err)));

  console.log("wsSSH: Default host connect: %s", cmdOptions.ssh);
  console.log("wsSSH: HTTP response: 'HTTP/%s %f %s'", cmdOptions.httpVersion, cmdOptions.code, cmdOptions.message);
  console.log("wsSSH: Listen on %d", cmdOptions.port);
  console.log("wsSSH: Starting web proxy...");
}