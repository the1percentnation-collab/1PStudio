import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d0d0f",
        panel: "#17171b",
        edge: "#2a2a31",
        gold: "#ffd54a",
      },
    },
  },
  plugins: [],
};

export default config;
