# HiveCAD Target Architecture

> **Status:** accepted plan, not yet implemented.
> Describes where the codebase is going and why. For what exists *today*, read
> [ARCHITECTURE.md](./ARCHITECTURE.md) — note that its §4 (code as single source of
> truth) and §8 (code execution pipeline) are superseded by this document once
> Stage 3 lands.

---

## 0. The one-paragraph summary

The document stops being a JavaScript string and becomes a typed object graph.
Code becomes a *view* of that graph, plus an escape hatch (`Script` features).
We keep replicad, but we own the operation layer, so we can read OpenCascade's
`Modified`/`Generated` history and build a FreeCAD-style ElementMap — which is
what finally makes face and edge references survive a model edit. Projects are
stored as a directory of diffable files, not a code blob, so the existing git
sync keeps working and shared models can be *viewed* without executing their
author's code.

---

## 1. What is actually wrong today

Ordered by how much they block everything else.

**W1 — The document is a JavaScript string.** `code: string` is the source of
truth (`store/slices/objectSlice.ts`). Object identity is a JS variable name,
assigned by `__record(varName, shape)` in `code-manager.ts`. Feature type is
recovered by string-sniffing (`lastOpName.includes('box')`). JavaScript is
Turing-complete, so the feature graph is not statically recoverable — the guessing
is not a bug in `mapFeatures()`, it is forced.

**W2 — There is no stable topological naming.** Selections are `"shape1:face-0"`,
where `0` is the index into `Array.from(shape.faces)` at mesh time
(`workers/replicad-worker.ts`). That is OCCT's explorer order; it reshuffles
whenever feature history changes. The index is then baked into generated code as
`getFace(solid, faceIndex)`.

**W2a — The module built to fix W2 is dead code.** `src/lib/topology/` (~180 KB)
generates `selectFace(obj, { stableId })` calls. `selectFace` is defined nowhere
in the worker, and nothing outside `lib/topology/index.ts` and its own tests
imports the generator. Only `ReferenceManager` is wired, into
`ReferenceRepairDialog` / `ReferenceIndicator`. We ship a reference-repair UI over
a naming system that never runs.

**W3 — replicad discards the history we need.** `_3DShape.fuse()` builds a
`BRepAlgoAPI_Fuse` inside a `GCWithScope()` and frees it at the end of the call.
`Modified()`/`Generated()` are computed by OCCT and thrown away. It also calls
`SimplifyResult(true, true, 1e-3)` afterward, silently.

**W4 — Incremental regeneration is fake.** `objectSlice.runCode()` computes
`plan.toExecute` / `plan.toCache` via `dependency-graph.ts`, then posts the
**entire** `executableCode` to the worker anyway. `mergeExecutionResults` only
backfills meshes for features `main()` didn't return. Zero kernel time saved; it
can resurrect stale ghost objects. Every tool click, undo, and history step
recomputes the whole model.

**W5 — The worker pool makes W4 unfixable.** `WorkerPool` spawns
`navigator.hardwareConcurrency || 4` workers, each initializing its own 10.8 MB
OCCT. OCCT shapes are C++ heap objects that cannot cross a worker boundary, and
tasks dispatch to whichever worker is idle — so consecutive runs land in different
kernel contexts. **There is nowhere to cache a shape.** The pool also buys
nothing: OCCT is single-threaded per instance and the workload is one serial
script.

**W6 — `replicad_single.wasm` is the exceptions-disabled build.** A fillet OCCT
cannot resolve *traps* rather than throwing a catchable error, killing the WASM
instance. `WorkerPool` registers no `onerror` and no timeout, so the promise never
settles and the UI hangs. This is why fillet/chamfer/shell cannot ship today even
though replicad implements all three.

**W7 — No B-Rep persistence.** `ProjectSnapshot` is `{ code, objects, sketches }`.
Opening a project re-executes the script. Viewing a *shared* project executes a
stranger's JavaScript. `Shape.serialize()` / `deserializeShape()` exist in replicad
and are unused.

