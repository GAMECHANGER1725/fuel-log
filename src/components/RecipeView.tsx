import type { Recipe } from '../lib/recipes';

/** Ingredients with exact amounts, then numbered steps. For one serving. */
export default function RecipeView({ recipe }: { recipe: Recipe }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="between">
        <span className="mono mut">Recipe · 1 serving</span>
        <span className="mono mut">{recipe.time}</span>
      </div>
      <div>
        <span className="mono fuel">Ingredients</span>
        <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
          {recipe.lines.map(([, , amount, item], i) => (
            <li key={i} className="item" style={{ padding: '8px 0', gap: 10, alignItems: 'baseline' }}>
              <span className="num" style={{ fontSize: 17, width: 78, flex: 'none', textAlign: 'left' }}>{amount}</span>
              <span className="grow small">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <span className="mono fuel">Method</span>
        <ol className="small" style={{ margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 6 }}>
          {recipe.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
