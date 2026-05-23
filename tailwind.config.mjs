import typography from "@tailwindcss/typography";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}"],
  plugins: [typography],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Public Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        brand: {
          navy: "#0b1220",
          blue: "#2563eb",
          accent: "#60a5fa",
        },
        app: "#f3f4f6",
        panel: "#ffffff",
        line: "#d8e1ee",
        ink: {
          strong: "#111b2f",
          DEFAULT: "#1e293b",
          muted: "#6b7280",
        },
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        lg: "18px",
        xl: "22px",
        "2xl": "28px",
      },
      boxShadow: {
        soft: "0 4px 12px rgba(15, 23, 42, 0.04)",
        card: "0 14px 30px rgba(15, 23, 42, 0.06)",
        hero: "0 30px 60px rgba(15, 23, 42, 0.10)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
    },
  },
};
