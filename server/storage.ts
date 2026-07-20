import {
  type User,
  type InsertUser,
  type Group,
  type InsertGroup,
  type CensusEntry,
  type InsertCensusEntry,
  type Proposal,
  type RiskScreen,
  type InsertRiskScreen,
  users,
  groups,
  censusEntries,
  proposals,
  riskScreens,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByMagicToken(token: string): Promise<User | undefined>;
  getUserByApprovalToken(token: string): Promise<User | undefined>;
  createUser(user: Partial<InsertUser> & { fullName: string; email: string; magicToken?: string; magicTokenExpiry?: Date }): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  getGroupsByUserId(userId: string): Promise<Group[]>;
  getAllGroups(): Promise<Group[]>;
  getGroup(id: string): Promise<Group | undefined>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, data: Partial<Group>): Promise<Group | undefined>;

  getCensusByGroupId(groupId: string): Promise<CensusEntry[]>;
  createCensusEntries(entries: InsertCensusEntry[]): Promise<CensusEntry[]>;
  deleteGroup(id: string): Promise<void>;
  deleteCensusByGroupId(groupId: string): Promise<void>;

  getProposalsByGroupId(groupId: string): Promise<Proposal[]>;
  getProposal(id: string): Promise<Proposal | undefined>;
  createProposal(data: { groupId: string; pdfPath: string; pdfBase64?: string; fileName: string; ratesData?: any }): Promise<Proposal>;
  deleteProposalsByGroupId(groupId: string): Promise<void>;

  // Risk Screen
  saveRiskScreen(data: InsertRiskScreen): Promise<RiskScreen>;
  getRiskScreen(id: string): Promise<RiskScreen | undefined>;
  getRiskScreensByGroupId(groupId: string): Promise<RiskScreen[]>;
  getLatestRiskScreenForGroup(groupId: string): Promise<RiskScreen | undefined>;
  getAllRiskScreens(): Promise<RiskScreen[]>;
  updateRiskScreenPdf(id: string, pdfBase64: string, resultJson: unknown): Promise<void>;

  // Internal sales quotes, admin-driven flow that mints a sharable
  // /q/:token link for prospects. Same scoring and rates as
  // self_service customer groups (rate engine is shared).
  createInternalSalesQuote(input: {
    companyName: string;
    state: string;
    zipCode: string;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdByAdminId: string;
    publicToken: string;
  }): Promise<Group>;
  getInternalSalesQuotes(): Promise<Group[]>;
  // Same shape as getInternalSalesQuotes but with the most recent
  // proposalId per group joined in. Powers the "select multiple →
  // download zip" action on the admin quotes list, where the client
  // needs an id to send to /api/admin/proposals/bulk-download.
  getInternalSalesQuotesWithLatestProposal(): Promise<Array<Group & { latestProposalId: string | null }>>;
  getCustomerGroups(): Promise<Group[]>;
  getGroupByPublicToken(token: string): Promise<Group | undefined>;
  bumpQuoteView(groupId: string): Promise<void>;
  setQuotePublicToken(groupId: string, token: string | null): Promise<Group | undefined>;
  markQuotePubliclyAccepted(groupId: string): Promise<Group | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByMagicToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.magicToken, token));
    return user;
  }

  async getUserByApprovalToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.approvalToken, token));
    return user;
  }

  async createUser(user: Partial<InsertUser> & { fullName: string; email: string; magicToken?: string; magicTokenExpiry?: Date }): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getGroupsByUserId(userId: string): Promise<Group[]> {
    console.log(`🔍 getGroupsByUserId called with userId: ${userId}`);
    const result = await db.select().from(groups).where(eq(groups.userId, userId)).orderBy(desc(groups.submittedAt));
    console.log(`🔍 Query returned ${result.length} groups`);
    if (result.length > 0) {
      console.log(`🔍 First group details:`, { id: result[0].id, userId: result[0].userId, companyName: result[0].companyName });
    }
    return result;
  }

  async getAllGroups(): Promise<Group[]> {
    return db.select().from(groups).orderBy(desc(groups.submittedAt));
  }

  async getGroup(id: string): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async createGroup(group: InsertGroup): Promise<Group> {
    const [created] = await db.insert(groups).values(group).returning();
    return created;
  }

  async updateGroup(id: string, data: Partial<Group>): Promise<Group | undefined> {
    const [updated] = await db
      .update(groups)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(groups.id, id))
      .returning();
    return updated;
  }

  async getCensusByGroupId(groupId: string): Promise<CensusEntry[]> {
    return db.select().from(censusEntries).where(eq(censusEntries.groupId, groupId));
  }

  async createCensusEntries(entries: InsertCensusEntry[]): Promise<CensusEntry[]> {
    if (entries.length === 0) return [];
    return db.insert(censusEntries).values(entries).returning();
  }

  async deleteGroup(id: string): Promise<void> {
    await db.delete(groups).where(eq(groups.id, id));
  }

  async deleteCensusByGroupId(groupId: string): Promise<void> {
    await db.delete(censusEntries).where(eq(censusEntries.groupId, groupId));
  }

  async getProposalsByGroupId(groupId: string): Promise<Proposal[]> {
    return db.select().from(proposals).where(eq(proposals.groupId, groupId)).orderBy(desc(proposals.createdAt));
  }

  async getProposal(id: string): Promise<Proposal | undefined> {
    const [proposal] = await db.select().from(proposals).where(eq(proposals.id, id));
    return proposal;
  }

  async createProposal(data: { groupId: string; pdfPath: string; pdfBase64?: string; fileName: string; ratesData?: any }): Promise<Proposal> {
    const [created] = await db.insert(proposals).values(data).returning();
    return created;
  }

  async deleteProposalsByGroupId(groupId: string): Promise<void> {
    await db.delete(proposals).where(eq(proposals.groupId, groupId));
  }

  // ── Internal sales quotes ───────────────────────────────────────────

  async createInternalSalesQuote(input: {
    companyName: string;
    state: string;
    zipCode: string;
    contactName?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    createdByAdminId: string;
    publicToken: string;
  }): Promise<Group> {
    const [created] = await db.insert(groups).values({
      userId: null,
      createdByAdminId: input.createdByAdminId,
      source: "internal_sales",
      publicToken: input.publicToken,
      companyName: input.companyName,
      state: input.state,
      zipCode: input.zipCode,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      // Status starts at 'draft' so the quotes list can distinguish
      // pre-census quotes from sent ones; once census is uploaded the
      // finalize step flips it to 'analyzing' (matching customer flow).
      status: "draft",
    }).returning();
    return created;
  }

  async getInternalSalesQuotes(): Promise<Group[]> {
    return db
      .select()
      .from(groups)
      .where(eq(groups.source, "internal_sales"))
      .orderBy(desc(groups.submittedAt));
  }

  async getInternalSalesQuotesWithLatestProposal(): Promise<
    Array<Group & { latestProposalId: string | null }>
  > {
    // Two-query approach: avoids a correlated subquery that can be
    // brittle across Drizzle versions and is plenty fast, N is the
    // number of internal-sales rows, typically a few hundred at most.
    const rows = await db
      .select()
      .from(groups)
      .where(eq(groups.source, "internal_sales"))
      .orderBy(desc(groups.submittedAt));
    if (rows.length === 0) return [];
    const allProposals = await db
      .select({
        id: proposals.id,
        groupId: proposals.groupId,
        createdAt: proposals.createdAt,
      })
      .from(proposals)
      .orderBy(desc(proposals.createdAt));
    // First-seen wins because we ordered by createdAt DESC.
    const latestByGroup = new Map<string, string>();
    for (const p of allProposals) {
      if (!latestByGroup.has(p.groupId)) latestByGroup.set(p.groupId, p.id);
    }
    return rows.map((g) => ({
      ...g,
      latestProposalId: latestByGroup.get(g.id) ?? null,
    }));
  }

  async getCustomerGroups(): Promise<Group[]> {
    return db
      .select()
      .from(groups)
      .where(eq(groups.source, "self_service"))
      .orderBy(desc(groups.submittedAt));
  }

  async getGroupByPublicToken(token: string): Promise<Group | undefined> {
    const [g] = await db.select().from(groups).where(eq(groups.publicToken, token));
    return g;
  }

  async bumpQuoteView(groupId: string): Promise<void> {
    // Atomic: COALESCE first_viewed_at so it stays at the first hit.
    await db.execute(sql`
      UPDATE groups
      SET view_count       = view_count + 1,
          last_viewed_at   = NOW(),
          first_viewed_at  = COALESCE(first_viewed_at, NOW()),
          updated_at       = NOW()
      WHERE id = ${groupId}
    `);
  }

  async setQuotePublicToken(groupId: string, token: string | null): Promise<Group | undefined> {
    const [updated] = await db
      .update(groups)
      .set({ publicToken: token, updatedAt: new Date() })
      .where(eq(groups.id, groupId))
      .returning();
    return updated;
  }

  async markQuotePubliclyAccepted(groupId: string): Promise<Group | undefined> {
    const [updated] = await db
      .update(groups)
      .set({
        publicAcceptedAt: new Date(),
        status: "proposal_accepted",
        updatedAt: new Date(),
      })
      .where(eq(groups.id, groupId))
      .returning();
    return updated;
  }

  async saveRiskScreen(data: InsertRiskScreen): Promise<RiskScreen> {
    const [row] = await db.insert(riskScreens).values(data).returning();
    return row;
  }

  async getRiskScreen(id: string): Promise<RiskScreen | undefined> {
    const [row] = await db.select().from(riskScreens).where(eq(riskScreens.id, id));
    return row;
  }

  async getRiskScreensByGroupId(groupId: string): Promise<RiskScreen[]> {
    return db.select().from(riskScreens)
      .where(eq(riskScreens.groupId, groupId))
      .orderBy(desc(riskScreens.createdAt));
  }

  async getLatestRiskScreenForGroup(groupId: string): Promise<RiskScreen | undefined> {
    const [row] = await db.select().from(riskScreens)
      .where(eq(riskScreens.groupId, groupId))
      .orderBy(desc(riskScreens.createdAt))
      .limit(1);
    return row;
  }

  async getAllRiskScreens(): Promise<RiskScreen[]> {
    return db.select().from(riskScreens).orderBy(desc(riskScreens.createdAt));
  }

  async updateRiskScreenPdf(id: string, pdfBase64: string, resultJson: unknown): Promise<void> {
    await db.update(riskScreens)
      .set({ pdfBase64, resultJson: resultJson as any })
      .where(eq(riskScreens.id, id));
  }
}

export const storage = new DatabaseStorage();
