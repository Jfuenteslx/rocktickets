/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0E1319",
        surface: "#151C25",
        raised: "#1C2530",
        line: "#2A3441",
        ink: "#E9E6DD",
        muted: "#8C97A6",
        lamp: { DEFAULT: "#F0B93A", dim: "#C99726", ink: "#1B1405" },
        ok: "#5DB98C",
        warn: "#E2A04B",
        bad: "#E5736F",
      },
      fontFamily: {
        display: ['"Barlow Condensed"', "system-ui", "sans-serif"],
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
