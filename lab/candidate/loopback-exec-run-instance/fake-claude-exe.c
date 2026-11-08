/* Native stand-in for Claude Code's claude.exe: runs the reviewed fake (stream-json emulator). */
#include <stdlib.h>
#include <unistd.h>
int main(int argc, char **argv) {
  char **args = calloc(argc + 2, sizeof(char *));
  if (!args) return 127;
  args[0] = "node";
  args[1] = "/opt/vlab-fake-claude-lex/fake-claude.mjs";
  for (int i = 1; i < argc; i++) args[i + 1] = argv[i];
  execv("/opt/vlab/node-v22.23.1-linux-x64/bin/node", args);
  return 127;
}
