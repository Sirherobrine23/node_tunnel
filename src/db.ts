import * as crypto from "node:crypto";
import mongoose from "mongoose";
const SecretEncrypt = process.env.PASSWORD_SECERET;
if (!SecretEncrypt) {
  console.error("PASSWORD_SECERET is not set");
  process.exit(1);
}

if (!!process.env.MongoDB_URL) {
  console.warn("MongoDB_URL is deprecated, use MONGO_URL instead");
  process.env.MONGO_URL = process.env.MongoDB_URL;
  delete process.env.MongoDB_URL;
} else if (!process.env.MONGO_URL) {
  console.error("MONGO_URL is not set");
  process.exit(1);
}

let { MONGO_URL } = process.env;
const urlParse = new URL(MONGO_URL);
if (urlParse.pathname === "/"||!urlParse.pathname) {
  MONGO_URL = ""; MONGO_URL += urlParse.protocol + "//"; MONGO_URL += urlParse.host;
  if (urlParse.username) MONGO_URL += urlParse.username; if (urlParse.password) MONGO_URL += ":" + urlParse.password;
  if (!!urlParse.username || !!urlParse.password) MONGO_URL += "@";
  MONGO_URL += "/ofvp";
}
mongoose.connect(MONGO_URL, {
  autoIndex: true,
  compressors: "zlib",
  serializeFunctions: true,
  zlibCompressionLevel: 9
});

export type passwordEncrypted = {
  Encrypt: string,
  iv: string
};

/**
 * @param password - plain text password to encrypt
 */
export function EncryptPassword(Password: string): passwordEncrypted {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(SecretEncrypt, "salt", 24);
  const cipher = crypto.createCipheriv("aes-192-cbc", key, iv);
  return {
    Encrypt: cipher.update(Password, "utf8", "hex") + cipher.final("hex"),
    iv: iv.toString("hex"),
  }
};

/**
 * Return String with password decrypt.
 * @param password
 * @returns {string}
 */
export function DecryptPassword(passwordObject: passwordEncrypted): string {
  const {iv, Encrypt} = passwordObject;
  if (!iv) throw new Error("iv blank");
  if (!Encrypt) throw new Error("Encrypt blank");
  const key = crypto.scryptSync(SecretEncrypt, "salt", 24);
  const decipher = crypto.createDecipheriv("aes-192-cbc", key, Buffer.from(iv, "hex"));
  return decipher.update(Encrypt, "hex", "utf8") + decipher.final("utf8");
};

export async function comparePassword(Password: string, passwordObject: passwordEncrypted): Promise<boolean> {
  const password = DecryptPassword(passwordObject);
  return password === Password;
}

type sshType = {
  UserID: string,
  Username: string,
  expireDate: Date,
  maxConnections: number,
  Password: passwordEncrypted
};

export const sshSchema = mongoose.model<sshType>("ssh", new mongoose.Schema<sshType, mongoose.Model<sshType, sshType, sshType, sshType>>({
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
  expireDate: {
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