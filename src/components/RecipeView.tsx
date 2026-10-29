import { useState } from 'react';
import { recipeMacros, scaleAmount, scaleItem, type Recipe } from '../lib/recipes';
import { editRecipe } from '../lib/coach';
import { friendlyError, hasAi } from '../lib/ai';
import { energy } from '../lib/nutrition';
import { useStore } from '../lib/store';
import { Icon, go, toast } from './ui';
import { addShopping, usePrefs } from '../lib/prefs';

/** Ingredients with exact amounts (scaled to 1, 2 or 4 servings), then numbered steps. `editable` adds "Edit with AI". */
export default function RecipeView({ recipe, editable = false }: { recipe: Recipe; editable?: boolean }) {
  const [n, setN] = useState(1);
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="between" style={{ alignItems: 'center' }}>
        <span className="mono mut">Recipe · {recipe.time}</span>
        <div className="row" style={{ gap: 4, alignItems: 'center' }} role="group" aria-label="Recipe makes">
          <span className="mono mut">Makes</span>
          {[1, 2, 4].map((x) => <button key={x} className="chip" style={{ minHeight: 32, padding: '0 12px' }} aria-pressed={n === x} aria-label={`Makes ${x} serving${x === 1 ? '' : 's'}`} onClick={() => setN(x)}>{x}</button>)}
        </div>
      </div>
      <div>
        <span className="mono fuel">Ingredients</span>
        <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
          {recipe.lines.map(([, , amount, item], i) => (
            <li key={i} className="item" style={{ padding: '8px 0', gap: 10, alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 17, width: 78, flex: 'none', textAlign: 'left' }}>{scaleAmount(amount, n)}</span>
              <span className="grow small">{scaleItem(item, n)}</span>
            </li>
          ))}
        </ul>
        <button
          className="btn sm"
          style={{ marginTop: 6 }}
          onClick={() => {
            const p = usePrefs.getState();
            p.setShopping(addShopping(p.shopping, recipe.lines.map(([, , amount, item]) => [scaleAmount(amount, n), scaleItem(item, n)])));
            toast(`Added ${recipe.lines.length} ingredient${recipe.lines.length === 1 ? '' : 's'} to your shopping list`, 0, { label: 'View', run: () => go('food?list=1') });
          }}
        >
          <Icon name="cart" size={14} /> Ingredients to shopping list
        </button>
      </div>
      <div>
        <span className="mono fuel">Method</span>
        <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
          {recipe.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
      {editable && <RecipeEditor recipe={recipe} />}
    </div>
  );
}

/** Ask the AI to change a recipe; the saved version replaces it in suggestions, search and logging. */
function RecipeEditor({ recipe }: { recipe: Recipe }) {
  const s = useStore();
  const unit = s.settings.unit;
  const edited = !!s.recipeEdits[recipe.name.toLowerCase()];
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<{ recipe: Recipe; changes: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setDraft(await editRecipe(s.settings, recipe, recipeMacros(recipe), ask, s.settings.wheyOk));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <div className="row">
        <button className="btn sm grow" onClick={() => setOpen(true)}><Icon name="pencil" size={16} /> Edit recipe{edited ? ' again' : ''}</button>
        {edited && <button className="btn sm" onClick={() => { s.setRecipeEdit(recipe.name, null); toast('Back to the original recipe'); }}>Reset</button>}
      </div>
    );

  if (!hasAi(s.settings))
    return <button className="btn sm" onClick={() => go('profile?open=ai')}>Add an AI key to edit recipes</button>;

  if (draft) {
    const m = recipeMacros(draft.recipe);
    return (
      <div className="stack rule" style={{ paddingTop: 12, gap: 10 }}>
        <span className="mono fuel">Your new version</span>
        {draft.changes && <p className="small mut">{draft.changes}</p>}
        <span className="mono">{energy(m.kcal, unit)} {unit} · {m.protein} g P · {m.carbs} g C · {m.fat} g F · {draft.recipe.serving}</span>
        <RecipeView recipe={draft.recipe} />
        <div className="row">
          <button className="btn" onClick={() => setDraft(null)}>Change it</button>
          <button
            className="btn primary grow"
            onClick={() => {
              s.setRecipeEdit(recipe.name, draft.recipe);
              toast('Recipe saved. Suggestions use your version now');
              setDraft(null);
              setOpen(false);
              setAsk('');
            }}
          >
            Save recipe
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stack rule" style={{ paddingTop: 12, gap: 8 }}>
      <label className="field">
        <span>How should it change?</span>
        <textarea className="input" value={ask} onChange={(e) => setAsk(e.target.value)} maxLength={300} placeholder="e.g. use 300 ml milk, swap peanut butter for almonds, make it bigger" autoFocus />
      </label>
      {error && <p className="small" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
      <div className="row">
        <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn primary grow" disabled={busy || !ask.trim()} onClick={run}>{busy ? 'Reworking the numbers…' : 'Update recipe'}</button>
      </div>
    </div>
  );
}
