import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7B1113', // Virginia Tech maroon, 黑堡情怀
          dark: '#5a0c0e',
        },
        accent: '#CF4420', // VT burnt orange
      },
    },
  },
  plugins: [],
};

export default config;
