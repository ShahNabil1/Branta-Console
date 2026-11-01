import { createFileRoute } from "@tanstack/react-router";

// Public health probe: returns only pass/fail per step. Bucket names, account
// endpoints and raw storage errors are logged server-side, never returned.
export const Route = createFileRoute("/api/public/r2-health")({
  server: {
    handlers: {
      GET: async () => {
        const {
          checkR2Health,
          createPresignedPutUrl,
          createPresignedGetUrl,
          deleteObject,
          getR2Client,
          getR2Config,
        } = await import("@/lib/r2.server");
        const steps: Array<{ step: string; ok: boolean }> = [];
        const health = await checkR2Health();
        steps.push({ step: "HeadBucket", ok: health.ok });
        if (!health.ok) {
          console.error("[r2-health] HeadBucket failed", health.error);
          return Response.json({ ok: false, steps }, { status: 503 });
        }

        const key = `_diagnostics/health-${Date.now()}.txt`;
        try {
          const cfg = getR2Config();
          const [{ PutObjectCommand }, client] = await Promise.all([
            import("@aws-sdk/client-s3"),
            getR2Client(cfg),
          ]);
          await client.send(new PutObjectCommand({
            Bucket: cfg.bucket,
            Key: key,
            Body: "branta r2 health check",
            ContentType: "text/plain",
          }));
          steps.push({ step: "PutObject", ok: true });

          const put = await createPresignedPutUrl({ key: key + ".presigned", contentType: "text/plain" });
          steps.push({ step: "PresignPUT", ok: Boolean(put.url) });

          const getUrl = await createPresignedGetUrl({ key });
          const fetched = await fetch(getUrl);
          const body = await fetched.text();
          steps.push({ step: "PresignedGET", ok: fetched.ok && body === "branta r2 health check" });

          await deleteObject(key);
          steps.push({ step: "DeleteObject", ok: true });
        } catch (err) {
          console.error("[r2-health] IO failed", err instanceof Error ? err.message : String(err));
          steps.push({ step: "IO", ok: false });
          return Response.json({ ok: false, steps }, { status: 503 });
        }

        return Response.json({ ok: true, steps });
      },
    },
  },
});
