/** Structured output contract for a future Bedrock review. The demo engine returns the same issue shape. */
export const reviewIssueJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["issues", "facts"],
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "issue_id",
          "kind",
          "priority",
          "title",
          "evidence",
          "impact",
          "question",
          "status",
          "waiting_for",
          "resolution_evidence",
        ],
        properties: {
          issue_id: { type: "string" },
          kind: { enum: ["missing", "ambiguous", "conflict"] },
          priority: { enum: ["high", "low"] },
          title: { type: "string" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["message_id", "quote"],
              properties: {
                message_id: { type: "string" },
                quote: { type: "string" },
              },
            },
          },
          impact: { type: "string" },
          question: { type: "string" },
          status: {
            enum: [
              "unconfirmed",
              "question_sent",
              "proposed",
              "confirmed",
              "needs_human_review",
              "accepted_risk",
              "reopened",
              "not_applicable",
            ],
          },
          waiting_for: { enum: ["buyer", "seller", "both", "none"] },
          resolution_evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["message_id", "quote"],
              properties: {
                message_id: { type: "string" },
                quote: { type: "string" },
              },
            },
          },
        },
      },
    },
    facts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "value", "status", "evidence"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
          value: { type: "string" },
          status: { enum: ["confirmed", "stated_by_one_party", "proposed", "historical"] },
          evidence: { type: "array" },
        },
      },
    },
  },
} as const;
