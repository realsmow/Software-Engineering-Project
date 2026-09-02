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
        // ---- ULMs raw design tokens (from reference HTML) ----
        // Hex/rgba tokens referenced via var() so utilities like
        // bg-accent / text-t1 / border-line map to the contract tokens.
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
          hover: "var(--accent-h)",
          pressed: "var(--accent-p)",
          soft: "var(--accent-soft)",
          border: "var(--accent-border)",
          blue: "var(--accent-blue)",
          orange: "var(--accent-orange)",
          red: "var(--accent-red)",
        },
        surface: {
          DEFAULT: "var(--s-surface)",
          bg: "var(--s-bg)",
          subtle: "var(--s-subtle)",
          inset: "var(--s-inset)",
        },
        line: {
          DEFAULT: "var(--s-line)",
          strong: "var(--s-line-strong)",
        },
        t1: "var(--s-t1)",
        t2: "var(--s-t2)",
        t3: "var(--s-t3)",
        t4: "var(--s-t4)",

        // Semantic tokens (shadcn convention) — bridged to the ULMs --s-*
        // palette so shadcn components inherit the exact colors + dark mode
        // (body.dark) as the rest of the app. No HSL indirection.
        border: "var(--s-line)",
        input: "var(--s-line)",
        ring: "var(--accent)",
        background: "var(--s-bg)",
        foreground: "var(--s-t1)",
        primary: {
          DEFAULT: "var(--accent)",
          foreground: "#ffffff",
          hover: "var(--accent-h)",
          soft: "var(--accent-soft)",
        },
        secondary: {
          DEFAULT: "var(--s-subtle)",
          foreground: "var(--s-t1)",
        },
        muted: {
          DEFAULT: "var(--s-subtle)",
          foreground: "var(--s-t3)",
        },
        destructive: {
          DEFAULT: "var(--accent-red)",
          foreground: "#ffffff",
          soft: "var(--s-alert-bg)",
        },
        warning: {
          DEFAULT: "var(--s-warn-t)",
          foreground: "#ffffff",
          soft: "var(--s-warn-bg)",
        },
        popover: {
          DEFAULT: "var(--s-surface)",
          foreground: "var(--s-t1)",
        },
        card: {
          DEFAULT: "var(--s-surface)",
          foreground: "var(--s-t1)",
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
        // ULMs strict scale: 4–6px, never larger than 8px.
        sm: "4px",
        DEFAULT: "5px",
        md: "6px",
        lg: "8px",
      },
      fontFamily: {
        // Prompt is the ULMs UI font (reference HTML); JetBrains Mono for numerics.
        sans: ["Prompt", "Inter", "system-ui", "sans-serif"],
        prompt: ["Prompt", "Inter", "system-ui", "sans-serif"],
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
        // ULMs shadow tokens (from reference HTML)
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        // Legacy shadows kept for existing UI
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
