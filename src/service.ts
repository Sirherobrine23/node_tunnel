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

export async function StartSshd (Loaddeds_Keys=false) {
  if (!(fs.existsSync("/run/sshd"))) fs.mkdirSync("/run/sshd");
  if (Loaddeds_Keys) await copyCreateKeys();
  const SSHProcess = child_process.exec("/usr/sbin/sshd -D -d -f /etc/ssh/sshd_config", {maxBuffer: Infinity});
  SSHProcess.on("exit", code => code !== 0 ? StartSshd():null);
  const logFile = fs.createWriteStream(`/tmp/sshd_${(new Date()).toString().replace(/[-\(\)\:\s+]/gi, "_")}.log`, {flags: "a"});
  SSHProcess.stdout.pipe(logFile);
  SSHProcess.stderr.pipe(logFile);
  return;
}