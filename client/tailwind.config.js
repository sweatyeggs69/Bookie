/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: 'var(--surface)',
          card: 'var(--surface-card)',
          raised: 'var(--surface-raised)',
          high: 'var(--surface-high)',
        },
        accent: {
          DEFAULT: '#7c6af8',
          hover: '#9180fa',
          muted: 'rgba(124,106,248,0.15)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          faint: 'var(--ink-faint)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },
        danger: '#e05252',
        success: '#4ade80',
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '6px',
        md: '6px',
        lg: '9px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '21px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
