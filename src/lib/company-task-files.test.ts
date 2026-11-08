import { describe, expect, it } from "vitest";
import { MAX_SUBMISSION_FILE_BYTES, submissionFileKey, submissionFileKind } from "./company-task-rules";

describe("task submission uploads", () => {
  it("accepts images, PDFs and ZIPs", () => {
    expect(submissionFileKind("shot.png", "image/png")).toBe("image");
    expect(submissionFileKind("brief.pdf", "application/pdf")).toBe("pdf");
    expect(submissionFileKind("bundle.zip", "application/zip")).toBe("zip");
  });
  it("rejects other files", () => {
    expect(submissionFileKind("run.exe", "application/octet-stream")).toBeNull();
    expect(submissionFileKind("notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeNull();
  });
  it("caps one file at 50 MB", () => {
    expect(MAX_SUBMISSION_FILE_BYTES).toBe(50 * 1024 * 1024);
  });
  it("stores files under the task and uploader", () => {
    expect(submissionFileKey("t1", "u1", "my file?.png", 5)).toBe("tasks/t1/u1/5-my_file_.png");
  });
});
