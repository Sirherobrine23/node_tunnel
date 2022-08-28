import mongoose from "mongoose";
import {} from "./webProxy";
import { startServer } from "./sshServer";
const privKeys: string[] = [process.env.SSH_PRIVATE_KEY];
mongoose.connection.once("connected", () => startServer(parseInt(process.env.SSH_PORT||"8022"), privKeys, process.env.SSH_BANNER));