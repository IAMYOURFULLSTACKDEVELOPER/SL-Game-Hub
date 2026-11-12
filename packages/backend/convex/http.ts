import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { webhook as monimeWebhook } from './monime';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/monime/webhook', method: 'POST', handler: monimeWebhook });
export default http;
