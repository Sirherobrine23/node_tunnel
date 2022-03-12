const { DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;
const socket = require("socket.io-client").io(DAEMON_HOST, {
  auth: {
    PASSWORD: DAEMON_USER,
    USER: DAEMON_PASSWORD
  }
});
module.exports.socket = socket;

socket.on("connect", () => console.log("Sockect connected"));
socket.on("error", err => {
  console.error("Daemon Socket.io, error:");
  console.error(err);
  process.exit(1);
});

module.exports.mongoStatus = mongoStatus;
async function mongoStatus() {
  while (true) {
    if (socket.connected) return;
    await new Promise(res => setTimeout(res, 500));
  }
}