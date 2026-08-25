/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          light: '#164e32',
          DEFAULT: '#0e3020',
          dark: '#071f14',
        },
        charcoal: {
          light: '#1f2937',
          DEFAULT: '#0d0f12',
          dark: '#090b0d',
        },
      }
    },
  },
  plugins: [],
}
