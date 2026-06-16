# The Physics of Software Engineering

**by Elon Musk**

---

## The Axioms (Non-Negotiable)

1. **The laws of the system are the law. Everything else is a recommendation.** Latency, CAP, entropy, cache coherence, big-O, the cost per call — these do not negotiate. Framework choice, file structure, service boundaries, roadmap — all negotiable.
2. **Reasoning by analogy is poison.** "That's how every service does it" gets you 10% better. First principles get you 10x. Drop to the actual primitives — requests, bytes, processes, storage — and reason up.
3. **Your requirements are dumb.** Every requirement in a spec, ticket, or legacy comment must have a human name attached, not a department. If nobody owns it, delete it.
4. **The best part is no part.** In software, the "part" may be code, a service, a queue, a flag, or an abstraction boundary. If you are not adding ~10% of deleted parts back, you did not delete enough.
5. **Do not optimize what should not exist.** Deletion runs before simplification. Simplification runs before speed. Speed runs before automation.
6. **Local maxima are traps.** Climbing the current architecture faster will never reach the next one. Sometimes you must tear out the ORM, collapse the microservice, or reach into the layer below to reach a better global design.
7. **The pipeline is the product.** The build graph, CI, deploy, local dev loop, and test harness are the thing. Engineer the system that produces the system first.
8. **Vertical integration beats the Idiot Index.** When `vendor_price / do_it_yourself_cost` is large, the layer is lying to you. Rewrite the layer or replace the vendor.
9. **Forcing functions collapse the decision tree.** A deprecation date, a feature-flag cutover, a deleted fallback — these focus the mind in ways no planning meeting can.

---

## The Algorithm

Every engineering problem, in order. Do not skip steps. Do not reorder.

1. **Make the requirements less dumb.** Attach a name to every constraint. Go to the person. Ask why. Expect half to not remember. Delete what cannot justify itself. Requirements from smart people are the most dangerous — you are less likely to question them.
2. **Delete the part or process.** Try to remove the module, the flag, the abstraction, the service, the queue, the build step, the migration, the config. If removal breaks nothing important, it is gone. If you never have to add anything back, you are not deleting hard enough.
3. **Simplify and optimize.** Only now. The most common error of a smart engineer is to optimize a thing that should not exist.
4. **Accelerate cycle time.** Once the design is right, attack the feedback loop: build, test, deploy, repro, rollback. Cut each in half. Then cut it again.
5. **Automate last.** Automation amplifies whatever process you have. Automating a bad process produces bad artifacts faster and makes the process harder to change.

---

## The Idiot Index

$$\text{Idiot Index} = \frac{\text{Cost of the current layer}}{\text{Cost of the primitive it wraps}}$$

Concretely, in software:

- `vendor_price / do_it_yourself_cost` — a SaaS tool for what a fifty-line Worker does.
- `framework_cost / primitive_cost` — a batteries-included framework for what a plain HTTP handler would do.
- `lines_of_abstraction / lines_of_actual_work` — a wrapper around a wrapper around a library call.
- `latency_added / latency_required` — a service hop that doubles the p95 for no correctness reason.

A high Idiot Index is not a procurement problem. It is a signal. Either the layer is inefficient, the market is gouging, or — most often — the component exists inside someone else's local maximum and can be redesigned from scratch.

Do not outsource the critical path.

---

## Beware the Local Maximum

A heroic optimization on a fundamentally wrong architecture still lands you on a small hill.

- A hand-tuned query plan on a schema that should never have been normalized that way.
- A cache layer bolted on top of a write path that should have been rewritten.
- A microservice boundary that matches the org chart instead of the data's actual joins.
- A framework version you cannot upgrade because of three bespoke hacks that should be deleted.
- A monitoring dashboard that measures the wrong thing beautifully.

The question is never "is this better than what we had?" It is **"is this on the right mountain?"** If the answer is no, stop optimizing. Start over. The first version of the rewrite will look worse. That is expected. Global maxima require going through a valley.

---

## Build the Pipeline First

The feature is the output. The pipeline is the product.

- A brilliant feature produced by a slow, fragile CI is a fragile feature.
- The local dev loop, the build graph, the deploy script, the test harness, the rollback path — these are the thing.
- If the pipeline is worse than the output, the output will not survive contact with reality.
- When you are about to ship something, ask: "Has the thing that produces this gotten better, or just the thing itself?" If only the thing, you are accumulating debt.

---

## Accept Reality. Then Change It.

Things are the way they are. The question is not "why is this framework / platform / API so bad?" The question is **"what is the next best step?"** A simpler module. A deleted abstraction. A rewritten query. A forced deprecation date.

Negative feedback is the only actionable feedback. In code review, design review, and incident review: ask what is broken, not what is good. Trust the reviewer who says the design is wrong over the reviewer who says it looks great.
