// Runs the ambient engine on the audio thread. The page compiles the wasm
// and posts the module here, since worklets cannot fetch.

class AmbientProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = null;
    this.untilReport = 0;
    this.port.onmessage = async ({ data }) => {
      if (data.type === "start") {
        const instance = await WebAssembly.instantiate(data.module, {});
        this.engine = instance.exports;
        this.engine.init(data.seed, data.style, data.modifiers, data.bpm, 1, sampleRate);
      }
    };
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    const engine = this.engine;
    if (!engine) return true;

    const frames = left.length;
    // Render before touching memory.buffer: rendering may grow the memory,
    // which detaches any buffer fetched earlier.
    const address = engine.render(frames);
    const samples = new Float32Array(engine.memory.buffer, address, frames * 2);
    for (let i = 0; i < frames; i++) {
      left[i] = samples[2 * i];
      if (right) right[i] = samples[2 * i + 1];
    }

    this.untilReport -= frames;
    if (this.untilReport <= 0) {
      this.untilReport = sampleRate / 4;
      const length = engine.take_headlines();
      // TextDecoder is missing from some worklet scopes; send raw bytes.
      const headlines = length
        ? new Uint8Array(engine.memory.buffer, engine.headlines_ptr(), length).slice()
        : null;
      this.port.postMessage({ elapsed: engine.elapsed_seconds(), headlines });
    }
    return true;
  }
}

registerProcessor("ambient", AmbientProcessor);
