import { Sheet } from './ui';
import { usePrefs } from '../lib/prefs';

/** Bump when there is something new to show; the sheet opens once per device for each id. */
export const NEWS_ID = '2026-10-29c';

const NEWS: [title: string, body: string, href?: string][] = [
  ['Training days', 'Tap Training day on Today to add 200 to 500 kcal to that day’s target (size in Profile). The week strip marks boosted days and days with a note.'],
  ['Goal weight', 'Progress shows how far you are toward your goal weight, and you can share this week vs last as text.', '#/progress'],
  ['Your checks, your bottle', 'Write your own food-quality checks, and pick a bottle size so one tap logs a whole bottle of water.', '#/profile?open=checks'],
  ['9 PM wrap-up', 'An opt-in evening notification with what’s left for the day. Turn it on next to the other reminders in Profile.', '#/profile?open=display'],
  ['Smarter Close the gap', 'Tap ✕ on a suggestion to stop seeing it. Add food shows what’s still to go and how much of it a portion covers.'],
  ['Log several at once', 'Select on Today deletes or copies several foods to today. Scanned products are remembered, even offline, and any search can be entered with your own numbers.'],
  ['More foods', 'Thali, kathi roll, fried rice, pad thai, dumplings, masala chai, iced coffee and other takeaway and café foods.', '#/food'],
  ['From your log', 'Coach now lists a few plain notes from your last week, no AI key needed.', '#/coach'],
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