**W8 — Sketches have two sources of truth.** `generateSketchCode` bakes *solved
literal coordinates* into the script; the constraints live only in the `sketches`
Map plus planegcs state. There is no path from code back to constraints.
Same disease: `CADObject.position/rotation/scale` are reset to `[0,0,0]`/`[1,1,1]`
on every `runCode` — dead fields.

**W9 — Imports are base64'd into the source.** A STEP import becomes
`const importedSTEPRaw = "<base64>"` inside `main()`. A 50 MB STEP → ~67 MB string
literal, re-parsed by Babel on *every* `new CodeManager(code)` (i.e. every tool
call), snapshotted into up to 50 history entries, and pushed to git.

**W10 — `new Function(code)` with no isolation.** The worker shares our origin:
`fetch`, IndexedDB, and under Tauri whatever the webview exposes. We have a public
gallery.

**W11 — Missing ops we already have.** No fillet, chamfer, shell, loft, sweep,
draft. replicad ships all of them plus `EdgeFinder`/`FaceFinder`. We are blocked by
W2 and W6, not by the kernel.

**W12 — Assembly is orphaned.** `AssemblySlice` is commented out of `CADState`;
`AssemblySolver` is unwired. No units, no expressions.

---

## 2. What we take from FreeCAD (and what we deliberately don't)

FreeCAD solved our problems. The value is **not** the XML — that's an
implementation detail, and JSON gives us every property that matters. The value is
four things:

1. **The container.** Parametric definition, view state, and computed shape are
   three separate artifacts. Headless mode reads only the definition.
2. **The property system.** `Document → DocumentObject → Property`, each typed and
   self-serializing. This is *why* FreeCAD gets undo, save, scripting, and
   generated UI for free.
3. **The DAG.** Typed dependencies, a `touched` set, recompute propagating only
   downstream of what changed.
