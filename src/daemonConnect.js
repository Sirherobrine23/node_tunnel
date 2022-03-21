const express = require("express");
const app = express();
app.listen(3002, () => console.log("listening on port 3002 to OpenSSH maneger. dont expose to internet!"));
const { DAEMON_PASSWORD, DAEMON_USER } = process.env;
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.daemon_password !== DAEMON_PASSWORD) return res.status(400).json({message: "Wrong password"});
  if (req.headers.daemon_user !== DAEMON_USER) return res.status(400).json({message: "Wrong user"});
  next();
});

const userManeger = require("./userManeger");
app.all("/status", ({res}) => res.sendStatus(200));
app.post("/v1/init", async (req, res) => {
  const MapUser = req.body.map(User => {
    User.expire = new Date(User.expire);
    return User;
  });
  userManeger.updateLocaluser(MapUser);
  await userManeger.loadUser(MapUser);
  return res.sendStatus(200);
});
app.post("/v1/update/:operation", async (req, res) => {
  if (req.params.operation === "delete") await userManeger.removeUser(req.body.username);
  else if (req.params.operation === "update") {
    await userManeger.removeUser(req.body.username);
    await userManeger.addUser(req.body);
  }
  res.sendStatus(200);
});
app.all("*", ({res}) => res.sendStatus(404));