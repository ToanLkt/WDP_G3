import json
import sys
from pathlib import Path

from gensim.models.doc2vec import Doc2Vec


def main():
    payload = json.load(sys.stdin)
    artifacts = Path(__file__).resolve().parent / "artifacts"
    model = Doc2Vec.load(str(artifacts / "doc2vec_api.model"))
    vocab = set(model.wv.key_to_index.keys())
    result = {}

    for name, tokens in payload.items():
        normalized = [str(token) for token in tokens if token is not None]
        in_vocab = [token for token in normalized if token in vocab]
        oov = [token for token in normalized if token not in vocab]
        total = len(normalized)
        result[name] = {
            "totalTokens": total,
            "inVocabulary": len(in_vocab),
            "oov": len(oov),
            "coveragePct": round((len(in_vocab) / total) * 100, 2) if total else 0,
            "oovTokens": oov[:50],
        }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
