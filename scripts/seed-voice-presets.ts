/**
 * Seed/update only voice presets — run with: npx tsx scripts/seed-voice-presets.ts
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma-node";

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    // System Default
    await prisma.voicePreset.upsert({
      where: { name: "System Default" },
      update: {
        config: {
          openai: {
            voice: "coral",
            instructions:
              "Speak in a warm, professional tone suitable for a daily podcast briefing. " +
              "Maintain a steady, engaging pace. Pause naturally between topics.",
            speed: 1.0,
          },
          groq: { voice: "diana" },
          cloudflare: { voice: "luna" },
        },
      },
      create: {
        name: "System Default",
        description: "The default Blipp voice — warm, professional podcast briefing tone.",
        isSystem: true,
        isActive: true,
        config: {
          openai: {
            voice: "coral",
            instructions:
              "Speak in a warm, professional tone suitable for a daily podcast briefing. " +
              "Maintain a steady, engaging pace. Pause naturally between topics.",
            speed: 1.0,
          },
          groq: { voice: "diana" },
          cloudflare: { voice: "luna" },
        },
      },
    });
    console.log("✓ System Default");

    // Nova
    await prisma.voicePreset.upsert({
      where: { name: "Nova" },
      update: {
        config: {
          openai: {
            voice: "nova",
            instructions:
              "Speak with bright, upbeat energy like a morning show host. " +
              "Keep the pace lively but clear. Add natural enthusiasm when introducing new topics.",
            speed: 1.05,
          },
          groq: { voice: "autumn" },
          cloudflare: { voice: "electra" },
        },
      },
      create: {
        name: "Nova",
        description:
          "Bright and energetic — like your favorite morning show host. Great for daily news briefings.",
        isSystem: true,
        isActive: true,
        config: {
          openai: {
            voice: "nova",
            instructions:
              "Speak with bright, upbeat energy like a morning show host. " +
              "Keep the pace lively but clear. Add natural enthusiasm when introducing new topics.",
            speed: 1.05,
          },
          groq: { voice: "autumn" },
          cloudflare: { voice: "electra" },
        },
        voiceCharacteristics: { gender: "female", tone: "energetic", pace: "fast" },
      },
    });
    console.log("✓ Nova");

    // Sage
    await prisma.voicePreset.upsert({
      where: { name: "Sage" },
      update: {
        config: {
          openai: {
            voice: "onyx",
            instructions:
              "Speak in a calm, measured, authoritative tone. " +
              "Take your time with complex ideas. Pause thoughtfully between sections. " +
              "Convey gravitas without being monotone.",
            speed: 0.95,
          },
          groq: { voice: "daniel" },
          cloudflare: { voice: "orpheus" },
        },
      },
      create: {
        name: "Sage",
        description:
          "Calm and authoritative — measured delivery for deep-dive analysis and long-form content.",
        isSystem: true,
        isActive: true,
        config: {
          openai: {
            voice: "onyx",
            instructions:
              "Speak in a calm, measured, authoritative tone. " +
              "Take your time with complex ideas. Pause thoughtfully between sections. " +
              "Convey gravitas without being monotone.",
            speed: 0.95,
          },
          groq: { voice: "daniel" },
          cloudflare: { voice: "orpheus" },
        },
        voiceCharacteristics: { gender: "male", tone: "authoritative", pace: "slow" },
      },
    });
    console.log("✓ Sage");

    // Spark
    await prisma.voicePreset.upsert({
      where: { name: "Spark" },
      update: {
        config: {
          openai: {
            voice: "shimmer",
            instructions:
              "Speak in a friendly, conversational tone with a hint of wit. " +
              "Sound like you're telling a friend about something interesting you just learned. " +
              "Keep it casual and engaging.",
            speed: 1.0,
          },
          groq: { voice: "hannah" },
          cloudflare: { voice: "thalia" },
        },
      },
      create: {
        name: "Spark",
        description:
          "Conversational and witty — casual tone perfect for entertainment and culture briefings.",
        isSystem: true,
        isActive: true,
        config: {
          openai: {
            voice: "shimmer",
            instructions:
              "Speak in a friendly, conversational tone with a hint of wit. " +
              "Sound like you're telling a friend about something interesting you just learned. " +
              "Keep it casual and engaging.",
            speed: 1.0,
          },
          groq: { voice: "hannah" },
          cloudflare: { voice: "thalia" },
        },
        voiceCharacteristics: { gender: "female", tone: "conversational", pace: "medium" },
      },
    });
    console.log("✓ Spark");

    console.log("\nDone — all voice presets updated.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
