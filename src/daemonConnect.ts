// import fs from "fs";
import { io } from "socket.io-client";
import * as userManeger from "./userManeger";

export function StartDaemon() {
  const { DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;
  const socketIo = io(DAEMON_HOST, {auth: {username: DAEMON_USER, password: DAEMON_PASSWORD}});
  
  socketIo.on("conneted", () => console.info("Connected to daemon"));
  socketIo.on("disconnect", () => console.info("Disconnected from daemon"));
  socketIo.on("error", err => {
    console.info("Error to connect to daemon");
    console.info(err);
    process.exit(2);
  });
  socketIo.on("users", (users: Array<userManeger.typeUser>) => {
    userManeger.updateLocaluser(users.map(a => {a.expire = new Date(a.expire);return a;}));
    for (const User of users) {
      User.expire = new Date(User.expire);
      userManeger.addUser(User.username, String(User.password), new Date(User.expire)).catch(console.error);
    };
  });
  socketIo.on("userUpdate", (operationType, document: userManeger.typeUser) => {
    if (operationType === "delete") userManeger.removeUser(document.username);
    else if (operationType === "update") {
      userManeger.removeUser(document.username);
      userManeger.addUser(document.username, String(document.password), new Date(document.expire));
    }
  });
  (async() => {
    while (true) {
      await userManeger.SshMonitor().then(SshMonitor => socketIo.emit("SshMonitor", SshMonitor)).catch(console.error);
      // socketIo.emit("SshLogs", fs.readdirSync("/tmp").filter(file => /sshd_.*\.log/.test(file)).map(file => ({file, content: fs.readFileSync(`/tmp/${file}`, "utf8")})));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  })();
}