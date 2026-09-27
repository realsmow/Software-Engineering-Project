import { rename, writeFile } from "node:fs/promises";

export async function writeBusinessClock(clockFile: string, instant: string) {
  await writeFile(`${clockFile}.next`, instant);
  // Windows may hold a reader's handle briefly. Retry replacement rather
  // than exposing a truncated clock file to the running backend.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(`${clockFile}.next`, clockFile);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(code ?? ""))
        throw error;
      await new Promise((done) => setTimeout(done, 25));
    }
  }
}
