import { describe, expect, test, vi } from "vitest";
import { createSupabaseHiringStorage } from "../../api/_lib/adapters/supabase.js";

function createFixture() {
  const bucket = {
    createSignedUploadUrl: vi.fn(async () => ({
      data: {
        path: "campaign/upload/cv.pdf",
        signedUrl:
          "https://project-ref.supabase.co/storage/v1/object/upload/sign/hiring-cvs/campaign/upload/cv.pdf?token=signed",
        token: "signed"
      },
      error: null
    })),
    info: vi.fn(async () => ({
      data: {
        name: "campaign/upload/cv.pdf",
        size: 2048,
        content_type: "application/pdf"
      },
      error: null
    })),
    createSignedUrl: vi.fn(async () => ({
      data: {
        signedUrl:
          "https://project-ref.supabase.co/storage/v1/object/sign/hiring-cvs/campaign/upload/cv.pdf?token=download"
      },
      error: null
    })),
    remove: vi.fn(async () => ({ data: [{ name: "campaign/upload/cv.pdf" }], error: null }))
  };
  const client = { storage: { from: vi.fn(() => bucket) } };
  return {
    bucket,
    storage: createSupabaseHiringStorage({ client, bucket: "hiring-cvs" })
  };
}

describe("Supabase hiring storage", () => {
  test("creates a non-upserting signed upload", async () => {
    const { bucket, storage } = createFixture();

    await expect(
      storage.createSignedUploadUrl({
        objectKey: "campaign/upload/cv.pdf",
        contentType: "application/pdf",
        size: 2048
      })
    ).resolves.toMatchObject({
      objectKey: "campaign/upload/cv.pdf",
      uploadToken: "signed"
    });
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith(
      "campaign/upload/cv.pdf",
      { upsert: false }
    );
  });

  test("normalizes confirmed object metadata and five-minute downloads", async () => {
    const { bucket, storage } = createFixture();

    await expect(storage.confirmObject("campaign/upload/cv.pdf")).resolves.toEqual({
      objectKey: "campaign/upload/cv.pdf",
      contentType: "application/pdf",
      size: 2048
    });
    await expect(
      storage.createSignedDownloadUrl("campaign/upload/cv.pdf", 300)
    ).resolves.toContain("project-ref.supabase.co");
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(
      "campaign/upload/cv.pdf",
      300,
      { download: true }
    );
  });

  test("deletes a private CV object idempotently", async () => {
    const { bucket, storage } = createFixture();

    await expect(
      storage.deleteObject("campaign/upload/cv.pdf")
    ).resolves.toEqual({ deleted: true });
    expect(bucket.remove).toHaveBeenCalledWith(["campaign/upload/cv.pdf"]);
  });
});
