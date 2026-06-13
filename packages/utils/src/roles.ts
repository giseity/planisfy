// Shared role and permission policy helpers. Keep this file dependency-free so
// server routes, auth helpers, and client code can all use the same hierarchy.

export const platformRoles = ["USER", "ADMIN", "SUPER", "OWNER"] as const;
export type PlatformRole = (typeof platformRoles)[number];

export const orgRoles = ["viewer", "member", "admin", "owner"] as const;
export type OrgRole = (typeof orgRoles)[number];

export const platformPermissions = [
  "platform.access",
  "platform.users.manage",
  "platform.organizations.manage",
  "platform.configuration.manage",
  "platform.ownership.manage",
] as const;
export type PlatformPermission = (typeof platformPermissions)[number];

export const orgPermissions = [
  "resource.read",
  "resource.write",
  "resource.publish",
  "resource.delete",
  "api_key.manage",
  "billing.manage",
  "integration.manage",
  "execution_target.manage",
  "operations.manage",
  "members.manage",
  "org.manage",
  "selfhost.operate",
  "selfhost.upgrade",
] as const;
export type OrgPermission = (typeof orgPermissions)[number];

const PLATFORM_ROLE_RANK = {
  USER: 0,
  ADMIN: 1,
  SUPER: 2,
  OWNER: 3,
} satisfies Record<PlatformRole, number>;

const ORG_ROLE_RANK = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
} satisfies Record<OrgRole, number>;

const PLATFORM_PERMISSION_MIN_ROLE = {
  "platform.access": "ADMIN",
  "platform.users.manage": "ADMIN",
  "platform.organizations.manage": "ADMIN",
  "platform.configuration.manage": "SUPER",
  "platform.ownership.manage": "OWNER",
} satisfies Record<PlatformPermission, PlatformRole>;

const ORG_PERMISSION_MIN_ROLE = {
  "resource.read": "viewer",
  "resource.write": "member",
  "resource.publish": "member",
  "resource.delete": "member",
  "api_key.manage": "admin",
  "billing.manage": "admin",
  "integration.manage": "admin",
  "execution_target.manage": "admin",
  "operations.manage": "admin",
  "members.manage": "admin",
  "org.manage": "owner",
  "selfhost.operate": "admin",
  "selfhost.upgrade": "owner",
} satisfies Record<OrgPermission, OrgRole>;

export function isPlatformRole(value: unknown): value is PlatformRole {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(PLATFORM_ROLE_RANK, value)
  );
}

export function isOrgRole(value: unknown): value is OrgRole {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ORG_ROLE_RANK, value)
  );
}

export function hasMinPlatformRole(
  role: string | null | undefined,
  minRole: PlatformRole,
) {
  if (!isPlatformRole(role)) return false;
  return PLATFORM_ROLE_RANK[role] >= PLATFORM_ROLE_RANK[minRole];
}

export function hasMinOrgRole(
  role: string | null | undefined,
  minRole: OrgRole,
) {
  if (!isOrgRole(role)) return false;
  return ORG_ROLE_RANK[role] >= ORG_ROLE_RANK[minRole];
}

export function canPlatform(
  role: string | null | undefined,
  permission: PlatformPermission,
) {
  return hasMinPlatformRole(role, PLATFORM_PERMISSION_MIN_ROLE[permission]);
}

export function canOrg(
  role: string | null | undefined,
  permission: OrgPermission,
) {
  return hasMinOrgRole(role, ORG_PERMISSION_MIN_ROLE[permission]);
}

export function minPlatformRoleFor(permission: PlatformPermission) {
  return PLATFORM_PERMISSION_MIN_ROLE[permission];
}

export function minOrgRoleFor(permission: OrgPermission) {
  return ORG_PERMISSION_MIN_ROLE[permission];
}
