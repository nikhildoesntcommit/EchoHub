// Echo Studio AI writer — runs a small language model entirely in this browser.
// Loaded as a module worker so generation never blocks the interface.
// The library comes from a pinned CDN build; the model weights come from the
// Hugging Face Hub once and are then cached by the browser. No prompts leave the device.

import {
  AutoTokenizer,
  AutoModelForCausalLM,
  TextStreamer,
  InterruptableStoppingCriteria,
  env
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;

let tokenizer = null;
let model = null;
let loading = null;
let device = null;
const stopper = new InterruptableStoppingCriteria();

// A 1B-parameter model needs a GPU to be pleasant (and to fit in memory), so the
// writer only runs where WebGPU is available; elsewhere Studio uses templates.
async function pickDevice() {
  const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) throw new Error('NO_WEBGPU');
  return { device: 'webgpu', fp16: adapter.features.has('shader-f16') };
}

// ONNX Runtime sometimes surfaces native failures as bare numbers; make them readable.
function friendly(err) {
  const msg = String(err?.message ?? err ?? '');
  if (msg === 'NO_WEBGPU') return 'this browser can’t give it access to your GPU (WebGPU)';
  if (/^\d+$/.test(msg) || /memory|alloc|OOM/i.test(msg)) return 'your device ran out of memory while loading the model';
  if (/fetch|network|Failed to load/i.test(msg)) return 'the model download was interrupted; check your connection';
  return msg || 'unknown error';
}

async function load({ id, dtypes }) {
  if (model) return { device };
  if (loading) return loading;
  loading = (async () => {
    const hw = await pickDevice();
    device = hw.device;
    const dtype = hw.fp16 ? dtypes.fp16 : dtypes.fp32;
    const files = new Map();
    const progress_callback = (p) => {
      if (p.status === 'progress' && p.total) {
        files.set(p.file, { loaded: p.loaded, total: p.total });
        let loaded = 0; let total = 0;
        files.forEach((f) => { loaded += f.loaded; total += f.total; });
        self.postMessage({ type: 'progress', loaded, total });
      }
    };
    self.postMessage({ type: 'status', text: 'Fetching model' });
    tokenizer = await AutoTokenizer.from_pretrained(id, { progress_callback });
    model = await AutoModelForCausalLM.from_pretrained(id, { dtype, device, progress_callback });
    self.postMessage({ type: 'status', text: 'Warming up' });
    // A one-token pass compiles the GPU shaders so the first real script starts quickly.
    const warm = tokenizer('Hi');
    await model.generate({ ...warm, max_new_tokens: 1 });
    return { device, dtype };
  })();
  try {
    return await loading;
  } catch (err) {
    model = null; tokenizer = null; loading = null;
    throw err;
  }
}

async function generate({ messages, options }) {
  const inputs = tokenizer.apply_chat_template(messages, { add_generation_prompt: true, return_dict: true });
  let text = '';
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (chunk) => { text += chunk; self.postMessage({ type: 'token', text: chunk }); }
  });
  stopper.reset();
  await model.generate({ ...inputs, ...options, streamer, stopping_criteria: stopper });
  return text;
}

self.addEventListener('message', async ({ data }) => {
  try {
    if (data.type === 'load') {
      const info = await load(data.model);
      self.postMessage({ type: 'ready', ...info });
    } else if (data.type === 'generate') {
      if (!model) await load(data.model);
      const text = await generate(data);
      self.postMessage({ type: 'done', text });
    } else if (data.type === 'stop') {
      stopper.interrupt();
    }
  } catch (err) {
    self.postMessage({ type: 'error', message: friendly(err), raw: `${err?.message ?? err}${err?.stack ? `\n${err.stack}` : ''}` });
  }
});
