import { Sheet } from './ui';
import { usePrefs } from '../lib/prefs';

/** Bump when there is something new to show; the sheet opens once per device for each id. */
export const NEWS_ID = '2026-10-29';

const NEWS: [title: string, body: string, href?: string][] = [
  ['One-tap logging', 'The + on any food adds one serving straight away, and every add has Undo. Quick log chips on Today do the same for your favourites.'],
  ['Usual meals', 'Foods you log together show up on Add food, ready to log as a set.', '#/food'],
  ['Browse foods', 'High protein, Big calories, Breakfast, Snacks and more, without typing. Search also knows roti, dahi, chana, aloo and friends.', '#/food'],
  ['Get around faster', 'Swipe Today left or right to change day, tap the date to jump, and long-press the app icon for Add food, Scan or Water.'],
  ['Fix things later', 'Tap a logged food to change its amount, time, day, name or numbers. Edit on Favourites lets you tidy or edit them.'],
  ['See the day', 'The log is grouped by meal with subtotals, plus the energy split, pace, time since you last ate, this week and a day note.'],
  ['Progress', 'A 14-day chart, tappable heatmap days and your recent notes.', '#/progress'],
  ['Make it yours', 'Accent colour, text size, which cards show on Today, and reminder times, all in Profile.', '#/profile?open=display'],
];

export default function WhatsNew({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} label="What's new">
      <div className="stack" style={{ gap: 2 }}>
        <span className="mono fuel">Fuel Log update</span>
        <h2 className="h2" style={{ fontSize: 26 }}>What’s new</h2>
      </div>
      <div className="stack" style={{ gap: 12 }}>
        {NEWS.map(([title, body, href]) => (
          <div key={title} className="stack" style={{ gap: 2 }}>
            <span className="bold">{title}</span>
            <span className="small mut">
              {body}{' '}
              {href && <a href={href} onClick={onClose}>Try it</a>}
            </span>
          </div>
        ))}
      </div>
      <button className="btn primary block" onClick={onClose}>Got it</button>
    </Sheet>
  );
}

/** Shows the sheet once per NEWS_ID on this device. */
export function WhatsNewOnce() {
  const seen = usePrefs((p) => p.newsSeen);
  const markNews = usePrefs((p) => p.markNews);
  if (seen === NEWS_ID) return null;
  return <WhatsNew onClose={() => markNews(NEWS_ID)} />;
}
