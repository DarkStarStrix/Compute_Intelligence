// Canonical public identity shared by Pages, notification delivery and Workers.
export const repository = "DarkStarStrix/Compute_Intelligence";
export function projectUrls(value = repository) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value))
    throw new Error("Invalid GitHub repository identity");
  const [owner, name] = value.split("/");
  const base =
    name.toLowerCase() === `${owner.toLowerCase()}.github.io`
      ? "/"
      : `/${name}/`;
  return {
    repositoryUrl: `https://github.com/${value}`,
    site: `https://${owner.toLowerCase()}.github.io${base}`,
    base,
    workflow: `https://api.github.com/repos/${value}/actions/workflows/pages.yml`,
  };
}
export const project = projectUrls();
export const snapshotUrl = `${project.site}data/current.json`;
export const mcpDataUrl = `${project.site}data/mcp/`;
