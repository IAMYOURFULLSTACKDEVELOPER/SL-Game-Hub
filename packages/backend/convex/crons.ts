import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();
crons.interval('sweep dice rooms', { seconds: 30 }, internal.dice.sweep);
crons.interval('sweep game rooms', { seconds: 30 }, internal.rooms.sweep);
crons.interval('sync wallet payments', { minutes: 5 }, internal.monime.syncPending);
crons.interval('clear chat typing', { minutes: 10 }, internal.messaging.sweepTyping);
export default crons;
