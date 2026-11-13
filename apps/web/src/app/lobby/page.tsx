import LobbyClient from './LobbyClient';

export const metadata = { title: 'Live games', description: 'Online games you can ask to join right now.' };

export default function LobbyPage() {
  return <LobbyClient />;
}
