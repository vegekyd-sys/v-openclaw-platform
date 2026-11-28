'use strict';

// Card workers must use the activated Makaron CLI, never an ambient `npx`
// package resolution. `npx makaron-cli` can select a stale package even when
// the active `makaron` command has already been upgraded.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

const DEFAULT_ROOT='/opt/makaron-cli-current';
const RELEASE_MANIFEST='.makaron-release.json';

function configuredCliRoot(env=process.env){
  return path.resolve(env.MAKARON_CLI_ROOT||DEFAULT_ROOT);
}

function configuredCliPath(env=process.env){
  if(env.MAKARON_CLI_BIN) return path.resolve(env.MAKARON_CLI_BIN);
  return path.join(configuredCliRoot(env),'bin','makaron');
}

function configuredReleaseManifestPath(env=process.env){
  return path.resolve(env.MAKARON_CLI_RELEASE_MANIFEST||path.join(configuredCliRoot(env),RELEASE_MANIFEST));
}

function readReleaseManifest(env=process.env){
  const manifestPath=configuredReleaseManifestPath(env);
  let manifest;
  try { manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')); }
  catch(error){ throw new Error(`Unable to read Makaron CLI release manifest at ${manifestPath}: ${error.message}`); }
  if(manifest.schemaVersion!==1 || typeof manifest.cliVersion!=='string' || !manifest.cliVersion.trim()) {
    throw new Error(`Invalid Makaron CLI release manifest at ${manifestPath}`);
  }
  return {...manifest,cliVersion:manifest.cliVersion.trim(),manifestPath};
}

function expectedVersion(env=process.env){
  const override=String(env.MAKARON_CLI_EXPECTED_VERSION||'').trim();
  return override||readReleaseManifest(env).cliVersion;
}

function assertMakaronCliRuntime(env=process.env){
  const executable=configuredCliPath(env);
  if(!fs.existsSync(executable)) throw new Error(`Makaron CLI executable is missing: ${executable}`);
  let version='';
  try{ version=execFileSync(executable,['--version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim(); }
  catch(error){ throw new Error(`Unable to run Makaron CLI at ${executable}: ${error.message}`); }
  const expected=expectedVersion(env);
  if(version!==expected) throw new Error(`Makaron card worker requires makaron ${expected}, but ${executable} reports ${version}`);
  return executable;
}

module.exports={
  configuredCliRoot,
  configuredCliPath,
  configuredReleaseManifestPath,
  readReleaseManifest,
  expectedVersion,
  assertMakaronCliRuntime,
};
