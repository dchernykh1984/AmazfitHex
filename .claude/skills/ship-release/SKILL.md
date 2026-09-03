---
name: ship-release
description: Take work from a branch through a pull request, review, a green pipeline, a merge, and out as a verified GitHub release with a .zab bundle attached. Load this when asked to open a pull request, get a pipeline green, merge, cut a release, or approve workflows on a release pull request.
---

# From branch to release

`gh` is authenticated. `git` pushes over SSH, which is fine for push and pull but
cannot open pull requests - use `gh` for anything touching the GitHub API.

**Never do a remote git operation the user did not ask for.** Opening a pull
request is fine when asked. Deleting a branch, force-pushing and merging each
need their own ask. When told to "merge", that covers the merge only.

## Before the pull request

Run every gate locally first - see CLAUDE.md. Then push the branch and open the
pull request with a body that explains **why**, not a list of files: what was
wrong, what was measured, what was decided against and on what evidence. Findings
that were investigated and rejected are worth a sentence.

## The base branch rules

`main` is protected by a ruleset. Two consequences that come up every time:

- **Rebase is the only allowed merge method.** Not squash, not a merge commit.
  Atomic commits survive into `main`, which is also what `release-please` reads.
- **One approving review is required, and GitHub will not let you approve your own
  pull request.** For a branch authored by the same account that has to merge it,
  the ruleset's admin bypass is the intended path: `gh pr merge <n> --rebase
--admin`. That is how every self-authored pull request in this repository has
  been merged. A release pull request is authored by `github-actions`, so it takes
  a normal approval and a normal `--rebase` merge.

Confirm the state before merging rather than guessing:

```bash
gh pr view <n> --json reviewDecision --jq .reviewDecision
gh pr view <n> --json mergeStateStatus --jq .mergeStateStatus
```

## Reading the checks

`gh pr checks <n>` lists them. The required ones are `pre-commit`, `actionlint`,
`commitizen`, `test` and `osv-scan / osv-scan`.

A row reading `osv-scanner  skipping` with a **neutral** conclusion is not a
failure: that is the scheduled security workflow, which skips on pull requests.
It has looked like that on every pull request in this repository.

## Workflows that need approving

Runs on a branch pushed by a bot land in `action_required` and never start. The
release pull request is always in this state. Approve each run:

```bash
gh api -X POST repos/<owner>/<repo>/actions/runs/<run_id>/approve
```

Find them with `gh run list --branch <branch> --json databaseId,workflowName,status,conclusion`
and look for `conclusion: action_required`. Then `gh run watch <id> --exit-status`.

## The release itself

Merging to `main` starts `release-please`, which maintains a release pull request
that bumps the version and writes the changelog from the Conventional Commits.
Merging **that** tags a GitHub release, which runs `build-and-distribute.yml`:
`version:sync`, then `zeus build`, then the `.zab` is attached to the release.

Only `feat:` and `fix:` move the version. A branch of `chore:`/`docs:`/`build:`
commits produces no release pull request, which is correct and not a fault.

Verify the release rather than assuming it:

```bash
gh run view <release_run_id> --json jobs --jq '.jobs[] | "\(.name) \(.conclusion)"'
gh release view <tag> --json tagName,assets
```

Both jobs should be `success` and the release should carry one `.zab` whose name
contains the app id, the app name and the version.

## Two things that have gone wrong here before

- **`release-please` could not create its pull request.** It did all its work and
  failed on the last step with "GitHub Actions is not permitted to create or
  approve pull requests". That is a repository setting
  (`can_approve_pull_request_reviews`), not a code problem, and it only shows up
  on the first release that actually has something to release. Changing it is a
  configuration change: ask before doing it, and mention that the same switch also
  lets a workflow approve pull requests.
- **The scheduled security scan can be red while every pull request is green.**
  `Security (scheduled)` runs on push to `main` and gates nothing, so a red one is
  easy to miss and easy to mistake for the release pipeline. Check
  `gh run list --branch main` after a merge. A dependency advisory in a transitive
  dev dependency is fixed with an `overrides` entry in `package.json` plus
  `npm install --package-lock-only`, which keeps it out of the app's own
  dependencies.
