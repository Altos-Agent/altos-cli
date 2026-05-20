import { parseRuntimeEnv } from "./env.js";

export const getRuntimeConfig = () => parseRuntimeEnv(process.env);

