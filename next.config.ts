import type { NextConfig } from "next";

const excludedOnnxBinaries = process.platform === 'linux'
  ? ['node_modules/onnxruntime-node/bin/napi-v*/win32/**', 'node_modules/onnxruntime-node/bin/napi-v*/darwin/**']
  : process.platform === 'win32'
    ? ['node_modules/onnxruntime-node/bin/napi-v*/linux/**', 'node_modules/onnxruntime-node/bin/napi-v*/darwin/**']
    : ['node_modules/onnxruntime-node/bin/napi-v*/win32/**', 'node_modules/onnxruntime-node/bin/napi-v*/linux/**'];

const nextConfig: NextConfig = {
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node'],
  outputFileTracingIncludes: {
    '/api/public-experiment': [
      './data/experience-search/records.json.gz',
      './data/experience-search/manifest.json',
      './data/experience-search/document-vectors.f32.gz',
      './data/experience-search-model-cache/Xenova/multilingual-e5-small/761b726dd34fb83930e26aab4e9ac3899aa1fa78/config.json',
      './data/experience-search-model-cache/Xenova/multilingual-e5-small/761b726dd34fb83930e26aab4e9ac3899aa1fa78/tokenizer.json',
      './data/experience-search-model-cache/Xenova/multilingual-e5-small/761b726dd34fb83930e26aab4e9ac3899aa1fa78/tokenizer_config.json',
      './data/experience-search-model-cache/Xenova/multilingual-e5-small/761b726dd34fb83930e26aab4e9ac3899aa1fa78/onnx/model_quantized.onnx',
      './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/*',
    ],
  },
  outputFileTracingExcludes: {
    '/api/public-experiment': [
      ...excludedOnnxBinaries,
      './data/experience-search-model-cache/Xenova/multilingual-e5-small/761b726dd34fb83930e26aab4e9ac3899aa1fa78/onnx/model_quantized.onnx.gz',
    ],
  },
};

export default nextConfig;
