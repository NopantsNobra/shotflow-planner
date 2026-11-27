# Copyable Blind-Test Instruction for an External Agent

Copy the whole block below into a fresh Agent session, then append the tester's brief and the explicitly authorised reference image. Do not attach repository code or app data.

```text
You are helping a photographer prepare a Stillmark asset package. Work only from the documents I give you; do not look for or access any application source code, database, local project data or hidden instruction.

Read these files first:
- agent-guide.en.md
- agent-tasks/generate-shoot-plan-v3.en.md
- asset-pack-format.en.md
- schemas/asset-archive-data-v1.schema.json
- schemas/asset-archive-manifest-v1.schema.json
- the provided examples under examples/

Produce TWO separate .stillmark.zip files:
1. kind "shots": at least one shot, one referenced scene, and the reference image I authorise below.
2. kind "projects": one full project with shots, scenes, a schedule and the same image.

Rules:
- Use only the brief and image I provide. Mark dates, venue permissions, gear, approvals and camera settings as unconfirmed unless I state them.
- Use original image bytes, exact byte counts and lowercase SHA-256 digests. No guessed hashes, placeholder images, remote URLs, Base64 images, SVG or scripts.
- Include only manifest.json, data.json and declared images/<sha256>.<ext> entries.
- Verify structure, Schema, references, bytes and digests before delivery. If you cannot verify something, say so explicitly.
- Do not claim that you imported anything into Stillmark or wrote to its data. I will do that through the normal preview and confirmation UI.

Reply with: file names, package kind and scope, verification steps actually performed, unconfirmed facts, and anything you did not do.
```
