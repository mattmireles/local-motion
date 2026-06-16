# Every Detail Is a Decision

## The Ten Commandments of Interface Design

1. **Care is the foundation.** Every decision — spacing, copy, timing — communicates respect or indifference. There is no neutral.
2. **Simplicity is earned, not applied.** Start with the full complexity of the problem. Refine until the solution feels inevitable.
3. **The interface must disappear.** The user came to do something. Every element that doesn't serve that task is an obstacle.
4. **Never wag your tail.** Design that calls attention to itself is insecurity, not confidence. Be deferential. Recede.
5. **Different is easy. Better is hard.** Genuine improvement means less friction, less confusion, less cognitive load.
6. **Distrust the static.** An interface only exists in motion — in transitions, responses, and the moments between states.
7. **Respect the medium.** Digital interfaces exist on glass and light. Use translucency, motion, and typography as native materials. Don't simulate physical ones.
8. **Design for context.** A workspace demands density. A mobile experience demands sequential flow. Never apply identical treatment to different contexts.
9. **Embrace failure.** Explore multiple approaches before committing. If every attempt succeeds, you aren't pushing hard enough.
10. **Own the consequences.** Confusion and frustration are design failures, not user failures.

---

### Show Care in Every Detail

- Spacing, alignment, and type hierarchy are not cosmetic — they signal that someone thought about this
- Placeholder copy, unfinished states, and missing edge cases signal carelessness instantly
- Micro-interactions — hover, focus, loading feedback — are where care is most visible and most often absent

### Earn Simplicity

- Empty is not simple. It is barren
- The user should see exactly what they need at the moment they need it — no more, no less
- Progressive disclosure: surface the essential, make the rest reachable but not visible
- Clutter is usually a structural problem (competing priorities), not a visual one (insufficient whitespace)

### Make the Interface Disappear

- If a user notices the interface — admires a gradient, puzzles over a control — something has gone wrong
- Content dominates the viewport. Chrome whispers
- A beautiful interface that doesn't work intuitively is ugly. Beauty without function is a lie

### Design in Motion

- Every state needs a design: empty, loading, partial, complete, error, offline
- Transitions communicate spatial relationships and causality — "where did that come from?" and "where did it go?"
- Latency should feel like transformation, not waiting. Materialize structure immediately; let content arrive into it
- Quality lives in the seams between states, not in any single screenshot

### Respect the Digital Medium

- CSS, motion, and light are your native materials
- Translucency, blur, and layering create authentic depth. Fake textures do not
- Typography is the primary structural material. Treat it with architectural rigor

### Design for Context

- **Focused work**: high density, persistent navigation, multi-pane layouts, keyboard shortcuts
- **Mobile**: sequential flow, one action per screen, large touch targets, minimal depth
- **Reading**: content fills the viewport, controls recede, typography does all the work
- Never "go responsive" by reflowing the same elements. Each context deserves its own thinking

### Design for Probabilistic Systems

- AI outputs are not deterministic. The interface must make this visible, not hide it
- Show what the system did, why, and how to adjust it. Transparency is not optional
- Design for collaboration, not command. The user guides; the system proposes
- Confidence indicators, editable outputs, easy undo. Never present probabilistic results with false certainty