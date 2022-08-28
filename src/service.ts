import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
const LogFile = path.join(os.tmpdir(), "nodessh.log");

function internalSSHKeygen(crypt: "rsa"|"dsa"|"ecdsa"|"ed25519"): Promise<{priv: string, pub: string}> {
  const randomTmpFile = path.join(os.tmpdir(), "ssh-keygen-tmp-" + crypto.randomBytes(32).toString("hex"));
  return new Promise<{priv: string, pub: string}>((resolve, reject) => {
    // ssh-keygen -q -f "$file" -N '' "$@" (-t ...)
    child_process.execFile("ssh-keygen", ["-q", "-f", randomTmpFile, "-N", "", "-t", crypt], (err) => {
      if (err) return reject(err);
      // ssh-keygen -l -f "$file.pub"
      child_process.execFile("ssh-keygen", ["-l", "-f", randomTmpFile + ".pub"], (err2) => {
        if (err2) return reject(err2);
        resolve({
          priv: randomTmpFile,
          pub: randomTmpFile+".pub"
        })
      });
    });
  });
}

export type sshHostKeys = {rsa: {priv: string, pub: string}, dsa: {priv: string, pub: string}, ecdsa: {priv: string, pub: string}, ed25519: {priv: string, pub: string}}
export async function CreateSSHKeys(): Promise<sshHostKeys> {
  const [rsa, dsa, ecdsa, ed25519] = await Promise.all([internalSSHKeygen("rsa"), internalSSHKeygen("dsa"), internalSSHKeygen("ecdsa"), internalSSHKeygen("ed25519")]).then(res => res.map(res => {
    const priv = fs.readFileSync(res.priv, "utf8"), pub = fs.readFileSync(res.pub, "utf8");
    fs.rmSync(res.priv); fs.rmSync(res.pub);
    return {priv, pub};
  }));
  return {rsa, dsa, ecdsa, ed25519};
}

export function log(Message: string, ...Args: any[]) {
  fs.appendFileSync(LogFile, (`[SSH Server]: ${Message}`+ Args.join(" ")+"\n"));
}