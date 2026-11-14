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
      // Discord-style: flat surfaces, tight radii, shadows only on things that float.
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.12)',
        lift: '0 8px 16px rgb(0 0 0 / 0.24)',
        glow: '0 0 0 2px rgb(var(--c-primary) / 0.5)',
      },
      borderRadius: { '2xl': '0.75rem', '3xl': '1rem' },
    },
  },
  plugins: [],
};
