import fs from "fs";
import path from "path";
import child_process from "child_process";

function execFileAsync(command: string, Args: Array<string>, Options?: child_process.ExecFileOptionsWithBufferEncoding): Promise<{stdout: string, stderr: string}> {
  return new Promise((resolve, reject) => {
    if (Options === undefined) Options = {encoding: "buffer"};
    child_process.execFile(command, Args, Options, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve({stdout: stdout.toString(), stderr: stderr.toString()});
    });
  });
}

async function copyCreateKeys() {
  const KeysStoragePath = "/data";
  if (fs.readdirSync(KeysStoragePath).filter(file => file.includes("ssh_host_")).length === 0) {
    console.log("SSH Host Keys Found, Creating New Keys");
    child_process.execSync("dpkg-reconfigure openssh-server &> /dev/null");
    fs.readdirSync("/etc/ssh").filter(file => file.includes("ssh_host_")).map(KeyFile => path.join("/etc/ssh/", KeyFile)).forEach(KeyFile => fs.copyFileSync(KeyFile, path.join(KeysStoragePath, path.basename(KeyFile))));
  } else {
    console.log("Copying SSH Host Keys");
    for (const KeyFile of fs.readdirSync(KeysStoragePath).filter(Key => Key.includes("ssh_host_"))) {
      const KeyFileOut = path.join("/etc/ssh", KeyFile);
      await fs.promises.copyFile(path.join(KeysStoragePath, KeyFile), KeyFileOut);
      await execFileAsync("chmod", ["0600", "-v", KeyFileOut]);
    };
  }
}

function startBadvpn() {
    console.log("Starting Badvpn");
    const badvpnExec = child_process.exec("badvpn --listen-addr 0.0.0.0:7300 --logger stdout --loglevel debug --max-clients 1000 --max-connections-for-client 10", {maxBuffer: Infinity});
    badvpnExec.stdout.on("data", data => process.stdout.write(data));
    badvpnExec.stderr.on("data", data => process.stdout.write(data));
    badvpnExec.on("close", code => {
      if (code !== 0) {
        console.log("Badvpn Closed with Code: " + code);
        process.exit(code);
      }
    });
}
startBadvpn();

export async function StartSshd (Loaddeds_Keys=false) {
  if (!(fs.existsSync("/run/sshd"))) fs.mkdirSync("/run/sshd");
  if (Loaddeds_Keys) await copyCreateKeys();
  const SSHProcess = child_process.exec("/usr/sbin/sshd -D -f /etc/ssh/sshd_config", {maxBuffer: Infinity});
  SSHProcess.on("exit", code => process.exit(code));
  SSHProcess.stdout.on("data", data => process.stdout.write(data));
  SSHProcess.stderr.on("data", data => process.stdout.write(data));
  return;
}
