#!/usr/bin/env node
import { StartSshd, startBadvpn } from "./service";
import * as Usermaneger from "./userManeger";
import mongoose from "mongoose"
import crypto from "crypto";
console.log("Starting...");
const SecretEncrypt = (process.env.PASSWORD_ENCRYPT||"").trim();
if (!SecretEncrypt) {
  console.error("env PASSWORD_ENCRYPT it blank.");
  process.exit(1);
}

function DecryptPassword(passwordObject: {iv: string; Encrypt: string;}): string {
  const {iv, Encrypt} = passwordObject;
  if (!iv) throw new Error("iv blank");
  if (!Encrypt) throw new Error("Encrypt blank");
  const key = crypto.scryptSync(SecretEncrypt, "salt", 24);
  const decipher = crypto.createDecipheriv("aes-192-cbc", key, Buffer.from(iv, "hex"));
  return decipher.update(Encrypt, "hex", "utf8") + decipher.final("utf8");
};

if (!process.env.MongoDB_URL) process.env.MongoDB_URL = "mongodb://localhost:27017/OFVpServer";
const Connection = mongoose.createConnection(process.env.MongoDB_URL);
Connection.on("error", err => {
  console.error("MongoDB connection error: %s", String(err));
  process.exit(1);
});

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

const sshSchema = Connection.model<sshType>("SSH", new mongoose.Schema<sshType>({
  UserID: {
    type: String,
    required: true,
    unique: true
  },
  Username: {
    type: String,
    required: true,
    unique: true
  },
  maxConnections: {
    type: Number,
    required: true,
    default: 5
  },
  Expire: {
    type: Date,
    required: true
  },
  Password: {
    Encrypt: {
      type: String,
      required: true
    },
    iv: {
      type: String,
      required: true
    }
  }
}));

async function syncUsers() {
  let Users: Array<sshType> = [];
  while (true) {
    const newUsers = await sshSchema.find({}).lean();
    const removed = Users.filter(user => !newUsers.find(newUser => newUser.UserID === user.UserID));
    const added = newUsers.filter(newUser => !Users.find(user => user.UserID === newUser.UserID));
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
          await Usermaneger.addUser(user.Username, DecryptPassword(user.Password), user.Expire);
        } catch (err) {
          console.error("Failed to add user: %s", user.Username);
        }
      }
    }
    Users = newUsers;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

Connection.once("connected", async () => {
  console.log("Connected to MongoDB");
  await sshSchema.find().lean().then(async Data => {
    console.log("Add all users");
    for (const {ssh, err} of await Promise.all(Data.map(ssh => Usermaneger.addUser(ssh.Username, DecryptPassword(ssh.Password), ssh.Expire).then(() => ({ssh})).catch(err => ({err, ssh})))) as Array<{err?: any, ssh: sshType}>) {
      if (!!err) console.error("Failed to add %s, Error: %s", ssh.Username, String(err));
    }
  });
  StartSshd(true);
  if (process.env.DONTSTARTBADVPN !== "true") startBadvpn();
  return syncUsers();
});