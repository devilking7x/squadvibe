/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Sora", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#0d0716",
        grape: "#1a0f2e",
        neon: "#c084fc",
        hot: "#f472b6",
        gold: "#fbbf24",
      },
    },
  },
  plugins: [],
};
