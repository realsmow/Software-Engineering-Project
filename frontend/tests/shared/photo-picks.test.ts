import { describe, expect, it } from "vitest";
import { MAX_JPEG_BEFORE_RESIZE, takePhotos } from "../../src/lib/photo-picks";

const file = (name: string, type: string, bytes = 1024) =>
  new File([new Uint8Array(bytes)], name, { type });

describe("takePhotos (#238: several photos per pick, capped)", () => {
  it("keeps the valid photos in order and names the first problem", () => {
    const a = file("a.jpg", "image/jpeg");
    const b = file("b.png", "image/png");
    const pick = takePhotos([a, file("notes.txt", "text/plain"), b], 0);
    expect(pick).toEqual({ accepted: [a, b], problem: "INVALID_FILE_TYPE" });
  });

  it("accepts a large JPEG, which is shrunk before upload, but not a large PNG", () => {
    const big = 7 * 1024 * 1024;
    const photo = file("IMG_1.jpg", "image/jpeg", big);
    expect(big).toBeLessThan(MAX_JPEG_BEFORE_RESIZE);
    expect(takePhotos([photo], 0)).toEqual({ accepted: [photo], problem: null });
    expect(takePhotos([file("shot.png", "image/png", big)], 0)).toEqual({
      accepted: [],
      problem: "FILE_TOO_LARGE",
    });
  });

  it("takes only what fits under the cap and says so", () => {
    const picked = [file("1.jpg", "image/jpeg"), file("2.jpg", "image/jpeg"), file("3.jpg", "image/jpeg")];
    expect(takePhotos(picked, 28, 30)).toEqual({ accepted: picked.slice(0, 2), problem: "TOO_MANY" });
    expect(takePhotos(picked, 30, 30)).toEqual({ accepted: [], problem: "TOO_MANY" });
  });
});
