import { z } from "zod";

/** Every domain entity id. */
export const IdSchema = z.string().uuid();
export type Id = z.infer<typeof IdSchema>;
