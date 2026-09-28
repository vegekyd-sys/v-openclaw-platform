// Read-only RPC helper for follow-up evidence: node inspect-rpc.mjs <method> '<json params>' [jqish path]
import { discoverGateway, connect, rpc } from "./lib.mjs";
const [method, params] = process.argv.slice(2);
if (!/^(chat\.history|tasks\.list|tasks\.get|sessions\.list|vlab\.workers\.status|health|status|cron\.list|models\.list|skills\.proposals\.list)$/.test(method)) throw new Error("read-only methods only");
const gw = discoverGateway();
const client = await connect(gw);
const r = await rpc(client, method, JSON.parse(params ?? "{}"), 120_000);
console.log(JSON.stringify(r));
client.stop(); process.exit(0);
