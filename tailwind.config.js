/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0a0d14',
        panel: '#121826',
        card: '#182133',
        accent: '#ffb347',
        accentSoft: '#ffd9a1',
        border: '#2a3550',
        danger: '#ff7a7a',
        success: '#8fe3a4'
      },
      boxShadow: {
        glow: '0 18px 70px rgba(255, 179, 71, 0.16)'
      }
    }
  },
  plugins: []
};
