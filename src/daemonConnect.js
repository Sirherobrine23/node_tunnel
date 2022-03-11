const { DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;
const socket = require("socket.io-client").io(`http://${DAEMON_HOST}:5000`, {
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

/** @type {Status: "Connecting"|"Connected"|"Error"; Error: null|Error;} */
const ConnectionStatusObject = {Status: "Connecting", Error: null};
socket.onAny(console.log)

socket.on("monngoConnection", status => {
  if (typeof status === "string") {
    ConnectionStatusObject.Status = status;
    return;
  }
  ConnectionStatusObject.Status === "Error";
  ConnectionStatusObject.Error= status;
});

module.exports.mongoStatus = mongoStatus;
async function mongoStatus() {
  while (true) {
    if (ConnectionStatusObject.Status === "Connected") return;
    if (ConnectionStatusObject.Status === "Error") throw ConnectionStatusObject.Error;
    if (ConnectionStatusObject.Status !== "Connecting") throw new Error("Users MongoDB Error in Connection");
    await new Promise(res => setTimeout(res, 500));
  }
}

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
    load: true,
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


const onCallbacks = [];
socket.on("userOn", (operationType, data) => onCallbacks.forEach(call => call(operationType, data)));
socket.on("usersDecrypt", data => onCallbacks.forEach(call => call("connect", data)));
module.exports.on = on;
/**
 * 
 * @param {(operationType: "connect"|"delete"|"insert"|"update"; data: typeUser|Array<typeUser>;) => void} callback 
 */
function on(callback) {
  if (typeof callback !== "function") throw new Error("Callback dont is callabck");
  onCallbacks.push(callback);
  return;
}