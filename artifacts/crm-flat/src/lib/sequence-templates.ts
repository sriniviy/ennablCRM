export interface TemplateStep {
  subject: string;
  body: string;
  delayDays: number;
}

export interface SequenceTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  steps: TemplateStep[];
}

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  {
    id: "cold-outreach",
    name: "Cold Outreach",
    description: "5-step intro sequence for new prospects",
    icon: "🎯",
    steps: [
      {
        subject: "Quick intro — {{companyName}}",
        body: `Hi {{firstName}},

I came across {{companyName}} and wanted to reach out. We work with companies like yours to help streamline their operations and grow revenue — and I thought there might be a fit.

Would you be open to a quick 15-minute call this week to explore?

Best,
{{repName}}`,
        delayDays: 0,
      },
      {
        subject: "Re: Quick intro — {{companyName}}",
        body: `Hi {{firstName}},

Just following up on my note from a few days ago in case it got buried.

Happy to keep this short — would a 15-minute call work for you this week or next?

Best,
{{repName}}`,
        delayDays: 3,
      },
      {
        subject: "One thing that might be useful",
        body: `Hi {{firstName}},

I don't want to keep sending emails if this isn't relevant, but I thought I'd share one thing before I stop bothering you.

[Insert a relevant insight, stat, or resource about their industry here.]

If this resonates, I'd love to chat. If not, no worries — I'll leave you alone after this.

Best,
{{repName}}`,
        delayDays: 7,
      },
      {
        subject: "Still worth a conversation?",
        body: `Hi {{firstName}},

I've reached out a few times without hearing back — I understand things get busy.

I'll keep this simple: is there a better time to connect, or is this just not the right fit right now?

Either answer works — I just want to make sure I'm not missing something.

Best,
{{repName}}`,
        delayDays: 14,
      },
      {
        subject: "Closing the loop",
        body: `Hi {{firstName}},

I'm going to stop reaching out after this so I don't clog your inbox.

If anything changes and you'd like to revisit, feel free to reach back out any time.

Wishing you and {{companyName}} all the best.

{{repName}}`,
        delayDays: 21,
      },
    ],
  },
  {
    id: "post-demo",
    name: "Post-Demo Follow-up",
    description: "3-step sequence to close after a product demo",
    icon: "🎬",
    steps: [
      {
        subject: "Great speaking with you, {{firstName}}",
        body: `Hi {{firstName}},

Thanks for taking the time today — it was great learning more about {{companyName}} and what you're working on.

To recap what we covered:
- [Key pain point they mentioned]
- [How your product addresses it]
- [Next step you discussed]

If you have any questions after reflecting on the demo, I'm happy to jump on a quick call or answer over email.

Best,
{{repName}}`,
        delayDays: 1,
      },
      {
        subject: "Any questions from the demo?",
        body: `Hi {{firstName}},

Just checking in to see if you had any questions after the demo.

I know these decisions take time, and I want to make sure you have everything you need to evaluate properly. If it would help to bring in any other stakeholders for a follow-up call, I'm happy to set that up.

What would be most useful for you right now?

Best,
{{repName}}`,
        delayDays: 3,
      },
      {
        subject: "Ready to move forward?",
        body: `Hi {{firstName}},

I wanted to check in one more time before I give you some space.

If the timing is right and you're ready to move forward, I can have everything set up quickly. If you need more time or have concerns I can address, I'm here.

Let me know either way — it would help me understand where things stand.

Best,
{{repName}}`,
        delayDays: 7,
      },
    ],
  },
  {
    id: "re-engagement",
    name: "Re-engagement",
    description: "4-step sequence to reconnect with cold or lost leads",
    icon: "🔄",
    steps: [
      {
        subject: "Checking in, {{firstName}}",
        body: `Hi {{firstName}},

It's been a while since we last spoke, and I wanted to check in to see how things are going at {{companyName}}.

A lot has changed on our end since we last connected — we've added some new capabilities that might be relevant to what you were working on.

Worth a quick catch-up?

Best,
{{repName}}`,
        delayDays: 0,
      },
      {
        subject: "Something new that might interest you",
        body: `Hi {{firstName}},

Following up on my last note. I wanted to share something specific that I think would be relevant to {{companyName}}:

[Insert a new feature, case study, or relevant development here.]

Companies similar to yours have found this particularly valuable. Would love to get your thoughts.

Best,
{{repName}}`,
        delayDays: 4,
      },
      {
        subject: "How [Similar Company] solved this",
        body: `Hi {{firstName}},

I wanted to share a quick story.

A company similar to {{companyName}} was dealing with [similar challenge]. After working with us, they were able to [specific outcome].

I thought this might resonate given what you mentioned when we last spoke.

Happy to share the full story if you're curious.

Best,
{{repName}}`,
        delayDays: 10,
      },
      {
        subject: "Last note from me, {{firstName}}",
        body: `Hi {{firstName}},

I've sent a few messages and don't want to overstay my welcome.

If the timing isn't right or this isn't a priority, I completely understand — no hard feelings at all.

If things change down the road, feel free to reach out. I'll be here.

Best of luck to you and {{companyName}},
{{repName}}`,
        delayDays: 18,
      },
    ],
  },
  {
    id: "onboarding",
    name: "New Client Onboarding",
    description: "6-step sequence to welcome and set up new clients for success",
    icon: "🚀",
    steps: [
      {
        subject: "Welcome aboard, {{firstName}}! 🎉",
        body: `Hi {{firstName}},

On behalf of the whole team — welcome! We're thrilled to have {{companyName}} on board.

Here's what to expect over the next few weeks:
- Today: Account setup and access details
- Day 3: Onboarding check-in call
- Week 2: First progress review
- Day 30: 30-day milestone review

Your dedicated point of contact is {{repName}} (that's me!). Don't hesitate to reach out with any questions.

Let's build something great together.

{{repName}}`,
        delayDays: 0,
      },
      {
        subject: "Your account is ready — here's how to get started",
        body: `Hi {{firstName}},

Your account is all set up and ready to go.

To get the most out of your first week, here are the three things I'd recommend doing first:
1. [First key action]
2. [Second key action]
3. [Third key action]

If you run into anything or have questions along the way, reply here and I'll get back to you quickly.

Best,
{{repName}}`,
        delayDays: 1,
      },
      {
        subject: "How's everything going so far?",
        body: `Hi {{firstName}},

Just checking in to see how the first few days have been for you and the team at {{companyName}}.

Is there anything you need help with or any questions that have come up? I want to make sure you're set up for success.

Happy to jump on a quick call if that would be easier.

Best,
{{repName}}`,
        delayDays: 3,
      },
      {
        subject: "Tips to get more out of your account",
        body: `Hi {{firstName}},

Now that you've had a chance to get started, I wanted to share a few tips our most successful customers use:

1. [Power tip #1]
2. [Power tip #2]
3. [Power tip #3]

These tend to make a big difference early on. Let me know if you'd like me to walk through any of them.

Best,
{{repName}}`,
        delayDays: 7,
      },
      {
        subject: "Two weeks in — how are things looking?",
        body: `Hi {{firstName}},

You're two weeks in — congratulations on getting everything set up!

I wanted to check in and see how things are tracking against your initial goals. Are you seeing the results you were hoping for?

If there's anything we can do to help you get more value, I'd love to hear about it.

Best,
{{repName}}`,
        delayDays: 14,
      },
      {
        subject: "30-day review — let's connect",
        body: `Hi {{firstName}},

It's been 30 days since {{companyName}} joined us — time flies!

I'd love to set up a quick 30-minute review call to:
- Look at what's working well
- Identify any areas we can improve
- Discuss your goals for the next quarter

Do you have 30 minutes available this week or next? Happy to work around your schedule.

Best,
{{repName}}`,
        delayDays: 30,
      },
    ],
  },
  {
    id: "deal-won",
    name: "Deal Won Thank You",
    description: "2-step sequence to celebrate and kick off a new partnership",
    icon: "🏆",
    steps: [
      {
        subject: "Thank you for choosing us, {{firstName}}",
        body: `Hi {{firstName}},

Thank you so much — we're genuinely excited to be working with {{companyName}}.

I'm going to be your main point of contact throughout, and I'll be introducing you to the rest of the team over the next few days.

To get things moving, here's what happens next:
1. [Next step 1]
2. [Next step 2]

Feel free to reach me directly at any time. We're committed to making this a great experience for you.

Best,
{{repName}}`,
        delayDays: 0,
      },
      {
        subject: "Ready to kick things off?",
        body: `Hi {{firstName}},

I wanted to follow up and make sure you have everything you need to get started.

I'd love to set up a brief kickoff call to align on goals, timelines, and answer any questions your team might have.

Does any time this week work for a 30-minute call? I'll send a calendar invite once we find a time that works.

Looking forward to it,
{{repName}}`,
        delayDays: 3,
      },
    ],
  },
];
