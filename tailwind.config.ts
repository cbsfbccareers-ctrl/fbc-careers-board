import type { Config } from "tailwindcss";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const typography = require("@tailwindcss/typography");

export default {
  plugins: [typography],
} satisfies Config;
