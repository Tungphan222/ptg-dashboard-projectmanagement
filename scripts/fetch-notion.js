// scripts/fetch-notion.js
// Chạy bởi GitHub Actions — fetch Notion DB → ghi ra data.json

const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

if (!DATABASE_ID) {
  console.error("❌ NOTION_DATABASE_ID chưa được set trong GitHub Secrets");
  process.exit(1);
}

// Map Notion property → object gọn
function mapPage(page) {
  const p = page.properties;

  function getText(prop) {
    const v = p[prop];
    if (!v) return "";
    if (v.type === "rich_text") return v.rich_text?.[0]?.plain_text ?? "";
    if (v.type === "title")     return v.title?.[0]?.plain_text ?? "";
    return "";
  }

  return {
    id:         page.id,
    name:       getText("Tên"),
    type:       p["Type"]?.select?.name ?? "",
    company:    getText("Company"),
    pic:        getText("PIC"),
    version:    getText("Version"),
    date_start: p["Date"]?.date?.start ?? null,
    date_end:   p["Date"]?.date?.end   ?? null,
    done:       p["Checkbox"]?.checkbox ?? false,
    url:        page.url,
  };
}

async function main() {
  const tasks = [];
  let cursor  = undefined;

  console.log(`📦 Fetching database: ${DATABASE_ID}`);

  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      page_size:   100,
      start_cursor: cursor,
      sorts: [{ property: "Date", direction: "descending" }],
    });

    for (const page of res.results) {
      tasks.push(mapPage(page));
    }

    cursor = res.has_more ? res.next_cursor : undefined;
    console.log(`   → ${tasks.length} tasks fetched so far...`);
  } while (cursor);

  const output = {
    synced_at: new Date().toISOString(),
    count:     tasks.length,
    tasks,
  };

  const outPath = path.join(__dirname, "..", "data.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`✅ Saved ${tasks.length} tasks → data.json`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
