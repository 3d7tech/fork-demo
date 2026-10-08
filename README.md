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
| `packages/spec` | Decision spec, fact and calculation result schemas |

## Working on it

```sh
pnpm install
pnpm test       # unit and golden tests
pnpm typecheck
```

Nothing merges with a failing golden test.
