const OLLAMA_HOST = 'http://localhost:11434';
const OLLAMA_MODEL = 'qwen3.5:0.8b';
const messages = [
  { role: 'user', content: 'hello' }
];

async function test() {
  const ollamaResponse = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      stream: true,
      options: {
        temperature: 0.7,
        top_p: 0.9,
        num_predict: 1024,
      },
    }),
  });
  console.log("Status:", ollamaResponse.status);
  const reader = ollamaResponse.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log("Chunk:", decoder.decode(value, { stream: true }));
  }
}
test();
