'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ParentSDK } from '@slgh/shared';
import { createClient } from '@slgh/shared';

export default function HTML5GamePlayPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [manifest, setManifest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    // Fetch game version info
    fetch(`/api/games/${params.slug}/play`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setLoading(false);
          return;
        }
        setGameUrl(data.bundleUrl);
        setManifest(data.manifest);
        setLoading(false);
      })
      .catch((err) => {
        setError('Failed to load game');
        setLoading(false);
      });
  }, [params.slug]);

  useEffect(() => {
    if (!iframeRef.current || !gameUrl) return;

    const parentSDK = new ParentSDK({
      gameId: params.slug,
      playerId: 'current-user', // Will be replaced with actual user ID
      allowedOrigins: ['*'], // In production, restrict to specific origins
    });

    const handleMessage = async (event: MessageEvent) => {
      await parentSDK.handleMessage(event, {
        onSubmitScore: async (submission) => {
          setScore(submission.score);
          // In production, submit to Supabase
          console.log('Score submitted:', submission);
        },
        onGetPlayerInfo: () => {
          // In production, fetch from Supabase
          return {
            id: 'user-id',
            username: 'Player',
            avatar: '🎮',
          };
        },
        onSaveData: async (data) => {
          // In production, save to Supabase
          console.log('Data saved:', data);
        },
        onLoadData: async (key) => {
          // In production, load from Supabase
          console.log('Data loaded:', key);
          return null;
        },
        onGameReady: () => {
          console.log('Game is ready');
        },
        onGameError: (err) => {
          console.error('Game error:', err);
        },
        onRequestHighScores: async (limit) => {
          // In production, fetch from Supabase
          console.log('High scores requested:', limit);
          return [];
        },
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [gameUrl, params.slug]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => router.push(`/games/${params.slug}`)} className="text-secondary">
          ← Back to Game
        </button>
        <div className="card p-6 mt-4">
          <p>Loading game...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => router.push(`/games/${params.slug}`)} className="text-secondary">
          ← Back to Game
        </button>
        <div className="card p-6 mt-4 bg-red-50 border border-red-200">
          <h2 className="text-xl font-bold text-red-800">Error</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push(`/games/${params.slug}`)} className="text-secondary">
          ← Back to Game
        </button>
        <h1 className="text-2xl font-bold">{manifest?.name || params.slug}</h1>
      </div>

      <div className="card p-4">
        <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
          {gameUrl ? (
            <iframe
              ref={iframeRef}
              src={gameUrl}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms"
              title={manifest?.name || 'Game'}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-white">
              No game URL available
            </div>
          )}
        </div>
      </div>

      {score !== null && (
        <div className="card p-4 bg-green-50 border border-green-200">
          <h2 className="font-bold text-green-800">Score: {score}</h2>
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-bold mb-2">Game Info</h2>
        {manifest && (
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted">Version</dt>
              <dd className="font-medium">{manifest.version}</dd>
            </div>
            <div>
              <dt className="text-muted">Players</dt>
              <dd className="font-medium">
                {manifest.minPlayers} - {manifest.maxPlayers}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Modes</dt>
              <dd className="font-medium">{manifest.modes?.join(', ')}</dd>
            </div>
          </dl>
        )}
      </div>
    </main>
  );
}
