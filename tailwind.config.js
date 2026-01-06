/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#4361ee',
        sidebar: '#4361ee',
      }
    },
  },
  plugins: [],
}
