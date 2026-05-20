import { createHash, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { RuntimeConfig } from "../config/env.js";

const legacySha256Prefix = "sha256:";
const legacySha256HashPattern = /^sha256:[a-f0-9]{64}$/;

const argon2Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
};

export const isLegacySha256PasswordHash = (hash: string) =>
  legacySha256HashPattern.test(hash);

const hashLegacySha256Password = (password: string) =>
  `${legacySha256Prefix}${createHash("sha256").update(password).digest("hex")}`;

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
};

export const hashPassword = async (password: string) =>
  await argon2.hash(password, argon2Options);

export const hashOperatorPassword = hashPassword;

export const verifyPassword = async (hash: string, password: string) => {
  if (isLegacySha256PasswordHash(hash)) {
    console.warn(
      "OPERATOR_PASSWORD_HASH uses deprecated SHA-256 format; regenerate it with pnpm auth:hash-password.",
    );
    return safeEqual(hashLegacySha256Password(password), hash);
  }

  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
};

export const verifyOperatorPassword = async (
  config: RuntimeConfig,
  username: string,
  password: string,
) => {
  if (username !== config.operatorUsername) {
    return false;
  }

  if (config.operatorPasswordHash) {
    return await verifyPassword(config.operatorPasswordHash, password);
  }

  return config.operatorPassword
    ? safeEqual(password, config.operatorPassword)
    : false;
};
