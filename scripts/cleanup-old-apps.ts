import { db } from "../lib/db";
import { and, lt, inArray } from "drizzle-orm";
import { applications, activities, scoutJobs, proposals, emailEvents } from "../lib/db/schema";

async function cleanup() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  console.log("🗑️  Cleaning database");
  console.log(`Keeping: applications with activity after ${threeDaysAgo.toISOString()}`);
  console.log("");

  // Find apps to delete
  const appsToDelete = await db
    .select({ id: applications.id })
    .from(applications)
    .where(lt(applications.lastActivityAt, threeDaysAgo))
    .all();

  console.log(`Found ${appsToDelete.length} old applications`);

  if (appsToDelete.length > 0) {
    const appIds = appsToDelete.map(a => a.id);

    // Delete in FK order
    const activitiesDeleted = await db.delete(activities).where(inArray(activities.applicationId, appIds)).run();
    const emailDeleted = await db.delete(emailEvents).where(inArray(emailEvents.matchedApplicationId, appIds)).run();
    const scoutUpdated = await db.update(scoutJobs).set({ promotedApplicationId: null, status: "new" }).where(inArray(scoutJobs.promotedApplicationId, appIds)).run();
    const proposalsDeleted = await db.delete(proposals).where(inArray(proposals.applicationId, appIds)).run();
    const appsDeleted = await db.delete(applications).where(inArray(applications.id, appIds)).run();

    console.log(`✓ Deleted ${activitiesDeleted.rowsAffected} activities`);
    console.log(`✓ Deleted ${emailDeleted.rowsAffected} email events`);
    console.log(`✓ Reset ${scoutUpdated.rowsAffected} scout jobs to 'new'`);
    console.log(`✓ Deleted ${proposalsDeleted.rowsAffected} proposals`);
    console.log(`✓ Deleted ${appsDeleted.rowsAffected} applications`);
  }

  console.log("\n✓ Cleanup complete");
}

cleanup().catch(console.error);
