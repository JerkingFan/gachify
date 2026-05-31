/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        spotify: {
          black: "#000000",
          base: "#121212",
          elevated: "#181818",
          highlight: "#282828",
          hover: "#2a2a2a",
          green: "#1ed760",
          "green-hover": "#1fdf64",
          muted: "#b3b3b3",
          subtle: "#6a6a6a",
        },
      },
      fontFamily: {
        sans: [
          "Circular",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      spacing: {
        sidebar: "280px",
        "player-bar": "90px",
        topbar: "64px",
      },
      backgroundImage: {
        "gradient-gachi":
          "linear-gradient(135deg, #1a472a 0%, #121212 45%, #3d1a1a 100%)",
      },
    },
  },
  plugins: [],
};
