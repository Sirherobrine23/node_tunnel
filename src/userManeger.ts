import * as child_process from "node:child_process";
import * as fs from "node:fs/promises";
import systeminformation from "systeminformation";

export type typeUser = {
  UserID: string,
  Username: string,
  Expire: Date,
  maxConnections: number,
  Password: {
    Encrypt: string,
    iv: string
  }
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

function execFilePromise(cmd: string, args?: Array<string>, env?: {[key: string]: string}): Promise<{stdout: string, stderr: string}> {
  return new Promise((resolve, reject) => {
    child_process.execFile(cmd, args, {
      env: {...process.env, ...(env||{})}
    }, (err, stdout, stderr) => {
      if (err) return reject(err);
      return resolve({stdout, stderr});
    });
  });
}

function execPromise(cmd: string, env?: {[key: string]: string}): Promise<{stdout: string, stderr: string}> {
  return new Promise((resolve, reject) => {
    child_process.exec(cmd, {
      env: {...process.env, ...(env||{})}
    }, (err, stdout, stderr) => {
      if (err) return reject(err);
      return resolve({stdout, stderr});
    });
  });
}

export async function getUsers(): Promise<Array<{
  Username: string,
  // Password: string,
  uid: number,
  gid: number,
  comment: string,
  home: string,
  shell: string,
}>> {
  const shadowFile = await fs.readFile("/etc/passwd", "utf8");
  const splitLines = shadowFile.split(/\n/g).filter(x => !!x);
  return splitLines.map(line => {
    const xx = line.split(":");
    return {
      Username: xx[0],
      // Password: xx[1],
      uid: Number(xx[2]),
      gid: Number(xx[3]),
      comment: xx[4],
      home: xx[5],
      shell: xx[6],
    };
  })
}

export async function addUser(username: string, password: string, ExpireDate: Date) {
  if (username.length <= 4) throw new Error("Username must be at least 5 characters");
  if (username.length >= 30) throw new Error("Username must be less than 30 characters");
  if (password.length <= 4) throw new Error("Password must be at least 5 characters");
  if ((await getUsers()).some(x => x.Username === username)) throw new Error("Username already exists");
  const DateToExpire = `${ExpireDate.getFullYear()}-${(ExpireDate.getMonth() + 1) <= 9 ? "0"+(ExpireDate.getMonth() + 1):(ExpireDate.getMonth() + 1)}-${ExpireDate.getDate() <= 9 ? "0"+ExpireDate.getDate():ExpireDate.getDate()}`;
  await execFilePromise("useradd", ["-e", DateToExpire, "-M", "-s", "/bin/false", username]).catch(async err => {
    if (/exist/.test(String(err))) {
      await removeUser(username);
      return addUser(username, password, ExpireDate);
    } else throw err;
  });
  await execPromise("(echo $pass;echo $pass)|passwd $username", {
    pass: password,
    username: username
  });
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

export async function SshMonitor(users: Array<typeUser>): Promise<Array<SshMonitorType>> {
  const CurrentDate = new Date();
  const Current_Process = (await GetProcess()).filter(a => a.command.includes("ssh") && !a.command.includes("defunct"));
  return users.map(User => {
    const SSH_Connections = Current_Process.filter(a => a.user === User.Username);
    const Ssh = {
      Username: User.Username,
      expire: User.Expire,
      Max_Connections: User.maxConnections,
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
