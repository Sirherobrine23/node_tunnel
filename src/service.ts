import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
const __TempFile = path.join(os.tmpdir(), "badvpnStart.lock");
const showBadLog = process.env.SHOWBADVPNLOGS === "true";
const PMINSTANCE = process.env.NODE_APP_INSTANCE || "0";
const LogFile = path.join(os.tmpdir(), `ssh_${PMINSTANCE}.log`);

export async function startBadvpn(): Promise<void> {
  if (fs.existsSync(__TempFile)) {
    if (PMINSTANCE !== fs.readFileSync(__TempFile, "utf8").trim()) return;
  }
  fs.writeFileSync(__TempFile, PMINSTANCE);
  console.log("Starting Badvpn");
  const badvpnExec = child_process.exec("badvpn --listen-addr 0.0.0.0:7300 --logger stdout --loglevel debug --max-clients 1000 --max-connections-for-client 10", {maxBuffer: Infinity});
  if (showBadLog) badvpnExec.stdout.on("data", data => process.stdout.write(data));
  if (showBadLog) badvpnExec.stderr.on("data", data => process.stdout.write(data));
  badvpnExec.once("close", code => {
    if (code !== 0) {
      console.log("Badvpn Closed with Code: " + code);
      fs.rmSync(__TempFile);
      return startBadvpn();
    }
    return Promise.resolve();
  });
}

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
  fs.appendFileSync(LogFile, (`[SSH Server ${PMINSTANCE}]: ${Message}`+ Args.join(" ")+"\n"));
}