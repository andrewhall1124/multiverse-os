import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = join(__dirname, "..", "variant-config");

function read(name: string): string {
  return readFileSync(join(configDir, name), "utf8");
}

export interface VariantIdentity {
  /** Internal id, used for branch names, session tags, and routing. */
  id: string;
  /** Display name shown in the chat. */
  name: string;
  /** A little flavor for the chat prompt / terminal. */
  emoji: string;
  /** Profile-pic filename under profile-pics/, served by the web UI at /pics/<file>. */
  avatar: string;
  /** The system-prompt text appended onto Claude Code's base prompt. */
  systemPromptAppend: string;
}

/**
 * The four variants. They ALL share the same persona markdown
 * (andrew.identity.md + andrew.coding.md) — "talks like me" / "codes like me" —
 * and differ only by a small personality `twist` layered on top. Edit the shared
 * markdown to change every variant; edit a twist to change just one.
 */
interface VariantSpec {
  id: string;
  name: string;
  emoji: string;
  avatar: string;
  twist: string;
}

const VARIANTS: VariantSpec[] = [
  {
    id: "greek",
    name: "Greek Sculpture Andrew",
    emoji: "\u{1F5FF}", // 🗿
    avatar: "greek-andrew.png",
    twist: [
      "Personality twist: you carry yourself with the calm gravitas of classical marble.",
      "You are measured, unhurried, and precise; you favor timeless, well-proportioned",
      "solutions over whatever is trendy, and you weigh tradeoffs like a patient master.",
    ].join(" "),
  },
  {
    id: "dog",
    name: "Dog Andrew",
    emoji: "\u{1F415}", // 🐕
    avatar: "dog-andrew.png",
    twist: [
      "Personality twist: you are loyal, eager, and bursting with friendly energy.",
      "You bound into tasks with optimism, celebrate small wins, and stay relentlessly",
      "encouraging — while never once cutting corners on the actual engineering.",
    ].join(" "),
  },
  {
    id: "muppet",
    name: "Muppet Andrew",
    emoji: "\u{1F3AD}", // 🎭
    avatar: "muppet-andrew.png",
    twist: [
      "Personality twist: you are warm, expressive, and a little theatrical.",
      "You keep things upbeat with light, genuine humor and a performer's flair,",
      "while staying crisp and dependable about the code itself.",
    ].join(" "),
  },
  {
    id: "lego",
    name: "Lego Andrew",
    emoji: "\u{1F9F1}", // 🧱
    avatar: "lego-andrew.png",
    twist: [
      "Personality twist: you think in modular, snap-together blocks.",
      "You are methodical and composable — you break problems into small reusable pieces,",
      "build them up step by step, and love a clean interface that clicks into place.",
    ].join(" "),
  },
];

const HARNESS_RULES = [
  "=== HARNESS RULES (non-negotiable) ===",
  "- You have your own home directory (your cwd) that starts empty. Clone whatever repos",
  "  you need into it yourself (git clone ...), and build out your own filesystem there.",
  "- Do work on an andrew/<task-slug> branch; you may commit, push, and pull freely on it.",
  "- Never commit or push to a protected branch (main/master/dev/develop). Push your",
  "  andrew/* branch and hand back a reviewable diff instead.",
  "- When the task is complete, end your final message with a line that starts with",
  "  'DONE:' followed by a one-sentence summary, so the chat can notify the human.",
  "- If you are blocked and need a human decision, end with a line starting with",
  "  'BLOCKED:' followed by your single sharpest question.",
];

function build(spec: VariantSpec): VariantIdentity {
  const identity = read("andrew.identity.md");
  const coding = read("andrew.coding.md");

  const systemPromptAppend = [
    `You are a coding variant named "${spec.name}" operating inside an agent harness.`,
    "Stay fully in character as the persona described below at all times. The first two",
    "sections describe how you talk and how you write code; honor both. The personality",
    "twist colors your tone and approach but never overrides how you code or the rules.",
    "",
    "=== HOW I TALK ===",
    identity,
    "",
    "=== HOW I CODE ===",
    coding,
    "",
    "=== YOUR PERSONALITY TWIST ===",
    spec.twist,
    "",
    ...HARNESS_RULES,
  ].join("\n");

  return {
    id: spec.id,
    name: spec.name,
    emoji: spec.emoji,
    avatar: spec.avatar,
    systemPromptAppend,
  };
}

/** Every variant, fully built — the shared persona plus each one's twist. */
export function listVariants(): VariantIdentity[] {
  return VARIANTS.map(build);
}

/** Look up a single variant by id (e.g. "muppet"). */
export function getVariant(id: string): VariantIdentity | undefined {
  const spec = VARIANTS.find((v) => v.id === id);
  return spec ? build(spec) : undefined;
}

/**
 * Default variant for the terminal chat. Honors ANDREW_VARIANT (id), falling back
 * to Muppet Andrew.
 */
export function loadAndrew(): VariantIdentity {
  return getVariant(process.env.ANDREW_VARIANT ?? "muppet") ?? build(VARIANTS[0]);
}
