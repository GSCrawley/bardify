// Generational Translator sanity tests — run: node lib/generational.test.mjs
import { toEra, scoreAttempt, neutralize } from "./generational.js";
import { ERAS } from "./generations.js";

let failures = 0;
const check = (name, cond) => {
  if (!cond) { console.error("FAIL:", name); failures++; }
  else console.log("ok:", name);
};

const FOLGER_HAMLET = "To be or not to be— that is the question: Whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune";

// every era renders deterministically and differently from the source
for (const era of ERAS) {
  const a = toEra(FOLGER_HAMLET, era.id, { density: 1 });
  const b = toEra(FOLGER_HAMLET, era.id, { density: 1 });
  check(era.id + ": deterministic", a.text === b.text);
  check(era.id + ": renders at all", a.text.length > 20);
}
// eras sound different from each other on a slang-rich line
const slangy = "Good morrow, my great friend! Thou art a villain and a fool, forsooth.";
const renders = ERAS.map((e) => toEra(slangy, e.id, { density: 1 }).text);
check("6 distinctive era voices", new Set(renders).size === 6);

// no double-replacement: phrase output words must not be re-swapped ("good morrow"->"oh hi" must not become "oh oh hi")
check("no double-swap (good morrow)", !toEra("Good morrow and thanks, my friend.", "millennial", { density: 1 }).text.includes("oh oh"));
check("no double-swap (thanks)", !toEra("Good morrow and thanks, my friend.", "millennial", { density: 1 }).text.includes("omg omg"));

// tier filter: tier-1 entries fall back to neutral when tier=0
const t0 = toEra("That is cool and fake, you poor soul.", "genz", { tier: 0 });
check("tier-0 keeps it school-safe", !/drippy|sus|broke/i.test(t0.text));
const t1 = toEra("That is cool and fake, you poor soul.", "genz", { tier: 1 });
check("tier-1 unlocks era flavor", t1.text !== t0.text);

// fidelity scoring: a faithful attempt beats gibberish, anchors are detected in any era
const good = "to live or not, that is the real question fr — do we take the Ls fr from karma's drama";
const sGood = scoreAttempt(FOLGER_HAMLET, good, "genz");
const sBad = scoreAttempt(FOLGER_HAMLET, "errr nothing relevant at all", "genz");
check("faithful attempt scores high", sGood.score >= 50 && sGood.kept.length >= 2);
check("gibberish scores ~0", sBad.score === 0);
check("neutralize catches era slang as anchors", neutralize("took the L, no cap").has("lose") || neutralize("took the L, no cap").has("true"));

// genalpha renders go lowercase
const ga = toEra("Hark! The Fool approaches with Fortune.", "genalpha", { density: 1 });
check("genalpha lowercases", ga.text.charAt(0) === ga.text.charAt(0).toLowerCase());

if (failures) { console.error(failures + " failures"); process.exit(1); }
console.log("all generational tests passed");
