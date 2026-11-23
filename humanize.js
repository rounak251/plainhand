// Rule-based humanizer. Runs after sloptrim's character-layer clean and after
// every AI rewrite. Code (fenced, indented, inline) and URLs are never touched.
// Each rule targets a pattern from the humanizer skill / sloptrim catalogue.

const CODE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|https?:\/\/\S+|(?:^|\n)(?: {4}|\t)[^\n]*)/g;

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const matchCase = (src, rep) => (src && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? cap(rep) : rep);

// ---------------------------------------------------------------- vocabulary
// [regex source (word stem forms), replacement forms in the same order]
const VERBS = [
  ["leverag", ["use", "uses", "used", "using"]],
  ["utiliz", ["use", "uses", "used", "using"]],
  ["utilis", ["use", "uses", "used", "using"]],
  ["facilitat", ["help", "helps", "helped", "helping"]],
  ["foster", ["encourage", "encourages", "encouraged", "encouraging"]],
  ["enhanc", ["improve", "improves", "improved", "improving"]],
  ["empower", ["help", "helps", "helped", "helping"]],
  ["elevat", ["improve", "improves", "improved", "improving"]],
  ["harness", ["use", "uses", "used", "using"]],
  ["streamlin", ["simplify", "simplifies", "simplified", "simplifying"]],
  ["bolster", ["strengthen", "strengthens", "strengthened", "strengthening"]],
  ["underscor", ["show", "shows", "showed", "showing"]],
  ["showcas", ["show", "shows", "showed", "showing"]],
  ["garner", ["earn", "earns", "earned", "earning"]],
  ["delv", ["look", "looks", "looked", "looking"]],
  ["embark", ["start", "starts", "started", "starting"]],
  ["commenc", ["start", "starts", "started", "starting"]],
  ["revolutioniz", ["change", "changes", "changed", "changing"]],
];
// stem + (e|es|ed|ing|s|er|...) -> pick form by suffix
function verbForm(word, forms) {
  const w = word.toLowerCase();
  if (/ing$/.test(w)) return forms[3];
  if (/(ed)$/.test(w)) return forms[2];
  if (/(es|s)$/.test(w) && !/ss$/.test(w)) return forms[1];
  return forms[0];
}

