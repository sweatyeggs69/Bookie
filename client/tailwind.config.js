/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0e0e12',
          card: '#16161d',
          raised: '#1c1c26',
          high: '#22222e',
        },
        accent: {
          DEFAULT: '#7c6af8',
          hover: '#9180fa',
          muted: 'rgba(124,106,248,0.15)',
        },
        ink: {
          DEFAULT: '#e2e2ee',
          muted: '#8080a0',
          faint: '#404055',
        },
        line: {
          DEFAULT: 'rgba(255,255,255,0.07)',
          strong: 'rgba(255,255,255,0.12)',
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
