// Colours come from ONE file: packages/shared/src/tokens.json (also used by the mobile app).
const tokens = require('../../packages/shared/src/tokens.json');
const colors = Object.fromEntries(
  Object.keys(tokens.light).map((k) => [k, `rgb(var(--c-${k}) / <alpha-value>)`])
);
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors,
      fontFamily: { display: ['var(--font-display)', 'system-ui', 'sans-serif'] },
      boxShadow: {
        soft: '0 1px 2px rgb(12 27 51 / 0.04), 0 8px 24px -8px rgb(12 27 51 / 0.12)',
        lift: '0 2px 4px rgb(12 27 51 / 0.06), 0 22px 40px -14px rgb(12 27 51 / 0.28)',
        glow: '0 10px 30px -8px rgb(var(--c-primary) / 0.55)',
      },
    },
  },
  plugins: [],
};
