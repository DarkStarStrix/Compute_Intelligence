import { describe, expect, it } from "vitest";
import {
  project,
  projectUrls,
  snapshotUrl,
  mcpDataUrl,
} from "../shared/project";

describe("GitHub project routing", () => {
  it("uses the renamed repository for the site, collector and MCP", () => {
    expect(project.site).toBe(
      "https://darkstarstrix.github.io/Compute_Intelligence/"
    );
    expect(snapshotUrl).toBe(`${project.site}data/current.json`);
    expect(mcpDataUrl).toBe(`${project.site}data/mcp/`);
    expect(project.workflow).toBe(
      "https://api.github.com/repos/DarkStarStrix/Compute_Intelligence/actions/workflows/pages.yml"
    );
  });
  it("derives asset paths from the repository metadata while preserving case", () => {
    expect(projectUrls("Owner/Renamed_App").base).toBe("/Renamed_App/");
    expect(projectUrls("Owner/owner.github.io").base).toBe("/");
  });
  it.each([
    "https://example.com",
    "owner/../app",
    "owner/app?query",
    "owner/app/extra",
  ])("rejects invalid repository identity %s", value => {
    expect(() => projectUrls(value)).toThrow(
      "Invalid GitHub repository identity"
    );
  });
});
