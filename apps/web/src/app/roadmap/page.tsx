export default function RoadmapPage() {
  return (
    <main className="mx-auto max-w-5xl space-y-8 p-4">
      <h1 className="text-3xl font-bold">Game Roadmap</h1>
      <p className="text-muted">
        We're constantly adding new games and features. Here's what's coming to SL Game Hub!
      </p>

      {/* Completed Games */}
      <section>
        <h2 className="text-2xl font-bold mb-4 text-green-600">✅ Completed Games</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <GameCard
            name="Snake"
            icon="🐍"
            description="Classic snake game with modern features. Guide the snake, eat food, grow, and avoid crashing."
            status="Available Now"
            color="green"
          />
          <GameCard
            name="Snake & Ladder"
            icon="🎲"
            image="/games/snake-and-ladder.webp"
            description="Traditional board game with dice rolling. Race to the finish while avoiding snakes and climbing ladders."
            status="Available Now"
            color="green"
          />
        </div>
      </section>

      {/* In Development */}
      <section>
        <h2 className="text-2xl font-bold mb-4 text-blue-600">🚧 In Development</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <GameCard
            name="Checkers"
            icon="♟️"
            image="/games/checkers.webp"
            description="Classic checkers/draughts game. Capture opponent pieces and king your pieces to win."
            status="Coming Soon"
            color="blue"
          />
          <GameCard
            name="Chess"
            icon="♔"
            image="/games/chess.webp"
            description="The ultimate strategy game. Play chess with AI or other players."
            status="Coming Soon"
            color="blue"
          />
          <GameCard
            name="Word Search"
            icon="🔍"
            description="Find hidden words in a grid of letters. Multiple categories and difficulty levels."
            status="Coming Soon"
            color="blue"
          />
          <GameCard
            name="Scrabble"
            icon="📝"
            image="/games/scrabble.webp"
            description="Word-building board game. Create words from letter tiles and score points."
            status="Coming Soon"
            color="blue"
          />
        </div>
      </section>

      {/* Planned Games */}
      <section>
        <h2 className="text-2xl font-bold mb-4 text-purple-600">📋 Planned Games</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <GameCard
            name="UNO"
            icon="🃏"
            description="Classic card game. Match colors and numbers, use action cards, and be the first to empty your hand."
            status="Planned"
            color="purple"
          />
          <GameCard
            name="Monopoly"
            icon="🏠"
            image="/games/sierrapoly.webp"
            description="Property trading game. Buy, sell, and trade properties to bankrupt your opponents."
            status="Planned"
            color="purple"
          />
          <GameCard
            name="Tic-Tac-Toe"
            icon="⭕"
            description="Simple yet strategic game. Get three in a row to win. Perfect for quick matches."
            status="Planned"
            color="purple"
          />
          <GameCard
            name="Connect Four"
            icon="🔴"
            description="Drop discs into the grid and connect four in a row to win."
            status="Planned"
            color="purple"
          />
          <GameCard
            name="Memory Match"
            icon="🧠"
            description="Card matching game. Find pairs of matching cards to test your memory."
            status="Planned"
            color="purple"
          />
          <GameCard
            name="Sudoku"
            icon="🔢"
            description="Logic puzzle game. Fill the grid with numbers 1-9 following Sudoku rules."
            status="Planned"
            color="purple"
          />
        </div>
      </section>

      {/* Features Roadmap */}
      <section>
        <h2 className="text-2xl font-bold mb-4">🎯 Features Roadmap</h2>
        <div className="space-y-4">
          <FeatureSection
            title="Community Features"
            items={[
              { name: 'National Leaderboards', status: '✅ Done' },
              { name: 'Tournaments', status: '✅ Done' },
              { name: 'Achievements & Badges', status: '✅ Done' },
              { name: 'Player Chat', status: '✅ Done' },
              { name: 'Rewards System', status: '✅ Done' },
              { name: 'Friend System', status: '🚧 In Progress' },
              { name: 'Player Profiles', status: '🚧 In Progress' },
              { name: 'Activity Feed', status: '📋 Planned' },
            ]}
          />
          <FeatureSection
            title="Game Features"
            items={[
              { name: 'Single Player Mode', status: '✅ Done' },
              { name: 'Multiplayer Mode', status: '✅ Done' },
              { name: 'AI Opponents', status: '✅ Done' },
              { name: 'Game Replays', status: '📋 Planned' },
              { name: 'Custom Game Rules', status: '📋 Planned' },
              { name: 'Tournament Brackets', status: '✅ Done' },
              { name: 'Spectator Mode', status: '📋 Planned' },
            ]}
          />
          <FeatureSection
            title="Platform Features"
            items={[
              { name: 'Game Publishing System', status: '✅ Done' },
              { name: 'Admin Dashboard', status: '✅ Done' },
              { name: 'Content Moderation', status: '✅ Done' },
              { name: 'Mobile App', status: '✅ Done' },
              { name: 'Dark Mode', status: '✅ Done' },
              { name: 'Push Notifications', status: '📋 Planned' },
              { name: 'Offline Mode', status: '📋 Planned' },
              { name: 'Cross-Platform Play', status: '📋 Planned' },
            ]}
          />
        </div>
      </section>

      {/* Contribute */}
      <section className="card p-6 bg-blue-50 border-blue-200">
        <h2 className="text-xl font-bold mb-2">Want to Help?</h2>
        <p className="text-muted mb-4">
          We're always looking for feedback and suggestions. If you have ideas for new games or features,
          let us know!
        </p>
        <a href="mailto:support@slgamehub.com" className="btn btn-primary">
          Contact Us
        </a>
      </section>
    </main>
  );
}

function GameCard({ name, icon, image, description, status, color }: any) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200',
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  return (
    <div className={`card p-6 ${colorClasses[color]}`}>
      <div className="flex items-start gap-4">
        {image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={image} alt="" width={96} height={64} loading="lazy" decoding="async" className="h-16 w-24 shrink-0 rounded-lg object-cover" />
          : <span className="text-5xl">{icon}</span>}
        <div className="flex-1">
          <h3 className="text-xl font-bold">{name}</h3>
          <p className="text-sm text-muted mt-2">{description}</p>
          <span className={`inline-block mt-3 px-3 py-1 text-sm rounded-full ${
            status === 'Available Now' ? 'bg-green-200 text-green-800' :
            status === 'Coming Soon' ? 'bg-blue-200 text-blue-800' :
            'bg-purple-200 text-purple-800'
          }`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

function FeatureSection({ title, items }: { title: string; items: { name: string; status: string }[] }) {
  return (
    <div className="card p-6">
      <h3 className="text-lg font-bold mb-4">{title}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-lg">{item.status.split(' ')[0]}</span>
            <span className="text-sm">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
