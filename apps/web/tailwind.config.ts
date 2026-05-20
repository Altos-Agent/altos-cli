import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Raycast dark canvas system
        canvas: "#07080a",
        surface: "#0d0d0d",
        "surface-elevated": "#101111",
        "surface-card": "#121212",
        hairline: "#242728",
        "hairline-soft": "rgba(255,255,255,0.08)",
        "hairline-strong": "rgba(255,255,255,0.16)",
        ink: "#f4f4f6",
        body: "#cdcdcd",
        muted: "#9c9c9d",
        ash: "#6a6b6c",
        stone: "#434345",
        primary: "#ffffff",
        "on-primary": "#000000",
        "accent-blue": "#57c1ff",
        "accent-red": "#ff6161",
        "accent-green": "#59d499",
        "accent-yellow": "#ffc533",
        "accent-blue-soft": "rgba(87,193,255,0.15)",
        "accent-red-soft": "rgba(255,97,97,0.15)",
        "accent-green-soft": "rgba(89,212,153,0.15)",
        "accent-yellow-soft": "rgba(255,197,51,0.15)",
        // Legacy aliases for existing components
        panel: "#111723",
        baseBlue: "#0052ff",
        safetyGreen: "#10b981"
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "10px",
        xl: "16px"
      },
      fontFamily: {
        sans: ["Inter", "Inter Fallback", "system-ui", "sans-serif"]
      },
      fontFeatureSettings: {
        default: '"calt", "kern", "liga", "ss03"'
      }
    }
  },
  plugins: []
};

export default config;
