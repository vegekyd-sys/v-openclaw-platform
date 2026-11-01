#!/usr/bin/env python3
# Applies one experimental startup patch to a disposable candidate runtime. Never run this against V.
import sys,glob,json,os,shutil,re

RELAY_STORE = """function readNativeHookRelayClientBridgeRecord(params) {
	const pathname = path.resolve(params.stateDbPath ?? resolveOpenClawStateSqlitePath());
	const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
	const db = new DatabaseSync(pathname, { readOnly: true });
	try {
		db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
		if (userVersion > 15) throw new Error(`OpenClaw state database ${pathname} has schema version ${userVersion}; this build supports up to 15`);
		return readNativeHookRelayBridgeRecordRow(db.prepare("SELECT * FROM native_hook_relay_bridges WHERE relay_id = ?").get(params.relayId));
	} finally {
		db.close();
	}
}
"""
RELAY_LAUNCHER = """// Codex waits on this process for every tool call: run the relay without the general CLI entry.
const tryRunNativeHookRelayFastPath = async () => {
  if (
    @@GUARD@@process.platform === "win32" ||
    !isNativeHookRelayInvocation(process.argv) ||
    process.argv.includes("--help") ||
    process.argv.includes("-h") ||
    normalizeLauncherMetadataValue(process.env.OPENCLAW_CONTAINER)
  ) {
    return false;
  }
  process.title = "openclaw";
  let exitCode = 1;
  try {
    (await import("./dist/warning-filter-z3hZGeVP.js")).t();
    const { runNativeHookRelayCliFromArgv } = await import("./dist/native-hook-relay-cli-FHvp11Az.js");
    exitCode = await runNativeHookRelayCliFromArgv(process.argv);
  } catch (error) {
    process.stderr.write(`[openclaw] native hook relay failed: ${getErrorMessage(error) || String(error)}\\n`);
  }
  process.exitCode = exitCode;
  process.stdout.write("", () => process.exit(exitCode));
  return true;
};

if (!waitingForCompileCacheRespawn && !(await tryRunNativeHookRelayFastPath())) {
  if (!isHelpFastPathDisabled() && (await tryOutputBareRootHelp())) {"""
root,kind=sys.argv[1],sys.argv[2]; dist=root+'/dist'; here=os.path.dirname(os.path.abspath(__file__))
def one(p):
    m=glob.glob(dist+'/'+p); assert len(m)==1,(p,m); return m[0]
def sub(f,old,new):
    s=open(f).read(); assert old in s,(f,old[:60]); open(f,'w').write(s.replace(old,new,1))
if kind=='fast':
    f=one('entry.esm-resolve-fast-path-jqbSGeOV.js')
    sub(f,'import process from "node:process";','''import process from "node:process";
import { readFileSync as ocRead } from "node:fs";
import { fileURLToPath as ocPath } from "node:url";
const ocScope = new Map();
function ocScopeType(dir) {
	const chain = [];
	let d = dir, type;
	for (;;) {
		const hit = ocScope.get(d);
		if (hit !== void 0) { type = hit; break; }
		chain.push(d);
		let raw = null;
		try { raw = ocRead(d + "/package.json", "utf8"); } catch {}
		if (raw !== null) { try { type = JSON.parse(raw).type === "module" ? "module" : "commonjs"; } catch { return null; } break; }
		const i = d.lastIndexOf("/");
		if (i <= 0 || d.endsWith("/node_modules")) return null;
		d = d.slice(0, i);
	}
	for (const x of chain) ocScope.set(x, type);
	return type;
}
function ocNodeModulesFastPath(specifier, context) {
	const parent = context.parentURL;
	if (parent === void 0 || !parent.startsWith("file:") || !parent.includes("/node_modules/") || context.conditions?.includes("require") === true) return null;
	const c1 = specifier.charCodeAt(1);
	if (specifier.charCodeAt(0) !== 46 || c1 !== 47 && (c1 !== 46 || specifier.charCodeAt(2) !== 47)) return null;
	let url;
	try { url = new URL(specifier, parent); } catch { return null; }
	if (!url.href.includes("/node_modules/") || url.search || url.hash) return null;
	if (url.pathname.endsWith(".mjs")) return { url: url.href, format: "module", shortCircuit: true };
	if (!url.pathname.endsWith(".js")) return null;
	const p = ocPath(url);
	return ocScopeType(p.slice(0, p.lastIndexOf("/"))) === "module" ? { url: url.href, format: "module", shortCircuit: true } : null;
}''')
    sub(f,'return nextResolve(specifier, context);','return ocNodeModulesFastPath(specifier, context) ?? nextResolve(specifier, context);')
