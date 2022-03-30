import child_process from "child_process";
import systeminformation from "systeminformation";

export type typeUser = {
  username: string;
  expire: Date;
  password: string|{
    iv: string;
    Encrypt: string;
  };
  ssh: {connections: number;};
  wireguard: Array<{
    keys: {
      Preshared: string;
      Private: string;
      Public: string;
    };
    ip: {
      v4: {ip: string; mask: string;};
      v6: {ip: string; mask: string;};
    }
  }>;
};

type SshMonitorType = {
  Username: string;
  expire: Date;
  Max_Connections: number;
  connections: Array<{
    CPU: number;
    Started: Date;
    TimeConnected: {
      seconds?: number;
      minutes?: number;
      hours?: number;
      days?: number;
      weeks?: number;
      months?: number;
      years?: number;
    };
  }>;
}

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
      KillProcess: () => child_process.execFileSync("kill", ["-9", String(pid)])
    };
  });
}

function execFilePromise(cmd: string, args?: Array<string>): Promise<{stdout: string, stderr: string}> {
  return new Promise((resolve, reject) => {
    child_process.execFile(cmd, args, (err, stdout, stderr) => {
      if (err) return reject(err);
      return resolve({stdout, stderr});
    });
  });
}

export async function addUser(username: string, password: string, ExpireDate: Date) {
  if (username.length <= 4) throw new Error("Username must be at least 5 characters");
  if (username.length >= 30) throw new Error("Username must be less than 30 characters");
  if (password.length <= 4) throw new Error("Password must be at least 5 characters");
  const PerlPass = (await execFilePromise("perl", ["-e", "print crypt($ARGV[0], \"password\")", password])).stdout;
  const DateToExpire = `${ExpireDate.getFullYear()}-${(ExpireDate.getMonth() + 1) <= 9 ? "0"+(ExpireDate.getMonth() + 1):(ExpireDate.getMonth() + 1)}-${ExpireDate.getDate() <= 9 ? "0"+ExpireDate.getDate():ExpireDate.getDate()}`;
  await execFilePromise("useradd", ["-e", DateToExpire, "-M", "-s", "/bin/false", "-p", PerlPass, username]);
  return;
}

export async function removeUser(username: string) {
  // Checks parameters is valid
  if (!username) throw (new Error("Username is empty"));
  if (typeof username !== "string") throw (new Error("Username must be a string"));
  if (username === "root") throw new Error("You can't delete the root user");
  (await GetProcess()).forEach(Process => {try {if (Process.user === username) Process.KillProcess()} catch (err) {}});
  // Delete
  try {
    child_process.execFileSync("userdel", ["-r", username], {stdio: "pipe"});
  } catch (err) {
    if (/user.*does not exist/gi.test(String(err))) return;
    throw err;
  }
  return;
}

export function loadUser(data: Array<typeUser>) {
  for (const user of data) addUser(user.username, String(user.password), new Date(user.expire)).then(() => {});
}

let users: Array<typeUser> = [];
export function updateLocaluser(data: Array<typeUser>) {users = data;}
export async function SshMonitor(): Promise<Array<SshMonitorType>> {
  const CurrentDate = new Date();
  const Current_Process = (await GetProcess()).filter(a => a.command.includes("ssh") && !a.command.includes("defunct"));
  return users.map(User => {
    const SSH_Connections = Current_Process.filter(a => a.user === User.username);
    const Ssh = {
      Username: User.username,
      expire: User.expire,
      Max_Connections: User.ssh.connections,
      connections: SSH_Connections.map(Process => {
        const calconne = () => {
          const CallD = {};
          let Difference = CurrentDate.getTime() - Process.Started.getTime();
          const DatesCal = [{name: "seconds", value: 1000, correct_value: 60}, {name: "minutes", value: 60, correct_value: 60}, {name: "hours", value: 60, correct_value: 60}, {name: "days", value: 24, correct_value: 24}, {name: "weeks", value: 7, correct_value: 7}, {name: "months", value: 30, correct_value: 30}, {name: "years", value: 12, correct_value: 12}];
          for (const Dat of DatesCal) {
            if (Difference <= Dat.value) break
            Difference = Difference / Dat.value;
            CallD[Dat.name] = Math.floor(Difference % Dat.correct_value);
          }
          return CallD;
        }
        return {
          CPU: Process.cpu,
          Started: Process.Started,
          TimeConnected: calconne()
        };
      }),
    }
    return Ssh;
  });
}

setInterval(async () => {
  const CurrentProcess = (await GetProcess()).filter(a => a.command.includes("ssh") && !a.command.includes("defunct"));
  for (const User of users) {
    if (User.ssh.connections !== 0) {
      const SSH_Connections = CurrentProcess.filter(a => a.user === User.username);
      if (User.ssh.connections > SSH_Connections.length) {
        for (const Process of SSH_Connections.reverse().slice(-(SSH_Connections.length - User.ssh.connections))) {
          console.log(`Killing ${Process.pid}, user "${User.username}"`);
          Process.KillProcess();
        }
      }
    }
  }
}, 1000);