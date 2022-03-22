const { DAEMON_PASSWORD, DAEMON_USER, DAEMON_HOST } = process.env;
const io = (require("socket.io-client")).io(DAEMON_HOST, {auth: {username: DAEMON_USER, password: DAEMON_PASSWORD}});
io.on("conneted", () => console.info("Connected to daemon"));
io.on("disconnect", () => console.info("Disconnected from daemon"));
io.on("error", err => {
  console.info("Error to connect to daemon");
  console.info(err);
  process.exit(2);
});

io.on("users", users => {
  users = users.map(User => {
    User.expire = new Date(User.expire);
    return User;
  })
  const userManeger = require("./userManeger");
  userManeger.updateLocaluser(users);
  userManeger.loadUser(users);
});
io.on("userUpdate", (operationType, document) => {
  const userManeger = require("./userManeger");
  if (operationType === "delete") userManeger.removeUser(document.username);
  else if (operationType === "update") {
    userManeger.removeUser(document.username);
    userManeger.addUser(document.username, document.password, new Date(document.expire));
  }
});