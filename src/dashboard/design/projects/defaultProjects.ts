/** Built-in Design Studio projects — always listed for every user (no provisioning). */

export type DesignProject = {
  id: string;
  name: string;
  description: string;
  to: string;
  builtin: true;
};

export const GALLERY_PROJECT_ID = "gallery";

export const GALLERY_PROJECT: DesignProject = {
  id: GALLERY_PROJECT_ID,
  name: "Gallery",
  description: "Uploads and generated images — pick from workflows and agent chat.",
  to: "/design/projects/gallery",
  builtin: true,
};

/** Default projects every user sees under Design → Projects. */
export function listDefaultProjects(): DesignProject[] {
  return [GALLERY_PROJECT];
}
