// scripts/fetch-notion.js
// Chạy bởi GitHub Actions — fetch Notion DB → ghi ra data.json

const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!process.env.NOTION_TOKEN) {
  console.error("❌ NOTION_TOKEN chưa được set trong GitHub Secrets");
  process.exit(1);
}
if (!DATABASE_ID) {
  console.error("❌ NOTION_DATABASE_ID chưa được set trong GitHub Secrets");
  process.exit(1);
}

// Auto-detect field names từ page đầu tiên
function detectFields(properties) {
  const keys = Object.keys(properties);
  const fields = {};

  // Title
  const titleKey = keys.find(k => properties[k].type === "title");
  fields.title = titleKey || "Name";

  // Status
  const statusKey = keys.find(k =>
    properties[k].type === "status" ||
    (properties[k].type === "select" && /status|trạng/i.test(k))
  );
  fields.status = statusKey || "Status";

  // Priority
  const priKey = keys.find(k => /priority|ưu tiên|uu tien/i.test(k));
  fields.priority = priKey || "Priority";

  // Assignee
  const assigneeKey = keys.find(k =>
    properties[k].type === "people" ||
    /assignee|pic|người phụ trách|assign/i.test(k)
  );
  fields.assignee = assigneeKey || "Assignee";

  // Deadline
  const deadlineKey = keys.find(k =>
    properties[k].type === "date" ||
    /deadline|due|hạn|ngày/i.test(k)
  );
  fields.deadline = deadlineKey || "Deadline";

  // Tags/Category
  const tagsKey = keys.find(k =>
    (properties[k].type === "multi_select" && k !== fields.status) ||
    /tag|category|danh mục|loại/i.test(k)
  );
  fields.tags = tagsKey || "Tags";

  return fields;
}

// Extract giá trị từ property
function extractProp(props, name) {
  const p = props[name];
  if (!p) return "";
  switch (p.type) {
    case "title":        return (p.title || []).map(t => t.plain_text).join("");
    case "rich_text":    return (p.rich_text || []).map(t => t.plain_text).join("");
    case "select":       return p.select ? p.select.name : "";
    case "multi_select": return (p.multi_select || []).map(s => s.name).join(", ");
    case "status":       return p.status ? p.status.name : "";
    case "people":       return (p.people || []).map(p => p.name || p.id).join(", ");
    case "date":         return p.date ? (p.date.start || "") : "";
    case "checkbox":     return p.checkbox ? "Done" : "";
    case "number":       return p.number !== null ? String(p.number) : "";
    case "url":          return p.url || "";
    case "email":        return p.email || "";
    default:             return "";
  }
}

async function main() {
  const allPages = [];
  let cursor = undefined;
  let fields = null;

  console.log(`📦 Fetching database: ${DATABASE_ID}`);

  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      page_size: 100,
      start_cursor: cursor,
    });

    for (const page of res.results) {
      // Detect fields từ page đầu tiên
      if (!fields) {
        fields = detectFields(page.properties);
        console.log("📋 Detected fields:", fields);
      }

      const p = page.properties;
      allPages.push({
        id:       page.id,
        url:      page.url,
        title:    extractProp(p, fields.title)    || "(Không có tên)",
        status:   extractProp(p, fields.status)   || "Not started",
        priority: extractProp(p, fields.priority) || "",
        assignee: extractProp(p, fields.assignee) || "",
        deadline: extractProp(p, fields.deadline) || "",
        tags:     extractProp(p, fields.tags)     || "",
      });
    }

    cursor = res.has_more ? res.next_cursor : undefined;
    console.log(`   → ${allPages.length} tasks fetched...`);
  } while (cursor);

  const output = {
    synced_at:  new Date().toISOString(),
    count:      allPages.length,
    fields:     fields,
    tasks:      allPages,
  };

  const outPath = path.join(__dirname, "..", "data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Saved ${allPages.length} tasks → data.json`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
