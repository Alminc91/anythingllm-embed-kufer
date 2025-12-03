# Prompt Evaluation Framework

Automated regression testing for VHS course advisor system prompts.

## Overview

When modifying system prompts, use this framework to ensure changes don't break existing functionality.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Test Cases     │────▶│  Run Both       │────▶│  LLM-as-Judge   │
│  (questions)    │     │  Prompt Versions│     │  Comparison     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                                ┌─────────────────┐
                                                │  Score Report   │
                                                │  (A vs B)       │
                                                └─────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `test_cases.json` | Standard questions with expected behaviors |
| `evaluation_prompt.md` | LLM-as-Judge prompt for comparing outputs |
| `run_evaluation.py` | Automation script (future) |
| `baseline_outputs/` | Reference outputs from current prompt version |

## Test Categories

| Category | Tests | Purpose |
|----------|-------|---------|
| `search` | Basic course searches | Core functionality |
| `multilingual` | EN, FR, etc. queries | Language detection + translation |
| `edge_case` | No results, ambiguous | Error handling |
| `status_emoji` | Availability display | ✅❌⚠️📞 rendering |
| `format` | Structure, links, fields | Output formatting |
| `interaction` | Follow-up questions | Conversational quality |

## Manual Testing (Quick)

1. Copy a question from `test_cases.json`
2. Send to chatbot with OLD prompt → save response
3. Send to chatbot with NEW prompt → save response
4. Use `evaluation_prompt.md` with Claude/GPT to compare

## Automated Testing (Future)

```bash
# Install dependencies
pip install requests openai

# Run evaluation
python run_evaluation.py \
  --prompt-a prompts/v1.txt \
  --prompt-b prompts/v2.txt \
  --evaluator gpt-4
```

## Scoring

| Score | Meaning |
|-------|---------|
| 5 | Perfect |
| 4 | Good, minor issues |
| 3 | Acceptable |
| 2 | Problems |
| 1 | Fails requirement |

**Pass criteria:** Total score ≥ 20/25 per test case

## Adding New Test Cases

```json
{
  "id": "unique_id",
  "category": "category_name",
  "question": "User question here",
  "expected": {
    "key_behavior": true,
    "another_check": "expected value"
  }
}
```

## Best Practices

1. **Always run tests** before deploying prompt changes
2. **Save baseline outputs** from working prompts
3. **Add test cases** for any new features
4. **Document failures** and their fixes
