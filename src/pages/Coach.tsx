import { useEffect, useRef, useState } from 'react';
import { dataOf, useStore } from '../lib/store';
import { applyCheckIn, checkIn, MAX_STEP, runChat, runIdeas, undoCheckIn, useCoach, type ChatMsg, type Idea, type Review } from '../lib/coach';
import { friendlyError, hasAi } from '../lib/ai';
import { dayTotals, energy, fmt } from '../lib/nutrition';
import { fmtDate } from '../lib/dates';
import { XP } from '../lib/game';
import { Icon, go, toast, useToday } from '../components/ui';

const STATUS: Record<Review['status'], [string, string]> = {
  'on-track': ['On track', 'var(--pro)'],
  'too-slow': ['Gaining too slowly', 'var(--fuel)'],
  'too-fast': ['Gaining too fast', 'var(--carb)'],
  'eat-more': ['Eat your target first', 'var(--fuel)'],
  'need-data': ['Needs more data', 'var(--mut)'],
};

export default function Coach() {
  const hasKey = useStore((s) => hasAi(s.settings));
  return (
    <>
      <header className="head">
        <div className="stack" style={{ gap: 2 }}>
          <span className="mono mut">Powered by DeepSeek</span>
          <h1 className="title">Coach</h1>
        </div>
      </header>
      <div className="page">
        {!hasKey ? (
          <section className="card stack">
            <h2 className="h2">Set up your coach</h2>
            <p className="small">The coach reads your log and weigh-ins, adjusts your targets each week, and suggests quick shakes and meals for what’s left today. It uses DeepSeek (through TokenHarbor) or Gemini with your own free key.</p>
            <button className="btn primary block" onClick={() => go('profile?open=ai')}>Add an AI key</button>
          </section>
        ) : (
          <>
            <CheckIn />
            <Ideas />
            <Chat />
          </>
        )}
      </div>
    </>
  );
}

// ----- Weekly check-in ------------------------------------------------------------

function CheckIn() {
  const { review, auto, set } = useCoach();
  const unit = useStore((s) => s.settings.unit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await checkIn();
      toast(r.applied ? 'Targets updated' : 'Check-in done');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const changed = review && (review.to.kcal !== review.from.kcal || review.to.protein !== review.from.protein || review.to.fat !== review.from.fat || review.to.carbs !== review.from.carbs);
  const [label, color] = review ? STATUS[review.status] : ['', ''];

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">Weekly check-in</h2>
        {review && <span className="tag" style={{ color }}>{label}</span>}
      </div>
      {review ? (
        <>
          <div className="stack" style={{ gap: 6 }}>
            <p style={{ fontSize: 17, fontWeight: 600 }}>{review.headline}</p>
            {review.summary && <p className="small">{review.summary}</p>}
          </div>
          <div className="grid4" style={{ padding: '10px 0', background: 'var(--s2)', borderRadius: 18 }}>
            <Delta label={unit} from={review.from.kcal} to={review.to.kcal} show={(v) => energy(v, unit)} color="var(--fuel)" />
            <Delta label="protein" from={review.from.protein} to={review.to.protein} color="var(--pro)" />
            <Delta label="carbs" from={review.from.carbs} to={review.to.carbs} />
            <Delta label="fat" from={review.from.fat} to={review.to.fat} />
          </div>
          <p className="small dim">{review.allowed.why}</p>
          {changed ? (
            review.applied ? (
              <div className="row">
                <span className="small grow" style={{ color: 'var(--pro)' }}>New targets are in use.</span>
                <button className="btn sm" onClick={() => toast(undoCheckIn() ? 'Targets put back' : 'Targets have changed since. Check in again instead.')}>Undo</button>
              </div>
            ) : (
              <button className="btn primary" onClick={() => toast(applyCheckIn() ? 'Targets updated' : 'This check-in is out of date. Check in again.')}>Use these targets</button>
            )
          ) : (
            <span className="small mut">Targets stay the same this week.</span>
          )}
          {review.water && (
            <div className="stack rule" style={{ paddingTop: 12, gap: 6 }}>
              <span className="mono pro">Water</span>
              <p className="small">{review.water}</p>
            </div>
          )}
          {review.focus.length > 0 && (
            <div className="stack rule" style={{ paddingTop: 12, gap: 8 }}>
              <span className="mono fuel">This week, focus on</span>
              <ol className="small" style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 6 }}>
                {review.focus.map((f, i) => <li key={i}>{f}</li>)}
              </ol>
            </div>
          )}
        </>
      ) : (
        <p className="small">Once a week the coach looks at what you ate, your weigh-ins and when you eat, then adjusts your calories and macros. Calories only move when your weight trend says so, by up to {MAX_STEP} kcal a week.</p>
      )}
      {error && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
      <div className="row">
        <button className="btn grow" disabled={busy} onClick={run}>
          <Icon name="refresh" size={16} /> {busy ? 'Reading your log…' : review ? 'Check in again' : 'Check in now'}
        </button>
      </div>
      <label className="row small">
        <input type="checkbox" checked={auto} onChange={(e) => set({ auto: e.target.checked })} style={{ width: 20, height: 20, accentColor: 'var(--fuel)', flex: 'none' }} />
        <span>Check in every week by itself and apply the new targets (you can always undo)</span>
      </label>
      {review && <span className="mono dim">Last check-in {fmtDate(review.date)} · {review.model}</span>}
    </section>
  );
}

