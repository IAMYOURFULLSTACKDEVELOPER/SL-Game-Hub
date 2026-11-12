import { ConvexReactClient } from 'convex/react';

export const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, { unsavedChangesWarning: false });
export { api } from '@slgh/backend/convex/_generated/api';
