/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as achievements from "../achievements.js";
import type * as appFiles from "../appFiles.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as crons from "../crons.js";
import type * as dice from "../dice.js";
import type * as gameVersions from "../gameVersions.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as leaderboards from "../leaderboards.js";
import type * as lib from "../lib.js";
import type * as monime from "../monime.js";
import type * as multiplayer from "../multiplayer.js";
import type * as pots from "../pots.js";
import type * as reports from "../reports.js";
import type * as rewards from "../rewards.js";
import type * as roomGames from "../roomGames.js";
import type * as rooms from "../rooms.js";
import type * as scrabbleNode from "../scrabbleNode.js";
import type * as seed from "../seed.js";
import type * as tournaments from "../tournaments.js";
import type * as users from "../users.js";
import type * as voice from "../voice.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  achievements: typeof achievements;
  appFiles: typeof appFiles;
  auth: typeof auth;
  chat: typeof chat;
  crons: typeof crons;
  dice: typeof dice;
  gameVersions: typeof gameVersions;
  games: typeof games;
  http: typeof http;
  leaderboards: typeof leaderboards;
  lib: typeof lib;
  monime: typeof monime;
  multiplayer: typeof multiplayer;
  pots: typeof pots;
  reports: typeof reports;
  rewards: typeof rewards;
  roomGames: typeof roomGames;
  rooms: typeof rooms;
  scrabbleNode: typeof scrabbleNode;
  seed: typeof seed;
  tournaments: typeof tournaments;
  users: typeof users;
  voice: typeof voice;
  wallet: typeof wallet;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
