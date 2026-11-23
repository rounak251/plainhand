// Deterministic fixes that are safe without reading context. Runs after
// sloptrim's character-layer clean. Code (fenced, indented, inline) is skipped.

const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|(?:^|\n)(?: {4}|\t)[^\n]*)/g;

const OPENERS = /^\s*(?:great question|good question|certainly|of course|absolutely|sure(?: thing)?|excellent question)[!.,]\s*(?:here(?:'s| is) (?:a|an|the) [^.\n]*?[.:]\s*)?/i;
const CLOSERS = [
  /\s*I hope (?:this|that) helps[^.!\n]*[.!]?/gi,
  /\s*(?:Let me know|Feel free to (?:let me know|reach out|ask))[^.!?\n]*[.!?]/gi,
  /\s*(?:Would you like|Do you want) me to [^?\n]*\?/gi,
  /\s*Happy (?:writing|coding|to help)[!.]/gi,
];
const PHRASES = [
  [/\b[Ii]t(?:'s| is) (?:worth noting|important to note|worth mentioning) that\s+(\w)/g, (_, c) => c.toUpperCase()],
  [/\b(Additionally|Furthermore|Moreover),\s/g, "Also, "],
  [/\bin order to\b/g, "to"],
  [/\b[Uu]tiliz(e|es|ed|ing)\b/g, (m, s) => (m[0] === "U" ? "U" : "u") + ({ e: "se", es: "ses", ed: "sed", ing: "sing" })[s]],
  [/\bdue to the fact that\b/g, "because"],
  [/\bat this point in time\b/g, "now"],
  [/\bIn today's (?:fast-paced|digital|ever-changing|modern) (?:\w+ )?(?:world|landscape|age|era),\s*(\w)/g, (_, c) => c.toUpperCase()],
];

function fixProse(s) {
  s = s.replace(/[“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'");
  s = s.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2");               // 3–5 -> 3-5
  s = s.replace(/\s+[—–]\s+|\s+--\s+/g, ", ");                 // spaced dash -> comma
  s = s.replace(/(\w)[—](\w)/g, "$1, $2");                          // word—word
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "$1").replace(/__([^_\n]+?)__/g, "$1");
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  return s;
}

export function ruleClean(text) {
  const parts = text.split(CODE);
  let out = parts.map((p, i) => (i % 2 ? p : fixProse(p))).join("");
  out = out.replace(OPENERS, "");
  for (const re of CLOSERS) out = out.replace(re, "");
  out = out.replace(/,\s*,/g, ",").replace(/ {2,}/g, " ").replace(/\n{3,}/g, "\n\n");
  return out.replace(/^\s+/, "").replace(/\s+$/, "");
}
