---
name: review-cycle
description: How review rounds are run on this project - verifying a finding before acting on it, landing each fix as its own commit, and covering it with a test that fails without the fix. Load this when asked to review a branch or pull request, to run review cycles, or to act on review findings.
---

# Review rounds

The pattern asked for here is: implement, then run one or more review rounds, and
land **each finding as its own commit**. Do not batch fixes; a reviewer should be
able to accept or reject them one at a time.

`/code-review` does the reviewing. What follows is what to do with what it says.

## Verify the finding before you fix it

A review finding is a claim, not a fact, and acting on a wrong one costs more than
checking it. Both failure directions have happened on this project:

- A screenshot looked like the canvas had a pale grey background, so a backdrop
  fill went in to cover it. Sampling the actual pixels showed only the cell
  colours and pure black: the "grey slab" was the packed dark hexagons themselves.
  The fix was removed again. **Measure before believing an impression.**
- A review said `drawPoly` renders nothing on the device, contradicting a working
  simulator screenshot. Reading the sibling project it cited showed the claim was
  first-hand and from real hardware - a genuinely different thing from what the
  simulator shows. **Follow a citation to its source rather than dismissing it.**

So: reproduce it, measure it, or read the code or citation it rests on. Then fix
it, or say plainly why it is not a finding.

## Each fix gets a test that would have caught it

For every behavioural fix, write the test and **check that it fails without the
fix** - stash the change, run it, restore. A test written after the fact that
passes either way is worse than none, because it looks like cover it does not
give. This is doubly true for anything drawn or tapped: a test double records a
call happily whether or not the watch would ever have drawn it.

Findings that are worth acting on but not testable through the public surface -
a defensive guard against a state the rules forbid - can be reached by writing
that state directly in the test. Say in the test why the state is impossible.

## Say what you did not do

Close the round by listing what was fixed, what was investigated and rejected and
on what evidence, and what remains open and why. A finding accepted as-is is
still worth a sentence: silence reads as an oversight.

## After the round

Run every gate (CLAUDE.md), push, and confirm the checks are green before asking
for a merge. See the **ship-release** skill for the merge and release mechanics.
