const STORAGE_KEY = 'yemken_hay_library_token';
let inMemoryToken: string | null = null;

function generateHexToken64(): string {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function getClientLibraryToken(): string {
  if (inMemoryToken && /^[a-f0-9]{64}$/.test(inMemoryToken)) {
    return inMemoryToken;
  }
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && /^[a-f0-9]{64}$/.test(saved)) {
      inMemoryToken = saved;
      return saved;
    }
    const fresh = generateHexToken64();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    inMemoryToken = fresh;
    return fresh;
  } catch {
    inMemoryToken = inMemoryToken || generateHexToken64();
    return inMemoryToken;
  }
}

let fetchInstalled = false;

export function buildApiFetch(baseFetch: typeof fetch): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isSameOriginApi =
      urlStr.startsWith('/api/') ||
      (typeof window !== 'undefined' &&
        typeof window.location !== 'undefined' &&
        urlStr.startsWith(`${window.location.origin}/api/`));

    if (!isSameOriginApi) {
      return baseFetch(input, init);
    }

    const token = getClientLibraryToken();
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has('x-yh-library')) {
      headers.set('x-yh-library', token);
    }

    return baseFetch(input, {
      ...init,
      headers,
      credentials: init?.credentials ?? 'include',
    });
  };
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof globalThis.fetch !== 'function') {
    return Promise.reject(new Error('Fetch API is unavailable.'));
  }
  const wrapped = buildApiFetch(globalThis.fetch.bind(globalThis));
  return wrapped(input, init);
}

export function installApiSessionFetch(target?: { fetch?: typeof fetch }): void {
  const host = target ?? (typeof window !== 'undefined' ? window : undefined);
  if (!host || typeof host.fetch !== 'function') {
    return;
  }
  if (!target && fetchInstalled) {
    return;
  }
  if (!target) {
    fetchInstalled = true;
  }

  const originalFetch = host.fetch.bind(host);
  const wrappedFetch = buildApiFetch(originalFetch);

  try {
    const ownDesc = Object.getOwnPropertyDescriptor(host, 'fetch');
    if (ownDesc && ownDesc.configurable === false && ownDesc.writable === false) {
      return;
    }
    Object.defineProperty(host, 'fetch', {
      value: wrappedFetch,
      configurable: true,
      writable: true,
    });
  } catch {
    // Some locked-down sandboxed Window objects forbid redefining fetch; explicit apiFetch still handles /api/* headers.
  }
}
