export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { startAsyncJobActiveChecker } = await import("./lib/async-job-worker");
  startAsyncJobActiveChecker();
}
