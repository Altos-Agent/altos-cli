import { stdin as input, stdout as output } from "node:process";
import { emitKeypressEvents } from "node:readline";
import { hashPassword } from "../auth/password.js";

const readHiddenPassword = async (prompt: string) => {
  if (!input.isTTY || !output.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of input) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }
    return Buffer.concat(chunks).toString("utf8").trimEnd();
  }

  emitKeypressEvents(input);
  input.setRawMode(true);
  output.write(prompt);

  return await new Promise<string>((resolve, reject) => {
    let password = "";

    const cleanup = () => {
      input.setRawMode(false);
      input.off("keypress", onKeypress);
      output.write("\n");
    };

    const onKeypress = (character: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl === true && key.name === "c") {
        cleanup();
        reject(new Error("Password prompt cancelled"));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(password);
        return;
      }
      if (key.name === "backspace") {
        password = password.slice(0, -1);
        return;
      }
      if (character) {
        password += character;
      }
    };

    input.on("keypress", onKeypress);
  });
};

const main = async () => {
  const password = await readHiddenPassword("Operator password: ");
  if (password.length === 0) {
    throw new Error("Password must not be empty");
  }

  const hash = await hashPassword(password);
  output.write(`${hash}\n`);
};

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unable to hash password";
  console.error(message);
  process.exitCode = 1;
});
