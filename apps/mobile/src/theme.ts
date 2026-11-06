import { useColorScheme } from 'react-native';
import { tokens } from '@slgh/shared';

// Same tokens.json as the website. "r g b" -> rgb(r,g,b)
const make = (o: Record<string, string>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, `rgb(${v.split(' ').join(',')})`])) as
    Record<keyof typeof tokens.light, string>;
const light = make(tokens.light);
const dark = make(tokens.dark);
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === 'dark' ? dark : light);
