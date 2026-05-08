import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        baseBlue: "#0052ff",
        safetyGreen: "#10b981",
        panel: "#111827"
      }
    }
  },
  plugins: []
};

export default config;
