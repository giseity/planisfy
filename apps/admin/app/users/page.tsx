import { db, users, accounts } from "@planisfy/database";
import { eq, sql, desc, count, ilike, or } from "drizzle-orm";
import { Badge } from "@planisfy/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@planisfy/ui/components/table";
import Link from "next/link";
import { requireAdmin } from "@/features/auth/admin-auth";
import { platformRoles } from "@planisfy/utils";

export const dynamic = "force-dynamic";

const userRoles = platformRoles;

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; role?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const limit = 25;
  const offset = (page - 1) * limit;
  const search = params.q || "";
  const roleFilter = userRoles.find((role) => role === params.role);

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(users.name, `%${search}%`),
        ilike(users.email, `%${search}%`),
        ilike(accounts.handle, `%${search}%`),
      ),
    );
  }
  if (roleFilter) {
    conditions.push(eq(users.role, roleFilter));
  }

  const whereClause =
    conditions.length > 0
      ? sql`${sql.join(conditions, sql` AND `)}`
      : undefined;

  const userList = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      handle: accounts.handle,
      createdAt: users.createdAt,
      styleCount:
        sql<number>`(SELECT count(*) FROM styles WHERE styles.owner_id = ${users.id} AND styles.deleted_at IS NULL)`.as(
          "style_count",
        ),
      keyCount:
        sql<number>`(SELECT count(*) FROM apikey WHERE apikey.reference_id = ${users.id} AND apikey.enabled = true)`.as(
          "key_count",
        ),
    })
    .from(users)
    .leftJoin(accounts, eq(users.id, accounts.id))
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: count() })
    .from(users)
    .leftJoin(accounts, eq(users.id, accounts.id))
    .where(whereClause);
  const total = totalRow?.count ?? 0;
  const pageHref = (nextPage: number) => {
    const query = new URLSearchParams();
    query.set("page", String(nextPage));
    if (search) query.set("q", search);
    if (roleFilter) query.set("role", roleFilter);
    return `/users?${query.toString()}`;
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Users</h1>

      <div className="flex gap-3 mb-4">
        <form className="flex gap-2 flex-1">
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by name, email, or handle..."
            className="flex h-8 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm"
          />
          <select
            name="role"
            defaultValue={roleFilter ?? ""}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All roles</option>
            <option value="USER">User</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER">Super</option>
            <option value="OWNER">Owner</option>
          </select>
          <button
            type="submit"
            className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-medium"
          >
            Search
          </button>
        </form>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Handle</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Styles</TableHead>
            <TableHead>Keys</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {userList.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <Link
                  href={`/users/${user.id}`}
                  className="font-medium hover:underline"
                >
                  {user.name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {user.email}
              </TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                @{user.handle}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    user.role === "OWNER"
                      ? "destructive"
                      : user.role === "SUPER"
                        ? "destructive"
                        : user.role === "ADMIN"
                          ? "warning"
                          : "secondary"
                  }
                >
                  {user.role}
                </Badge>
              </TableCell>
              <TableCell>{user.styleCount}</TableCell>
              <TableCell>{user.keyCount}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(user.createdAt).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
          {userList.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-8 text-muted-foreground"
              >
                No users found
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {total > limit && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
          </p>
          <div className="flex gap-1">
            {page > 1 && (
              <Link
                href={pageHref(page - 1)}
                className="h-8 px-3 rounded-md border text-sm flex items-center"
              >
                Previous
              </Link>
            )}
            {offset + limit < total && (
              <Link
                href={pageHref(page + 1)}
                className="h-8 px-3 rounded-md border text-sm flex items-center"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
