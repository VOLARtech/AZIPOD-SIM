// URLs of the packed ship models (tools/ship). Separate module so the single-file offline build can
// swap it for an empty one and stay small: there the ships fall back to their procedural look.
export const MODEL_URLS = import.meta.glob('./*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
