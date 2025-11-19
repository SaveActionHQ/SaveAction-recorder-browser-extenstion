# Git Hooks with Husky

This project uses [Husky](https://typicode.github.io/husky/) to manage Git hooks for ensuring code quality and consistency.

## Installed Hooks

### 1. Pre-commit (`pre-commit`)

Runs before every commit to ensure code quality:

- **Lints** staged files with ESLint
- **Formats** code with Prettier
- **Type checks** TypeScript files

This hook uses `lint-staged` to only check files that are being committed.

**What gets checked:**

```json
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.{json,css,html,md}": ["prettier --write"]
}
```

### 2. Commit Message (`commit-msg`)

Validates commit messages to follow [Conventional Commits](https://www.conventionalcommits.org/) specification.

**Valid formats:**

```
<type>(<scope>): <subject>

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes (formatting, etc)
- refactor: Code refactoring
- perf: Performance improvements
- test: Adding or updating tests
- build: Build system changes
- ci: CI/CD changes
- chore: Other changes (dependencies, etc)
- revert: Revert previous commit

Examples:
✅ feat: add recording pause functionality
✅ fix(popup): resolve state sync issue
✅ docs: update README with new features
✅ chore(deps): update dependencies
❌ fixed bug (missing type)
❌ add feature (wrong format)
```

### 3. Pre-push (`pre-push`)

Runs before pushing to remote to ensure everything works:

- **Type checks** entire codebase
- **Runs all tests** (164 unit tests)

This prevents broken code from being pushed to the repository.

## Setup

Husky is automatically set up when you run `npm install` (via the `prepare` script in `package.json`).

If you need to reinstall hooks manually:

```bash
npm run prepare
# or
npx husky install
```

## Skipping Hooks (Not Recommended)

In rare cases where you need to skip hooks:

```bash
# Skip pre-commit
git commit --no-verify

# Skip pre-push
git push --no-verify
```

**⚠️ Warning:** Only use `--no-verify` when absolutely necessary, as it bypasses quality checks.

## Troubleshooting

### Hooks not running

1. Make sure you ran `npm install`
2. Verify `.husky/` directory exists
3. Check that hook files are executable

### Permission errors (Linux/Mac)

```bash
chmod +x .husky/pre-commit
chmod +x .husky/commit-msg
chmod +x .husky/pre-push
```

### Windows line ending issues

Git may show warnings about CRLF/LF. These are harmless and the hooks will still work.

## Development Workflow

1. **Make changes** to your code
2. **Stage files**: `git add .`
3. **Commit**: `git commit -m "feat: add new feature"`
   - Pre-commit hook runs (lint + format)
   - Commit-msg hook validates message
4. **Push**: `git push`
   - Pre-push hook runs (typecheck + tests)

This ensures all code committed to the repository:

- ✅ Follows coding standards
- ✅ Is properly formatted
- ✅ Has valid commit messages
- ✅ Passes all tests
- ✅ Has no type errors
