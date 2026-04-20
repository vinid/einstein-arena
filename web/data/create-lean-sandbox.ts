import { Sandbox } from "e2b";
import { LeanVerifier } from "../src/lib/lean-verify";

(async () => {
  if (!process.env.E2B_API_KEY) {
    console.error("E2B_API_KEY is not set");
    process.exit(1);
  }

  const verifier = new LeanVerifier();

  console.log("Initializing LeanVerifier (creates sandbox + warms REPL)...");
  const t0 = Date.now();
  await verifier.init();
  console.log(`Ready in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  const sbx: Sandbox = (verifier as any).sbx;
  console.log(`Sandbox ID: ${sbx.sandboxId}`);

  console.log("Pausing sandbox...");
  await verifier.close();
  await sbx.pause();

  console.log("\n✓ Sandbox ready. Add this to your environment:\n");
  console.log(`  LEAN_WARM_SANDBOX_ID=${sbx.sandboxId}`);
  console.log("\nResume takes ~1s. The sandbox auto-pauses when idle.");
})();
