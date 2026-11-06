// Colours come from ONE file: packages/shared/src/tokens.json (also used by the mobile app).
const tokens = require('../../packages/shared/src/tokens.json');
const colors = Object.fromEntries(
  Object.keys(tokens.light).map((k) => [k, `rgb(var(--c-${k}) / <alpha-value>)`])
);
module.exports = { content: ['./src/**/*.{ts,tsx}'], theme: { extend: { colors } }, plugins: [] };