elif kind=='bundle':
    v=root+'/node_modules/.oc-vendor'
    shutil.rmtree(v,ignore_errors=True); shutil.copytree(here+'/vendor',v)
    p=root+'/node_modules/typebox/package.json'; j=json.load(open(p))
    for k,n in {'.':'index','./compile':'compile','./format':'format','./guard':'guard','./schema':'schema','./value':'value'}.items():
        j['exports'][k]={'import':f'../.oc-vendor/typebox-{n}.mjs','default':f'../.oc-vendor/typebox-{n}.mjs'}
    json.dump(j,open(p,'w'))
    # package exports must stay inside the package, so the vendored files live under it
    os.makedirs(root+'/node_modules/typebox/oc',exist_ok=True); shutil.rmtree(root+'/node_modules/typebox/oc'); shutil.copytree(v,root+'/node_modules/typebox/oc')
    j=json.load(open(p))
    for k in j['exports']:
        e=j['exports'][k]
        if isinstance(e,dict) and '.oc-vendor' in e.get('import',''):
            t=e['import'].replace('../.oc-vendor/','./oc/'); j['exports'][k]={'import':t,'default':t}
    json.dump(j,open(p,'w'))
    p=root+'/node_modules/kysely/package.json'; j=json.load(open(p))
    os.makedirs(root+'/node_modules/kysely/oc',exist_ok=True); shutil.rmtree(root+'/node_modules/kysely/oc'); shutil.copytree(v,root+'/node_modules/kysely/oc')
    j['exports']['.']={'default':'./oc/kysely-index.mjs'}; json.dump(j,open(p,'w'))
    shutil.rmtree(v)
elif kind=='ansi':
    f=one('ansi-DrXAcdMD.js')
    sub(f,'const segmenter = new Intl.Segmenter();','let ocSeg; const segmenter = { segment: (s) => (ocSeg ??= new Intl.Segmenter()).segment(s) };')
    sub(f,'const rgiEmojiRegex = /^\\p{RGI_Emoji}$/v;','let ocRgi; const rgiEmojiRegex = { test: (s) => (ocRgi ??= new RegExp("^\\\\p{RGI_Emoji}$", "v")).test(s) };')
elif kind=='relayfast':
    # Source-level equivalent: gateway/operator-scopes import, raw node:sqlite locator read, launcher branch for hooks relay.
    cli=one('native-hook-relay-cli-DTqrikhm.js'); cl=one('native-hook-relay-client-GFGIwlRq.js')
    flag=sys.argv[3] if len(sys.argv)>3 else ''
    entry='native-hook-relay-cli-FHvp11Az.js'
    if flag:
        # A/B: keep the original chunks byte-for-byte for the old path and patch copies for the fast one.
        c2=cli.replace('DTqrikhm','FASTcli0'); l2=cl.replace('GFGIwlRq','FASTcl00'); e2=dist+'/native-hook-relay-cli-FASTent0.js'
        shutil.copy(cli,c2); shutil.copy(cl,l2)
        sub(c2,'./native-hook-relay-client-GFGIwlRq.js','./native-hook-relay-client-FASTcl00.js')
        t=open(dist+'/'+entry).read(); assert 'DTqrikhm' in t; open(e2,'w').write(t.replace('DTqrikhm','FASTcli0'))
        cli,cl,entry=c2,l2,'native-hook-relay-cli-FASTent0.js'
    sub(cli,'import "./method-scopes-C3BvHJ95.js";\n','')
    for l in ('import "./errors-u9zSVTak.js";\n',
              'import { h as clearNodeSqliteKyselyCacheForDatabase, t as openNodeSqliteDatabase } from "./node-sqlite-CL-d6drd.js";\n',
              'import { i as getNodeSqliteKysely, r as executeSqliteQueryTakeFirstSync } from "./kysely-sync-DKYGT267.js";\n',
              'import { a as readSqliteUserVersion, n as createNewerSqliteSchemaVersionError } from "./sqlite-user-version-DkmzAA6V.js";\n'):
        sub(cl,l,'')
    s=open(cl).read()
    x=s.index('function assertSupportedSchemaVersion(db, pathname)'); y=s.index('//#endregion',s.index('function readNativeHookRelayClientBridgeRecord'))
    open(cl,'w').write(s[:x]+RELAY_STORE+s[y:])
    guard=f'existsSync({json.dumps(flag)}) ||\n    ' if flag else ''
    sub(root+'/openclaw.mjs','if (!waitingForCompileCacheRespawn) {\n  if (!isHelpFastPathDisabled() && (await tryOutputBareRootHelp())) {',RELAY_LAUNCHER.replace('@@GUARD@@',guard).replace('native-hook-relay-cli-FHvp11Az.js',entry))
elif kind=='relaytrim':
    sub(one('native-hook-relay-cli-DTqrikhm.js'),'import "./method-scopes-C3BvHJ95.js";\n','')
    sub(one('native-hook-relay-client-GFGIwlRq.js'),'import "./errors-u9zSVTak.js";\n','')
else: sys.exit('unknown '+kind)
print('patched',kind)
