import * as crypto from "node:crypto";
import mongoose from "mongoose";
mongoose.connection.on("error", (err: Error) => {console.log(err); process.exit(1);});
mongoose.connect(process.env.MONGODB_URL, {autoIndex: true, compressors: "zlib", serializeFunctions: true, zlibCompressionLevel: 9});

export const comparePassword = (Password: string, Passwordbase64: string): boolean => Password === DecryptPassword(Passwordbase64);
export function DecryptPassword(Passwordbase64: string): string {
  if (!process.env.PASSWORD_SECERET) throw new Error("Password Secret is blank");
  const passwordMatch = Buffer.from(Passwordbase64, "base64").toString("utf8").match(/(.*)::(SHs|OfV)::(.*)/);
  if (!passwordMatch) throw new Error("Invalid password");
  const [, iv, ,Encrypt] = passwordMatch;
  if (!iv) throw new Error("iv blank");
  if (!Encrypt) throw new Error("Encrypt blank");
  const key = crypto.scryptSync(process.env.PASSWORD_SECERET, "salt", 24);
  const decipher = crypto.createDecipheriv("aes-192-cbc", key, Buffer.from(iv, "hex"));
  return decipher.update(Encrypt, "hex", "utf8") + decipher.final("utf8");
};


export type sshType = {
  Username: string,
  Password: string,
  maxConnections: number,
  currentConnections: number,
  dateTransferedHistoric?: {
    [year: string]: {
      [month: string]: number
    }
  }
};

export const sshDb = mongoose.model<sshType>("sshDb", new mongoose.Schema<sshType, mongoose.Model<sshType, sshType, sshType, sshType>>({
  Username: {
    type: String,
    required: true,
    unique: true
  },
  Password: {
    type: String,
    required: true
  },
  maxConnections: {
    type: Number,
    required: true,
    default: 6
  },
  currentConnections: {
    type: Number,
    required: true,
    default: 0
  },
  dateTransferedHistoric: {
    type: Object,
    default: () => ({[(new Date()).getFullYear()]: {[(new Date()).getMonth()+1]: 0}})
  }
}));