const WORDS = [
  // phrase-level first (longest match wins by order)
  [/\b(crucial|pivotal|paramount|vital|critical) (importance|role)\b/gi, (m, a, n) => (n.toLowerCase() === "importance" ? "importance" : "central role")],
  [/\b(?:unlock(?:ing)?|reach(?:ing)?|realiz(?:e|ing)) (your|their|its|our|his|her) (?:full |true )?potential\b/gi, (m, p) => (/ing/.test(m.split(" ")[0]) ? "reaching " : "reach ") + p + " potential"],
  [/\b(has been|was|is|have been) nothing short of (?:transformative|remarkable|incredible|amazing|extraordinary)\b/gi, "$1 a big change"],
  [/\bnothing short of\s+/gi, ""],
  [/\bat your earliest convenience\b/gi, "when it suits you"],
  [/\bPlease (?:do not|don't) hesitate to (?:reach out|contact (?:me|us)|get in touch)[^.!\n]*[.!]/g, "Just reply here if you have questions."],
  [/\bI wanted to take a moment to\b/gi, "I wanted to"],
  [/\b(?:that|which) lie ahead\b/gi, "ahead"],
  [/\bnestled (?:perfectly |comfortably )?(?:in|on|within|among|into)\b/gi, (m) => "sitting " + m.split(" ").pop()],
  [/\bunparalleled\b/gi, "excellent"],
  [/\bthe ultimate\b/gi, "a"],
  [/\bregarding\b/gi, "about"],
  [/\bdelv(?:e|es|ed|ing) (?:deep(?:er|ly)? )?into\b/gi, (m) => verbForm(m.split(" ")[0], ["look into", "looks into", "looked into", "looking into"])],
  [/\bembark(?:s|ed|ing)? on (?:a|an|the|this|our|your) (?:\w+ )?journey (?:of|to|toward|towards)\b/gi, (m) => verbForm(m.split(" ")[0], ["start", "starts", "started", "starting"])],
  [/\bnavigat(?:e|es|ed|ing) the (?:complexities|intricacies|challenges) of\b/gi, (m) => verbForm(m.split(" ")[0], ["deal with", "deals with", "dealt with", "dealing with"])],
  [/\b(?:stands?|serves?) as a testament to\b/gi, (m) => (/s as/i.test(m) ? "shows" : "show")],
  [/\b(is|are|was|were) a testament to\b/gi, (m, v) => ({ is: "shows", are: "show", was: "showed", were: "showed" })[v.toLowerCase()]],
  [/\ba testament to\b/gi, "proof of"],
  [/\bplays? an? (?:crucial|key|pivotal|vital|significant|important|critical|central|major|instrumental) role in\b/gi, (m) => (/plays/i.test(m) ? "matters for" : "matter for")],
  [/\b(?:a|an) (?:rich |vibrant |intricate )?tapestry of\b/gi, "a mix of"],
  [/\bin the (?:ever[- ]evolving|ever[- ]changing|rapidly evolving|fast[- ]paced|dynamic) (?:world|landscape|realm|field) of\b/gi, "in"],
  [/\bin the realm of\b/gi, "in"],
  [/\bthe realm of\b/gi, "the field of"],
  [/\bwhen it comes to\b/gi, "for"],
  [/\ba (?:wide|broad|diverse|vast) (?:range|variety|array|spectrum) of\b/gi, "many"],
  [/\b(?:a )?(?:plethora|myriad|multitude) of\b/gi, "many"],
  [/\bmyriad\b/gi, "many"],
  [/\ba deep dive into\b/gi, "a close look at"],
  [/\bdeep dive\b/gi, "close look"],
  [/\bgame[- ]changer\b/gi, "big change"],
  [/\bgame[- ]changing\b/gi, "major"],
  [/\bparadigm shift\b/gi, "big change"],
  [/\bpivotal moment\b/gi, "turning point"],
  [/\bthe intricacies of\b/gi, "the details of"],
  [/\bintricacies\b/gi, "details"],
  [/\bin the heart of\b/gi, "in"],
  [/\b(?:serves|stands|acts|functions) as (a|an|the)\b/gi, (m, art) => "is " + art],
  [/\b(?:serve|stand|act|function) as (a|an|the)\b/gi, (m, art) => "are " + art],
  [/\bboasts\b/gi, "has"],
  [/\bboast\b/gi, "have"],
  [/\balign(s)? with\b/gi, (m, s) => (s ? "matches" : "match")],
  [/\baligned with\b/gi, "in line with"],
  [/\bresonat(?:e|es|ed|ing) with\b/gi, (m) => verbForm(m.split(" ")[0], ["appeal to", "appeals to", "appealed to", "appealing to"])],
  [/\bin order to\b/gi, "to"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bin spite of the fact that\b/gi, "although"],
  [/\bat this point in time\b/gi, "now"],
  [/\bprior to\b/gi, "before"],
  [/\bin close proximity to\b/gi, "near"],
  [/\bon a (?:regular|daily|weekly|monthly) basis\b/gi, (m) => ({ regular: "regularly", daily: "daily", weekly: "weekly", monthly: "monthly" })[m.split(" ")[2].toLowerCase()]],
  [/\ba (?:large|significant|substantial) number of\b/gi, "many"],
  [/\bthe vast majority of\b/gi, "most"],
  [/\bin terms of\b/gi, "for"],
  [/\bwith regard to\b/gi, "about"],
  [/\bfor all intents and purposes,?\s*/gi, ""],
  [/\bcould potentially\b/gi, "could"],
  [/\bmay potentially\b/gi, "may"],
  [/\bmight (?:possibly|potentially)\b/gi, "might"],
  [/\bcan potentially\b/gi, "can"],
  [/\bseamless(ly)?\s+/gi, (m, ly) => (ly ? "" : "smooth ")],
  [/\bmeticulous(ly)?\b/gi, (m, ly) => "careful" + (ly ? "ly" : "")],
  [/\b(crucial|pivotal|paramount|vital)\b/gi, "important"],
  [/\binnovative\b/gi, "new"],
  [/\bcutting[- ]edge\b/gi, "modern"],
  [/\btransformative\b/gi, "major"],
  [/\bmajor (?=change|shift)/gi, "big "],
  [/\bgroundbreaking\b/gi, "new"],
  [/\bmultifaceted\b/gi, "complex"],
  [/\bholistic\b/gi, "overall"],
  [/\bintricate\b/gi, "complex"],
  [/\binterplay\b/gi, "interaction"],
  [/\bvibrant\b/gi, "lively"],
  [/\bendeavou?r(s)?\b/gi, (m, s) => "effort" + (s || "")],
  [/\b(the|a|several|some|its|their|our|your|many|two|three|four|five|other) key (?!to\b|in\b|for\b)(\w)/gi, (m, d, c) => d + " main " + c],
  [/\bunlock(s|ed|ing)?\b/gi, (m, s) => "open" + (s || "") + " up"],
  [/\bensur(e|es|ed|ing) that\b/gi, (m, s) => ({ e: "make", es: "makes", ed: "made", ing: "making" })[s.toLowerCase()] + " sure"],
];

// sentence-start throat clearing: deleted, next word capitalized
const LEADINS = new RegExp(
  "(^|[.!?]\\s+|\\n\\s*)(?:" + [
    "At its core", "At the end of the day", "Ultimately", "In essence", "Essentially", "Fundamentally",
    "In conclusion", "In summary", "To sum up", "To summarize", "All in all", "Overall",
    "Importantly", "Notably", "Interestingly", "Crucially", "Simply put", "Put simply",
    "Needless to say", "As we all know", "As many of you (?:already )?know",
    "Here's the thing", "Here is the thing", "The thing is", "Let's be honest", "Let's face it", "Honestly", "Truth be told",
    "In today's (?:fast-paced |rapidly changing |ever-changing |modern |digital |interconnected )*(?:digital )?(?:world|landscape|age|era|society|environment)",
    "In an era (?:of|where|when) [^,]{3,60}", "In the world of [^,]{3,40}",
    "When it comes down to it", "With that (?:being )?said", "That being said", "That said",
    "Additionally", "Furthermore", "Moreover", "In addition",
  ].join("|") + ")[,:]\\s+(\\w)", "g");
const LEADINS_THAT = /(^|[.!?]\s+|\n\s*)(?:It(?:'s| is) (?:worth noting|important to note|worth mentioning|important to remember|crucial to understand|no secret|clear) that|It should be noted that|It goes without saying that|The (?:truth|reality|fact of the matter) is(?: that)?|The thing is(?: that)?)\s+(\w)/g;

// whole sentences that only stage or close
const DEAD_SENTENCES = [
  /(?:^|[ \t]+)(?:Let's|Let us) (?:dive|jump|delve) (?:in|into it|right in)[^.!?\n]*[.!?]/gim,
  /(?:^|[ \t]+)(?:Let's|Let us) (?:explore|break (?:it|this|that) down|take a (?:closer |deeper )?look)[^.!?\n]{0,60}[.!:]/gim,
  /(?:^|[ \t]+)Here's (?:what you need to know|why (?:it|this|that) matters|the (?:breakdown|kicker|deal))[.:!]/gim,
  /(?:^|[ \t]+)(?:The future (?:looks|is) (?:bright|promising)|Exciting times (?:lie|are) ahead|Only time will tell|The possibilities are (?:endless|limitless)|The sky's the limit)[^.!?\n]*[.!]/gim,
  /(?:^|[ \t]+)(?:And )?(?:That's|That is) (?:the real|what makes|why it) [^.!?\n]{0,60}(?:win|matters|special|powerful|different)[.!]/gim,
  /(?:^|[ \t]+)(?:Let that sink in|Read that again|Think about that)[.!]/gim,
  /(?:^|[ \t]+)[^.!?\n]{0,40}\bis a journey,? not a destination[.!]/gim,
];

const OPENERS = /^\s*(?:(?:great|good|excellent|fantastic) question|certainly|of course|absolutely|sure(?: thing)?)[!.,]\s*(?:(?:here(?:'s| is| are) (?:a|an|the|some|your) [^.\n]*?[.:]|I'd be (?:happy|glad) to help[^.\n]*[.!])\s*)?/i;
const CLOSERS = [
  /[ \t]*I hope (?:this|that|these) (?:helps|was helpful|gives you)[^.!\n]*[.!]?/gi,
  /[ \t]*(?:Let me know|Feel free to (?:let me know|reach out|ask))[^.!?\n]*[.!?]/gi,
  /[ \t]*(?:Would you like|Do you want) me to [^?\n]*\?/gi,
  /[ \t]*Happy (?:writing|coding|learning|to help)[!.]/gi,
  /^[ \t]*I hope (?:this|that) email finds you well[.!,]?[ \t]*\n?/gim,
];

// -ing rider bolted onto a finished clause: ", highlighting the importance of X." -> "."
const ING_RIDER = /,\s+(?:highlighting|underscoring|showcasing|emphasizing|symbolizing|reflecting|reinforcing|demonstrating|illustrating|signaling|cementing|solidifying|marking|paving the way for|setting the stage for|fostering|cultivating)\b[^.!?\n]{0,140}(?=[.!?])/gi;

// "X isn't just A, it's B" -> "X is B";  "not only A but also B" -> "A and B"
const CONTRASTS = [
  [/\b(is|are|was|were)n't (?:just|merely|only|simply) (?:about )?[^,.;:\n—–]{1,70}?\s*(?:[,.;:—–]|--)\s*(?:it|they|this|that|he|she)(?:'s|'re| is| are| was| were)\s+(about\s+)?/gi, (m, v, ab) => v + " " + (ab || "")],
  [/\b(It|This|That)(?:'s| is) not (?:just|merely|only|simply) (?:about )?[^,.;:\n—–]{1,70}?\s*(?:[,.;:—–]|--)\s*(?:it|this|that)(?:'s| is)\s+(about\s+)?/gi, (m, s, ab) => s + "'s " + (ab || "")],
  [/\b(But |And )?here's the thing:\s*(\w)/gi, (m, c, w) => (c ? c : "") + (c ? w : w.toUpperCase())],
  [/\bnot (?:just|merely|only) ([^,.;:\n—–]{2,60}?),?\s+but (?:also )?/gi, "$1 and "],
  [/,\s+no (?:guessing|waste|wasted motion|hassle|fluff|stress|jargon|exceptions)(?: required| needed)?(?=[.!])/gi, ""],
];

const SOFT = [[/\brobust\b/gi, "strong"], [/\bcomprehensive\b/gi, "full"], [/\blandscape\b/gi, "field"], [/\bvaluable\b/gi, "useful"], [/\btruly\s+/gi, ""]];

const CONTRACTIONS = [
  [/\bdo not\b/g, "don't"], [/\bdoes not\b/g, "doesn't"], [/\bdid not\b/g, "didn't"],
  [/\bis not\b/g, "isn't"], [/\bare not\b/g, "aren't"], [/\bwas not\b/g, "wasn't"], [/\bwere not\b/g, "weren't"],
  [/\bcannot\b/g, "can't"], [/\bwill not\b/g, "won't"], [/\bwould not\b/g, "wouldn't"],
  [/\bshould not\b/g, "shouldn't"], [/\bcould not\b/g, "couldn't"], [/\bhas not\b/g, "hasn't"], [/\bhave not\b/g, "haven't"],
  [/\b([Ii]t|[Tt]hat|[Tt]here|[Ww]hat|[Hh]ere) is (?=(?:a|an|the|not|no|also|still|just|easy|hard|why|how|what|where|when|\w+ing|\w+ed)\b)/g, "$1's "],
  [/\b([Tt]hey|[Ww]e|[Yy]ou) are (?=\w)/g, "$1're "],
  [/\b([Ww]e|[Yy]ou|[Tt]hey|I) will (?=\w)/g, "$1'll "],
  [/\b([Ww]e|[Yy]ou|[Tt]hey|I) have (?=(?:been|got|done|made|seen|had|to|already|never|just)\b)/g, "$1've "],
  [/\bI am\b/g, "I'm"], [/\b([Ll])et us\b/g, "$1et's"],
];

function properNouns(text) {
  // words written Capitalized mid-sentence in body lines are treated as names
  const set = new Set();
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line) || (line.match(/\S+/g) || []).length <= 6) continue;
    const body = line.replace(/^\s*[-*]\s+[^:]{1,60}:/, "");
    for (const m of body.matchAll(/(?<=[a-z,;]\s)([A-Z][a-z]+)/g)) set.add(m[1]);
  }
  return set;
}
function sentenceCase(label, proper) {
  let first = true;
  return label.replace(/[A-Za-z][\w'-]*/g, (w) => {
    const out = w.split("-").map((seg, k) =>
      (first && k === 0) || !/^[A-Z][a-z]+$/.test(seg) || proper.has(seg) ? seg : seg.toLowerCase()).join("-");
    first = false;
    return out;
  });
}
const isTitleCase = (label) => {
  const ws = label.match(/[A-Za-z][\w'-]*/g) || [];
  const caps = ws.filter((w) => /^[A-Z]/.test(w)).length;
  return ws.length >= 2 && caps >= Math.max(2, Math.ceil(ws.length * 0.6));
};
function fixHeadings(text, original) {
  const proper = properNouns(original);
  return text
    .replace(/^(#{1,6}\s+)(.+)$/gm, (m, h, body) => h + (isTitleCase(body) ? sentenceCase(body, proper) : body))
    .replace(/^(\s*[-*]\s+)([^:\n]{2,60})(:\s)/gm, (m, b, label, c) => b + (isTitleCase(label) ? sentenceCase(label, proper) : label) + c)
    .replace(/^([A-Z][\w'-]*(?: [A-Za-z&][\w'-]*){1,7}):?$/gm, (line) => (isTitleCase(line) ? sentenceCase(line, proper) : line));
}

const EMOJI = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}]\uFE0F?[ \t]?/gu;

function fixProse(s, mode) {
  const formal = mode === "academic" || mode === "technical";
  // punctuation layer
  s = s.replace(/[“”„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'");
  s = s.replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2");
  s = s.replace(/\s*[—–]\s*([^—–\n.!?]{1,80}?)\s*[—–]\s*/g, " ($1) ");  // paired dashes -> parentheses
  s = s.replace(/\s+[—–]\s+|\s+--\s+/g, ", ").replace(/(\w)[—](\w)/g, "$1, $2").replace(/[—–]/g, ", ");
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, "$1").replace(/__([^_\n]+?)__/g, "$1");
  if (mode !== "casual") s = s.replace(EMOJI, "");
  s = s.replace(/\s*(?:→|⇒|➡️?)\s*/g, " to ");
  s = s.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "");

  // structure layer
  for (const [re, to] of CONTRASTS) s = s.replace(re, to);
  s = s.replace(ING_RIDER, "");
  for (const re of DEAD_SENTENCES) s = s.replace(re, "");
  for (let i = 0; i < 2; i++) s = s.replace(LEADINS, (m, pre, c) => pre + c.toUpperCase()).replace(LEADINS_THAT, (m, pre, c) => pre + c.toUpperCase());

  // vocabulary layer
  s = s.replace(/\bdelv(?:e|es|ed|ing) deep(?:ly|er)? into\b/gi, (w) => matchCase(w, verbForm(w.split(" ")[0], ["dig into", "digs into", "dug into", "digging into"])));
  for (const [stem, forms] of VERBS) {
    s = s.replace(new RegExp("\\b" + stem + "(?:e|es|ed|ing|s)?\\b", "gi"), (w) => matchCase(w, verbForm(w, forms)));
  }
  for (const [re, to] of WORDS) s = s.replace(re, (...a) => matchCase(a[0], typeof to === "function" ? to(...a) : to.replace(/\$(\d)/g, (_, n) => a[n])));

  if (!formal) {
    for (const [re, to] of SOFT) s = s.replace(re, (w) => matchCase(w, to));
    for (const [re, to] of CONTRACTIONS) s = s.replace(re, to);
  }
  return s;
}

function splitLong(s) {
  // break sentences over ~32 words at "; " or ", but " / ", and " so rhythm varies
  return s.replace(/[^.!?\n]+[.!?]/g, (sent) => {
    if ((sent.match(/\S+/g) || []).length < 32) return sent;
    let m = sent.match(/^(.{60,}?);\s+(\w)(.+)$/s) || sent.match(/^(.{60,}?),\s+(but|and|so|which means)\s+(\w)(.+)$/is);
    if (!m) return sent;
    if (m.length === 4) return m[1] + ". " + m[2].toUpperCase() + m[3];
    const conj = m[2].toLowerCase() === "which means" ? "That means" : cap(m[2].toLowerCase());
    return m[1] + ". " + conj + " " + m[3] + m[4];
  });
}

function tidy(s) {
  s = s.replace(/\b([Aa]) (important|overall|unusual|interaction|open|easier|early|effort|earn)/g, "$1n $2")
       .replace(/\b([Aa])n (strong|full|new|major|lively|careful|complex|useful|smooth|main|close|big|proof|mix|field|turning|modern|simpl)/g, "$1 $2");
  s = s.replace(/[ \t]+$/gm, "").replace(/[ \t]+([,.;:!?])/g, "$1").replace(/,\s*,/g, ",").replace(/,\s*\./g, ".").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
  s = s.replace(/([.!?])\s*\1+/g, "$1").replace(/[ \t]{2,}/g, " ").replace(/^[ \t]+(?=\S)/gm, (m) => (m.length >= 2 ? m : ""));
  s = s.replace(/(^|\n)([-*]\s+)?([a-z])/g, (m, p, b, c) => p + (b || "") + c.toUpperCase());
  s = s.replace(/\n{3,}/g, "\n\n");
  return s;
}

const PH = (n) => "\uE000" + n + "\uE001";
export function humanize(text, mode = "general") {
  const code = [];
  let out = text.replace(CODE, (m) => {
    const lead = m.startsWith("\n") ? "\n" : "";
    code.push(m.slice(lead.length));
    return lead + PH(code.length - 1);
  });
  out = splitLong(fixProse(out, mode));
  out = out.replace(OPENERS, "");
  for (const re of CLOSERS) out = out.replace(re, "");
  out = fixHeadings(out, text);
  out = tidy(out);
  out = out.replace(/\uE000(\d+)\uE001/g, (m, n) => code[+n]);
  return out.replace(/^\s+/, "").replace(/\s+$/, "");
}
