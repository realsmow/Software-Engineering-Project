import { afterEach, describe, expect, it, vi } from "vitest";
import { RESIZE_MAX_EDGE, resizeForUpload } from "../../src/lib/resize-image";

/**
 * #238 / P-01: photos are stored as bytes in the database (1 GB on Render), and
 * a phone photo is 3-5 MB. jsdom has no canvas, so the browser pieces the
 * helper needs are stubbed here; without them it must hand the file back.
 */
function jpeg(bytes: number, name = "photo.jpg") {
  return new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });
}

function stubBrowser({ width, height, outBytes }: { width: number; height: number; outBytes: number }) {
  const drawn: { width: number; height: number }[] = [];
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close: vi.fn() }))
  );
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      drawImage: vi.fn((_img: unknown, _x: number, _y: number, w: number, h: number) =>
        drawn.push({ width: w, height: h })
      ),
    })),
    toBlob: vi.fn((done: (blob: Blob | null) => void, type: string) =>
      done(new Blob([new Uint8Array(outBytes)], { type }))
    ),
  };
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas" ? (canvas as unknown as HTMLCanvasElement) : create(tag)) as typeof document.createElement);
  return { canvas, drawn };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resizeForUpload (#238, P-01)", () => {
  it("returns a small file untouched", async () => {
    stubBrowser({ width: 4000, height: 3000, outBytes: 10 });
    const file = jpeg(200 * 1024);
    expect(await resizeForUpload(file)).toBe(file);
  });

  it("returns the file untouched when the browser cannot decode it", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("HEIC"))));
    const file = jpeg(3 * 1024 * 1024);
    expect(await resizeForUpload(file)).toBe(file);
  });

  it("returns the file untouched where there is no canvas support (jsdom, old browsers)", async () => {
    const file = jpeg(3 * 1024 * 1024);
    expect(await resizeForUpload(file)).toBe(file);
  });

  it("leaves a PNG as it is, since JPEG would lose its transparency", async () => {
    stubBrowser({ width: 4000, height: 3000, outBytes: 10 });
    const file = new File([new Uint8Array(3 * 1024 * 1024)], "shot.png", { type: "image/png" });
    expect(await resizeForUpload(file)).toBe(file);
  });

  it("re-encodes a large JPEG to at most 1600 px on its long edge", async () => {
    const { drawn } = stubBrowser({ width: 4000, height: 3000, outBytes: 300 * 1024 });
    const result = await resizeForUpload(jpeg(4 * 1024 * 1024, "IMG_1.jpg"));
    expect(drawn).toEqual([{ width: RESIZE_MAX_EDGE, height: 1200 }]);
    expect(result).not.toBeNull();
    expect(result.type).toBe("image/jpeg");
    expect(result.size).toBe(300 * 1024);
    expect(result.name).toBe("IMG_1.jpg");
  });

  it("asks the browser to turn the photo the way the camera recorded it", async () => {
    // Re-encoding drops the EXIF orientation tag, so the pixels must already be
    // upright; without this a portrait phone photo can arrive sideways.
    stubBrowser({ width: 4000, height: 3000, outBytes: 300 * 1024 });
    const file = jpeg(4 * 1024 * 1024);
    await resizeForUpload(file);
    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: "from-image" });
  });

  it("keeps the original when re-encoding would not make it smaller", async () => {
    stubBrowser({ width: 1200, height: 900, outBytes: 900 * 1024 });
    const file = jpeg(600 * 1024);
    expect(await resizeForUpload(file)).toBe(file);
  });
});
