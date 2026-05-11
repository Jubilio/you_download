/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        yd: {
          primary: '#6366F1',
          'primary-dark': '#4F46E5',
          accent: '#818CF8',
          black: '#0A0A0F',
          dark: '#12121A',
          grey: '#1E1E2E',
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
