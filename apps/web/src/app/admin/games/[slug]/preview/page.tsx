'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ParentSDK, type GameMessage } from '@slgh/shared';

export default function GamePreviewPage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [gameUrl, setGameUrl] = useState<string | null>(null);
  const [manifest, setManifest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    // Fetch game version info
    fetch(`/api/admin/games/${params.slug}/preview`)
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
      playerId: 'preview-admin',
      allowedOrigins: ['*'], // In production, restrict to specific origins
    });

    const handleMessage = async (event: MessageEvent) => {
      await parentSDK.handleMessage(event, {
        onSubmitScore: async (submission) => {
          addLog(`Score submitted: ${submission.score}`);
        },
        onGetPlayerInfo: () => ({
          id: 'preview-admin',
          username: 'Preview User',
          avatar: '🎮',
        }),
        onSaveData: async (data) => {
          addLog(`Data saved: ${data.key}`);
        },
        onLoadData: async (key) => {
          addLog(`Data loaded: ${key}`);
          return null;
        },
        onGameReady: () => {
          addLog('Game is ready');
        },
        onGameError: (err) => {
          addLog(`Game error: ${err}`);
        },
        onRequestHighScores: async (limit) => {
          addLog(`High scores requested: ${limit}`);
          return [];
        },
      });
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [gameUrl, params.slug]);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <button onClick={() => router.push('/admin/games')} className="text-secondary">
          ← Back to Games
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
        <button onClick={() => router.push('/admin/games')} className="text-secondary">
          ← Back to Games
        </button>
        <div className="card p-6 mt-4 bg-red-50 border border-red-200">
          <h2 className="text-xl font-bold text-red-800">Error</h2>
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 p-4">
      <div className="flex items-center justify-between">
        <button onClick={() => router.push('/admin/games')} className="text-secondary">
          ← Back to Games
        </button>
        <h1 className="text-2xl font-bold">Preview: {manifest?.name || params.slug}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Game Preview */}
        <div className="lg:col-span-2">
          <div className="card p-4">
            <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
              {gameUrl ? (
                <iframe
                  ref={iframeRef}
                  src={gameUrl}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  title="Game Preview"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-white">
                  No game URL available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Game Info & Logs */}
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-bold mb-2">Game Info</h2>
            {manifest && (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted">Name</dt>
                  <dd className="font-medium">{manifest.name}</dd>
                </div>
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
                <div>
                  <dt className="text-muted">Entry Point</dt>
                  <dd className="font-medium">{manifest.entryPoint}</dd>
                </div>
              </dl>
            )}
          </div>

          <div className="card p-4">
            <h2 className="font-bold mb-2">SDK Events</h2>
            <div className="h-64 overflow-y-auto bg-gray-900 text-green-400 text-xs p-2 rounded font-mono">
              {logs.length === 0 ? (
                <p className="text-gray-500">Waiting for game events...</p>
              ) : (
                logs.map((log, i) => <div key={i}>{log}</div>)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
