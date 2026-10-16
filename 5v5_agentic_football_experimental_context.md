# 5v5 Agentic Football — Experimental Training Context

## Project Goal

Develop and validate tactical policies for a five-agent football team using three formations:

- **1–1–2**
- **2–1–1**
- **3–0–1**

The final deliverable will eventually be **15 validated agent prompts**:

- 5 agents for **1–1–2**
- 5 agents for **2–1–1**
- 5 agents for **3–0–1**

Do **not** write the final prompts before sufficient match evidence exists.

The objective is not to copy real-world coaches directly. External football and futsal knowledge should generate hypotheses, while **actual behavior inside the game engine is the final authority**.

---

## Core Method

Use the iterative loop:

**Propose → Test → Diagnose → Refine**

### Propose
Define:
- the formation hypothesis,
- each agent's intended tactical role,
- one specific behavior or relationship to test,
- the expected failure mode.

### Test
Run controlled matches:
- keep models constant unless model performance is the variable,
- keep unrelated role instructions constant,
- use the same opponent when comparing a challenger with the current champion,
- avoid unnecessary live shouts during controlled tests,
- save the exact setup used.

### Diagnose
Determine:
1. Did the agents execute the intended tactic?
2. Did match outcomes improve?
3. What do shots on target, turnovers, and replay evidence explain?
4. Is the result repeatable?

### Refine
Change **one meaningful tactical or instruction variable at a time**.

Retest under the same conditions.

Promote the challenger only when the evidence supports it.

---

# Decision Order

All tactical promotion decisions follow this hierarchy.

## 1. Execution
**Does the team carry out the intended spacing, support, and recovery?**

If not, do not conclude that the formation itself is bad.

First determine whether the problem is:
- instruction clarity,
- conflicting priorities,
- model reasoning,
- latency,
- starting placement,
- or engine behavior.

## 2. Results
Compare:
- win/draw/loss,
- score,
- goal difference,

against the **same opponents**.

Results matter only after execution is credible.

## 3. Supporting Evidence
Use:
- shots on target for,
- shots on target against,
- dangerous turnovers,
- selected replay sequences.

These explain *why* the result happened.

Possession, total shots, and individual awards are diagnostic signals, not primary objectives.

## 4. Repeatability
Retest:
- close results,
- surprising results,
- unusually strong or weak performances.

A single win or loss should not automatically promote or reject a tactical version.

---

# Data Strategy

Use three data sources in order of importance.

## Dataset A — Agentic Football Engine Matches

This is the most important dataset because it reflects the environment the agents must actually solve.

For every match, record:

| Field | Record |
|---|---|
| Version | e.g. `112_v03` |
| Formation | 1–1–2 / 2–1–1 / 3–0–1 |
| GK prompt version | exact version |
| DEF prompt version | exact version |
| MID prompt version | exact version |
| FOR1 prompt version | exact version |
| FOR2 prompt version | exact version |
| Model per agent | exact model |
| Opponent | name / style |
| Result | W / D / L |
| Score | goals for / against |
| Goal difference | match GD |
| Shots | for / against |
| Shots on target | for / against |
| Dangerous turnovers | manually coded |
| Latency/failures | if available |
| Shouts | exact text or none |
| Execution failures | observed behavior |
| Primary diagnosis | one main cause |
| Next hypothesis | one change to test |

Save:
- setup export,
- exact prompts,
- reports,
- replay/video if available.

---

## Dataset B — Futsal and Small-Sided Football

Use futsal and 5v5 material primarily to generate tactical ideas around:

- width,
- passing lanes,
- support angles,
- rotations,
- compactness,
- pressing,
- recovery,
- overloads,
- transition attack,
- transition defense,
- goalkeeper distribution.

Small-sided football should generally receive more weight than 11v11 material because the geometry and player density are closer to the target environment.

---

## Dataset C — Elite 11v11 Coaches

Study coaches such as Guardiola, Mourinho, Klopp, Simeone, Ancelotti, Arteta, etc. for **principles**, not literal positional copying.

Example transformation:

**Coach behavior → tactical principle → 5v5 interpretation → testable hypothesis → engine experiment**

Do not assume a successful 11v11 structure transfers directly into 5v5.

