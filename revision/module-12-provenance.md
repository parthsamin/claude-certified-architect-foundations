# Module 12 — Preserving Provenance

> Exam relevance: Domain 5 (Context Management & Reliability, **15%**).

---

## 12.1 Attribution loss problem

Stripping a claim from its source destroys auditability.

```
BAD:  "The AI music market is estimated at $3.2B."
GOOD: {
  "claim": "AI music market is estimated at $3.2B",
  "source_name": "Global AI Music Report 2024",
  "source_url": "https://example.com/...",
  "publication_date": "2024-06-15",
  "confidence": 0.9
}
```

Every numeric claim, every direct quote, every fact in a multi-source synthesis should carry source + date + confidence.

## 12.2 Handling conflicting data

When two sources disagree, **do not pick one**. Preserve both with attribution; let the consumer decide.

```json
{
  "claim": "Share of AI-generated music",
  "values": [
    {"value": "12%", "source": "Spotify Annual Report 2024", "date": "2024-03", "methodology": "automated classification"},
    {"value": "8%",  "source": "Music Industry Assoc. Survey",  "date": "2024-07", "methodology": "survey of 500 labels"}
  ],
  "conflict_detected": true,
  "possible_explanation": "Methodology and time-period differences"
}
```

## 12.3 Include dates

Without dates, a YoY difference looks like a contradiction.

```
BAD:  "Source A says 10%, source B says 15%. Contradiction."
GOOD: "Source A (2023) says 10%, source B (2024) says 15%. Likely 5% growth YoY."
```

A claim without a date is a claim without context. The exam loves this trap.

## 12.4 Render by content type

Don't force everything into one format.

| Content type | Best rendering |
|---|---|
| Financial data | **Tables** |
| News / analysis | **Prose** |
| Technical findings | **Structured lists** |
| Time series | **Chronological order** |

## Build

`npm run m12:prov` — synthesis on "AI in music streaming" from two findings with different dates/sources. BAD strips attribution and blends numbers; GOOD presents both with sources and dates, reframes "conflict" as "growth between dates."

## Exam traps

- "Multi-source report has confident numbers but no citations" → attribution loss.
- "Two sources say different numbers — report picks one and moves on" → preserve both with attribution.
- "10% vs 15% across two sources called a contradiction" → check dates first; could be growth.
- "Synthesis is one long paragraph of mixed financial, narrative, and technical info" → render by content type (tables / prose / lists / chronological).
- "Same fact appears in 5 sources — model returns just one" → preserve attribution diversity (or note that 5 sources agree).
