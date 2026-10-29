import { Sheet } from './ui';
import { usePrefs } from '../lib/prefs';

/** Bump when there is something new to show; the sheet opens once per device for each id. */
export const NEWS_ID = '2026-10-29zg';

const NEWS: [title: string, body: string, href?: string][] = [
  ['Fold a meal', 'Tap Breakfast, Lunch or any meal heading in the log to fold it away; its totals stay. Tap again to open it.'],
  ['Notes in Share this day', 'Sharing a day now includes the day note and any notes on foods.'],
  ['Choose your Progress cards', 'Hide the Progress cards you don’t use: tap Customise this page at the bottom of Progress.', '#/profile?open=progress'],
  ['Quick log your way', 'Show 6, 10 or 16 of your foods in Quick log, in one scrolling row or all at once.', '#/profile?open=today'],
  ['Automatic training days', 'Pick your gym days in Profile and the training-day boost switches on by itself on those days.', '#/profile?open=today'],
  ['Notes on a food', 'Tap a logged food to add a short note, like “homemade, extra ghee”. It shows under the food in the log, and Search your log finds it.'],
  ['Tidier settings', 'Profile’s settings are split into Look, Today page and Reminders, so things are quicker to find.', '#/profile?open=today'],
  ['Don’t go too long without eating', 'With reminders on, pick 3, 4 or 5 hours in Profile and the app nudges you with a food idea until you hit your energy target.', '#/profile?open=reminders'],
  ['Shopping list', 'Under a recipe’s ingredients, tap Shopping list, or tap the cart on any food. The list is on Add food; tick things off as you shop, add your own items, or share it.', '#/food?list=1'],
  ['Black theme', 'A true-black theme for OLED screens, easier on the eyes at night. Pick Black in Profile, under Look.', '#/profile?open=look'],
  ['Water this week', 'The water card shows your average over the last 7 days and how often you hit the goal, and Weekly averages on Progress has a water column.', '#/progress'],
  ['Usually now', 'Quick log puts the foods you often have around this time first, marked with a clock.'],
  ['This month vs last', 'Progress’s comparison card now switches between week and month.', '#/progress'],
  ['Open straight to Add food', 'Pick which page the app opens on in Profile, so logging is one tap from the home screen.', '#/profile?open=look'],
  ['Weigh-in reminder', 'Choose daily, every 3 days, weekly or fortnightly for the weigh-in reminder on Today, in Profile.', '#/profile?open=today'],
  ['Week so far', 'This week on Today says how far ahead or behind your energy target the week is, and how much a day catches up.'],
  ['Search your log', 'On Progress, type a food to see every time you logged it and when. Tap one to open that day, or + to have it again now.', '#/progress'],
  ['Where it came from', 'Under the log, open Where it came from to see which foods gave the day’s protein or energy.'],
  ['Tag the day', 'Tap Gym, Rest day, Eating out and more under the day note to add them without typing. Tap again to take one off. Progress then compares those days with the rest. Make your own tags in Profile.', '#/profile?open=today'],
  ['Badge on the app icon', 'Show protein or energy still to eat on the home-screen icon. Turn it on in Profile, under Reminders.', '#/profile?open=reminders'],
  ['By weekday', 'Progress shows your average energy and protein for each day of the week, so a day you usually fall short stands out.', '#/progress'],
  ['Speak instead of typing', 'Tap the mic in Add food’s search, or Speak it under Describe it, and say what you ate. Searches that found a food come back as chips under the search box.', '#/food'],
  ['How often you have it', 'A food’s Add sheet shows how many days you had it in the last month and when you last did.'],
  ['Training days', 'Tap Training day on Today to add 200 to 500 kcal to that day’s target (size in Profile). The week strip marks boosted days and days with a note.'],
  ['Goal weight', 'Progress shows how far you are toward your goal weight, and you can share this week vs last as text.', '#/progress'],
  ['Your checks, your bottle', 'Write your own food-quality checks, and pick a bottle size so one tap logs a whole bottle of water.', '#/profile?open=checks'],
  ['9 PM wrap-up', 'An opt-in evening notification with what’s left for the day. Turn it on next to the other reminders in Profile.', '#/profile?open=reminders'],
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
