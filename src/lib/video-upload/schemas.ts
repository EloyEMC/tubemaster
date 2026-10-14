import { z } from "zod";
import { credentialRefSchema } from "../video-metadata/schemas";

export const uploadRequestSchema = z.object({
  credentialRef: credentialRefSchema,
  expectedChannelId: z.string().trim().min(1),
  filePath: z.string().trim().min(1),
  title: z.string().trim().min(1).max(100),
  description: z.string().max(5000).optional(),
  visibility: z.literal("private"),
  dryRun: z.boolean().optional(),
  confirmed: z.boolean().optional(),
}).strict();
