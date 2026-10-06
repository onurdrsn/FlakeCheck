export interface AuthEnv {
  FLAKECHECK_PROJECT_TOKENS: string;
}

export interface AuthContext {
  repo: string;
}

export function canonicalRepo(value: string | undefined): string | null {
  if (!value || !/^[^/\s]+\/[^/\s]+$/.test(value)) return null;
  return value;
}

export async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

export function digestHex(value: string): Promise<string> {
  return digest(value).then((bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''));
}

async function isPublicGitHubRepository(repo: string, githubAccessToken?: string): Promise<boolean> {
  const apiResponse = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FlakeCheck',
      ...(githubAccessToken ? { Authorization: `Bearer ${githubAccessToken}` } : {}),
    },
  });
  if (apiResponse.ok) {
    const repository = await apiResponse.json() as { private?: boolean };
    return repository.private === false;
  }

  // GitHub's unauthenticated REST API is rate-limited. The repository page
  // remains a useful public/private check when that limit is exhausted.
  if (apiResponse.status === 403 || apiResponse.status === 429) {
    const pageResponse = await fetch(`https://github.com/${repo}`, {
      headers: { Accept: 'text/html', 'User-Agent': 'FlakeCheck' },
      redirect: 'manual',
    });
    return pageResponse.status === 200;
  }
  return false;
}

export async function constantTimeEqual(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  if (left.length !== right.length) return false;
  const timingSafeEqual = (crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (a: BufferSource, b: BufferSource) => boolean;
  }).timingSafeEqual;
  if (timingSafeEqual) return timingSafeEqual(left as unknown as BufferSource, right as unknown as BufferSource);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function authenticate(repoValue: string | undefined, token: string | undefined, env: AuthEnv, githubAccessToken?: string): Promise<AuthContext> {
  const repo = canonicalRepo(repoValue);
  if (!repo) throw new Error('A canonical repo in owner/name format is required');
  if (!token) {
    if (await isPublicGitHubRepository(repo, githubAccessToken)) return { repo };
    throw new Error('X-FlakeCheck-Token is required for private repositories');
  }
  let projectTokens: unknown;
  try {
    projectTokens = JSON.parse(env.FLAKECHECK_PROJECT_TOKENS);
  } catch {
    throw new Error('FLAKECHECK_PROJECT_TOKENS is invalid JSON');
  }
  const expectedDigest = projectTokens && typeof projectTokens === 'object'
    ? (projectTokens as Record<string, unknown>)[repo]
    : undefined;
  if (typeof expectedDigest !== 'string' || !/^[a-f0-9]{64}$/i.test(expectedDigest)) throw new Error('Repository token is not configured');
  const suppliedDigest = await digest(token);
  const expectedBytes = new Uint8Array(expectedDigest.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  if (!(await constantTimeEqual(suppliedDigest, expectedBytes))) throw new Error('Invalid repository token');
  return { repo };
}
