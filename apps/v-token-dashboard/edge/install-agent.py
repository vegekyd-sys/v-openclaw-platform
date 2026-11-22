"""Install the macOS collector for an already staged independent release."""
import argparse
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--app", type=Path, required=True)
parser.add_argument("--data", type=Path, required=True)
parser.add_argument("--wrangler", required=True)
args = parser.parse_args()
state = args.data.expanduser().absolute()
state.mkdir(mode=0o700, parents=True, exist_ok=True)
name = "com.versa.v-token-usage.sync"
domain = f"gui/{os.getuid()}"
plist = Path.home() / "Library/LaunchAgents" / (name + ".plist")
node = shutil.which("node")
if not node or not (args.app / "sync.py").exists() or not os.access(args.wrangler, os.X_OK):
    parser.error("Staged app, Node and Wrangler are required")
config = dict(
    Label=name, ProgramArguments=[sys.executable, "-B", str(args.app.absolute() / "sync.py"), "--data", str(state)],
    RunAtLoad=True, StartInterval=1800, ProcessType="Background", StandardOutPath=str(state / "sync.log"),
    StandardErrorPath=str(state / "sync.log"),
    EnvironmentVariables=dict(PATH=str(Path(node).parent) + ":/usr/local/bin:/usr/bin:/bin",
                              WRANGLER=args.wrangler, PYTHONUNBUFFERED="1"),
)
if plist.exists() and plistlib.loads(plist.read_bytes()) != config:
    parser.error("Existing launch agent has a different configuration; inspect it before replacement")
plist.write_bytes(plistlib.dumps(config))
if subprocess.run(["launchctl","print",domain+"/"+name],capture_output=True).returncode:
    subprocess.run(["launchctl","bootstrap",domain,str(plist)],check=True)
