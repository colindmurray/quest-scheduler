/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "hsl(210 70% 50%)",
          accent: "hsl(180 80% 40%)",
          background: "hsl(210 20% 95%)",
          "background-dark": "hsl(220 20% 10%)",
        },
      },
      fontFamily: {
        sans: ['"PT Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
