import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const __TempFile = path.join(os.tmpdir(), "badvpnStart.lock");
export function startBadvpn() {
  if (fs.existsSync(__TempFile)) return;
  fs.writeFileSync(__TempFile, "1");
  console.log("Starting Badvpn");
  const badvpnExec = child_process.exec("badvpn --listen-addr 0.0.0.0:7300 --logger stdout --loglevel debug --max-clients 1000 --max-connections-for-client 10", {maxBuffer: Infinity});
  badvpnExec.stdout.on("data", data => process.stdout.write(data));
  badvpnExec.stderr.on("data", data => process.stdout.write(data));
  badvpnExec.on("close", code => {
    if (code !== 0) {
      console.log("Badvpn Closed with Code: " + code);
      fs.rmSync(__TempFile);
      return startBadvpn()
    }
  });
}