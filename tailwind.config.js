/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["Poppins", "ui-sans-serif", "system-ui"],
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },

      backgroundImage: {
        // para usar: bg-gradient-radial from-... via-... to-...
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },

      keyframes: {
        "gradient-move": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        heartbeat: {
          "0%, 100%": { transform: "scale(1)" },
          "14%": { transform: "scale(1.12)" },
          "28%": { transform: "scale(1)" },
          "42%": { transform: "scale(1.12)" },
          "70%": { transform: "scale(1)" },
        },
        glow: {
          "0%,100%": { filter: "drop-shadow(0 0 0 rgba(242,86,145,0))" },
          "50%": { filter: "drop-shadow(0 0 16px rgba(242,86,145,.35))" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: 1 },
          "50%": { opacity: 0.85 },
        },
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        wave: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },

      animation: {
        "gradient-move": "gradient-move 6s ease-in-out infinite",
        gradient: "gradient-move 6s ease-in-out infinite", // alias para animate-gradient
        heartbeat: "heartbeat 1.6s ease-in-out infinite",
        glow: "glow 3s ease-in-out infinite",
        "pulse-glow": "pulse-soft 2.4s ease-in-out infinite",
        "pulse-slow": "pulse-soft 3s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float 10s ease-in-out infinite",
        "float-slower": "float 14s ease-in-out infinite",
        wave: "wave 12s linear infinite",
        "wave-slow": "wave 18s linear infinite",
      },
    },
  },
  plugins: [],
};
