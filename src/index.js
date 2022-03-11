#!/usr/bin/env node
const daemon = require("./daemonConnect");
const child_process = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { CronJob } = require("cron");

async function StartSshd (Loaddeds_Keys=false) {
  if (!(fs.existsSync("/run/sshd"))) fs.mkdirSync("/run/sshd");
  // Write SSH Config
  fs.writeFileSync("/etc/ssh/sshd_config", ([
    `Banner ${path.resolve(__dirname, "./banner.html")}`,
    "PasswordAuthentication yes",
    "PermitRootLogin yes",
    "ChallengeResponseAuthentication no",
    "Include /etc/ssh/sshd_config.d/*.conf",
    "UsePAM yes",
    "X11Forwarding no",
    "PrintMotd yes",
    "AcceptEnv LANG LC_*",
    "Subsystem       sftp    /usr/lib/openssh/sftp-server",
    "LogLevel DEBUG1",
    "",
    "# Ports",
    "",
    "Port 22"
  ]).join("\n"));

  // Copy or Create ssh host keys
  if (Loaddeds_Keys) {
    const KeysStoragePath = "/data";
    if (fs.readdirSync(KeysStoragePath).filter(file => file.includes("ssh_host_")).length === 0) {
      console.log("SSH Host Keys Found, Creating New Keys");
      child_process.execSync("dpkg-reconfigure openssh-server &> /dev/null");
      fs.readdirSync("/etc/ssh").filter(file => file.includes("ssh_host_")).map(KeyFile => path.join("/etc/ssh/", KeyFile)).forEach(KeyFile => fs.copyFileSync(KeyFile, path.join(KeysStoragePath, path.basename(KeyFile))));
    } else {
      console.log("Copying SSH Host Keys");
      fs.readdirSync(KeysStoragePath).filter(Key => Key.includes("ssh_host_")).map(Key => path.join(KeysStoragePath, Key)).forEach(KeyFile => {
        const KeyFileOut = path.join("/etc/ssh", path.basename(KeyFile));
        fs.copyFileSync(KeyFile, KeyFileOut);
        child_process.execFileSync("chmod", ["0600", "-v", KeyFileOut], {stdio: "ignore"});
      });
    }
  }
  const SSHProcess = child_process.exec("/usr/sbin/sshd -D -f /etc/ssh/sshd_config");
  SSHProcess.on("exit", code => code !== 0 ? StartSshd():null);
  SSHProcess.stdout.on("data", data => process.stdout.write(data));
  SSHProcess.stderr.on("data", data => process.stdout.write(data));
  return;
}

/**
 * 
 * @param {string} cmd 
 * @param {*} args 
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
const execPromise = (cmd, options) => new Promise((resolve, reject) => {
  child_process.exec(cmd, options, (err, stdout, stderr) => {
    if (err) return reject(err);
    return resolve({stdout, stderr});
  });
});
/**
 * 
 * @param {string} cmd 
 * @param {Array<string>} args 
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
const execFilePromise = (cmd, args) => new Promise((resolve, reject) => {
  child_process.execFile(cmd, args, (err, stdout, stderr) => {
    if (err) return reject(err);
    return resolve({stdout, stderr});
  });
});

/**
 * 
 * @param {string} username 
 * @param {string} password 
 * @param {Date} ExpireDate 
 * @returns {Promise<{
 *   Add: true|false;
 *   Error: null|Array<string>|string;
 * }>}
 */
async function AddtoSystem(username = "", password = "", ExpireDate = new Date(Date.now() * 2)) {
  if (username.length <= 4) return {
    Add: false,
    Error: "Username must be at least 5 characters"
  };
  if (username.length >= 30) return {
    Add: false,
    Error: "Username must be less than 30 characters"
  };
  if (password.length <= 4) return {
    Add: false,
    Error: "Password must be at least 5 characters"
  };
  const PerlPass = crypto.createHash("md5").update(password).digest("hex");
  // const PerlPass = (await execFilePromise("perl", ["-e", "print crypt($ARGV[0], \"password\")", password])).stdout;
  const DateToExpire = `${ExpireDate.getFullYear()}-${(ExpireDate.getMonth() + 1) <= 9 ? "0"+(ExpireDate.getMonth() + 1):(ExpireDate.getMonth() + 1)}-${ExpireDate.getDate() <= 9 ? "0"+ExpireDate.getDate():ExpireDate.getDate()}`;
  await execFilePromise("useradd", ["-e", DateToExpire, "-M", "-s", "/bin/false", "-p", PerlPass, username]);
  return;
}

async function RemoveFromSystem(username = "") {
  // Checks parameters is valid
  if (!username) throw (new Error("Username is empty"));
  if (typeof username !== "string") throw (new Error("Username must be a string"));
  if (username === "root") throw new Error("You can't delete the root user");
  (await Process.GetProcess()).forEach(Process => {try {if (Process.user === Username) Process.KillProcess()} catch (err) {}});
  // Delete
  try {
    child_process.execFileSync("userdel", ["-r", username], {stdio: "pipe"});
  } catch (err) {
    if (/user.*does not exist/gi.test(String(err))) return;
    throw err;
  }
  return;
}

daemon.on((operationType, data) => {
  if (operationType === "connect") data.map(user => AddtoSystem(user.username, user.password, user.expire));
  else {
    if (operationType === "insert") AddtoSystem(data.username, data.password, data.expire);
    else if (operationType === "update") {
      RemoveFromSystem(data.username);
      AddtoSystem(data.username, data.password, data.expire);
    }
  }
});

async function SshMonitor() {
  const CurrentDate = new Date();
  const Current_Process = (await Process.GetProcess()).filter(a => a.command.includes("ssh") && !a.command.includes("defunct"));
  return (await MongoUsers.getUsers()).map(User => {
    const SSH_Connections = Current_Process.filter(a => a.user === User.username);
    const Ssh = {
      Username: User.username,
      expire: User.expire.toString(),
      Max_Connections: User.ssh.connections,
      connections: SSH_Connections.map(Process => {
        const DataSsh =  {CPU: Process.cpu, Started: Process.Started.toString(), TimeConnected: {seconds: 0, minutes: 0, hours: 0, days: 0, weeks: 0, months: 0, years: 0}};
        let Difference = CurrentDate.getTime() - Process.Started.getTime();
        const DatesCal = [{name: "seconds", value: 1000, correct_value: 60}, {name: "minutes", value: 60, correct_value: 60}, {name: "hours", value: 60, correct_value: 60}, {name: "days", value: 24, correct_value: 24}, {name: "weeks", value: 7, correct_value: 7}, {name: "months", value: 30, correct_value: 30}, {name: "years", value: 12, correct_value: 12}];
        for (const Dat of DatesCal) {
          if (Difference <= Dat.value) break
          Difference = Difference / Dat.value;
          DataSsh.TimeConnected[Dat.name] = Math.floor(Difference % Dat.correct_value);
        }
        return DataSsh;
      }),
    }
    return Ssh;
  });
}

daemon.mongoStatus().then(() =>{
  StartSshd(true);
  const cron = new CronJob("* * * * * *", () => SshMonitor().then(data => daemon.socket.emit("ssh_monitor", data)));
  cron.start();
}).catch(err => {console.error(err); process.exit(2);});