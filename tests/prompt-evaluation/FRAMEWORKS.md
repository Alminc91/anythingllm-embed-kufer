# LLM Evaluation Frameworks

Overview of open-source tools for prompt testing and evaluation.

## Popular Frameworks

### 1. **promptfoo** ⭐ Recommended
```bash
npm install -g promptfoo
```
- YAML-based test configuration
- Built-in LLM-as-judge
- Side-by-side comparison UI
- CI/CD integration
- https://github.com/promptfoo/promptfoo

```yaml
# promptfoo.yaml
prompts:
  - prompts/v1.txt
  - prompts/v2.txt

tests:
  - vars:
      question: "Gibt es Yoga-Kurse?"
    assert:
      - type: contains
        value: "▪"
      - type: llm-rubric
        value: "Response is in German"
```

### 2. **DeepEval**
```bash
pip install deepeval
```
- Python-native
- Multiple evaluation metrics
- Pytest integration
- https://github.com/confident-ai/deepeval

```python
from deepeval import evaluate
from deepeval.metrics import AnswerRelevancyMetric

metric = AnswerRelevancyMetric()
evaluate(test_cases, [metric])
```

### 3. **LangFuse** ⭐ Self-Hosted
```bash
# Docker self-host
docker run -d -p 3000:3000 langfuse/langfuse
```
- **Open Source** - self-hostable (data stays with you)
- Tracing, prompt management, evaluations
- LangChain/LlamaIndex integration
- https://github.com/langfuse/langfuse

### 4. **LangSmith** (by LangChain)
- Cloud-based tracing + evaluation
- Dataset management
- Human feedback integration
- https://smith.langchain.com

### 5. **Ragas**
```bash
pip install ragas
```
- RAG-specific evaluation
- Faithfulness, relevance scores
- https://github.com/explodinggradients/ragas

### 6. **OpenAI Evals**
```bash
pip install evals
```
- OpenAI's evaluation framework
- Custom eval creation
- https://github.com/openai/evals

## Comparison

| Framework | Language | Best For | Difficulty |
|-----------|----------|----------|------------|
| promptfoo | Node.js | Quick A/B testing | Easy |
| DeepEval | Python | Pytest integration | Easy |
| **LangFuse** | Docker | **Self-hosted tracing + eval** | Easy |
| LangSmith | Cloud | Production monitoring | Medium |
| Ragas | Python | RAG systems | Medium |
| OpenAI Evals | Python | Comprehensive testing | Hard |

## Recommendation for Your Use Case

**promptfoo** is ideal because:
1. Simple YAML config (no Python needed)
2. Built-in LLM-as-judge with customizable rubrics
3. Nice CLI output + web UI
4. Easy CI/CD integration

### Quick Start with promptfoo

```bash
# Install
npm install -g promptfoo

# Initialize in project
cd tests/prompt-evaluation
promptfoo init

# Run evaluation
promptfoo eval

# View results in browser
promptfoo view
```

### Example promptfoo config for VHS chatbot

```yaml
# promptfoo.yaml
description: "VHS Course Advisor Prompt Evaluation"

providers:
  - openai:gpt-4  # or anthropic:claude-3

prompts:
  - id: v1
    raw: |
      {{system_prompt_v1}}

      User: {{question}}
  - id: v2
    raw: |
      {{system_prompt_v2}}

      User: {{question}}

tests:
  - description: "German search"
    vars:
      question: "Gibt es Yoga-Kurse?"
    assert:
      - type: contains
        value: "▪"
      - type: not-contains
        value: "- "  # no dashes
      - type: llm-rubric
        value: "Response is entirely in German with no English words"

  - description: "English translation"
    vars:
      question: "Do you have swimming courses?"
    assert:
      - type: llm-rubric
        value: "Response is in English, field labels are translated"
      - type: not-contains
        value: "Kursnummer"

  - description: "Status emoji"
    vars:
      question: "Welche Kurse haben noch Plätze?"
    assert:
      - type: contains-any
        value: ["✅", "❌", "⚠️", "📞"]

  - description: "No hallucination"
    vars:
      question: "Gibt es Fallschirmspringen?"
    assert:
      - type: llm-rubric
        value: "Response admits no matching courses found, does not invent courses"
```

## DIY Python Script (Simple)

If you prefer a lightweight custom solution:

```python
#!/usr/bin/env python3
"""
Simple prompt evaluation script.
Usage: python run_evaluation.py
"""

import json
import os
from openai import OpenAI  # or anthropic

client = OpenAI()

def load_test_cases():
    with open("test_cases.json") as f:
        return json.load(f)["test_cases"]

def get_response(system_prompt: str, question: str) -> str:
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": question}
        ]
    )
    return response.choices[0].message.content

def evaluate_with_llm(question: str, response_a: str, response_b: str) -> dict:
    eval_prompt = open("evaluation_prompt.md").read()
    eval_prompt = eval_prompt.replace("{question}", question)
    eval_prompt = eval_prompt.replace("{response_a}", response_a)
    eval_prompt = eval_prompt.replace("{response_b}", response_b)

    result = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": eval_prompt}],
        response_format={"type": "json_object"}
    )
    return json.loads(result.choices[0].message.content)

def main():
    prompt_v1 = open("../../prompts/v1.txt").read()
    prompt_v2 = open("../../prompts/v2.txt").read()

    test_cases = load_test_cases()
    results = []

    for test in test_cases:
        print(f"Testing: {test['id']}...")

        response_a = get_response(prompt_v1, test["question"])
        response_b = get_response(prompt_v2, test["question"])

        evaluation = evaluate_with_llm(test["question"], response_a, response_b)
        results.append({
            "test_id": test["id"],
            **evaluation
        })

    # Summary
    a_wins = sum(1 for r in results if r["winner"] == "A")
    b_wins = sum(1 for r in results if r["winner"] == "B")
    ties = sum(1 for r in results if r["winner"] == "tie")

    print(f"\n=== Results ===")
    print(f"Prompt A wins: {a_wins}")
    print(f"Prompt B wins: {b_wins}")
    print(f"Ties: {ties}")

    with open("results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    main()
```

## Summary

| Approach | Effort | Features |
|----------|--------|----------|
| Manual testing | Low | Quick, no setup |
| Custom Python | Medium | Full control |
| promptfoo | Low | Best balance |
| DeepEval | Medium | Pytest integration |
| LangSmith | High | Production-grade |
