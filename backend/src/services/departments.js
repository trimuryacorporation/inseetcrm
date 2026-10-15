import { Models } from "../models/operations.js";
import { Job, User } from "../models/index.js";
import { fail } from "../utils/security.js";
export function departmentName(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}
export function prepareDepartment(data) {
  if (data.name !== undefined) {
    data.name = departmentName(data.name);
    if (data.name.length < 2 || data.name.length > 120)
      throw fail(400, "Department name must contain 2 to 120 characters.");
    data.nameKey = data.name.toLowerCase();
  }
  return data;
}
export async function validateDepartment(value, current, session) {
  if (value === undefined) return value;
  const name = departmentName(value);
  if (!name) return "";
  if (current && name === current) return current;
  const record = await Models.departments
    .findOne({ nameKey: name.toLowerCase(), deletedAt: null })
    .session(session || null);
  if (!record)
    throw fail(400, "Select a saved department or add the department first.");
  return record.name;
}
export async function guardDepartmentChange(current, newName, session) {
  if (newName === current.name) return;
  if (
    (await User.exists({ department: current.name }).session(session)) ||
    (await Models.teams
      .exists({ department: current.name, deletedAt: null })
      .session(session)) ||
    (await Job.exists({ department: current.name, deletedAt: null }).session(
      session,
    ))
  )
    throw fail(
      409,
      "This department is assigned to an employee, team or job. Reassign those records before renaming or archiving it.",
    );
}

export async function ensureStaffDepartments(owner) {
  if (!owner) return;
  const names = [
    "HR",
    "Recruitment",
    "BDE",
    "Management",
    "Sales",
    "Finance",
    "Accounts",
    "Operations",
    "IT",
    "Administration",
  ];
  await Models.departments.bulkWrite(
    names.map((name) => ({
      updateOne: {
        filter: { nameKey: name.toLowerCase() },
        update: {
          $setOnInsert: {
            name,
            nameKey: name.toLowerCase(),
            owner,
            description: "Standard department",
            deletedAt: null,
          },
        },
        upsert: true,
      },
    })),
  );
}
