// Shared PGlite harness: all migrations applied, sql`` tag + sql.query like the Neon client.
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

export const migrationsDir = new URL("../../../migrations/", import.meta.url);

export async function testDb() {
  const pg = new PGlite();
  for (const f of readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort()) await pg.exec(readFileSync(new URL(f, migrationsDir), "utf8"));
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
      return (await pg.query(text, values)).rows;
    },
    { query: async (text: string, params?: unknown[]) => (await pg.query(text, params)).rows },
  );
  return { pg, sql: sql as never };
}

/** A city, owner + tenant profiles, a property and a listing. */
export async function seedListing(pg: PGlite, id = "L1", owner = "owner") {
  await pg.query(`insert into profiles (user_id, full_name, mobile) values ($1,'Rohith Owner','9876543210') on conflict do nothing`, [owner]);
  await pg.query(`insert into profiles (user_id, full_name) values ('tenant','Asha Tenant') on conflict do nothing`);
  const city = (await pg.query<{ id: string }>(`select id from cities limit 1`)).rows[0]?.id;
  await pg.query(`insert into properties (id, owner_id, title, property_type, address, city_id, pincode, lat, lng) values ($1,$2,'Mud Home','PG','Kadri, Mangaluru',$3,'575002',12.9,74.8) on conflict do nothing`, [`P-${id}`, owner, city]);
  await pg.query(`insert into listings (id, property_id, owner_id, title, description, city_name, locality_name, monthly_rent, deposit, available_from, room_type, furnished)
    values ($1,$2,$3,'Mud Home 2-sharing','x','Mangaluru','Kadri',8999,8999,'2026-11-01','Shared room','Furnished') on conflict do nothing`, [id, `P-${id}`, owner]);
}
