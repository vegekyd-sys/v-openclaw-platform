// Diagnostic only: exit normally on SIGUSR2 so --cpu-prof writes its profile.
process.on("SIGUSR2", () => process.exit(0));
