import type { Config } from "tailwindcss";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const typography = require("@tailwindcss/typography");

export default {
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "fbc-gradient":
          "linear-gradient(90deg, #002230 0%, #006088 33%, #009BDB 66%, #B0E4FA 100%)",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
