import { Sheet } from './ui';
import { usePrefs } from '../lib/prefs';

/** Bump when there is something new to show; the sheet opens once per device for each id. */
export const NEWS_ID = '2026-10-29b';

const NEWS: [title: string, body: string, href?: string][] = [
  ['Log in fewer taps', 'Quick log chips on Today, plus Scan, Snap meal and Numbers. The + on any food adds your usual amount straight away, and every add has Undo.'],
  ['It remembers you', 'Amounts start where you usually are, your own foods come first in search, and Usual meals logs foods you eat together as a set.', '#/food'],
  ['Find foods faster', 'Browse High protein, Big calories, Breakfast and more. Search knows roti, dahi, chana, aloo and plurals.', '#/food'],
  ['Get around', 'Swipe or use ← → to change day, tap the date to jump, / to search on a laptop, and long-press the app icon for shortcuts.'],
  ['Fix things later', 'Tap a logged food to change its amount, time, day, name or numbers. Edit on Favourites lets you tidy or edit them, and Copy from… copies any day.'],
  ['See your day', 'Meals with subtotals, energy split, pace, protein per kg, last ate, this week, a day note and a cheer when you hit a target. Tap the ring for eaten or to go.'],
  ['Progress', 'This week vs last, a 14-day chart, personal records, recent notes and a weigh-in reminder.', '#/progress'],
  ['Make it yours', 'Reorder or hide Today’s cards, accent colour, text size and reminder times, all in Profile. Your log also downloads as a spreadsheet.', '#/profile?open=display'],
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
