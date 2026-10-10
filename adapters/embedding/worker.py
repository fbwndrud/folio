"""Offline optional runtime. Transport accepts only adapter-owned local raster paths."""
import contextlib
import hashlib
import importlib.metadata
import json
import sys

REVISION = '914f7f89142e33e77833254d9c9b90c3cef7303b'
MODEL = 'google/embeddinggemma-2'

class InputPolicyError(Exception):
    pass

def main():
    request = json.load(sys.stdin)
    if request['revision'] != REVISION or request['dimension'] not in (128, 256, 512, 768):
        raise ValueError('unsupported model revision/dimension')
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        from sentence_transformers import SentenceTransformer
        from huggingface_hub import snapshot_download
        from pathlib import Path
        directory = Path(snapshot_download(MODEL, revision=REVISION, local_files_only=True))
        configs = {}
        for path in sorted(directory.rglob('*.json')):
            configs[str(path.relative_to(directory))] = hashlib.sha256(path.read_bytes()).hexdigest()
        model = SentenceTransformer(MODEL, revision=REVISION, device='cpu', model_kwargs={'torch_dtype': torch.float32}, local_files_only=True)
        prompts = model.prompts
        text_limit = min(8192, model[0].tokenizer.model_max_length)
        configs['folioInputPolicy'] = {'textTokenLimit': text_limit, 'specialTokenReserve': 8, 'textOverflow': 'reject', 'maxImagePixels': 16000000, 'maxInputBytes': 8 * 1024 * 1024, 'maxInputs': 100, 'maxBatchBytes': 32 * 1024 * 1024}
        items = []
        for item in request['inputs']:
            if set(item) == {'text'}:
                prefix = prompts['SearchQuery' if request['query'] else 'Document']
                tokens = model[0].tokenizer(prefix + item['text'], truncation=False)['input_ids']
                if len(tokens) + 8 > text_limit:
                    raise InputPolicyError('EMBEDDING_TEXT_TOO_LONG')
                items.append(item['text'])
            elif set(item) == {'image'} and Path(item['image']).is_file() and not request['query']:
                from PIL import Image
                with Image.open(item['image']) as image:
                    if image.width * image.height > 16000000:
                        raise InputPolicyError('EMBEDDING_IMAGE_TOO_LARGE')
                items.append(item)
            else:
                raise ValueError('unsupported observed modality')
        # Mixed media batches must not receive the text task prefix.
        vectors = []
        for item in items:
            options = {'normalize_embeddings': True}
            if isinstance(item, str):
                options['prompt_name'] = 'SearchQuery' if request['query'] else 'Document'
            vector = model.encode([item], **options)[0][:request['dimension']]
            vector = vector / __import__('numpy').linalg.norm(vector)
            vectors.append(vector.tolist())
        runtime = {name: importlib.metadata.version(name) for name in ('torch', 'torchvision', 'transformers', 'sentence-transformers', 'numpy', 'Pillow', 'huggingface-hub')}
        runtime['python'] = __import__('platform').python_version()
        profile = {'model': MODEL, 'modelRevision': REVISION, 'processorRevision': REVISION,
                   'processorConfig': configs, 'runtime': runtime, 'dtype': 'float32',
                   'dimension': request['dimension'], 'normalization': 'l2',
                   'prefixes': {'document': prompts['Document'], 'query': prompts['SearchQuery'], 'media': ''}}
    json.dump({'profile': profile, 'vectors': vectors}, sys.stdout, allow_nan=False)

if __name__ == '__main__':
    try:
        main()
    except InputPolicyError as error:
        print(json.dumps({'error': 'observed input exceeds explicit embedding policy', 'errorCode': str(error)}))
    except Exception:
        # Avoid exposing paths, tokens, input bytes or library diagnostics to callers.
        print(json.dumps({'error': 'offline model runtime failed; verify cache and compatible dependencies'}))
        sys.exit(1)
