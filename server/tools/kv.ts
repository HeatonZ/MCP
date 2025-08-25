/// <reference lib="deno.unstable" />
import { z } from "npm:zod";
import type { ToolSpec } from "@shared/types/tool.ts";
import { kvGet, kvList, kvSet } from "../kv.ts";

export const kvTools: ToolSpec[] = []; 