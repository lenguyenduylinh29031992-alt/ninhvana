import type { Config } from 'tailwindcss';
import preset from '@grand-suite/config';

const config: Config = {
  presets: [preset],
  content: ['./src/**/*.{ts,tsx,mdx}'],
};

export default config;
