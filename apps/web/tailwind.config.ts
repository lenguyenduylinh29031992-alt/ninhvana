import type { Config } from 'tailwindcss';

const config: Config = {
  presets: [require('@grand-suite/config')],
  content: ['./src/**/*.{ts,tsx,mdx}'],
};

export default config;
