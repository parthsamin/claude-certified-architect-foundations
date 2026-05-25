// ===================================================================
// Module 2 · Concept 2.2 — The tool_choice Parameter
// ===================================================================
// `description` decides WHICH tool. `tool_choice` decides WHETHER the
// model is allowed to skip tools at all. Three values:
//
//   {type:"auto"}                  Model decides: call a tool OR answer
//                                  in plain text. The default.
//   {type:"any"}                   Model MUST call SOME tool. It cannot
//                                  reply with text. It still picks WHICH.
//   {type:"tool", name:"X"}        Model MUST call tool X specifically.
//                                  Use to FORCE a first step / ordering.
//
// Key consequence: with "any" or "tool", the model CANNOT emit a
// text-only turn — so it also cannot ask a clarifying question. You
// trade flexibility for a guarantee.
//
// Run me with:  npm run m2:choice
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools = [
  {
    name: "extract_metadata",
    description:
      "Extract structured metadata (title, author, topic) from a piece " +
      "of text. Use as the FIRST step before any further processing.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        topic: { type: "string" },
      },
      required: ["title", "topic"],
    },
  },
  {
    name: "summarize_text",
    description: "Produce a short summary of a piece of text.",
    input_schema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
];

// One API call. Reports what the model DID: which tool, or a text reply.
async function runWithChoice(label, toolChoice, question) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    tools,
    tool_choice: toolChoice,
    messages: [{ role: "user", content: question }],
  });
  const toolBlock = res.content.find((b) => b.type === "tool_use");
  const textBlock = res.content.find((b) => b.type === "text");
  console.log(`\n[${label}]  tool_choice = ${JSON.stringify(toolChoice)}`);
  console.log(`   stop_reason: ${res.stop_reason}`);
  if (toolBlock) {
    console.log(`   -> CALLED TOOL: ${toolBlock.name}(${JSON.stringify(toolBlock.input)})`);
  } else {
    console.log(`   -> TEXT REPLY: "${(textBlock?.text ?? "").slice(0, 80)}..."`);
  }
}

async function main() {
  // -----------------------------------------------------------------
  // PART 1 — a question that needs NO tool at all: "Just say hi."
  // Watch how each tool_choice value changes the behavior.
  // -----------------------------------------------------------------
  const chat = "Hi! Just say hello back, nothing else.";

  console.log("########## PART 1: a question that needs NO tool ##########");

  // auto -> model is free to answer in text. It should.
  await runWithChoice("AUTO", { type: "auto" }, chat);

  // any -> model is FORCED to call some tool, even though it is
  // pointless here. It will pick one and shove the chat into it.
  await runWithChoice("ANY", { type: "any" }, chat);

  // tool -> forced to call this specific tool, however irrelevant.
  await runWithChoice("TOOL=summarize_text", { type: "tool", name: "summarize_text" }, chat);

  // -----------------------------------------------------------------
  // PART 2 — the LEGITIMATE use of forcing: guarantee a first step.
  // We give it an article and FORCE extract_metadata first, so no
  // matter what, metadata extraction happens before anything else.
  // -----------------------------------------------------------------
  console.log("\n########## PART 2: forcing a guaranteed first step ##########");
  const article =
    "Title: The Rise of Agentic AI. By Jordan Lee. " +
    "Agentic systems chain tool calls to complete multi-step tasks...";

  // Even though the text invites summarizing, we force metadata first.
  await runWithChoice("TOOL=extract_metadata", { type: "tool", name: "extract_metadata" }, article);

  console.log("\nLesson: auto = flexible. any = guaranteed tool call.");
  console.log("tool = guaranteed SPECIFIC call (forced ordering / structured output).");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
