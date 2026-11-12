import { Icon, type IconName } from './Icon';

const TONES = { green: '', blue: 'icon-badge-blue', gold: 'icon-badge-gold' } as const;

export function PageHeader({ icon, title, subtitle, tone = 'green' }: { icon: IconName; title: string; subtitle?: string; tone?: keyof typeof TONES }) {
  return (
    <div className="reveal flex items-center gap-4">
      <span className={`icon-badge pop-in h-14 w-14 rounded-2xl ${TONES[tone]}`}><Icon name={icon} size={28} /></span>
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="mt-0.5 text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
