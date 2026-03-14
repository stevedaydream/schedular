/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        shift: {
          D: '#fef9c3',
          N: '#dbeafe',
          Off: '#dcfce7',
          AM: '#fce7f3'
        }
      }
    }
  },
  plugins: []
}
