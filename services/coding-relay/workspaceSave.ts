/**
 * Archive ~/workspace from an E2B sandbox and persist to Convex storage (metered).
 */
import type { Sandbox } from "e2b";
import type { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const MAX_BYTES = 5 * 1024 * 1024;

export async function saveWorkspaceFromSandbox(
  convex: ConvexHttpClient,
  sandbox: Sandbox,
  token: string,
  sandboxId: string,
  name: string,
  onProgress: (msg: string) => void,
): Promise<void> {
  onProgress("\r\n  \x1b[36msaving workspace\x1b[0m — measuring…\r\n");
  const sizeOut = await sandbox.commands.run(
    `WS="$HOME/workspace"; [ -d "$WS" ] || WS="$HOME"; du -sb "$WS" 2>/dev/null | cut -f1`,
    { timeoutMs: 60_000 },
  );
  const sizeBytes = Number.parseInt(sizeOut.stdout.trim(), 10);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    onProgress("\r\n  \x1b[31mnothing to save\x1b[0m — create files under ~/workspace first.\r\n");
    return;
  }
  if (sizeBytes > MAX_BYTES) {
    onProgress(
      `\r\n  \x1b[31mworkspace too large\x1b[0m — ${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB (max ${MAX_BYTES / (1024 * 1024)} MiB).\r\n`,
    );
    return;
  }

  let prep: { uploadUrl: string; name: string; chargeUsd: number };
  try {
    prep = (await convex.mutation(anyApi.coding.prepareWorkspaceSave, {
      token,
      name,
      sizeBytes,
    })) as typeof prep;
  } catch (e) {
    onProgress(`\r\n  \x1b[31msave blocked:\x1b[0m ${String(e).slice(0, 200)}\r\n`);
    return;
  }

  onProgress(
    `\r\n  archiving (~${(sizeBytes / 1024).toFixed(0)} KiB, $${prep.chargeUsd.toFixed(2)})…\r\n`,
  );
  const tarOut = await sandbox.commands.run(
    `WS="$HOME/workspace"; [ -d "$WS" ] || WS="$HOME"; tar czf - -C "$(dirname "$WS")" "$(basename "$WS")" 2>/dev/null | base64 -w0`,
    { timeoutMs: 180_000 },
  );
  if (tarOut.exitCode !== 0 || !tarOut.stdout.trim()) {
    onProgress("\r\n  \x1b[31marchive failed\x1b[0m — try again or shrink ~/workspace.\r\n");
    return;
  }

  const bytes = Buffer.from(tarOut.stdout.trim(), "base64");
  const uploadRes = await fetch(prep.uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/gzip" },
    body: bytes,
  });
  if (!uploadRes.ok) {
    onProgress(`\r\n  \x1b[31mupload failed\x1b[0m (${uploadRes.status}).\r\n`);
    return;
  }
  const uploaded = (await uploadRes.json()) as { storageId?: string };
  if (!uploaded.storageId) {
    onProgress("\r\n  \x1b[31mupload failed\x1b[0m — no storage id.\r\n");
    return;
  }

  try {
    const done = (await convex.mutation(anyApi.coding.finalizeWorkspaceSave, {
      token,
      storageId: uploaded.storageId,
      name: prep.name,
      sizeBytes: bytes.byteLength,
      sandboxId,
    })) as { ok: boolean; chargedUsd?: number; balanceUsd?: number };
    if (done.ok) {
      onProgress(
        `\r\n  \x1b[32msaved\x1b[0m “${prep.name}” — charged $${(done.chargedUsd ?? prep.chargeUsd).toFixed(2)}` +
          (done.balanceUsd != null ? ` · balance $${done.balanceUsd.toFixed(2)}` : "") +
          "\r\n",
      );
    }
  } catch (e) {
    onProgress(`\r\n  \x1b[31mfinalize failed:\x1b[0m ${String(e).slice(0, 200)}\r\n`);
  }
}
