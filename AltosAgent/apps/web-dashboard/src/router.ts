// @altos/web-dashboard - Hash-based router

type RouteHandler = (params: Record<string, string>, query: URLSearchParams) => void;

interface Route {
  pattern: RegExp;
  handler: RouteHandler;
  keys: string[];
}

export class Router {
  private routes: Route[] = [];
  private currentParams: Record<string, string> = {};
  private currentQuery = new URLSearchParams();

  constructor() {
    window.addEventListener("hashchange", () => this.resolve());
    window.addEventListener("load", () => this.resolve());
  }

  add(path: string, handler: RouteHandler): this {
    const { pattern, keys } = pathToRegex(path);
    this.routes.push({ pattern, handler, keys });
    return this;
  }

  navigate(path: string): void {
    window.location.hash = path;
  }

  resolve(): void {
    const hash = window.location.hash.slice(1) || "/sessions";
    const [pathStr, queryStr] = hash.split("?");
    this.currentQuery = new URLSearchParams(queryStr || "");

    for (const route of this.routes) {
      const match = pathStr.match(route.pattern);
      if (match) {
        const params: Record<string, string> = {};
        route.keys.forEach((key, i) => {
          params[key] = match[i + 1] ?? "";
        });
        this.currentParams = params;
        route.handler(params, this.currentQuery);
        return;
      }
    }

    // 404 → redirect to sessions
    this.navigate("/sessions");
  }

  get currentRouteParams(): Record<string, string> {
    return this.currentParams;
  }

  get currentRouteQuery(): URLSearchParams {
    return this.currentQuery;
  }
}

function pathToRegex(path: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const escaped = path.replace(/\+/g, "\\+").replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  return {
    pattern: new RegExp(`^${escaped}$`),
    keys,
  };
}

export const router = new Router();
