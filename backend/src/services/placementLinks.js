import { Candidate } from "../models/recruitment.js";
import { Client, Job } from "../models/index.js";
import { scope, jobScope } from "../middleware/auth.js";
import { fail } from "../utils/security.js";
export async function placementClientScope(user) {
  if (["Super Admin", "Admin", "HR Manager", "Team Leader"].includes(user.role))
    return {};
  const clients = await Job.distinct("client", {
    deletedAt: null,
    ...jobScope(user),
  });
  return { $or: [scope(user), { _id: { $in: clients } }] };
}
export async function resolvePlacementLinks(
  data,
  user,
  session,
  current = null,
) {
  const keys = ["candidate", "client", "job"];
  const hasLinks = keys.some((k) => data[k] !== undefined);
  const nameChanged = ["candidateName", "companyName", "jobTitle"].some(
    (k) => data[k] !== undefined && data[k] !== current?.[k],
  );
  if (current && !hasLinks && !nameChanged) return data;
  if (
    current &&
    keys.every(
      (k) => current[k] && String(data[k] || current[k]) === String(current[k]),
    )
  ) {
    for (const key of ["candidateName", "companyName", "jobTitle"])
      data[key] = current[key];
    return data;
  }
  const refs = Object.fromEntries(
    keys.map((k) => [k, data[k] || current?.[k]]),
  );
  if (keys.some((k) => !refs[k]))
    throw fail(
      400,
      "Select an existing candidate, client and job from the dropdowns.",
    );
  const candidate = await Candidate.findOne({
    _id: refs.candidate,
    deletedAt: null,
    ...scope(user),
  }).session(session);
  const job = await Job.findOne({
    _id: refs.job,
    deletedAt: null,
    ...jobScope(user),
  }).session(session);
  if (!candidate || !job)
    throw fail(
      400,
      "Selected candidate or job is unavailable or not authorized.",
    );
  if (String(job.client) !== String(refs.client))
    throw fail(400, "The selected job does not belong to this client.");
  const client = await Client.findOne({
    _id: refs.client,
    deletedAt: null,
  }).session(session);
  if (!client) throw fail(400, "Selected client is unavailable.");
  return Object.assign(data, refs, {
    candidateName: candidate.fullName,
    companyName: client.companyName,
    jobTitle: job.title,
  });
}
