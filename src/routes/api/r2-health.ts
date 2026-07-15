import { createFileRoute } from "@tanstack/react-router";
import { checkR2Health, createPresignedPutUrl, createPresignedGetUrl, deleteObject, getR2Client, getR2Config } from "@/lib/r2.server";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const Route = createFileRoute("/api/r2-health")({
  server: {
    handlers: {
      GET: async () => {
        const steps: Array<{ step: string; ok: boolean; detail?: unknown }> = [];
        const health = await checkR2Health();
        steps.push({ step: "HeadBucket", ok: health.ok, detail: health });
        if (!health.ok) return Response.json({ ok: false, steps }, { status: 500 });

        const key = `_diagnostics/health-${Date.now()}.txt`;
        try {
          const cfg = getR2Config();
          const client = getR2Client(cfg);
          await client.send(new PutObjectCommand({
            Bucket: cfg.bucket,
            Key: key,
            Body: "branta r2 health check",
            ContentType: "text/plain",
          }));
          steps.push({ step: "PutObject", ok: true, detail: { key } });

          const put = await createPresignedPutUrl({ key: key + ".presigned", contentType: "text/plain" });
          steps.push({ step: "PresignPUT", ok: Boolean(put.url), detail: { hasPublicUrl: Boolean(put.publicUrl) } });

          const getUrl = await createPresignedGetUrl({ key });
          const fetched = await fetch(getUrl);
          const body = await fetched.text();
          steps.push({ step: "PresignedGET", ok: fetched.ok && body === "branta r2 health check", detail: { status: fetched.status } });

          await deleteObject(key);
          steps.push({ step: "DeleteObject", ok: true });
        } catch (err) {
          steps.push({ step: "IO", ok: false, detail: err instanceof Error ? err.message : String(err) });
          return Response.json({ ok: false, steps }, { status: 500 });
        }

        return Response.json({ ok: true, steps });
      },
    },
  },
});
