import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type?: string;
    properties?: Record<string, ToolProperty>;
    required?: string[];
    [key: string]: unknown;
  };
}

export interface ToolProperty {
  type?: string | string[];
  description?: string;
  enum?: (string | number)[];
  default?: unknown;
  items?: ToolProperty;
  [key: string]: unknown;
}

export interface NamespaceMeta {
  id: string;
  display_name: string;
  short: string;
  long: string;
  icon: string;
  accent: "petrol" | "orange";
  sources: string[];
  typical_questions: string[];
}

interface NamespacesYaml {
  namespaces: NamespaceMeta[];
}

const TOOLS_PATH =
  process.env.TOOLS_JSON_PATH ?? resolve(process.cwd(), "data/tools.json");
const NAMESPACES_PATH =
  process.env.NAMESPACES_YAML_PATH ?? resolve(process.cwd(), "data/namespaces.yaml");

let _toolsCache: Record<string, Tool[]> | null = null;
let _namespacesCache: NamespaceMeta[] | null = null;

export function loadTools(): Record<string, Tool[]> {
  if (_toolsCache) return _toolsCache;
  const raw = readFileSync(TOOLS_PATH, "utf-8");
  _toolsCache = JSON.parse(raw) as Record<string, Tool[]>;
  return _toolsCache;
}

export function loadNamespaces(): NamespaceMeta[] {
  if (_namespacesCache) return _namespacesCache;
  const raw = readFileSync(NAMESPACES_PATH, "utf-8");
  const data = yaml.load(raw) as NamespacesYaml;
  if (!data?.namespaces) {
    throw new Error("namespaces.yaml: missing 'namespaces' array");
  }
  _namespacesCache = data.namespaces;
  return _namespacesCache;
}

export function getNamespace(id: string): NamespaceMeta | undefined {
  return loadNamespaces().find((n) => n.id === id);
}

export function getToolsFor(namespaceId: string): Tool[] {
  return loadTools()[namespaceId] ?? [];
}

export function totalToolCount(): number {
  const tools = loadTools();
  return Object.values(tools).reduce((sum, list) => sum + list.length, 0);
}
