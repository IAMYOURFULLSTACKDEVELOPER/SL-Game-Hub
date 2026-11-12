# Game Publishing System

## Overview

The game publishing system allows admins to upload HTML5 games to the platform without redeploying the application. Games are stored in Convex file storage and loaded dynamically.

## Features

- **Secure Upload**: File type validation, size limits, and manifest validation
- **Version Control**: Track multiple versions of each game with rollback support
- **Sandboxed Execution**: Games run in ifframes with restricted postMessage SDK
- **Preview System**: Admins can preview games before publishing
- **Dynamic Loading**: Published games appear in the library automatically

## Architecture

### Database Schema

#### `game_versions` Table
- Tracks all versions of uploaded games
- Links to Convex file storage for bundles and thumbnails (`bundle_storage_id`, `thumbnail_storage_id`)
- Stores game manifest JSON
- Supports rollback functionality

### File Storage

- Bundles (ZIP, max 10MB) and thumbnails (max 512KB) are uploaded to Convex file storage
  through admin-only upload URLs (`gameVersions:generateUploadUrl`), then recorded by `gameVersions:create`.
- Players get a bundle URL only for the current version of a published game (`gameVersions:current`).

### Security

- **Iframe Sandbox**: Games run with `allow-scripts allow-same-origin allow-forms` only
- **postMessage SDK**: Restricted API for game → parent communication
- **No Token Access**: Games cannot access user authentication tokens
- **Rate Limiting**: Score submissions limited to 5 per minute per player
- **Admin Only**: Upload and management restricted to admin users

## Game Manifest

Every uploaded game must include a `game-manifest.json` file:

```json
{
  "id": "my-awesome-game",
  "name": "My Awesome Game",
  "description": "A brief description",
  "version": "1.0.0",
  "minPlayers": 1,
  "maxPlayers": 1,
  "modes": ["single"],
  "entryPoint": "index.html",
  "author": "Game Studio"
}
```

### Manifest Fields

- `id`: Unique identifier (lowercase, hyphens, 2-40 chars)
- `name`: Display name (2-60 chars)
- `description`: Game description (max 400 chars)
- `version`: Semantic version (e.g., 1.0.0)
- `minPlayers`: Minimum number of players (≥1)
- `maxPlayers`: Maximum number of players (≥1)
- `modes`: Array of game modes (`single` and/or `multi`)
- `entryPoint`: HTML file to load (must end in .html)
- `author`: Optional author name

## Game SDK

Games can communicate with the parent application using the provided SDK:

### Including the SDK

```html
<script src="/sdk/game-sdk.js"></script>
<script>
  const sdk = new GameSDK();
</script>
```

### SDK Methods

#### `submitScore(score, metadata?)`
Submit a score to the platform.
```javascript
await sdk.submitScore(1000, { level: 5 });
```

#### `getPlayerInfo()`
Get public player information (no sensitive data).
```javascript
const player = await sdk.getPlayerInfo();
console.log(player.username, player.avatar);
```

#### `saveData(key, data)`
Save game data (key-value storage).
```javascript
await sdk.saveData('level-progress', JSON.stringify({ level: 5, stars: 3 }));
```

#### `loadData(key)`
Load saved game data.
```javascript
const data = await sdk.loadData('level-progress');
```

#### `notifyReady()`
Notify parent that game is ready.
```javascript
await sdk.notifyReady();
```

#### `requestHighScores(limit?)`
Request high scores leaderboard.
```javascript
const scores = await sdk.requestHighScores(10);
```

#### `reportError(error)`
Report an error to the parent.
```javascript
sdk.reportError('Something went wrong');
```

## Upload Workflow

### 1. Prepare Game Bundle

Create a ZIP file containing:
- `index.html` (or custom entry point from manifest)
- `game-manifest.json` (required)
- Game assets (images, sounds, etc.)
- Game JavaScript files

### 2. Upload via Admin Panel

1. Navigate to `/admin/games`
2. Click "Upload New Game"
3. Fill in game metadata (or use manifest)
4. Upload ZIP bundle
5. Optionally upload thumbnail
6. Submit

### 3. Preview Game

1. Navigate to `/admin/games/[slug]/preview`
2. Game loads in sandboxed iframe
3. Test game functionality
4. Monitor SDK events in the event log

### 4. Publish Game

1. Navigate to `/admin/games`
2. Change status from "draft" to "review"
3. After review, change to "approved"
4. Finally, change to "published"
5. Game appears in the library

## Version Management

### Creating a New Version

1. Upload with a new version number (e.g., 1.0.0 → 1.1.0)
2. System automatically creates new version record
3. Old versions remain in history

### Rolling Back

1. Navigate to `/admin/games/[slug]/versions`
2. Find the version to rollback to
3. Click "Rollback to v[X.X.X]"
4. System updates game to use that version

## Game Lifecycle

```
Draft → Review → Approved → Published → Unpublished
```

- **Draft**: Initial state, not visible to players
- **Review**: Under admin review
- **Approved**: Ready for publication
- **Published**: Visible in library, playable
- **Unpublished**: Removed from library (can be republished)

## Built-in vs Uploaded Games

### Built-in Games
- Hardcoded in the application (Snake, Snake & Ladder)
- Use client-side game engines
- No manifest required
- Stored in `packages/shared/src/games/`

### Uploaded Games
- Stored in Convex file storage
- Loaded dynamically via iframe
- Require manifest
- Can be updated without redeployment

## Security Considerations

### For Game Developers

- **No Direct DOM Access**: Game runs in iframe, cannot access parent DOM
- **No LocalStorage**: Use SDK's `saveData`/`loadData` instead
- **No Authentication**: Cannot access user tokens
- **Limited API**: Only SDK methods are available
- **Rate Limits**: Score submissions are rate-limited

### For Platform Administrators

- **Validate Uploads**: System validates file types, sizes, and manifests
- **Review Before Publishing**: Manual review step in workflow
- **Monitor Events**: Preview page shows SDK event log
- **Rollback Available**: Can quickly rollback problematic versions
- **Sandbox Execution**: Games run with restricted iframe permissions

## API Endpoints

### `POST /api/admin/games/upload`
Upload a new game or version.

**Request:**
- Form data with `bundle`, `thumbnail`, and metadata fields

**Response:**
```json
{
  "success": true,
  "gameId": "uuid"
}
```

### `GET /api/admin/games/[slug]/preview`
Get preview information for a game.

**Response:**
```json
{
  "bundleUrl": "https://...",
  "manifest": { ... },
  "version": "1.0.0"
}
```

### `GET /api/games/[slug]/play`
Get play information for a published game.

**Response:**
```json
{
  "bundleUrl": "https://...",
  "manifest": { ... },
  "version": "1.0.0"
}
```

## Troubleshooting

### Game Not Loading

1. Check if game status is "published"
2. Verify bundle URL is accessible
3. Check browser console for errors
4. Ensure manifest has correct entry point

### SDK Not Working

1. Verify SDK script is included
2. Check iframe sandbox attributes
3. Ensure `postMessage` is being sent correctly
4. Check parent origin in SDK constructor

### Upload Failing

1. Verify file is a valid ZIP
2. Check file size (max 10MB)
3. Ensure manifest is valid JSON
4. Verify all required fields are present

## Example Game

See `packages/shared/src/game-manifest-template.json` for a template manifest.

For a complete example game implementation, refer to the built-in games in `packages/shared/src/games/`.
