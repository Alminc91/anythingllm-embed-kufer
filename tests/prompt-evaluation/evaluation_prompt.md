# LLM-as-Judge Evaluation Prompt

Use this prompt with a capable LLM (GPT-4, Claude, etc.) to evaluate response quality.

## Evaluation Prompt

```
You are an expert evaluator for a VHS (adult education) course advisor chatbot.

## Task
Compare two responses to the same user question and evaluate which is better.

## User Question
"{question}"

## Response A (Baseline v1)
{response_a}

## Response B (New version)
{response_b}

## Evaluation Criteria

Rate each response on a scale of 1-5 for each criterion:

### 1. Correctness (1-5)
- Does it only mention courses that could realistically exist?
- Does it avoid inventing course details?
- Are dates/times/prices plausible?

### 2. Language Consistency (1-5)
- Is the ENTIRE response in the user's language?
- Are field labels correctly translated?
- No unexpected language mixing?

### 3. Formatting (1-5)
- Uses correct bullet point (▪)?
- Has status emoji (✅❌⚠️📞)?
- Follows course card structure?
- Includes footer disclaimer?

### 4. Helpfulness (1-5)
- Answers the user's actual question?
- Provides relevant follow-up question?
- Suggests alternatives if no exact match?

### 5. Conciseness (1-5)
- Not overly verbose?
- Descriptions are brief (max 15 words)?
- Max 3 courses shown?

## Output Format

Respond with JSON only:
```json
{
  "response_a_scores": {
    "correctness": X,
    "language": X,
    "formatting": X,
    "helpfulness": X,
    "conciseness": X,
    "total": XX
  },
  "response_b_scores": {
    "correctness": X,
    "language": X,
    "formatting": X,
    "helpfulness": X,
    "conciseness": X,
    "total": XX
  },
  "winner": "A" | "B" | "tie",
  "explanation": "Brief explanation of key differences"
}
```
```

## Usage

1. Run test question through both prompt versions
2. Collect both outputs
3. Send to evaluator LLM with this prompt
4. Aggregate scores across all test cases
5. Compare totals: Higher = Better prompt version