---

# Replay / Video Analysis

Do not start by analyzing entire matches with expensive multimodal AI.

Instead build a **critical-event dataset**.

Extract sequences around:

- every goal scored,
- every goal conceded,
- every shot on target,
- dangerous turnovers,
- failed buildup,
- successful press escape,
- counterattacks conceded,
- representative normal possessions.

The purpose is to reduce a full match into a smaller number of high-value tactical sequences.

AI vision can be used as a first-pass annotator, but ambiguous tactical judgments should be reviewed.

---

# Match Phase Classification

Each important sequence should first be classified into one of these phases:

1. **In possession**
2. **Out of possession**
3. **Attacking transition**
4. **Defensive transition**
5. **Goalkeeper distribution / restart**

Analysis should compare behavior against the role expectations for that phase.

---

# Execution Evaluation

For each relevant sequence, evaluate observable team behavior.

Suggested scoring:

- **0 = failed**
- **1 = partially executed**
- **2 = clearly executed**

Evaluate:

| Dimension | Evaluation question |
|---|---|
| Shape | Did agents occupy the intended structure? |
| Spacing | Did agents avoid unnecessary duplication/crowding? |
| Support | Did the ball carrier have useful options? |
| Depth | Was there a usable forward option? |
| Security | Was someone protecting against a counter? |
| Press / cover | Did one pressure while others protected threats? |
| Recovery | Did agents react correctly after possession loss? |
| Transition attack | Did support appear after regaining possession? |
| Role discipline | Did each agent perform its assigned function? |
| Decision quality | Did the selected action fit the situation? |

These scores are **evaluation tools**, not instructions to place inside prompts.

---

# Formation Hypotheses

Each formation is a separate policy family with its own champion version.

---

## 1–1–2

### Intended structure

**DEF → MID → FOR1 + FOR2**

### Main questions
- Does DEF remain adequate deepest protection?
- Does MID connect defense and attack?
- Does MID recover after possession loss?
- Do FOR1 and FOR2 occupy complementary spaces?
- Does FOR2 provide enough support?
- Can the team attack without isolating DEF?

### Expected failure mode

**The lone defender becomes exposed during defensive transition.**

---

## 2–1–1

### Intended structure

**DEF + MID → FOR2 → FOR1**

### Main questions
- Do the two deeper agents protect counters?
- Does one step forward while the other provides cover?
- Does FOR2 successfully link the lines?
- Is FOR1 consistently reachable?
- Can the team progress without becoming too conservative?

### Expected failure mode

**FOR1 becomes isolated and buildup stalls.**

---

## 3–0–1

### Intended structure

**DEF + MID + FOR2 → FOR1**

### Main questions
- Does the three-player base stay coherent?
- Does at least one deep player progress play?
- Can the team reliably reach FOR1?
- Does FOR1 remain available as an outlet?
- Does support arrive quickly after possession is regained?
- Does added defensive stability justify reduced midfield connectivity?

### Expected failure mode

**The three-player base becomes disconnected from FOR1.**

---

# Failure Diagnosis Framework

Every major problem should be classified before changing instructions.

## 1. Execution Failure
The agent did not perform the intended behavior.

Possible causes:
- unclear instruction,
- conflicting priorities,
- excessive prompt complexity,
- weak condition ordering.

Typical next action:
- simplify or reprioritize the relevant role instruction.

## 2. Tactical Failure
The agents executed the intended tactic, but the tactic produced poor outcomes.

Typical next action:
- change the tactical rule or role relationship.

## 3. Model Failure
The tactical idea may be valid, but the model:
- reacts too slowly,
- misunderstands conditions,
- makes poor decisions despite clear instructions,
- fails consistently in the same reasoning situation.

Typical next action:
- test a model change while holding tactics constant.

## 4. Variance / Matchup Effect
The outcome may be driven by:
- isolated events,
- opponent style,
- randomness,
- small sample size.

Typical next action:
- repeat the match before changing the policy.

---

# Controlled Refinement Rule

Use:

**one hypothesis → one change → same opponent → same surrounding setup → retest**

Avoid:

**loss → rewrite all five agents**

Maintain a version tree for each formation.

