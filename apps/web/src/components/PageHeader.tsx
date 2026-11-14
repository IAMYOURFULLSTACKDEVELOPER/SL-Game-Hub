import { Icon, type IconName } from './Icon';

const TONES = { green: '', blue: 'icon-badge-blue', gold: 'icon-badge-gold' } as const;

export function PageHeader({ icon, title, subtitle, tone = 'green' }: { icon: IconName; title: string; subtitle?: string; tone?: keyof typeof TONES }) {
  return (
    <div className="reveal flex items-center gap-3 border-b border-border/60 pb-4">
      <span className={`icon-badge pop-in h-12 w-12 rounded-2xl ${TONES[tone]}`}><Icon name={icon} size={24} /></span>
      <div className="min-w-0">
        <h1>{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
