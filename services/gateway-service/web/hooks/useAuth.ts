import { useCallback, useState } from 'react';
import type { ApiClient } from '../types';
import { friendlyResponseError, readJson, userFacingMessage } from '../http';

export function useAuth(repo: string, token: string) {
  const [status, setStatus] = useState('Connect a repository to load live evidence');
  const api = useCallback<ApiClient>(async <T,>(path: string, init?: RequestInit) => {
    const headers = { 'Content-Type': 'application/json', 'X-FlakeCheck-Token': token, 'X-FlakeCheck-Repo': repo };
    const response = await fetch(`${path}${path.includes('?') ? '&' : '?'}repo=${encodeURIComponent(repo)}`, {
      ...init,
      credentials: 'include',
      headers: { ...headers, ...(init?.headers ?? {}) },
    });
    if (!response.ok) throw friendlyResponseError(response, 'Unable to complete the request.');
    const payload = await readJson<T>(response);
    return payload as T;
  }, [repo, token]);

  const connect = useCallback(async <T,>(work: () => Promise<T>) => {
    try {
      const result = await work();
      setStatus('Live gateway connected');
      return result;
    } catch (error) {
      const message = userFacingMessage(error, 'We could not connect to the workspace. Please check the repository and token.');
      setStatus(message);
      throw error;
    }
  }, []);

  return { api, connect, status, setStatus };
}
