# sokoban-solver

[![make.fun · sokoban-solver-01-run-20261121](https://make.fun/badge/sokoban-solver-01-run-20261121.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![rank](https://make.fun/badge/sokoban-solver-01-run-20261121/eziebatozai/sokoban-solver/rank.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)
[![reward](https://make.fun/badge/sokoban-solver-01-run-20261121/eziebatozai/sokoban-solver/reward.svg)](https://make.fun/bounty/sokoban-solver-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=sokoban-solver-01-run-20261121)

A push-optimal Sokoban solver for make.fun's "Build the best Sokoban solver, 21 November 2026".

## Approach

The levels are a one-wide hallway with one to four small rooms off it. A box
pushed out of a room into the hallway can never come back, so every box stays
in its room and the push-optimal total P* is the sum of the rooms' optima.
The solver exploits that directly:

1. **Rooms.** Cut the dead squares of the player's row (the hallway: a box
   there reaches no goal) out of the floor; each remaining component holding
   boxes is a room.
2. **Per-room push-optimal A\*.** A state is the boxes' squares plus the
   player's reachable region (named by its lowest square). The heuristic is
   the cheapest box-to-goal assignment by BFS distance, which drops by at
   most one per push, so it is admissible and the first solved state popped
   is push-optimal. Dead-square pruning (reverse pull reachability from the
   goals) and frozen 2x2 block pruning keep the search small.
3. **Stitching.** Rooms are solved in turn with the other rooms' boxes
   standing as walls; the player walks along the hallway between rooms.
   Walking is free — only pushes are scored — so the stitched total is P*.

Deterministic by construction: fixed direction order, fixed tie-breaks, and
a work budget (states kept) instead of the clock. The same input always
gives the same output.

## Practice-set results

| Instance | Pushes | P* | Points |
|----------|--------|----|--------|
| i001 | 13 | 13 | 1000 |
| i002 | 16 | 16 | 1000 |
| i003 | 29 | 29 | 1000 |
| i004 | 47 | 47 | 1000 |
| i005 | 60 | 60 | 1000 |

**Practice score: 1,000,000** (house baseline plain-astar 1.0.0: 200,000 — it
solves only i001). Runtime on the whole practice set: ~0.3 s (limit 60 s).
Three further randomly drawn sets from the kit generator also scored
1,000,000 each, every instance at P*, in 0.3–0.4 s per set. Two runs on the
practice set produce byte-identical outputs.
