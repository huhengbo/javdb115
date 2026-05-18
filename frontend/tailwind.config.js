/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172026',
        mist: '#F4F7F8',
        line: '#D7E0E2',
        brand: '#0F766E',
        warn: '#B45309',
        danger: '#B42318'
      }
    }
  },
  plugins: []
};
