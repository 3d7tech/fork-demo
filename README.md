# Fork, by 3d7 Technologies

Fork helps employees of small UK companies make better decisions about their pay, pension and benefits, and helps the business save employer National Insurance through salary sacrifice.

- **Demo:** https://3d7tech.github.io/fork-demo/ (source in `demo/`). All companies, people and figures are fictional.
- **Build brief:** [`BUILD_PROMPT.md`](BUILD_PROMPT.md)
- **Decisions:** [`docs/adr/`](docs/adr) · **Open questions:** [`docs/open-questions.md`](docs/open-questions.md)

Fork gives guidance, not regulated financial or tax advice.

## Packages

| Package | What it is |
|---|---|
| `packages/rules` | Versioned UK rule packs as dated data with official sources (`uk-2026-27`, draft) |
| `packages/calc` | Pure calculation modules and the golden test cases |
| `packages/spec` | Decision spec, fact, calculation result, screen layout and copy schemas |
| `packages/models` | Model registry (`config/models.yaml`), role runner, versioned prompts, call logging |
| `packages/pipeline` | `askFork`: question → checked decision screen or honest message; decision families; number checks |
| `packages/ui` | Screen grammar components, visuals and the `fork.css` design tokens |
| `apps/web` | Next.js app: ask page, streaming building steps, live levers, `/preview` of every screen state |

## Working on it

```sh
pnpm install
pnpm test       # unit and golden tests
pnpm typecheck
FORK_ANTHROPIC_API_KEY=… pnpm smoke:models   # live: the whole pipeline on four questions, with timing
```

Run the app (demo mode without a key, real models with one):

```sh
pnpm --filter web dev        # http://localhost:3000, and /preview for every screen state
pnpm e2e                     # build, then browser tests with accessibility checks at 360px
```

Nothing merges with a failing golden test.
