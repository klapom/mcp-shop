import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export interface ProductMarketing {
  tagline: string;
  description_long: string;
  use_cases: string[];
  icon_url: string;
  screenshots: { url: string; caption: string }[];
  pricing_note: string;
  category: string;
}

export interface Product {
  id: string;
  slug: string;
  display_name: string;
  scopes: { namespace: string; scope: string }[];
  trial_days: number | null;
  stripe_product_id: string | null;
  status: "active" | "draft" | "deprecated";
  marketing: ProductMarketing;
}

interface ProductsYaml {
  products: Product[];
}

const PRODUCTS_YAML_PATH =
  process.env.PRODUCTS_YAML_PATH ??
  resolve(
    process.cwd(),
    "../mcp-platform/docs/inventory/products.yaml"
  );

let _cache: Product[] | null = null;

export function loadProducts(): Product[] {
  if (_cache) return _cache;

  const raw = readFileSync(PRODUCTS_YAML_PATH, "utf-8");
  const data = yaml.load(raw) as ProductsYaml;

  if (!data?.products || !Array.isArray(data.products)) {
    throw new Error(`products.yaml: expected 'products' array, got ${typeof data?.products}`);
  }

  _cache = data.products;
  return _cache;
}

export function getActiveProducts(): Product[] {
  return loadProducts().filter((p) => p.status === "active");
}

export function getProductBySlug(slug: string): Product | undefined {
  return loadProducts().find((p) => p.slug === slug);
}

export function isMarketingComplete(marketing: ProductMarketing): boolean {
  return Boolean(
    marketing.tagline &&
    marketing.description_long &&
    marketing.use_cases.length > 0
  );
}
