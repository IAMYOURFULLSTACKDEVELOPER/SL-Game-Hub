'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { validateGameUpload, type ValidationResult } from '@slgh/shared';

export default function GameUploadPage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [manifestText, setManifestText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // For now, we'll require manual manifest input
    // In production, this would extract the manifest from the zip
    const result = await validateGameUpload(file, manifestText || '{}');
    setValidation(result);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = fileInputRef.current?.files?.[0];
    const thumbnail = thumbnailInputRef.current?.files?.[0];

    if (!file) {
      setValidation({ valid: false, errors: ['Please select a game bundle file'], warnings: [] });
      return;
    }

    if (!manifestText) {
      setValidation({ valid: false, errors: ['Please provide a game manifest'], warnings: [] });
      return;
    }

    setUploading(true);

    try {
      const response = await fetch('/api/admin/games/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        setValidation({ valid: false, errors: [error.message || 'Upload failed'], warnings: [] });
        return;
      }

      router.push('/admin/games');
    } catch (error) {
      setValidation({
        valid: false,
        errors: [error instanceof Error ? error.message : 'Upload failed'],
        warnings: [],
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 p-4">
      <button onClick={() => router.push('/admin/games')} className="text-secondary">
        ← Back to Games
      </button>

      <h1 className="text-2xl font-bold">Upload New Game</h1>

      <form onSubmit={handleUpload} className="card space-y-6 p-6">
        {/* Game Bundle */}
        <div>
          <label className="block mb-2 font-medium">Game Bundle (ZIP)</label>
          <input
            ref={fileInputRef}
            type="file"
            name="bundle"
            accept=".zip,application/zip"
            onChange={handleFileChange}
            className="input w-full"
            required
          />
          <p className="text-sm text-muted mt-1">Max size: 10MB. Must contain index.html and game-manifest.json</p>
        </div>

        {/* Thumbnail */}
        <div>
          <label className="block mb-2 font-medium">Thumbnail Image</label>
          <input
            ref={thumbnailInputRef}
            type="file"
            name="thumbnail"
            accept="image/png,image/jpeg,image/webp"
            className="input w-full"
          />
          <p className="text-sm text-muted mt-1">Max size: 512KB. Recommended: 16:9 aspect ratio</p>
        </div>

        {/* Game Metadata */}
        <div className="space-y-4">
          <div>
            <label className="block mb-2 font-medium">Game ID</label>
            <input
              type="text"
              name="gameId"
              placeholder="my-awesome-game"
              pattern="^[a-z0-9-]{2,40}$"
              className="input w-full"
              required
            />
            <p className="text-sm text-muted mt-1">Lowercase, hyphens allowed (2-40 chars)</p>
          </div>

          <div>
            <label className="block mb-2 font-medium">Game Name</label>
            <input
              type="text"
              name="name"
              placeholder="My Awesome Game"
              minLength={2}
              maxLength={60}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">Description</label>
            <textarea
              name="description"
              placeholder="Describe your game..."
              maxLength={400}
              rows={3}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">Version</label>
            <input
              type="text"
              name="version"
              placeholder="1.0.0"
              pattern="^[0-9]+\.[0-9]+\.[0-9]+$"
              className="input w-full"
              required
            />
            <p className="text-sm text-muted mt-1">Semantic versioning (e.g., 1.0.0)</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block mb-2 font-medium">Min Players</label>
              <input
                type="number"
                name="minPlayers"
                min={1}
                defaultValue={1}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block mb-2 font-medium">Max Players</label>
              <input
                type="number"
                name="maxPlayers"
                min={1}
                defaultValue={1}
                className="input w-full"
                required
            />
            </div>
          </div>

          <div>
            <label className="block mb-2 font-medium">Game Modes</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="modes" value="single" defaultChecked className="checkbox" />
                Single Player
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="modes" value="multi" className="checkbox" />
                Multiplayer
              </label>
            </div>
          </div>

          <div>
            <label className="block mb-2 font-medium">Entry Point</label>
            <input
              type="text"
              name="entryPoint"
              placeholder="index.html"
              defaultValue="index.html"
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">Author (Optional)</label>
            <input
              type="text"
              name="author"
              placeholder="Game Studio"
              maxLength={100}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block mb-2 font-medium">Changelog (Optional)</label>
            <textarea
              name="changelog"
              placeholder="What's new in this version?"
              maxLength={1000}
              rows={3}
              className="input w-full"
            />
          </div>
        </div>

        {/* Validation Results */}
        {validation && (
          <div
            className={`p-4 rounded-lg ${
              validation.valid ? 'bg-primary/10 border border-primary/30' : 'bg-danger/10 border border-danger/30'
            }`}
          >
            {validation.errors.length > 0 && (
              <div className="space-y-1">
                <h3 className="font-medium text-red-800">Errors:</h3>
                <ul className="list-disc list-inside text-red-700">
                  {validation.errors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            {validation.warnings.length > 0 && (
              <div className="space-y-1 mt-2">
                <h3 className="font-medium text-yellow-800">Warnings:</h3>
                <ul className="list-disc list-inside text-yellow-700">
                  {validation.warnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            {validation.valid && validation.errors.length === 0 && (
              <p className="text-green-700 font-medium">✓ Validation passed</p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={uploading || validation?.valid === false}
          className="btn btn-primary w-full"
        >
          {uploading ? 'Uploading...' : 'Upload Game'}
        </button>
      </form>
    </div>
  );
}
