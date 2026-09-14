import { config } from "zod";

// Configure before application modules construct schemas. Zod's optional JIT
// probes Function(), which strict CSP correctly blocks even if Zod catches it.
config({ jitless: true });
