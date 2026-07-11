// Asset loader. In the original, BLOAD pulled binary files into memory at
// fixed addresses; here we fetch JSON from /data and surface typed payloads.
// The /data directory will mirror modern/shapes_json once Phase 1 imports it.

export class Loader {
  async json<T>(path: string): Promise<T> {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`loader: ${path} -> ${res.status}`);
    return res.json() as Promise<T>;
  }
}
