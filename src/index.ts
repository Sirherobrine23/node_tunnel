#!/usr/bin/env node
import { StartSshd, startBadvpn } from "./service";
import * as Usermaneger from "./userManeger";
import { io as socketIO } from "socket.io-client";
import crypto from "crypto";

const SecretEncrypt = process.env.PASSWORD_ENCRYPT;
if (!SecretEncrypt) {
  console.error("env PASSWORD_ENCRYPT it blank.");
  process.exit(1);
}
console.log("Starting...");
const { DAEMON_HOST, DAEMON_USERNAME, DAEMON_PASSWORD } = process.env;
if (!DAEMON_HOST) {
  console.log("Daemon host not defined");
  process.exit(1);
}
const io = socketIO(DAEMON_HOST, {
  auth: {
    username: DAEMON_USERNAME,
    password: DAEMON_PASSWORD
  }
});

function DecryptPassword(passwordObject: {iv: string; Encrypt: string;}): string {
  const {iv, Encrypt} = passwordObject;
  if (!iv) throw new Error("iv blank");
  if (!Encrypt) throw new Error("Encrypt blank");
  const key = crypto.scryptSync(SecretEncrypt, "salt", 24);
  const decipher = crypto.createDecipheriv("aes-192-cbc", key, Buffer.from(iv, "hex"));
  return decipher.update(Encrypt, "hex", "utf8") + decipher.final("utf8");
};

type sshType = {
  UserID: string,
  Username: string,
  Expire: Date,
  maxConnections: number,
  Password: {
    Encrypt: string,
    iv: string
  }
};
function getUsers(): Promise<Array<sshType>> {
  return new Promise<Array<sshType>>(resolve => {
    // "opensshUsers"
    io.once("opensshUsers", data => resolve(data));
    io.emit("opensshUsers", "get");
  });
}

async function syncUsers() {
  let Users: Array<sshType> = [];
  while (true) {
    const newUsers = await getUsers();
    const removed = Users.filter(user => !newUsers.some(newUser => newUser.UserID === user.UserID));
    const added = newUsers.filter(newUser => !Users.some(user => user.UserID === newUser.UserID));
    if (removed.length > 0) {
      for (const user of removed) {
        try {
          await Usermaneger.removeUser(user.Username);
          console.log("Removed: %s", user.Username);
        } catch (err) {
          console.error("Failed to remove user: %s", user.Username);
        }
      }
    }
    if (added.length > 0) {
      for (const user of added) {
        try {
          await Usermaneger.addUser(user.Username, DecryptPassword(user.Password), user.Expire).then();
          console.log("Added: %s", user.Username);
        } catch (err) {
          console.error("Failed to add user: %s", user.Username);
        }
      }
    }
    Users = newUsers;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function removeConnections() {
  while (true) {
    const process = (await Usermaneger.GetProcess()).filter(process => process.command.includes("ssh") && !/defunct/.test(process.command));
    for (const user of await getUsers()) {
      if (user.maxConnections === 0) continue;
      const userProcess = process.filter(process => process.user === user.Username);
      if (userProcess.length > user.maxConnections) {
        for (const process of userProcess.slice(user.maxConnections)) {
          try {
            await process.KillProcess();
            console.log("Killed: %s", process.command);
          } catch (err) {
            console.error("Failed to kill process: %s", process.command);
          }
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

io.once("connect", async () => {
  console.log("Connected to MongoDB");
  console.log("Add all users to System");
  await getUsers().then(async Data => {
    for (const {ssh, err} of await Promise.all(Data.map(ssh => Usermaneger.addUser(ssh.Username, DecryptPassword(ssh.Password), ssh.Expire).then(() => ({ssh})).catch(err => ({err, ssh})))) as Array<{err?: any, ssh: sshType}>) {
      if (!!err) console.error("Failed to add %s, Error: %s", ssh.Username, String(err));
    }
  });
  StartSshd(true);
  if (process.env.DONTSTARTBADVPN !== "true") startBadvpn();
  removeConnections();
  return syncUsers();
});