Example:

```text
1-1-2
└── v0 champion
    ├── v1 MID recovery change
    ├── v2 FOR2 support change
    └── v3 DEF risk change
```

Only one challenger should be evaluated against the champion at a time.

Never lose the current best known version.

---

# Experimental Schedule

Assuming ten practice matches are available per weekly cycle:

## Week 1 — Formation Mapping

Run the full formation/opponent matrix:

| Formation | Balanced | High Press | Deep / Counter |
|---|---:|---:|---:|
| 1–1–2 | 1 | 1 | 1 |
| 2–1–1 | 1 | 1 | 1 |
| 3–0–1 | 1 | 1 | 1 |

Total: **9 matches**

Use match 10 to repeat:
- the closest comparison, or
- the most surprising result.

### Week 1 objective
Identify each formation's characteristic execution problems and matchup weaknesses.

Do not select a final winner yet.

---

## Week 2 — Diagnose and Refine

For each formation:

1. identify the most important recurring failure,
2. create one challenger,
3. compare champion vs challenger against the opponent that exposes that weakness,
4. repeat if the evidence is close.

Approximate allocation:

- 3 matches for 1–1–2
- 3 matches for 2–1–1
- 3 matches for 3–0–1
- 1 uncertainty-resolution match

---

## Week 3 — Validation

Run the refined champion from each formation through the original 3 × 3 matrix again.

Total:
- 9 comparison matches
- 1 repeatability match

This produces:

**baseline → diagnosis → intervention → validation**

---

# Champion / Challenger Promotion Logic

A challenger should be promoted only when:

1. **Execution is at least as reliable as the champion.**
2. **Results improve or remain competitive against the same opponent.**
3. **Supporting evidence does not reveal a hidden structural problem.**
4. **The improvement survives a repeat test when the result is close or surprising.**

A formation should not be declared superior merely because it won a single match.

---

# Tactical Knowledge vs Prompt Wording

The object being optimized is the **role specification**, not the prose prompt.

Use this sequence:

**Role hypothesis → prompt implementation → observed behavior → tactical diagnosis → revised role hypothesis → prompt revision**

This avoids confusing:
- football/tactical quality,
with
- prompt-engineering quality.

---

# Final Role-Contract Stage

Before writing final prompts, create a validated role contract for every agent in every formation.

There will be 15 role contracts:

| Formation | GK | DEF | MID | FOR1 | FOR2 |
|---|---|---|---|---|---|
| 1–1–2 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 2–1–1 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 3–0–1 | ✓ | ✓ | ✓ | ✓ | ✓ |

Each role contract should contain:

- primary responsibility,
- in-possession responsibilities,
- out-of-possession responsibilities,
- attacking-transition behavior,
- defensive-transition behavior,
- teammate relationships,
- decision priority,
- known anti-patterns,
- formation-specific duties,
- model/latency considerations,
- evidence supporting the rule.

Only after these contracts are validated should they be converted into final natural-language agent prompts.

---

# Final Prompt Criteria

The eventual agent prompts should be:

- self-contained,
- formation-specific,
- role-specific,
- ordered by decision priority,
- based on observed engine behavior,
- free of contradictory instructions,
- short enough for reliable reasoning,
- explicit about known failure modes,
- compatible with confirmed engine capabilities only.

Do not invent:
- unsupported actions,
- coordinates,
- numerical thresholds,
- communication systems,
- memory,
- physics assumptions,
- output formats.

---

# Key Operating Principle

The most important distinction in the project is:

> **If execution fails, refine the instruction.  
> If execution succeeds but the football fails, refine the tactic.**

The engine—not football theory—is the final judge.

---

# Next Data to Collect

Highest-value inputs for the next stage:

1. formation-preview screenshots,
2. setup export JSON,
3. exact deployed prompts,
4. exact model used by each player,
5. legal-action/state/output documentation,
6. fitness-test results,
7. latency/failure data,
8. detailed match reports,
9. replay/video from matches,
10. at least one match against each benchmark opponent for each formation.

The first major analysis milestone is the **9-match 3 × 3 formation matrix**.

Do not produce the final 15 prompts before analyzing that evidence unless the objective explicitly changes.
