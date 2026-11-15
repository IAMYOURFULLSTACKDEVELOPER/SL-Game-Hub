import { httpRouter } from 'convex/server';
import { auth } from './auth';
import { webhook as monimeWebhook } from './monime';
import { webhook as muxWebhook } from './mux';

const http = httpRouter();
auth.addHttpRoutes(http);
http.route({ path: '/monime/webhook', method: 'POST', handler: monimeWebhook });
http.route({ path: '/mux/webhook', method: 'POST', handler: muxWebhook });
export default http;
