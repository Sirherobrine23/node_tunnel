const {socket} = require("./daemonConnect");
const child_process = require("child_process");
const crypto = require("crypto");
const systeminformation = require("systeminformation");

/**
 * @type {{
 *  username: string;
 *  expire: Date;
 *  password: string|{
 *    iv: string;
 *    Encrypt: string;
 *  };
 *  ssh: {connections: number;};
 *  wireguard: Array<{
 *     keys: {
 *       Preshared: string;
 *       Private: string;
 *       Public: string;
 *     };
 *     ip: {
 *       v4: {ip: string; mask: string;};
 *       v6: {ip: string; mask: string;};
 *     }
 *   }>;
 * }}
 */
const typeUser = {
  username: "",
  expire: new Date(),
  password: {
    iv: "",
    Encrypt: "",
  },
  ssh: {connections: 0},
  wireguard: [{
    keys: {
      Preshared: "",
      Private: "",
      Public: "",
    },
    ip: {
      v4: {ip: "", mask: "",},
      v6: {ip: "", mask: "",},
    }
  }]
};

async function GetProcess() {
  return (await systeminformation.processes()).list.map(Process => {
    const { command, cpus, mem, pid, user, params, started } = Process;
    return {
      pid: pid,
      cpu: cpus,
      mem: mem,
      user: user,
      command: command + " " + params,
      Started: new Date(started),
      KillProcess: () => child_process.execFileSync("kill", ["-9", pid])
    };
  });
}

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
 * @returns {Promise<void>}
 */
async function addUser(username, password, ExpireDate) {
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

async function removeUser(username = "") {
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

socket.on("userOnDescrypt", userOn);
/**
 * 
 * @param {"delete"|"insert"|"update"} operationType 
 * @param {typeUser} data 
 */
async function userOn(operationType, data) {
  if (operationType === "delete") await removeUser(data.username);
  else if (operationType === "insert") await addUser(data.username, data.password, data.expire);
  else if (operationType === "update") {
    await removeUser(data.username);
    await addUser(data.username, data.password, data.expire);
  }
}

socket.on("usersDecrypt", loadUser);
/**
 * 
 * @param {Array<typeUser>} data 
 */
async function loadUser(data) {
  console.info(`(re)loadig users!`);
  for (const user of data) {
    try {
      await addUser(user.username, user.password, user.expire);
      console.log("Sucess in add user:", user.username);
    } catch (err){
      console.error("Error in add user:", user.username);
      console.error(err);
    }
  }
}

/** @type {Array<typeUser} */
let users = [];
socket.on("usersDecrypt", data => users = data);

setInterval(async () => {
  const CurrentProcess = (await GetProcess()).filter(a => a.command.includes("ssh") && !a.command.includes("defunct"));
  for (const User of users) {
    if (User.ssh.connections !== 0) {
      const SSH_Connections = CurrentProcess.filter(a => a.user === User.username);
      if (User.ssh.connections > SSH_Connections.length) {
        for (const Process of SSH_Connections.reverse().slice(-(SSH_Connections.length - User.ssh.connections))) {
          Process.KillProcess();
        }
      }
    }
  }
}, 1000);
setInterval(async () => socket.emit("ssh_monitor", await SshMonitor()), 3*1000);
async function SshMonitor() {
  const CurrentDate = new Date();
  const Current_Process = (await GetProcess()).filter(a => a.command.includes("ssh") && !a.command.includes("defunct"));
  return users.map(User => {
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