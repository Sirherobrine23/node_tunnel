import { io as socketIO } from "socket.io-client";
import * as crypto from "node:crypto";
const SecretEncrypt = process.env.PASSWORD_ENCRYPT;
if (!SecretEncrypt) {
  console.error("env PASSWORD_ENCRYPT it blank.");
  process.exit(1);
}

const { DAEMON_HOST, DAEMON_USERNAME, DAEMON_PASSWORD } = process.env;
if (!DAEMON_HOST) {
  console.log("Daemon host not defined");
  process.exit(1);
}
console.log("Starting daemon connection on %s...", DAEMON_HOST);
export const io = socketIO(DAEMON_HOST, {
  transports: ["websocket", "polling"],
  auth: {username: DAEMON_USERNAME, password: DAEMON_PASSWORD},
  extraHeaders: {username: DAEMON_USERNAME, password: DAEMON_PASSWORD},
});
io.on("connect", () => console.log("Connected"));
io.on("connect_error", err => {
  console.error(String(err));
  process.exit(1);
});

export function DecryptPassword(passwordObject: {iv: string; Encrypt: string;}): string {
  const {iv, Encrypt} = passwordObject;
  if (!iv) throw new Error("iv blank");
  if (!Encrypt) throw new Error("Encrypt blank");
  const key = crypto.scryptSync(SecretEncrypt, "salt", 24);
  const decipher = crypto.createDecipheriv("aes-192-cbc", key, Buffer.from(iv, "hex"));
  return decipher.update(Encrypt, "hex", "utf8") + decipher.final("utf8");
};

export type sshType = {
  UserID: string,
  Username: string,
  Expire: Date,
  maxConnections: number,
  Password: {
    Encrypt: string,
    iv: string
  }
};

let localCache: Date = new Date();
let localCacheUsers: sshType[] = [];
export function getUsers(cleanCache?: boolean): Promise<Array<sshType>> {
  if (!cleanCache) {
    if ((localCache.getTime() - (new Date()).getTime()) <= 1000 * 60 * 60) {
      console.log("Using local cache");
      return Promise.resolve(localCacheUsers);
    }
  }
  return new Promise<Array<sshType>>(resolve => {
    // "opensshUsers"
    io.once("opensshUsers", data => {
      localCacheUsers = data;
      localCache = new Date(Date.now() + 1000 * 60 * 60);
      resolve(data);
    });
    io.emit("opensshUsers", "get");
  });
}