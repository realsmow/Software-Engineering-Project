import type { Config } from "tailwindcss";

/**
 * ULMs Design Tokens
 * แปลงจาก mockup UI/UX ที่ทีม design ส่งมา
 * อ้างอิง: ULMS_Login_UX-UI.html (Design System section)
 */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1120px",
      },
    },
    extend: {
      colors: {
        // Semantic tokens (shadcn convention)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          soft: "hsl(var(--primary-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Tier colors (สำหรับแยกระดับอุปกรณ์)
        tier: {
          t0: "hsl(var(--tier-t0))",
          t1: "hsl(var(--tier-t1))",
          t2: "hsl(var(--tier-t2))",
          t3: "hsl(var(--tier-t3))",
        },
        // Credit band colors
        credit: {
          d0: "hsl(var(--credit-d0))",
          d1: "hsl(var(--credit-d1))",
          d2: "hsl(var(--credit-d2))",
          d3: "hsl(var(--credit-d3))",
        },
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "22px",
      },
      fontFamily: {
        sans: ["Sarabun", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        // จาก type scale ใน mockup
        display: ["32px", { lineHeight: "1.22", letterSpacing: "-0.01em", fontWeight: "800" }],
        h2: ["22px", { lineHeight: "1.3", fontWeight: "800" }],
        h3: ["16.5px", { lineHeight: "1.4", fontWeight: "800" }],
        body: ["15px", { lineHeight: "1.55" }],
        small: ["13px", { lineHeight: "1.5" }],
        tiny: ["11.5px", { lineHeight: "1.5" }],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,30,20,.04), 0 24px 40px -30px rgba(16,30,20,.25)",
        popover: "0 30px 60px -34px rgba(16,40,24,.5)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [],
} satisfies Config;