4. **ElementMap.** `TopoShape = TopoDS_Shape + Tag + ElementMap + StringHasher`.
   Two parallel naming schemes: `IndexedName` (`Face1`, volatile, OCCT's index) and
   `MappedName` (`;MGFace1;:H1,F`, stable, encodes derivation history). After each
   operation a `MapperMaker` walks the builder's `Modified`/`Generated` maps and
   composes input names into output names.

**The critical detail: FreeCAD does not use OCAF/TNaming for this.** ElementMap is
hand-rolled on `BRepBuilderAPI` history. Our WASM build exports zero `TNaming`
symbols — but it *does* export `BRepTools_History`, `BRepAlgoAPI_*`,
`BRepFilletAPI_*`, and `Modified`/`Generated`/`IsDeleted` (31 matches in
`replicad_single.d.ts`). **The exact layer FreeCAD built is the layer we can port,
on the binary we already ship.**

**We do not port FreeCAD.** ~1M lines of C++/Qt/Python, no WASM port exists. The
only piece anyone successfully extracted is planegcs — which we already use. We
steal the model, not the codebase.

**We also do not copy their container.** See D6.

---

## 3. Accepted decisions

| # | Decision | Choice | One-way door? |
|---|---|---|---|
| D1 | Source of truth | Document graph + `Script` feature escape hatch | **Yes** |
| D2 | Kernel | Keep replicad; own the op layer via `getOC()` | No |
| D3 | Naming | ElementMap primary; signatures for repair; Finders in script view | No |
| D4 | Workers | One stateful kernel worker | No |
| D5 | B-Rep persistence | Selective: imports + tip objects | No |
| D6 | Storage layout | Git-native directory of files | **Yes** |
| D7 | Undo | Immer patches, mutations expressed as commands | No |
| D8 | Sketches | Sketch is a DocumentObject; constraints are truth | No |
| D10 | Units/expressions | Decide representation now, implement later | **Yes** |

### D1 — Document graph is truth; the script is a view

The problem was never *code as truth*. It was **JavaScript** as truth. OpenSCAD
and Zoo's KCL succeed with code-as-truth because they own a constrained language.
FreeCAD succeeds because the document is data and Python is a driver, never the
file. The middle position — arbitrary JS *is* the file — is the one that doesn't
work.

So: the typed `DocumentObject` graph is truth. The script view is generated from
it. And a `Script` feature is a first-class object type whose property is a JS body
producing a shape, treated as an **opaque node in the DAG with declared inputs**.
This is FreeCAD's scripted-object hatch. It preserves the thing we care about —
dropping into code — without making the whole document a program.

**Consequence (important):** untrusted JS now travels *inside* shared documents.
See D9.

### D2 — Keep replicad, own the operation layer

Write a thin `ops/` module. Each operation constructs its own `BRepAlgoAPI_*` /
`BRepFilletAPI_*`, calls `Build()`, reads `Modified()`/`Generated()`/`IsDeleted()`
**before the builder dies**, and returns `{ shape, history }`. `getOC()` gives us
raw OCCT; replicad's exported `cast()` brings us back to ergonomic shapes.

We keep replicad for everything else — `Drawing`, `Sketcher`, `Finder`, exporters
are good and rewriting them is waste.

Two things this forces us to own:
- **OCCT memory.** Builders and intermediate shapes need explicit `delete()` /
  scoped cleanup. replicad was doing this for us.
- **Simplification policy.** replicad's `SimplifyResult(true, true, 1e-3)` merges
  faces after `Build()`, which perturbs history mapping. Simplification becomes an
  explicit per-op decision, not an invisible default.

Rejected: forking replicad (maintenance burden, or blocked on upstream); swapping
to [occt-wasm](https://github.com/andymai/occt-wasm) now (rewrites every tool *and*
the sketch layer, and leaves us with no naming, no document model, no incremental
regen afterward).

**The op layer is the seam that makes a later kernel swap cheap.** occt-wasm —
native WASM exceptions, structured `OcctError` codes, ~4.5 MB brotli, history
exposed by design — remains the obvious future home. Build the seam first.

**Immediately and independently: switch to `replicad_with_exceptions.wasm`.**
Cost ~8.4 MB uncompressed (~3–4× smaller over the wire). We currently load 4–16
copies of the *smaller* binary, so D4 more than pays for it. Without this, fillet
cannot ship.

### D3 — ElementMap primary, signatures for repair, Finders for authoring

- **Geometric signature matching alone fails exactly where it matters.** A cube's
  six faces have identical area and edge count. `signaturesMatch`'s 0.7 confidence
  threshold is a coin flip on symmetric geometry.
- **Declarative selectors** (replicad `Finder`, CadQuery-style) are robust to
  history edits by construction and excellent for scripting — but there is no
  natural query for "I clicked *that* face", and adding a second face parallel to
  XY silently breaks "the face parallel to XY".
- **ElementMap** is exact and survives feature insertion. Cost: every op must be
  wrapped (D2), and names grow, so we need a string hasher.

Therefore: ElementMap is *the reference*. Geometric signatures stop being the
naming system and become what they're actually good at — ranked repair suggestions
feeding the `ReferenceRepairDialog` we already built. Finders are exposed in the
script view for power users.

**Honest limit:** no naming system saves us when a sketch edit makes the filleted
edge genuinely cease to exist. That is a repair-UX problem, and FreeCAD has the
same residue. Our repair dialog is the right answer — it just needs a naming system
underneath that is right 95% of the time instead of 60%.

### D4 — One kernel worker

It owns OCCT, the shape store (`Map<featureId, TopoDS_Shape>`), and meshing.

The tempting design is "one stateful kernel worker + a pool of stateless mesh
workers." Reject it: meshing needs the `TopoDS_Shape`, which lives in the kernel
worker's heap. Shipping it out means serializing to BREP and re-parsing — likely
more expensive than meshing in place.

Add a second worker only when profiling demands it, and add it for **import
parsing** (genuinely stateless — takes bytes) before meshing.

Reject `SharedArrayBuffer` + pthreads OCCT: requires COOP/COEP headers, which break
embedding and complicate Tauri, for threading OCCT barely uses.

### D5 — Persist B-Rep selectively

FreeCAD stores a `.brp` for every object. We should not — BREP is verbose and a
fillet-heavy solid runs to megabytes.

Persist B-Rep for:
1. **Imported geometry.** Never re-parse a STEP file. Ever. (Kills W9.)
2. **Tip objects** of the document.

Let intermediates recompute. Use `Shape.serialize()`, which replicad already
exposes.

The real prize is not faster opens — it is **view without execute**. The discover
feed currently requires running a stranger's JavaScript to see their model.

### D6 — A directory, not an archive

FreeCAD's `.FCStd` is a zip. **A zip is the wrong choice for us**, for a reason
specific to our stack: `QuickStore` is *git* (local git on Tauri, in-memory git on
web) and `RemoteStore` is GitHub. A zip is an opaque blob to git — no deltas, the
whole file rewrites on every save, history balloons.

```
project/
  document.json          # parametric definition — diffable
  gui.json               # view state (cf. GuiDocument.xml)
  shapes/<id>.brep       # selective, per D5
  elementmap/<id>.json   # hashed names, kept out of document.json
  blobs/<sha256>.step    # content-addressed imports
  thumbnail.png
```

Git diffs each file independently. Content-addressed blobs dedupe and never
rewrite. Export a `.hive` zip only for download and interchange, where a single
file actually matters.

**Diffability constraints this imposes on `document.json`:** stable key ordering,
no volatile fields (no `Date.now()` timestamps in serialized state), ids rather
than array indices for cross-references.

Understanding *why* FreeCAD chose a zip — they predate git-native sync and optimize
for a single desktop file — is what tells us not to.

### D7 — Undo via patches, mutations via commands

Full snapshots (today, capped at 50) conflate "what changed" with "what is", and
with W9 that's a 67 MB string × 50.

Use Immer-style property patches — they fall out of the document graph for free.
But **express every mutation as a named command** from day one. Then a command
journal with inverses (FreeCAD's `Transaction`) is a refactor, not a rewrite. This
matters more than it looks: a command log is what CRDT/OT layers attach to, and
retrofitting one onto patch-based undo is painful.

### D8 — Sketch is a DocumentObject

Its properties *are* its geometry and constraints. planegcs runs during recompute.

One real design question inside this: constraint solving is nondeterministic — a
system can have several valid solutions. So **store constraints as truth, and cache
the last solved positions as the solver's initial guess.** Stable across reopens
without making solved coordinates authoritative.

### D9 — Extension API and sandboxing

Two concerns the current design conflates.

**Authoring:** once D1 lands, extensions emit **typed document operations**, not
code strings. No more Babel surgery in third-party code.

**Safety:** `new Function(code)` in a worker shares our origin. D1's `Script`
feature means untrusted JS now travels inside shared documents, so this is coupled,
not deferrable.

Policy:
- D5 solves the common case for free: a shared project with persisted B-Rep is
  **viewable without evaluating anything**.
- A `Script` feature in a document we do not own **never auto-executes on open.**
  Show the cached B-Rep; require an explicit "run".
- Real untrusted execution (community extensions, foreign `Script` features) needs
  an actual isolate: a sandboxed iframe with a locked CSP, or QuickJS-in-WASM.

### D10 — Decide representation now, build later

We don't need units this quarter. But the property type is a one-way door —
retrofitting units into `dimensions: Record<string, any>` after a thousand projects
exist is miserable.

- **Canonical internally** (mm, degrees — same as FreeCAD), with a `Quantity` type
  at the property boundary carrying the display unit.
- A property's value is `number | Expression` from the start, even if `Expression`
  is unimplemented and throws.

Both cost almost nothing now.

---

## 4. Target layering

```
Layer 5  Script view   generated from the document; `Script` features are DAG nodes
Layer 4  Recompute     topo-sort + touched-set; only dirty objects re-execute
Layer 3  Document      Document → DocumentObject → typed Property; LinkSub refs
Layer 2  ElementMap    MappedName ⇄ IndexedName, composed from op history
Layer 1  Operations    own the BRepBuilderAPI builder; return { shape, history }
Layer 0  Kernel        ONE worker; OCCT + persistent Map<featureId, TopoDS_Shape>
```

**The reference type.** `LinkSub = { objectId, subElements: MappedName[] }` is what
`"shape1:face-0"` should have been. Note the consequence: the generated script must
*render* LinkSubs into something executable — the kernel worker resolves
`LinkSub → TopoDS subshape` via the ElementMap. It does **not** execute a
`selectFace(...)` call in user code. That path (`topology/CodeGeneration.ts`) is
deleted.

---

## 5. Migration sequence

Ordered by payoff over risk, not by layer number.

### Stage 0 — Unblock (days, low risk, no model changes)
- Collapse `WorkerPool` to a single kernel worker. *(W5)*
- Switch to `replicad_with_exceptions.wasm`. *(W6)*
- Add `worker.onerror` and a per-task timeout so a kernel trap surfaces as an error
  instead of a hang. *(W6)*
- Stop base64-embedding imports; write them to `blobs/<sha256>` and reference by
  id. *(W9)*

Touches nothing in the document model. Stops the bleeding.

### Stage 1 — Real incremental regeneration
- Add the `ops/` layer (D2) and the persistent shape store in the kernel worker.
- `EXECUTE` becomes `RECOMPUTE(dirtyIds)`.
- The existing `dependency-graph.ts` plan is finally honored. *(W4)*

### Stage 2 — Naming
- ElementMap composed from op history (D3). *(W2, W3)*
- Selections become `MappedName`s; `getFace(solid, index)` is deleted.
- **Fillet, chamfer, shell, and loft become shippable.** *(W11)*

Disposition of `src/lib/topology/`:
- **Keep** `TopologyReference`, `ReferenceManager`, and the repair UI.
- **Delete** `CodeGeneration.ts` and the `selectFace` path.
- **Rewrite** `StableId` around `MappedName`; demote `GeometricSignature` to
  repair-suggestion input.

### Stage 3 — Document model
- Typed properties; `Document → DocumentObject → Property` (D1, D10). *(W1)*
- `code` becomes generated output; `Script` becomes a feature type.
- Undo becomes patches + commands (D7).
- Save becomes the directory layout (D6) with selective B-Rep (D5). *(W7)*
- Supersedes ARCHITECTURE.md §4 and §8.

### Stage 4 — Constraints into the document
- Sketch becomes a DocumentObject; planegcs runs in recompute (D8). *(W8)*

### Stage 5 — The rest
- Assembly / external document references (`App::Link`-style). *(W12)*
- Units and expressions (D10 representation already in place).
- Sandboxed isolate for untrusted `Script` features and community extensions (D9).

---

## 6. Load-bearing summary

- **One-way doors:** D1 (source of truth), D6 (storage layout), D10 (property
  representation). Get these right; the rest are refactors.
- **Unblocks the most features:** D2 → D3. Owning the op layer gives history;
  history gives naming; naming ships fillet, chamfer, shell, loft.
- **Pure profit, no design cost:** D4 and the exceptions build. Days of work;
  removes a hang-forever failure mode and ~150 MB of resident WASM.

---

## 7. References

- [FreeCAD TopoShape & ElementMap](https://deepwiki.com/FreeCAD/FreeCAD/2.1-toposhape-and-topological-naming)
- [FCStd file format](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/File_Format_FCStd.md)
- [FreeCAD toponaming issue #8432](https://github.com/FreeCAD/FreeCAD/issues/8432)
- [Ondsel — toponaming fix phase 2](https://www.ondsel.com/blog/milestone-toponaming-fix-phase-2-done/)
- [occt-wasm](https://github.com/andymai/occt-wasm) · [brepjs](https://brepjs.dev/)
- [opencascade.js — wasm exceptions discussion](https://github.com/donalffons/opencascade.js/discussions/122)
- [replicad as a library](https://replicad.xyz/docs/use-as-a-library/)
