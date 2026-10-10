"""
bakemon.net rerank service on Modal (https://modal.com).

Deploy:
    modal deploy modal_app.py

This exposes a web endpoint at the URL Modal prints after deploy, e.g.
https://<your-workspace>--bakemon-rerank-rerank.modal.run

No server to manage, no memory ceiling to fight: Modal builds the container
image once (bakes the model in), then runs it on demand. The free tier
includes monthly compute credits that comfortably cover a demo with a
handful of concurrent users; the container scales to zero between requests,
so there is no idle cost.

Local test:
    modal run modal_app.py
"""

import modal
from pydantic import BaseModel

app = modal.App("bakemon-rerank")

MODEL_NAME = "cl-nagoya/ruri-v3-reranker-310m"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "transformers==4.57.*",
        "torch==2.*",
        "fastapi==0.115.*",
        "pydantic==2.*",
        "sentencepiece",
        "protobuf",
    )
    # Bake the model weights into the image at build time, so a cold start
    # does not need to hit the Hugging Face Hub.
    .run_commands(
        "python -c \"from transformers import AutoTokenizer, AutoModelForSequenceClassification; "
        f"AutoTokenizer.from_pretrained('{MODEL_NAME}'); "
        f"AutoModelForSequenceClassification.from_pretrained('{MODEL_NAME}')\""
    )
)


@app.cls(image=image, gpu="T4", scaledown_window=120, min_containers=0)
class Reranker:
    @modal.enter()
    def load(self):
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME).to(self.device)
        self.model.eval()

    @modal.method()
    def score(self, query: str, docs: list[str]) -> list[float]:
        import torch

        if not docs:
            return []
        inputs = self.tokenizer(
            [query] * len(docs),
            docs,
            return_tensors="pt",
            truncation=True,
            max_length=512,
            padding=True,
        ).to(self.device)
        with torch.no_grad():
            logits = self.model(**inputs).logits.squeeze(-1)
        return logits.float().cpu().tolist()


class CandidateIn(BaseModel):
    id: str
    text: str


class RerankIn(BaseModel):
    query: str
    candidates: list[CandidateIn]


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def rerank(payload: RerankIn):
    """
    POST body: {"query": str, "candidates": [{"id": str, "text": str}, ...]}
    Response:  {"ranked": [{"id": str, "score": float}, ...]}
    """
    if not payload.query or not payload.candidates:
        return {"ranked": []}

    ids = [c.id for c in payload.candidates]
    texts = [c.text for c in payload.candidates]

    reranker = Reranker()
    scores = reranker.score.remote(payload.query, texts)

    ranked = sorted(
        ({"id": i, "score": s} for i, s in zip(ids, scores)),
        key=lambda item: item["score"],
        reverse=True,
    )
    return {"ranked": ranked}


@app.local_entrypoint()
def main():
    # modal run modal_app.py  -- quick smoke test from your own machine
    reranker = Reranker()
    query = "山奥の廃神社で、帰ろうとしたら鈴が一回だけ鳴った。風がなかった。"
    docs = [
        "狸，狢: 宵の口の頃、お勝手の流しにある桶の箍が切れたので、水の流れ出るような音がした。",
        "嫁の泣き声が聞こえる池: 姑に憎まれた若い嫁女が、田を一日で植えることが出来ず、気を落として死んでしまった。",
    ]
    scores = reranker.score.remote(query, docs)
    for doc, score in zip(docs, scores):
        print(f"{score:.3f}  {doc[:40]}")
