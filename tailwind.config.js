/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        emeraldRoyal: "#0b3d2e",
        goldLux: "#d7b56d",
        nightVelvet: "#050a0f"
      },
      boxShadow: {
        glow: "0 0 30px rgba(215, 181, 109, 0.4)"
      }
    }
  },
  plugins: []
};
