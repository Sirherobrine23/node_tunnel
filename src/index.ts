#!/usr/bin/env node
import { StartSshd } from "./service"
import * as daemon from "./daemonConnect";
console.info("Starting SSH Server");
StartSshd(true).then(() => {
  console.info("Starting Daemon Connect");
  daemon.StartDaemon();
});