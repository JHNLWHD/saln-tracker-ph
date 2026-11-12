import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: { colors: { primary: { 700: 'var(--archive-blue)' } } } },
  plugins: [],
} satisfies Config;
