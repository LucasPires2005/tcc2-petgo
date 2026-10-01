/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#F5E9E2', 100: '#F5E9E2', 600: '#741934', 700: '#8B1E3F' },
        primary: '#5A3E2B',
        surface: '#F5E9E2',
        ink: '#333333',
        success: '#22C55E'
      }
    }
  },
  plugins: []
};
