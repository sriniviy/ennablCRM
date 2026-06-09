import { db, dealStagesTable, companiesTable, contactsTable, dealsTable, tasksTable, activitiesTable } from "./index";

async function seed() {
  console.log("Seeding database...");

  // Upsert deal stages
  const stages = await db
    .insert(dealStagesTable)
    .values([
      { name: "Lead", order: 0, color: "#94a3b8" },
      { name: "Qualified", order: 1, color: "#60a5fa" },
      { name: "Proposal", order: 2, color: "#a78bfa" },
      { name: "Negotiation", order: 3, color: "#f59e0b" },
      { name: "Won", order: 4, color: "#22c55e" },
      { name: "Lost", order: 5, color: "#ef4444" },
    ])
    .onConflictDoNothing()
    .returning();

  console.log(`Seeded ${stages.length > 0 ? stages.length : "existing"} deal stages`);

  // Check if we already have seed data
  const existingCompanies = await db.select().from(companiesTable).limit(1);
  if (existingCompanies.length > 0) {
    console.log("Demo data already exists, skipping...");
    process.exit(0);
  }

  // Seed companies
  const [acme, techflow, nova] = await db
    .insert(companiesTable)
    .values([
      {
        name: "Acme Corporation",
        domain: "acme.com",
        industry: "Manufacturing",
        size: "500-1000",
        website: "https://acme.com",
        city: "San Francisco",
        country: "US",
      },
      {
        name: "TechFlow Inc.",
        domain: "techflow.io",
        industry: "Software",
        size: "50-200",
        website: "https://techflow.io",
        city: "New York",
        country: "US",
      },
      {
        name: "Nova Systems",
        domain: "novasystems.com",
        industry: "IT Services",
        size: "200-500",
        website: "https://novasystems.com",
        city: "Austin",
        country: "US",
      },
    ])
    .returning();

  console.log("Seeded 3 companies");

  // Seed contacts
  const [alice, bob, carol, dave] = await db
    .insert(contactsTable)
    .values([
      {
        firstName: "Alice",
        lastName: "Johnson",
        email: "alice@acme.com",
        phone: "+1 415 555 0101",
        title: "VP of Engineering",
        status: "CUSTOMER",
        companyId: acme.id,
        tags: ["enterprise", "decision-maker"],
        notes: "Key stakeholder for the platform contract renewal.",
      },
      {
        firstName: "Bob",
        lastName: "Martinez",
        email: "bob@techflow.io",
        phone: "+1 212 555 0102",
        title: "CTO",
        status: "PROSPECT",
        companyId: techflow.id,
        tags: ["startup", "technical"],
      },
      {
        firstName: "Carol",
        lastName: "Williams",
        email: "carol@novasystems.com",
        phone: "+1 512 555 0103",
        title: "Director of Operations",
        status: "LEAD",
        companyId: nova.id,
        tags: ["mid-market"],
      },
      {
        firstName: "Dave",
        lastName: "Chen",
        email: "dave.chen@gmail.com",
        title: "Founder",
        status: "PROSPECT",
        tags: ["inbound"],
      },
    ])
    .returning();

  console.log("Seeded 4 contacts");

  // Get the qualified and proposal stage IDs
  const allStages = await db.select().from(dealStagesTable).orderBy(dealStagesTable.order);
  const leadStage = allStages.find((s) => s.name === "Lead");
  const qualifiedStage = allStages.find((s) => s.name === "Qualified");
  const proposalStage = allStages.find((s) => s.name === "Proposal");
  const negotiationStage = allStages.find((s) => s.name === "Negotiation");
  const wonStage = allStages.find((s) => s.name === "Won");

  if (!leadStage || !qualifiedStage || !proposalStage || !negotiationStage || !wonStage) {
    console.error("Could not find deal stages");
    process.exit(1);
  }

  // Seed deals
  const deals = await db
    .insert(dealsTable)
    .values([
      {
        title: "Acme Platform License",
        value: 120000,
        currency: "USD",
        probability: 80,
        stageId: negotiationStage.id,
        contactId: alice.id,
        companyId: acme.id,
        closeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        notes: "Annual platform license renewal with potential 20% expansion.",
        order: 0,
      },
      {
        title: "TechFlow Integration Project",
        value: 45000,
        currency: "USD",
        probability: 60,
        stageId: proposalStage.id,
        contactId: bob.id,
        companyId: techflow.id,
        closeDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
        order: 0,
      },
      {
        title: "Nova Systems Consulting",
        value: 28000,
        currency: "USD",
        probability: 30,
        stageId: qualifiedStage.id,
        contactId: carol.id,
        companyId: nova.id,
        closeDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        order: 0,
      },
      {
        title: "Dave Chen Starter Plan",
        value: 4800,
        currency: "USD",
        probability: 50,
        stageId: leadStage.id,
        contactId: dave.id,
        closeDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        order: 0,
      },
    ])
    .returning();

  console.log("Seeded 4 deals");

  // Seed tasks
  await db.insert(tasksTable).values([
    {
      title: "Send Acme renewal proposal",
      priority: "HIGH",
      type: "EMAIL",
      contactId: alice.id,
      dealId: deals[0].id,
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Follow up with Bob on TechFlow demo",
      priority: "MEDIUM",
      type: "CALL",
      contactId: bob.id,
      dealId: deals[1].id,
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Schedule discovery call with Nova",
      priority: "LOW",
      type: "MEETING",
      contactId: carol.id,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      title: "Review Dave Chen inbound form",
      priority: "MEDIUM",
      type: "TODO",
      contactId: dave.id,
      dueDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log("Seeded 4 tasks");

  // Seed activities
  await db.insert(activitiesTable).values([
    {
      type: "CONTACT_CREATED",
      title: "Contact created: Alice Johnson",
      contactId: alice.id,
    },
    {
      type: "DEAL_CREATED",
      title: 'Deal created: "Acme Platform License"',
      contactId: alice.id,
      dealId: deals[0].id,
    },
    {
      type: "DEAL_MOVED",
      title: 'Acme Platform License moved to Negotiation',
      dealId: deals[0].id,
    },
    {
      type: "CALL",
      title: "Discovery call with Bob Martinez",
      description: "Discussed integration requirements and timeline. Strong interest.",
      contactId: bob.id,
      dealId: deals[1].id,
    },
    {
      type: "EMAIL_SENT",
      title: "Sent proposal to TechFlow",
      contactId: bob.id,
      dealId: deals[1].id,
    },
    {
      type: "NOTE",
      title: "Note: Carol prefers async communication",
      description: "Carol mentioned she prefers email over phone calls.",
      contactId: carol.id,
    },
  ]);

  console.log("Seeded 6 activities");
  console.log("Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
