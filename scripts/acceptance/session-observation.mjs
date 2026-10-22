// Acceptance-only observation. Never replay prompts, commands or other mutations.
export async function observeSessionList(read, {
  onFailure = async () => {},
  alive = () => true,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await read(); }
    catch (error) {
      await onFailure(error, attempt);
      if (!/fetch failed/.test(String(error?.message)) || attempt === 3 || !alive()) throw error;
      await sleep(1000);
    }
  }
}
