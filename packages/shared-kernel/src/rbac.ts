export type RbacRole = 'owner' | 'admin' | 'member' | 'viewer';
export type ApiKeyScope = 'read' | 'ingest' | 'quarantine' | 'admin';

const ROLE_WEIGHT: Record<RbacRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export function isValidRole(value: string): value is RbacRole {
  return value in ROLE_WEIGHT;
}

export function hasRoleAtLeast(actual: RbacRole, required: RbacRole): boolean {
  return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[required];
}

export function hasApiScope(scopes: readonly string[], required: ApiKeyScope): boolean {
  return scopes.includes('admin') || scopes.includes(required);
}

export function requiredRoleForAction(action: string): RbacRole {
  switch (action) {
    case 'read':
    case 'analytics:read':
    case 'flakes:read':
      return 'viewer';
    case 'ingest':
    case 'quarantine:write':
    case 'issues:sync':
      return 'member';
    case 'policy:write':
    case 'notifications:write':
    case 'tokens:manage':
    case 'runs:delete':
    case 'members:manage':
      return 'admin';
    case 'org:delete':
    case 'org:transfer':
      return 'owner';
    default:
      return 'member';
  }
}
