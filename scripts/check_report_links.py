import os
import re

base_dir = r"docs/report"
md_files = []
for root, dirs, files in os.walk(base_dir):
    for f in files:
        if f.endswith(".md"):
            md_files.append(os.path.join(root, f))

link_pattern = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")

errors = []
total_links = 0

for mdf in md_files:
    with open(mdf, "r", encoding="utf-8") as f:
        content = f.read()

    for match in link_pattern.finditer(content):
        text, url = match.groups()
        # skip external urls, mailto, anchor only
        if url.startswith("http://") or url.startswith("https://") or url.startswith("mailto:") or url.startswith("#"):
            continue

        total_links += 1
        # remove anchor inside relative url
        url_clean = url.split("#")[0]
        if not url_clean:
            continue

        target = os.path.normpath(os.path.join(os.path.dirname(mdf), url_clean))
        if not os.path.exists(target):
            errors.append((mdf, url, target))

print(f"Checked {total_links} relative links across {len(md_files)} markdown files.")
if errors:
    print(f"Found {len(errors)} broken links:")
    for mdf, url, target in errors:
        print(f"  In {mdf}: link '{url}' -> target '{target}' does NOT exist")
else:
    print("ALL RELATIVE LINKS EXIST AND ARE VALID (100% OK)!")