function Delta({ label, from, to, color, show = (v) => String(Math.round(v)) }: { label: string; from: number; to: number; color?: string; show?: (v: number) => string }) {
  const d = Math.round(to - from);
  return (
    <div className="stack" style={{ gap: 0, textAlign: 'center' }}>
      <span className="num" style={{ fontSize: 22, color }}>{show(to)}</span>
      <span className="mono mut" style={{ fontSize: 10 }}>{label}</span>
      <span className="mono" style={{ fontSize: 10, color: d > 0 ? 'var(--pro)' : d < 0 ? 'var(--carb)' : 'var(--dim)' }}>{d === 0 ? 'same' : `${d > 0 ? '+' : '−'}${label === 'kJ' ? fmt(Math.abs(d) * 4.184) : Math.abs(d)}`}</span>
    </div>
  );
}

// ----- What to make now -----------------------------------------------------------

function Ideas() {
  const s = useStore();
  const today = useToday();
  const { ideas, note, set } = useCoach();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const unit = s.settings.unit;
  const T = s.settings.targets;
  const done = dayTotals(s.days[today]);
  const kLeft = Math.max(0, T.kcal - done.kcal);
  const pLeft = Math.max(0, T.protein - done.protein);
  const list = ideas?.date === today ? ideas.list : [];

  const get = async () => {
    setBusy(true);
    setError('');
    setOpen(null);
    try {
      // Today's earlier ideas go along so a retry brings new ones.
      const r = await runIdeas(s.settings, dataOf(useStore.getState()), note, list.map((x) => x.name));
      set({ ideas: { date: today, at: Date.now(), list: r.ideas, model: r.model } });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const log = (i: Idea) => {
    s.addEntries(today, [{ name: i.name, serving: i.serving, base: { kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat }, qty: 1, source: 'coach' }], [
      { id: `coach-${Date.now().toString(36)}`, name: i.name, serving: i.serving, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat },
    ]);
    toast(`Logged ${i.name}`, XP.meal);
    setOpen(null);
  };

  const groups = ([5, 10, 20] as const).map((m) => [m, list.map((x, idx) => [x, idx] as const).filter(([x]) => x.minutes === m)] as const);

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">What to make now</h2>
      </div>
      <p className="small">
        {kLeft > 0 ? `${energy(kLeft, unit)} ${unit} and ${fmt(pLeft)} g protein left today.` : 'You’ve hit today’s energy target.'} Shakes and drinks come first: they’re the easiest way to get calories in without feeling stuffed.
      </p>
      <input className="input" value={note} onChange={(e) => set({ note: e.target.value })} maxLength={200} placeholder="Optional: “no blender”, “use paneer”" aria-label="Anything the coach should know" />
      {error && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
      <button className={`btn block${list.length ? '' : ' primary'}`} disabled={busy} onClick={get}>
        {list.length > 0 && <Icon name="refresh" size={16} />}
        {busy ? 'Thinking it through…' : list.length ? (note.trim() ? 'New ideas with my note' : 'New ideas') : 'Get 5, 10 and 20 minute ideas'}
      </button>
      {groups.map(([m, items]) =>
        items.length ? (
          <div key={m} className="stack" style={{ gap: 6 }}>
            <span className="mono fuel">{m} minutes</span>
            {items.map(([i, idx]) => {
              const isOpen = open === idx;
              return (
                <div key={idx} className="stack" style={{ gap: 0, background: 'var(--s2)', borderRadius: 18, overflow: 'hidden' }}>
                  <div className="row" style={{ gap: 0 }}>
                    <button className="item-btn" style={{ padding: '10px 12px', minHeight: 56 }} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : idx)}>
                      <span style={{ fontWeight: 600 }}>{i.name}</span>
                      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {i.liquid && <span className="tag" style={{ color: 'var(--pro)' }}>{i.kind}</span>}
                        <span className="mono mut">{energy(i.kcal, unit)} {unit} · {i.protein} g P</span>
                      </span>
                    </button>
                    <button className="btn icon" style={{ borderRadius: 0, background: 'var(--s3)', alignSelf: 'stretch', height: 'auto' }} aria-label={`Log ${i.name}`} onClick={() => log(i)}>+</button>
                  </div>
                  {isOpen && (
                    <div className="stack" style={{ padding: '4px 12px 12px', gap: 10 }}>
                      {i.why && <p className="small mut">{i.why}</p>}
                      <div>
                        <span className="mono fuel">Ingredients · {i.serving}</span>
                        <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
                          {i.ingredients.map((x, k) => <li key={k}>{x}</li>)}
                        </ul>
                      </div>
                      <div>
                        <span className="mono fuel">Method</span>
                        <ol className="small" style={{ margin: '4px 0 0', paddingLeft: 20, display: 'grid', gap: 4 }}>
                          {i.steps.map((x, k) => <li key={k}>{x}</li>)}
                        </ol>
                      </div>
                      <span className="mono mut">{i.carbs} g carbs · {i.fat} g fat</span>
                      <button className="btn primary block" onClick={() => log(i)}>Log it · +{XP.meal} XP</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null,
      )}
      {list.length > 0 && <span className="mono dim">AI estimates · {ideas?.model}</span>}
    </section>
  );
}

// ----- Ask the coach --------------------------------------------------------------

const STARTERS = ['Why am I not gaining weight?', 'What should I drink before bed?', 'How do I eat more at school?', 'Rate my eating this week out of 10'];

function Chat() {
  const s = useStore();
  const { chat, set } = useCoach();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chat.length) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [chat.length]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    const history: ChatMsg[] = [...chat, { role: 'user', text: t.slice(0, 500) }];
    set({ chat: history });
    setQ('');
    setBusy(true);
    setError('');
    try {
      const reply = await runChat(s.settings, dataOf(useStore.getState()), history);
      // Append to whatever is there now (it may have been cleared while waiting).
      const cur = useCoach.getState().chat;
      if (cur.length) set({ chat: [...cur, { role: 'model' as const, text: reply }].slice(-30) });
    } catch (e) {
      setError(friendlyError(e));
      const cur = useCoach.getState().chat;
      if (cur[cur.length - 1]?.text === t.slice(0, 500)) set({ chat: cur.slice(0, -1) });
      setQ(t);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <h2 className="h2">Ask your coach</h2>
        {chat.length > 0 && <button className="btn sm" disabled={busy} onClick={() => set({ chat: [] })}>Clear</button>}
      </div>
      {chat.length === 0 ? (
        <>
          <p className="small mut">Ask anything about your eating. The coach can see your last two weeks of logs, weigh-ins and meal times.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {STARTERS.map((x) => <button key={x} className="chip" disabled={busy} onClick={() => void send(x)}>{x}</button>)}
          </div>
        </>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {chat.map((m, i) => <div key={i} className={`bubble ${m.role === 'user' ? 'me' : 'coach'}`}>{m.text}</div>)}
          {busy && <div className="bubble coach mut">Thinking…</div>}
          <div ref={end} />
        </div>
      )}
      {error && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
      <form className="row" onSubmit={(e) => { e.preventDefault(); void send(q); }}>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Ask a question" aria-label="Ask your coach" enterKeyHint="send" />
        <button className="btn primary" type="submit" disabled={busy || !q.trim()}>Ask</button>
      </form>
    </section>
  );
}
