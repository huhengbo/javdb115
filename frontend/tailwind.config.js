/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ui-text)',
        mist: 'var(--ui-canvas)',
        line: 'var(--ui-border)',
        brand: 'var(--ui-accent)',
        warn: 'var(--ui-warning)',
        danger: 'var(--ui-danger)'
      }
    }
  },
  plugins: []
};
