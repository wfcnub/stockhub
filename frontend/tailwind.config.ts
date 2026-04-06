import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        gemini: {
          bg: {
            primary: "rgb(var(--gemini-bg-primary) / <alpha-value>)",
            secondary: "rgb(var(--gemini-bg-secondary) / <alpha-value>)",
            tertiary: "rgb(var(--gemini-bg-tertiary) / <alpha-value>)",
            elevated: "rgb(var(--gemini-bg-elevated) / <alpha-value>)",
          },
          surface: {
            DEFAULT: "rgb(var(--gemini-surface) / <alpha-value>)",
            hover: "rgb(var(--gemini-surface-hover) / <alpha-value>)",
            active: "rgb(var(--gemini-surface-active) / <alpha-value>)",
            border: "rgb(var(--gemini-border) / <alpha-value>)",
          },
          text: {
            primary: "rgb(var(--gemini-text-primary) / <alpha-value>)",
            secondary: "rgb(var(--gemini-text-secondary) / <alpha-value>)",
            tertiary: "rgb(var(--gemini-text-tertiary) / <alpha-value>)",
            muted: "rgb(var(--gemini-text-muted) / <alpha-value>)",
          },
          accent: {
            blue: "rgb(var(--gemini-accent-blue) / <alpha-value>)",
            purple: "rgb(var(--gemini-accent-purple) / <alpha-value>)",
            pink: "rgb(var(--gemini-accent-pink) / <alpha-value>)",
            cyan: "rgb(var(--gemini-accent-cyan) / <alpha-value>)",
            green: "rgb(var(--gemini-accent-green) / <alpha-value>)",
            yellow: "rgb(var(--gemini-accent-yellow) / <alpha-value>)",
            orange: "rgb(var(--gemini-accent-orange) / <alpha-value>)",
            red: "rgb(var(--gemini-accent-red) / <alpha-value>)",
          },
          gradient: {
            start: "rgb(var(--gemini-gradient-start) / <alpha-value>)",
            middle: "rgb(var(--gemini-gradient-middle) / <alpha-value>)",
            end: "rgb(var(--gemini-gradient-end) / <alpha-value>)",
          },
        },
      },
      fontFamily: {
        sans: [
          "Manrope",
          "Plus Jakarta Sans",
          "Sora",
          "Avenir Next",
          "sans-serif",
        ],
        mono: [
          "IBM Plex Mono",
          "JetBrains Mono",
          "Fira Code",
          "monospace",
        ],
      },
      boxShadow: {
        gemini: "var(--gemini-shadow-sm)",
        "gemini-lg": "var(--gemini-shadow-lg)",
        "gemini-xl": "var(--gemini-shadow-xl)",
      },
      borderRadius: {
        gemini: "12px",
        "gemini-lg": "16px",
        "gemini-xl": "24px",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-soft": "pulseSoft 2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      backgroundImage: {
        "gemini-gradient": "linear-gradient(120deg, rgb(var(--gemini-gradient-start)) 0%, rgb(var(--gemini-gradient-middle)) 50%, rgb(var(--gemini-gradient-end)) 100%)",
        "gemini-gradient-hover": "linear-gradient(120deg, rgb(var(--gemini-gradient-hover-start)) 0%, rgb(var(--gemini-gradient-hover-middle)) 50%, rgb(var(--gemini-gradient-hover-end)) 100%)",
        "shimmer": "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
      },
    },
  },
  plugins: [],
};

export default config;